import { AlertTriangle, Loader2, RefreshCw, SkipForward, X } from 'lucide-react';

/** The 409 body every import endpoint returns when a file touches existing records. */
export type ImportConflict = {
  row: number;
  name?: string | null;
  current_name?: string | null;
  email?: string | null;
  registration_number?: string | null;
  staff_number?: string | null;
  assessment_name?: string | null;
  current_marks?: number | null;
  current_grade?: string | null;
  new_marks?: number | null;
  new_grade?: string | null;
  message?: string | null;
};

export type ImportConflictReport = {
  conflict_count: number;
  new_count: number;
  total_rows: number;
  conflicts: ImportConflict[];
};

export type ConflictChoice = 'skip' | 'update';

/** Reads a thrown ApiRequestError's body, returning the report only if it is one. */
export function asConflictReport(data: unknown): ImportConflictReport | null {
  if (!data || typeof data !== 'object') return null;
  const body = data as Record<string, unknown>;
  if (body.needs_conflict_decision !== true) return null;
  return {
    conflict_count: Number(body.conflict_count ?? 0),
    new_count: Number(body.new_count ?? 0),
    total_rows: Number(body.total_rows ?? 0),
    conflicts: Array.isArray(body.conflicts) ? (body.conflicts as ImportConflict[]) : [],
  };
}

const identifierOf = (conflict: ImportConflict) =>
  conflict.registration_number || conflict.staff_number || conflict.email || '—';

export default function ImportConflictDialog({
  report,
  noun,
  busy,
  onChoose,
  onCancel,
}: {
  report: ImportConflictReport;
  /** Plural label for what is being imported, e.g. "learners" or "marks". */
  noun: string;
  busy: ConflictChoice | null;
  onChoose: (choice: ConflictChoice) => void;
  onCancel: () => void;
}) {
  const isMarks = report.conflicts.some((conflict) => conflict.current_marks != null);

  return (
    <div
      className="fixed inset-0 z-[70] flex items-center justify-center bg-slate-950/85 p-3 backdrop-blur-sm sm:p-6"
      role="dialog"
      aria-modal="true"
      aria-label={`Existing ${noun} found`}
      onMouseDown={(event) => {
        if (event.target === event.currentTarget && !busy) onCancel();
      }}
    >
      <div className="flex max-h-[88vh] w-full max-w-2xl flex-col overflow-hidden rounded-2xl border border-slate-700 bg-slate-900 shadow-2xl">
        <div className="flex items-start justify-between gap-4 border-b border-slate-800 px-5 py-4">
          <div className="flex gap-3">
            <div className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-amber-400/30 bg-amber-400/10 text-amber-300">
              <AlertTriangle size={18} />
            </div>
            <div>
              <h2 className="text-lg font-bold text-slate-100">
                {report.conflict_count} {noun} already exist
              </h2>
              <p className="mt-1 text-sm text-slate-400">
                Nothing has been saved yet. {report.new_count} of {report.total_rows} rows are new —
                choose what to do with the rest.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onCancel}
            disabled={Boolean(busy)}
            className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-800 hover:text-slate-200 disabled:opacity-50"
            aria-label="Cancel import"
          >
            <X size={19} />
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
          <div className="overflow-hidden rounded-xl border border-slate-800">
            <table className="w-full text-left text-sm">
              <thead className="bg-slate-800/60">
                <tr>
                  {['Row', 'Identifier', isMarks ? 'Assessment' : 'In file', isMarks ? 'Change' : 'Currently stored'].map((header) => (
                    <th key={header} className="px-3 py-2 text-xs font-semibold uppercase tracking-wide text-slate-400">
                      {header}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800">
                {report.conflicts.slice(0, 200).map((conflict) => (
                  <tr key={`${conflict.row}-${identifierOf(conflict)}`} className="odd:bg-slate-950/40">
                    <td className="px-3 py-2 text-slate-500">{conflict.row}</td>
                    <td className="px-3 py-2 font-medium text-slate-200">{identifierOf(conflict)}</td>
                    <td className="px-3 py-2 text-slate-300">
                      {isMarks ? conflict.assessment_name ?? '—' : conflict.name ?? '—'}
                    </td>
                    <td className="px-3 py-2 text-slate-400">
                      {isMarks ? (
                        <span>
                          <span className="text-slate-300">{conflict.current_marks ?? '—'}</span>
                          {' → '}
                          <span className="font-semibold text-amber-200">{conflict.new_marks ?? '—'}</span>
                        </span>
                      ) : (
                        conflict.current_name ?? '—'
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {report.conflicts.length > 200 ? (
            <p className="mt-2 text-xs text-slate-500">
              Showing the first 200 of {report.conflicts.length}. Your choice applies to all of them.
            </p>
          ) : null}
        </div>

        <div className="flex flex-col gap-2 border-t border-slate-800 bg-slate-950/50 px-5 py-4 sm:flex-row sm:justify-end">
          <button
            type="button"
            onClick={onCancel}
            disabled={Boolean(busy)}
            className="rounded-lg border border-slate-700 px-4 py-2.5 text-sm font-semibold text-slate-300 hover:bg-slate-800 disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={() => onChoose('skip')}
            disabled={Boolean(busy)}
            className="inline-flex items-center justify-center gap-2 rounded-lg border border-slate-600 bg-slate-800 px-4 py-2.5 text-sm font-semibold text-slate-100 hover:bg-slate-700 disabled:opacity-50"
          >
            {busy === 'skip' ? <Loader2 size={16} className="animate-spin" /> : <SkipForward size={16} />}
            Skip existing, import {report.new_count} new
          </button>
          <button
            type="button"
            onClick={() => onChoose('update')}
            disabled={Boolean(busy)}
            className="inline-flex items-center justify-center gap-2 rounded-lg bg-amber-500 px-4 py-2.5 text-sm font-bold text-slate-950 hover:bg-amber-400 disabled:opacity-50"
          >
            {busy === 'update' ? <Loader2 size={16} className="animate-spin" /> : <RefreshCw size={16} />}
            Update all {report.conflict_count}
          </button>
        </div>
      </div>
    </div>
  );
}
