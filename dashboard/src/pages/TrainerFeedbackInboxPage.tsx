import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  AlertCircle, CheckCircle2, EyeOff, Inbox, MessageSquareReply,
  RefreshCw, Send, Star, Users,
} from 'lucide-react';
import {
  trainerFeedbackAPI,
  type FeedbackSummary,
  type TrainerFeedbackItem,
} from '../api/feedback';
import { useAuth } from '../auth/AuthContext';
import { hasPermission } from '../auth/ProtectedRoute';

const DIMENSION_LABELS: Record<string, string> = {
  teaching_rating: 'Teaching & delivery',
  communication_rating: 'Communication',
  support_rating: 'Learner support',
};

function Stars({ value, size = 14 }: { value: number | null; size?: number }) {
  return (
    <span className="inline-flex items-center gap-0.5">
      {[1, 2, 3, 4, 5].map((star) => (
        <Star
          key={star}
          size={size}
          className={(value ?? 0) >= star ? 'fill-amber-400 text-amber-400' : 'text-slate-700'}
        />
      ))}
    </span>
  );
}

export default function TrainerFeedbackInboxPage() {
  const { user } = useAuth();
  const canFilterTrainers = hasPermission(user, 'feedback.trainer.view');

  const [feedback, setFeedback] = useState<TrainerFeedbackItem[]>([]);
  const [summary, setSummary] = useState<FeedbackSummary | null>(null);
  const [trainers, setTrainers] = useState<Array<{ id: string; name: string; feedback_count: number }>>([]);
  const [trainerId, setTrainerId] = useState('');
  const [canSeeIdentities, setCanSeeIdentities] = useState(false);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [replyFor, setReplyFor] = useState<string | null>(null);
  const [replyText, setReplyText] = useState('');
  const [sending, setSending] = useState(false);

  const load = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const params = trainerId ? { trainer_id: trainerId } : {};
      const [received, summaryData] = await Promise.all([
        trainerFeedbackAPI.getReceived(params),
        trainerFeedbackAPI.getSummary(params),
      ]);
      setFeedback(received.feedback);
      setCanSeeIdentities(received.can_see_identities);
      setSummary(summaryData);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load feedback');
    } finally {
      setLoading(false);
    }
  }, [trainerId]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (!canFilterTrainers) return;
    trainerFeedbackAPI.getTrainerDirectory().then(setTrainers).catch(() => setTrainers([]));
  }, [canFilterTrainers]);

  const maxBar = useMemo(
    () => Math.max(1, ...Object.values(summary?.distribution ?? {})),
    [summary],
  );

  const handleReply = async (feedbackId: string) => {
    if (!replyText.trim()) return;
    try {
      setSending(true);
      setError(null);
      await trainerFeedbackAPI.respond(feedbackId, replyText.trim());
      setReplyFor(null);
      setReplyText('');
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to send reply');
    } finally {
      setSending(false);
    }
  };

  if (loading) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <RefreshCw className="h-8 w-8 animate-spin text-amber-400" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="flex items-center gap-3 text-3xl font-bold text-white">
            <Inbox className="text-amber-400" /> Learner Feedback
          </h1>
          <p className="mt-2 text-slate-400">
            What your learners say about teaching, materials, and support.
          </p>
        </div>
        {canFilterTrainers && trainers.length > 0 ? (
          <label className="flex items-center gap-2 text-sm text-slate-400">
            <Users size={15} />
            <select
              value={trainerId}
              onChange={(event) => setTrainerId(event.target.value)}
              className="rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-slate-200 focus:ring-2 focus:ring-amber-500"
            >
              <option value="">All trainers</option>
              {trainers.map((trainer) => (
                <option key={trainer.id} value={trainer.id}>
                  {trainer.name} ({trainer.feedback_count})
                </option>
              ))}
            </select>
          </label>
        ) : null}
      </header>

      {error ? (
        <div className="flex items-center gap-2 rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-200">
          <AlertCircle size={16} /> {error}
        </div>
      ) : null}

      {/* Summary */}
      {summary && summary.total > 0 ? (
        <div className="grid gap-5 lg:grid-cols-3">
          <div className="rounded-2xl border border-slate-800 bg-slate-900 p-6">
            <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">Overall</p>
            <p className="mt-2 text-4xl font-bold text-amber-300">
              {summary.average_rating?.toFixed(2) ?? '—'}
              <span className="ml-1 text-base font-normal text-slate-500">/ 5</span>
            </p>
            <div className="mt-2">
              <Stars value={Math.round(summary.average_rating ?? 0)} size={16} />
            </div>
            <p className="mt-3 text-sm text-slate-400">
              {summary.total} submission{summary.total === 1 ? '' : 's'} • {summary.awaiting_response} awaiting a reply
            </p>
          </div>

          <div className="rounded-2xl border border-slate-800 bg-slate-900 p-6">
            <p className="mb-3 text-xs font-semibold uppercase tracking-wider text-slate-500">Rating spread</p>
            <div className="space-y-2">
              {[5, 4, 3, 2, 1].map((star) => {
                const count = summary.distribution[String(star)] ?? 0;
                return (
                  <div key={star} className="flex items-center gap-3 text-xs">
                    <span className="w-3 text-slate-400">{star}</span>
                    <Star size={11} className="fill-amber-400 text-amber-400" />
                    <div className="h-2 flex-1 overflow-hidden rounded-full bg-slate-800">
                      <div
                        className="h-full rounded-full bg-amber-400/70"
                        style={{ width: `${(count / maxBar) * 100}%` }}
                      />
                    </div>
                    <span className="w-6 text-right text-slate-400">{count}</span>
                  </div>
                );
              })}
            </div>
          </div>

          <div className="rounded-2xl border border-slate-800 bg-slate-900 p-6">
            <p className="mb-3 text-xs font-semibold uppercase tracking-wider text-slate-500">By dimension</p>
            <div className="space-y-3">
              {Object.entries(DIMENSION_LABELS).map(([key, label]) => {
                const value = summary.averages[key as keyof FeedbackSummary['averages']];
                return (
                  <div key={key} className="flex items-center justify-between gap-3 text-sm">
                    <span className="text-slate-400">{label}</span>
                    <span className="flex items-center gap-2">
                      <Stars value={Math.round(value ?? 0)} size={12} />
                      <span className="w-8 text-right font-medium text-slate-200">
                        {value?.toFixed(1) ?? '—'}
                      </span>
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      ) : null}

      {/* By subject */}
      {summary && summary.by_subject.length > 1 ? (
        <div className="overflow-x-auto rounded-2xl border border-slate-800 bg-slate-900">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-slate-700 bg-slate-800">
              <tr>
                <th className="px-5 py-3 text-xs font-bold uppercase text-slate-400">Subject</th>
                <th className="px-5 py-3 text-xs font-bold uppercase text-slate-400">Responses</th>
                <th className="px-5 py-3 text-xs font-bold uppercase text-slate-400">Average</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800">
              {summary.by_subject.map((row) => (
                <tr key={row.subject_id ?? 'general'} className="hover:bg-slate-800/60">
                  <td className="px-5 py-3 text-slate-200">
                    {row.subject_code ? (
                      <span className="mr-2 rounded bg-slate-800 px-1.5 py-0.5 font-mono text-xs text-slate-300">
                        {row.subject_code}
                      </span>
                    ) : null}
                    {row.subject_name}
                  </td>
                  <td className="px-5 py-3 text-slate-400">{row.count}</td>
                  <td className="px-5 py-3">
                    <span className="flex items-center gap-2">
                      <Stars value={Math.round(row.average_rating ?? 0)} size={12} />
                      <span className="text-slate-300">{row.average_rating?.toFixed(2) ?? '—'}</span>
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}

      {/* Feedback list */}
      <div className="space-y-4">
        {feedback.map((item) => (
          <article key={item.id} className="rounded-2xl border border-slate-800 bg-slate-900 p-6">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div>
                <div className="flex items-center gap-3">
                  <Stars value={item.rating} size={16} />
                  <span className="text-sm font-semibold text-slate-200">{item.rating}/5</span>
                  <span className="rounded-full bg-slate-800 px-2.5 py-0.5 text-xs capitalize text-slate-400">
                    {item.category}
                  </span>
                </div>
                <p className="mt-2 text-xs text-slate-500">
                  {item.is_anonymous && !canSeeIdentities ? (
                    <span className="inline-flex items-center gap-1">
                      <EyeOff size={11} /> Anonymous learner
                    </span>
                  ) : (
                    item.student_name ?? 'Learner'
                  )}
                  {item.subject_name ? ` • ${item.subject_code ?? ''} ${item.subject_name}` : ''}
                  {canFilterTrainers && item.trainer_name ? ` • ${item.trainer_name}` : ''}
                  {item.created_at ? ` • ${new Date(item.created_at).toLocaleDateString()}` : ''}
                </p>
              </div>
              {item.status === 'answered' ? (
                <span className="inline-flex items-center gap-1 rounded-full bg-teal-500/15 px-3 py-1 text-xs font-medium text-teal-300">
                  <CheckCircle2 size={12} /> Replied
                </span>
              ) : null}
            </div>

            {item.comment ? (
              <p className="mt-4 whitespace-pre-line text-slate-300">{item.comment}</p>
            ) : (
              <p className="mt-4 text-sm italic text-slate-600">No written comment.</p>
            )}

            <div className="mt-4 flex flex-wrap gap-4 text-xs text-slate-500">
              {Object.entries(DIMENSION_LABELS).map(([key, label]) => {
                const value = item[key as keyof TrainerFeedbackItem] as number | null;
                if (value == null) return null;
                return (
                  <span key={key} className="flex items-center gap-1.5">
                    {label}: <Stars value={value} size={10} />
                  </span>
                );
              })}
            </div>

            {item.trainer_response ? (
              <div className="mt-4 rounded-lg border border-teal-500/30 bg-teal-500/10 p-4">
                <p className="text-xs font-semibold uppercase tracking-wider text-teal-300">Your reply</p>
                <p className="mt-1 whitespace-pre-line text-sm text-slate-200">{item.trainer_response}</p>
              </div>
            ) : replyFor === item.id ? (
              <div className="mt-4 space-y-3">
                <textarea
                  value={replyText}
                  onChange={(event) => setReplyText(event.target.value.slice(0, 2000))}
                  rows={3}
                  autoFocus
                  placeholder="Thank the learner and say what you will change..."
                  className="w-full rounded-lg border border-slate-700 bg-slate-800 px-4 py-3 text-sm text-slate-100 placeholder-slate-500 focus:ring-2 focus:ring-teal-500"
                />
                <div className="flex gap-2">
                  <button
                    onClick={() => handleReply(item.id)}
                    disabled={sending || !replyText.trim()}
                    className="flex items-center gap-2 rounded-lg bg-teal-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-teal-700 disabled:opacity-50"
                  >
                    <Send size={14} /> {sending ? 'Sending...' : 'Send reply'}
                  </button>
                  <button
                    onClick={() => { setReplyFor(null); setReplyText(''); }}
                    className="rounded-lg bg-slate-800 px-4 py-2 text-sm text-slate-400 transition hover:bg-slate-700"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            ) : (
              <button
                onClick={() => { setReplyFor(item.id); setReplyText(''); }}
                className="mt-4 inline-flex items-center gap-2 rounded-lg border border-slate-700 px-4 py-2 text-sm text-slate-300 transition hover:border-slate-600 hover:bg-slate-800"
              >
                <MessageSquareReply size={14} /> Reply
              </button>
            )}
          </article>
        ))}

        {feedback.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-slate-700 p-12 text-center text-slate-500">
            No learner feedback yet.
          </div>
        ) : null}
      </div>
    </div>
  );
}
