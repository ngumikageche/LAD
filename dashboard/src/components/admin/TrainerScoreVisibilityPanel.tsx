import { useEffect, useState } from 'react';
import { AlertTriangle, ChevronDown, ChevronRight, Eye, EyeOff } from 'lucide-react';
import { apiRequest } from '../../api/client';

type SubjectBreakdown = {
  subject_id: string | null;
  subject_name: string;
  subject_code: string | null;
  module_name: string | null;
  course_name: string | null;
  marks: number;
  assigned_trainers: string[];
  visible_to_trainer: boolean | null;
};

type Visibility = {
  trainer: { id: string; name: string | null; assigned_subject_count: number } | null;
  totals: {
    marks_in_view: number;
    marks_visible_to_trainer: number | null;
    marks_hidden_from_trainer: number | null;
    subjects_with_marks: number;
  };
  by_subject: SubjectBreakdown[];
  hidden_from_trainer: SubjectBreakdown[];
  duplicate_subject_names: { subject_name: string; variants: SubjectBreakdown[] }[];
  unattributed_marks: number;
};

type TrainerOption = { id: string; name: string };

const shortId = (id: string | null) => (id ? `${id.slice(0, 8)}…` : '—');

/**
 * Explains why a trainer sees fewer marks than an administrator does.
 *
 * Marks attach to a subject by id, and a trainer sees a mark only when that
 * exact id is assigned to them. Two subjects can share a name, so marks
 * uploaded against one "Solar PV Systems" can sit on a different id from the
 * one the trainer holds — both screens are then correct and disagree.
 */
