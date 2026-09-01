import { useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import { Download, Printer, Search } from 'lucide-react';
import type { PracticalAssessmentReport } from '../../api/trainer';
import { exportExcel } from '../../utils/exportUtils';
import {
  COMPETENCE_PASS_MARK,
  competenceTone,
  isCompetent,
  ratingLabel,
} from '../../utils/competence';

/**
 * The performance score sheet for practical assessment data that has been
 * entered: one row per learner, with the practical marks and the oral marks
 * kept apart, then the total, the percentage, and the competence outcome.
 *
 * The analytics panels beside it answer "how is the cohort doing"; a trainer
 * signing off an assessment needs the other question — what exactly was
 * recorded against each learner — which is what a score sheet is. The split
 * between practical and oral is the split the marking itself uses, so a learner
 * who can do the work but cannot explain it is visible as such rather than
 * averaged into one number.
 */

/** Matches PracticalAssessmentReport.MAX_TASK_SCORE on the backend. */
const MAX_TASK_SCORE = 25;
const MAX_ORAL_SCORE = 1;

export type ScoreSheetRow = {
  id: string;
  student: string;
  registration: string;
  unit: string;
  practicalScore: number | null;
  practicalMax: number;
  oralScore: number | null;
  oralMax: number;
  total: number | null;
  max: number;
  percentage: number | null;
  outcome: string;
  status: PracticalAssessmentReport['status'];
  assessedOn: string | null;
};

const fmt = (value: number | null) => (value === null ? '—' : value.toFixed(1));

/**
 * Marks split by what was being assessed. Maximums count every item on the
 * sheet, scored or not — the same rule the backend totals by, so an unfinished
 * report reads as unfinished rather than as a small perfect score.
 */
function splitMarks(report: PracticalAssessmentReport) {
  const totals = {
    practical: { score: 0, max: 0, entered: false },
    oral: { score: 0, max: 0, entered: false },
  };

  const add = (bucket: 'practical' | 'oral', score: number | null | undefined, max: number) => {
    const target = totals[bucket];
    target.max += max;
    if (score != null) {
      target.score += score;
      target.entered = true;
    }
  };

  const sections = report.report_sections ?? [];
  if (sections.length > 0) {
    sections.forEach((section) => {
      if (section.type === 'narrative') return;
      const bucket = section.type === 'oral' ? 'oral' : 'practical';
      (section.items ?? []).forEach((item) => {
        add(bucket, item.score, item.max_score ?? (bucket === 'oral' ? MAX_ORAL_SCORE : MAX_TASK_SCORE));
      });
    });
  } else if ((report.task_items ?? []).length > 0 || (report.oral_questions ?? []).length > 0) {
    (report.task_items ?? []).forEach((item) => add('practical', item.score, item.max_score ?? MAX_TASK_SCORE));
    (report.oral_questions ?? []).forEach((item) => add('oral', item.awarded_score, item.max_score ?? MAX_ORAL_SCORE));
  } else {
    [report.task_1_score, report.task_2_score, report.task_3_score, report.task_4_score]
      .forEach((score) => add('practical', score, MAX_TASK_SCORE));
  }

  return {
    practicalScore: totals.practical.entered ? totals.practical.score : null,
    practicalMax: totals.practical.max,
    oralScore: totals.oral.entered ? totals.oral.score : null,
    oralMax: totals.oral.max,
  };
}

function toScoreSheetRows(reports: PracticalAssessmentReport[]): ScoreSheetRow[] {
  return reports
    .map((report) => {
      const { practicalScore, practicalMax, oralScore, oralMax } = splitMarks(report);
      const max = report.total_max_score ?? (practicalMax + oralMax);
      const total = report.total_score
        ?? (practicalScore === null && oralScore === null ? null : (practicalScore ?? 0) + (oralScore ?? 0));
      const percentage = report.score_percentage
        ?? (total !== null && max > 0 ? (total / max) * 100 : null);
      return {
        id: report.id,
        student: report.student_name ?? 'Unknown learner',
        registration: report.student_registration_number ?? '—',
        unit: report.unit_of_competency || '—',
        practicalScore,
        practicalMax,
        oralScore,
        oralMax,
        total,
        max,
        percentage,
        outcome: report.competency_outcome ?? 'INCOMPLETE',
        status: report.status,
        assessedOn: report.assessment_date ?? report.updated_at ?? report.created_at ?? null,
      };
    })
    .sort((left, right) => left.student.localeCompare(right.student));
}

type Props = {
  reports: PracticalAssessmentReport[];
  /** Who the export is stamped for. */
  generatedBy?: string;
  /** Cap the rows shown on screen; the export always carries every row. */
  limit?: number;
  /** Rendered under the heading when the list is capped. */
  footer?: ReactNode;
};

export default function PracticalScoreSheet({ reports, generatedBy = 'Trainer', limit, footer }: Props) {
  const [search, setSearch] = useState('');
  const rows = useMemo(() => toScoreSheetRows(reports), [reports]);

  const matching = useMemo(() => {
    const query = search.trim().toLowerCase();
    if (!query) return rows;
    return rows.filter((row) => (
      row.student.toLowerCase().includes(query)
      || row.registration.toLowerCase().includes(query)
      || row.unit.toLowerCase().includes(query)
    ));
  }, [rows, search]);

  const visible = limit ? matching.slice(0, limit) : matching;
  const scored = rows.filter((row) => row.percentage !== null);
  const average = scored.length
    ? scored.reduce((sum, row) => sum + (row.percentage ?? 0), 0) / scored.length
    : null;
  const competent = rows.filter((row) => isCompetent(row.outcome)).length;

  const handleExport = () => {
    exportExcel(
      [{
        name: 'Score Sheet',
        rows: matching.map((row) => ({
          Learner: row.student,
          'Registration no.': row.registration,
          'Unit of competency': row.unit,
          'Practical marks': row.practicalScore === null ? 'Not entered' : Number(row.practicalScore.toFixed(1)),
          'Practical max': row.practicalMax,
          'Oral marks': row.oralScore === null ? 'Not entered' : Number(row.oralScore.toFixed(1)),
          'Oral max': row.oralMax,
          Total: row.total === null ? 'Not entered' : Number(row.total.toFixed(1)),
          'Total max': row.max,
          Percentage: row.percentage === null ? 'Incomplete' : Number(row.percentage.toFixed(1)),
          Outcome: ratingLabel(row.outcome),
          Status: row.status,
          Assessed: row.assessedOn ? new Date(row.assessedOn).toLocaleDateString() : '—',
        })),
      }],
      'practical-assessment-score-sheet',
      { generatedBy, reportTitle: 'Practical Assessment Score Sheet' },
    );
  };

  return (
    <div className="rounded-2xl border border-slate-800 bg-slate-950/50 p-4">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <h3 className="text-sm font-semibold text-slate-200">Performance Score Sheet</h3>
          <p className="mt-1 text-xs text-slate-500">
            {rows.length} practical assessment{rows.length === 1 ? '' : 's'} entered
            {average === null ? ', none fully marked yet' : ` · ${average.toFixed(1)}% average · ${competent} competent`}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2 print:hidden">
          <span className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" size={15} />
            <input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search learner or unit"
              className="w-56 rounded-xl border border-slate-700 bg-slate-950/70 py-2 pl-9 pr-3 text-sm text-slate-100 outline-none focus:border-teal-400"
            />
          </span>
          <button
            type="button"
            onClick={() => window.print()}
            className="inline-flex items-center gap-1.5 rounded-xl border border-slate-700 px-3 py-2 text-xs font-semibold text-slate-300 transition hover:border-slate-500 hover:text-white"
          >
            <Printer size={14} /> Print
          </button>
          <button
            type="button"
            onClick={handleExport}
            disabled={matching.length === 0}
            className="inline-flex items-center gap-1.5 rounded-xl border border-emerald-500/40 bg-emerald-500/10 px-3 py-2 text-xs font-semibold text-emerald-200 transition hover:bg-emerald-500/20 disabled:cursor-not-allowed disabled:opacity-40"
          >
            <Download size={14} /> Export
          </button>
        </div>
      </div>

      <div className="mt-4 overflow-x-auto">
        <table className="min-w-full text-sm">
          <thead className="border-b border-slate-800 text-xs uppercase tracking-wider text-slate-500">
            <tr>
              <th className="px-3 py-2.5 text-left">Learner</th>
              <th className="px-3 py-2.5 text-left">Reg. no.</th>
              <th className="px-3 py-2.5 text-left">Unit of competency</th>
              <th className="px-3 py-2.5 text-center">Practical</th>
              <th className="px-3 py-2.5 text-center">Oral</th>
              <th className="px-3 py-2.5 text-center">Total</th>
              <th className="px-3 py-2.5 text-center">%</th>
              <th className="px-3 py-2.5 text-center">Outcome</th>
              <th className="px-3 py-2.5 text-center">Status</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-800">
            {visible.length === 0 ? (
              <tr>
                <td colSpan={9} className="px-3 py-8 text-center text-slate-500">
                  {rows.length === 0
                    ? 'No practical assessment data has been entered yet.'
                    : 'No learners match this search.'}
                </td>
              </tr>
            ) : visible.map((row) => (
              <tr key={row.id} className="hover:bg-slate-800/40">
                <td className="px-3 py-2.5 font-medium text-slate-100">{row.student}</td>
                <td className="px-3 py-2.5 text-slate-400">{row.registration}</td>
                <td className="px-3 py-2.5 text-slate-300">{row.unit}</td>
                <td className="px-3 py-2.5 text-center text-slate-300">
                  {fmt(row.practicalScore)}<span className="text-slate-600"> / {row.practicalMax}</span>
                </td>
                <td className="px-3 py-2.5 text-center text-slate-300">
                  {row.oralMax === 0 ? '—' : <>{fmt(row.oralScore)}<span className="text-slate-600"> / {row.oralMax}</span></>}
                </td>
                <td className="px-3 py-2.5 text-center font-semibold text-slate-100">
                  {fmt(row.total)}<span className="text-slate-600"> / {row.max}</span>
                </td>
                <td className={`px-3 py-2.5 text-center font-bold ${
                  row.percentage === null ? 'text-slate-500'
                  : row.percentage >= COMPETENCE_PASS_MARK ? 'text-emerald-300'
                  : 'text-rose-300'
                }`}>
                  {row.percentage === null ? '—' : `${row.percentage.toFixed(1)}%`}
                </td>
                <td className="px-3 py-2.5 text-center">
                  <span className={`rounded-full border px-2.5 py-1 text-xs font-semibold ${competenceTone[row.outcome] ?? competenceTone.INCOMPLETE}`}>
                    {ratingLabel(row.outcome)}
                  </span>
                </td>
                <td className="px-3 py-2.5 text-center text-xs text-slate-400">{row.status}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {limit && matching.length > visible.length ? (
        <p className="mt-3 text-xs text-slate-500">
          Showing {visible.length} of {matching.length} learners. {footer}
        </p>
      ) : footer ? <p className="mt-3 text-xs text-slate-500">{footer}</p> : null}
    </div>
  );
}
