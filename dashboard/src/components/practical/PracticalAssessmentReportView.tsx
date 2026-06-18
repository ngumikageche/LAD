import { forwardRef } from 'react';
import type { ForwardedRef } from 'react';
import type { PracticalAssessmentReport } from '../../api/trainer';

const outcomeClass = (outcome: string | null) => {
  switch ((outcome ?? '').toUpperCase()) {
    case 'COMPETENT':
      return 'bg-green-500/15 text-green-300 border-green-500/30';
    case 'BORDERLINE':
      return 'bg-amber-500/15 text-amber-300 border-amber-500/30';
    case 'NOT YET COMPETENT':
      return 'bg-red-500/15 text-red-300 border-red-500/30';
    default:
      return 'bg-slate-700 text-slate-300 border-slate-600';
  }
};

const formatDate = (value: string | null) => {
  if (!value) return 'Not set';
  return new Date(value).toLocaleString();
};

const scoreText = (value: number | null) => (value == null ? 'Not recorded' : `${value.toFixed(1)} / 25`);

type Props = {
  report: PracticalAssessmentReport;
  studentName?: string | null;
  studentRegistration?: string | null;
  trainerName?: string | null;
  institutionLocation?: string | null;
};

const PracticalAssessmentReportView = forwardRef(function PracticalAssessmentReportView(
  {
    report,
    studentName,
    studentRegistration,
    trainerName,
    institutionLocation,
  }: Props,
  ref: ForwardedRef<HTMLDivElement>,
) {
  const rows = report.task_items?.length
    ? report.task_items.map((item) => ({
        label: item.description?.trim() || `Task ${item.number}`,
        score: item.score,
        remark: item.remark,
      }))
    : [1, 2, 3, 4]
        .map((taskNumber, index) => {
          const score = [
            report.task_1_score,
            report.task_2_score,
            report.task_3_score,
            report.task_4_score,
          ][index];
          const remark = [
            report.task_1_remark,
            report.task_2_remark,
            report.task_3_remark,
            report.task_4_remark,
          ][index];
          const description = [
            report.task_1_description,
            report.task_2_description,
            report.task_3_description,
            report.task_4_description,
          ][index];

          if (description == null && score == null && remark == null) {
            return null;
          }

          return {
            label: description?.trim() || `Task ${taskNumber}`,
            score,
            remark,
          };
        })
        .filter((row): row is { label: string; score: number | null; remark: string | null } => row !== null);

  return (
    <div ref={ref} className="mx-auto w-full max-w-5xl rounded-3xl border border-slate-800 bg-slate-900 p-6 shadow-xl shadow-slate-950/30 print:max-w-none print:rounded-none print:border-0 print:shadow-none">
      <div className="border-b border-slate-800 pb-4 text-center">
        <p className="text-xs uppercase tracking-[0.3em] text-teal-300">Practical Assessment Report</p>
        <h1 className="mt-2 text-2xl font-bold text-slate-100">{report.institution_name}</h1>
        <p className="text-sm text-slate-400">{institutionLocation ?? report.department_name}</p>
        <p className="mt-2 text-sm text-slate-400">{report.awarding_body}</p>
      </div>

      <div className="mt-6 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <InfoCard label="Student" value={studentName ?? report.student_name ?? 'Unknown student'} />
        <InfoCard label="Reg. Number" value={studentRegistration ?? report.student_registration_number ?? 'Not set'} />
        <InfoCard label="Trainer" value={trainerName ?? report.trainer_name ?? 'Unknown trainer'} />
        <InfoCard label="Status" value={report.status} />
      </div>

      <div className="mt-6 grid gap-4 rounded-2xl border border-slate-800 bg-slate-950/50 p-5 md:grid-cols-2">
        <div>
          <p className="text-xs uppercase tracking-widest text-slate-500">Qualification</p>
          <p className="mt-1 text-slate-100">{report.qualification}</p>
        </div>
        <div>
          <p className="text-xs uppercase tracking-widest text-slate-500">Period</p>
          <p className="mt-1 text-slate-100">{report.period}</p>
        </div>
        <div>
          <p className="text-xs uppercase tracking-widest text-slate-500">Unit of Competency</p>
          <p className="mt-1 text-slate-100">{report.unit_of_competency}</p>
        </div>
        <div>
          <p className="text-xs uppercase tracking-widest text-slate-500">Unit Code</p>
          <p className="mt-1 text-slate-100">{report.unit_code}</p>
        </div>
        <div>
          <p className="text-xs uppercase tracking-widest text-slate-500">Assessment Date</p>
          <p className="mt-1 text-slate-100">{formatDate(report.assessment_date)}</p>
        </div>
        <div>
          <p className="text-xs uppercase tracking-widest text-slate-500">Released At</p>
          <p className="mt-1 text-slate-100">{formatDate(report.released_at)}</p>
        </div>
      </div>

      <div className="mt-6 overflow-hidden rounded-2xl border border-slate-800">
        <table className="w-full border-collapse text-sm">
          <thead className="bg-slate-800/80 text-slate-300">
            <tr>
              <th className="px-4 py-3 text-left font-medium">Task</th>
              <th className="px-4 py-3 text-left font-medium">Score</th>
              <th className="px-4 py-3 text-left font-medium">Remarks</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr className="border-t border-slate-800">
                <td colSpan={3} className="px-4 py-4 text-center text-slate-500">No tasks recorded</td>
              </tr>
            ) : rows.map((row, index) => (
              <tr key={`${row.label}-${index}`} className="border-t border-slate-800">
                <td className="px-4 py-4 text-slate-100">{row.label}</td>
                <td className="px-4 py-4 text-slate-300">{scoreText(row.score)}</td>
                <td className="px-4 py-4 text-slate-400">{row.remark ?? 'No remark recorded'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="mt-6 grid gap-4 md:grid-cols-3">
        <div className="rounded-2xl border border-slate-800 bg-slate-950/60 p-4">
          <p className="text-xs uppercase tracking-widest text-slate-500">Total Score</p>
          <p className="mt-2 text-3xl font-bold text-slate-100">{report.total_score == null ? '--' : report.total_score.toFixed(1)}</p>
        </div>
        <div className="rounded-2xl border border-slate-800 bg-slate-950/60 p-4">
          <p className="text-xs uppercase tracking-widest text-slate-500">Competency Outcome</p>
          <span className={`mt-3 inline-flex rounded-full border px-3 py-1 text-sm font-semibold ${outcomeClass(report.competency_outcome)}`}>
            {report.competency_outcome ?? 'INCOMPLETE'}
          </span>
        </div>
        <div className="rounded-2xl border border-slate-800 bg-slate-950/60 p-4">
          <p className="text-xs uppercase tracking-widest text-slate-500">Released By</p>
          <p className="mt-2 text-sm text-slate-200">{report.released_by_name ?? 'Not released'}</p>
        </div>
      </div>

      <div className="mt-6 flex items-center justify-between border-t border-slate-800 pt-4 text-xs text-slate-500">
        <span>Report ID: {report.id}</span>
        <span>Generated: {formatDate(report.created_at)}</span>
      </div>
    </div>
  );
});

function InfoCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-slate-800 bg-slate-950/60 p-4">
      <p className="text-xs uppercase tracking-widest text-slate-500">{label}</p>
      <p className="mt-2 text-sm font-semibold text-slate-100">{value}</p>
    </div>
  );
}

export default PracticalAssessmentReportView;