export default function TrainerScoreVisibilityPanel() {
  const [open, setOpen] = useState(false);
  const [trainers, setTrainers] = useState<TrainerOption[]>([]);
  const [trainerId, setTrainerId] = useState('');
  const [data, setData] = useState<Visibility | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open || trainers.length) return;
    apiRequest<any[]>('/trainers')
      .then((rows) =>
        setTrainers(
          (Array.isArray(rows) ? rows : []).map((row) => ({
            id: String(row.id),
            name: row.user?.name ?? 'Unnamed trainer',
          })),
        ),
      )
      .catch(() => setTrainers([]));
  }, [open, trainers.length]);

  useEffect(() => {
    if (!open) return;
    setLoading(true);
    setError(null);
    apiRequest<Visibility>(`/api/v1/admin/scores/visibility${trainerId ? `?trainer_id=${trainerId}` : ''}`)
      .then(setData)
      .catch((err) => setError(err instanceof Error ? err.message : 'Could not run the check'))
      .finally(() => setLoading(false));
  }, [open, trainerId]);

  return (
    <div className="mb-6 overflow-hidden rounded-lg border border-slate-800 bg-slate-900">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        className="flex w-full items-center justify-between px-5 py-3 text-left transition hover:bg-slate-800/60"
      >
        <span className="flex items-center gap-2 text-sm font-semibold text-slate-200">
          {open ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
          Trainer visibility check
        </span>
        <span className="text-xs text-slate-500">Why can a trainer not see these marks?</span>
      </button>

      {open && (
        <div className="border-t border-slate-800 p-5">
          <label className="mb-4 block">
            <span className="mb-1 block text-xs font-semibold uppercase tracking-wider text-slate-500">Trainer</span>
            <select
              value={trainerId}
              onChange={(event) => setTrainerId(event.target.value)}
              className="w-full max-w-sm rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-slate-200"
            >
              <option value="">— All marks, no trainer selected —</option>
              {trainers.map((trainer) => (
                <option key={trainer.id} value={trainer.id}>{trainer.name}</option>
              ))}
            </select>
          </label>

          {loading && <p className="text-sm text-slate-400">Checking…</p>}
          {error && <p className="text-sm text-red-300">{error}</p>}

          {data && !loading && (
            <div className="space-y-4">
              {data.trainer && (
                <div className="grid gap-3 sm:grid-cols-3">
                  <Stat label="Assigned subjects" value={data.trainer.assigned_subject_count} />
                  <Stat label="Marks they can see" value={data.totals.marks_visible_to_trainer ?? 0} tone="good" />
                  <Stat label="Marks hidden from them" value={data.totals.marks_hidden_from_trainer ?? 0} tone="warn" />
                </div>
              )}

              {data.duplicate_subject_names.length > 0 && (
                <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 p-4">
                  <p className="flex items-center gap-2 text-sm font-semibold text-amber-300">
                    <AlertTriangle size={15} />
                    Same subject name on more than one id
                  </p>
                  <p className="mt-1 text-xs text-amber-200/80">
                    Marks split across these. A trainer assigned one id cannot see marks recorded
                    against the other, even though both read the same on screen.
                  </p>
                  <ul className="mt-3 space-y-2">
                    {data.duplicate_subject_names.map((group) => (
                      <li key={group.subject_name} className="rounded border border-amber-500/20 bg-slate-950/40 p-3">
                        <p className="text-sm font-medium text-slate-100">{group.subject_name}</p>
                        <ul className="mt-1 space-y-1">
                          {group.variants.map((variant) => (
                            <li key={variant.subject_id} className="flex flex-wrap items-center gap-2 text-xs text-slate-400">
                              <code className="rounded bg-slate-800 px-1.5 py-0.5 text-indigo-300">
                                {variant.subject_code ?? shortId(variant.subject_id)}
                              </code>
                              <span>{variant.marks} mark{variant.marks === 1 ? '' : 's'}</span>
                              <span className="text-slate-600">·</span>
                              <span>{variant.module_name ?? 'no module'} / {variant.course_name ?? 'no course'}</span>
                              <span className="text-slate-600">·</span>
                              <span>
                                {variant.assigned_trainers.length
                                  ? `held by ${variant.assigned_trainers.join(', ')}`
                                  : 'held by nobody'}
                              </span>
                            </li>
                          ))}
                        </ul>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {data.unattributed_marks > 0 && (
                <p className="rounded-lg border border-slate-700 bg-slate-800/60 px-4 py-2 text-xs text-slate-300">
                  {data.unattributed_marks} mark{data.unattributed_marks === 1 ? ' has' : 's have'} no subject
                  recorded, so no trainer can see {data.unattributed_marks === 1 ? 'it' : 'them'}. Re-upload with a
                  subject column, or set the subject on the marks.
                </p>
              )}

              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm">
                  <thead className="border-b border-slate-700 text-xs uppercase tracking-wider text-slate-500">
                    <tr>
                      <th className="py-2 pr-4">Subject</th>
                      <th className="py-2 pr-4">Id</th>
                      <th className="py-2 pr-4">Marks</th>
                      <th className="py-2 pr-4">Assigned to</th>
                      {data.trainer && <th className="py-2">Visible</th>}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800">
                    {data.by_subject.map((row) => (
                      <tr key={row.subject_id ?? 'none'}>
                        <td className="py-2 pr-4 text-slate-100">{row.subject_name}</td>
                        <td className="py-2 pr-4">
                          <code className="rounded bg-slate-800 px-1.5 py-0.5 text-xs text-indigo-300">
                            {row.subject_code ?? shortId(row.subject_id)}
                          </code>
                        </td>
                        <td className="py-2 pr-4 text-slate-300">{row.marks}</td>
                        <td className="py-2 pr-4 text-xs text-slate-400">
                          {row.assigned_trainers.length ? row.assigned_trainers.join(', ') : '—'}
                        </td>
                        {data.trainer && (
                          <td className="py-2">
                            {row.visible_to_trainer ? (
                              <span className="inline-flex items-center gap-1 text-xs text-emerald-300">
                                <Eye size={12} /> Yes
                              </span>
                            ) : (
                              <span className="inline-flex items-center gap-1 text-xs text-amber-300">
                                <EyeOff size={12} /> No
                              </span>
                            )}
                          </td>
                        )}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {data.trainer && data.hidden_from_trainer.length > 0 && (
                <p className="text-xs text-slate-400">
                  To let {data.trainer.name ?? 'this trainer'} see the hidden marks, assign them the subject id
                  those marks are on — Trainers → Assign Subjects — or move the marks onto the subject they
                  already hold.
                </p>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function Stat({ label, value, tone }: { label: string; value: number; tone?: 'good' | 'warn' }) {
  const colour = tone === 'good' ? 'text-emerald-300' : tone === 'warn' ? 'text-amber-300' : 'text-slate-100';
  return (
    <div className="rounded-lg border border-slate-700 bg-slate-800/60 px-4 py-3">
      <p className="text-xs uppercase tracking-wider text-slate-500">{label}</p>
      <p className={`mt-1 text-xl font-bold ${colour}`}>{value}</p>
    </div>
  );
}
