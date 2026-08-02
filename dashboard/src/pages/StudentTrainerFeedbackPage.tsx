import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  AlertCircle, CheckCircle2, EyeOff, MessageSquareQuote, RefreshCw,
  Send, Star, Trash2, UserCircle2,
} from 'lucide-react';
import {
  FEEDBACK_CATEGORIES,
  trainerFeedbackAPI,
  type FeedbackCategory,
  type FeedbackTarget,
  type TrainerFeedbackItem,
} from '../api/feedback';

const DIMENSIONS = [
  { key: 'teaching_rating', label: 'Teaching & delivery' },
  { key: 'communication_rating', label: 'Communication' },
  { key: 'support_rating', label: 'Learner support' },
] as const;

type DimensionKey = (typeof DIMENSIONS)[number]['key'];

function StarRating({
  value,
  onChange,
  size = 24,
  label,
  readOnly = false,
}: {
  value: number | null;
  onChange?: (next: number) => void;
  size?: number;
  label?: string;
  readOnly?: boolean;
}) {
  return (
    <div className="flex items-center gap-1" role={readOnly ? undefined : 'radiogroup'} aria-label={label}>
      {[1, 2, 3, 4, 5].map((star) => {
        const filled = (value ?? 0) >= star;
        if (readOnly) {
          return (
            <Star
              key={star}
              size={size}
              className={filled ? 'fill-amber-400 text-amber-400' : 'text-slate-700'}
            />
          );
        }
        return (
          <button
            key={star}
            type="button"
            role="radio"
            aria-checked={value === star}
            aria-label={`${star} star${star > 1 ? 's' : ''}`}
            onClick={() => onChange?.(star)}
            className="rounded transition hover:scale-110 focus:outline-none focus:ring-2 focus:ring-amber-400"
          >
            <Star
              size={size}
              className={filled ? 'fill-amber-400 text-amber-400' : 'text-slate-600 hover:text-slate-400'}
            />
          </button>
        );
      })}
    </div>
  );
}

export default function StudentTrainerFeedbackPage() {
  const [targets, setTargets] = useState<FeedbackTarget[]>([]);
  const [mine, setMine] = useState<TrainerFeedbackItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const [selected, setSelected] = useState<FeedbackTarget | null>(null);
  const [rating, setRating] = useState<number | null>(null);
  const [dimensions, setDimensions] = useState<Record<DimensionKey, number | null>>({
    teaching_rating: null,
    communication_rating: null,
    support_rating: null,
  });
  const [category, setCategory] = useState<FeedbackCategory>('general');
  const [comment, setComment] = useState('');
  const [isAnonymous, setIsAnonymous] = useState(true);

  const load = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const [targetRows, mineRows] = await Promise.all([
        trainerFeedbackAPI.getTargets(),
        trainerFeedbackAPI.getMine(),
      ]);
      setTargets(targetRows);
      setMine(mineRows);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load trainers');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const submittedByKey = useMemo(() => {
    const map = new Map<string, TrainerFeedbackItem>();
    mine.forEach((item) => map.set(`${item.trainer_id}:${item.subject_id ?? ''}`, item));
    return map;
  }, [mine]);

  const resetForm = () => {
    setSelected(null);
    setRating(null);
    setDimensions({ teaching_rating: null, communication_rating: null, support_rating: null });
    setCategory('general');
    setComment('');
    setIsAnonymous(true);
  };

  const handleSelect = (target: FeedbackTarget) => {
    setSelected(target);
    setError(null);
    const existing = submittedByKey.get(`${target.trainer_id}:${target.subject_id}`);
    setRating(existing?.rating ?? null);
    setDimensions({
      teaching_rating: existing?.teaching_rating ?? null,
      communication_rating: existing?.communication_rating ?? null,
      support_rating: existing?.support_rating ?? null,
    });
    setCategory(existing?.category ?? 'general');
    setComment(existing?.comment ?? '');
    setIsAnonymous(existing?.is_anonymous ?? true);
  };

  const handleSubmit = async () => {
    if (!selected) return;
    if (!rating) {
      setError('Give an overall rating from 1 to 5 stars.');
      return;
    }
    try {
      setSubmitting(true);
      setError(null);
      await trainerFeedbackAPI.submit({
        trainer_id: selected.trainer_id,
        subject_id: selected.subject_id,
        rating,
        ...dimensions,
        category,
        comment: comment.trim() || null,
        is_anonymous: isAnonymous,
      });
      setSuccess(
        `Feedback sent for ${selected.trainer_name} — ${selected.subject_name}.`
        + (isAnonymous ? ' Your name was not shared with the trainer.' : ''),
      );
      resetForm();
      await load();
      setTimeout(() => setSuccess(null), 4000);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to send feedback');
    } finally {
      setSubmitting(false);
    }
  };

  const handleWithdraw = async (item: TrainerFeedbackItem) => {
    try {
      setError(null);
      await trainerFeedbackAPI.withdraw(item.id);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to withdraw feedback');
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
      <header>
        <h1 className="flex items-center gap-3 text-3xl font-bold text-white">
          <Star className="text-amber-400" /> Rate My Trainers
        </h1>
        <p className="mt-2 text-slate-400">
          Tell your trainers what is working and what could be better. Feedback is anonymous by default.
        </p>
      </header>

      {error ? (
        <div className="flex items-center gap-2 rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-200">
          <AlertCircle size={16} /> {error}
        </div>
      ) : null}
      {success ? (
        <div className="flex items-center gap-2 rounded-xl border border-green-500/30 bg-green-500/10 px-4 py-3 text-sm text-green-200">
          <CheckCircle2 size={16} /> {success}
        </div>
      ) : null}

      <div className="grid gap-6 lg:grid-cols-3">
        {/* Trainer picker */}
        <section className="rounded-2xl border border-slate-800 bg-slate-900">
          <div className="border-b border-slate-800 p-5">
            <h2 className="text-base font-semibold text-slate-100">Your trainers</h2>
            <p className="mt-1 text-xs text-slate-500">
              {targets.length} trainer/subject pairing{targets.length === 1 ? '' : 's'}
            </p>
          </div>
          <div className="max-h-[560px] divide-y divide-slate-800 overflow-y-auto">
            {targets.map((target) => {
              const key = `${target.trainer_id}:${target.subject_id}`;
              const active = selected && `${selected.trainer_id}:${selected.subject_id}` === key;
              return (
                <button
                  key={key}
                  onClick={() => handleSelect(target)}
                  className={`w-full px-5 py-4 text-left transition ${
                    active ? 'border-l-2 border-amber-400 bg-amber-500/10' : 'hover:bg-slate-800/60'
                  }`}
                >
                  <p className="flex items-center gap-2 font-semibold text-slate-100">
                    <UserCircle2 size={16} className="shrink-0 text-slate-500" />
                    {target.trainer_name}
                  </p>
                  <p className="mt-1 text-xs text-slate-400">
                    {target.subject_code ? (
                      <span className="mr-2 rounded bg-slate-800 px-1.5 py-0.5 font-mono text-slate-300">
                        {target.subject_code}
                      </span>
                    ) : null}
                    {target.subject_name}
                  </p>
                  {target.already_submitted ? (
                    <span className="mt-2 inline-flex items-center gap-1 text-xs text-teal-300">
                      <CheckCircle2 size={12} /> Rated {target.my_rating}/5 — tap to revise
                    </span>
                  ) : null}
                </button>
              );
            })}
            {targets.length === 0 ? (
              <p className="px-5 py-10 text-center text-sm text-slate-500">
                You are not enrolled in any subject with an assigned trainer yet.
              </p>
            ) : null}
          </div>
        </section>

        {/* Feedback form */}
        <section className="space-y-6 lg:col-span-2">
          {selected ? (
            <div className="rounded-2xl border border-slate-800 bg-slate-900 p-6">
              <div className="mb-5 border-b border-slate-800 pb-4">
                <h2 className="text-lg font-bold text-slate-100">{selected.trainer_name}</h2>
                <p className="mt-1 text-sm text-slate-400">
                  {selected.subject_code ? `${selected.subject_code} — ` : ''}{selected.subject_name}
                </p>
              </div>

              <div className="mb-6">
                <label className="mb-2 block text-sm font-medium text-slate-300">Overall rating *</label>
                <div className="flex items-center gap-3">
                  <StarRating value={rating} onChange={setRating} size={28} label="Overall rating" />
                  <span className="text-sm text-slate-500">{rating ? `${rating}/5` : 'Not rated yet'}</span>
                </div>
              </div>

              <div className="mb-6 grid gap-4 sm:grid-cols-3">
                {DIMENSIONS.map((dimension) => (
                  <div key={dimension.key}>
                    <label className="mb-2 block text-xs font-medium uppercase tracking-wider text-slate-500">
                      {dimension.label}
                    </label>
                    <StarRating
                      value={dimensions[dimension.key]}
                      onChange={(next) => setDimensions((current) => ({ ...current, [dimension.key]: next }))}
                      size={18}
                      label={dimension.label}
                    />
                  </div>
                ))}
              </div>

              <div className="mb-4">
                <label className="mb-2 block text-sm font-medium text-slate-300">Focus area</label>
                <select
                  value={category}
                  onChange={(event) => setCategory(event.target.value as FeedbackCategory)}
                  className="w-full rounded-lg border border-slate-700 bg-slate-800 px-4 py-3 text-slate-100 focus:border-transparent focus:ring-2 focus:ring-amber-500"
                >
                  {FEEDBACK_CATEGORIES.map((option) => (
                    <option key={option.value} value={option.value}>{option.label}</option>
                  ))}
                </select>
              </div>

              <div className="mb-4">
                <label className="mb-2 block text-sm font-medium text-slate-300">Comments</label>
                <textarea
                  value={comment}
                  onChange={(event) => setComment(event.target.value.slice(0, 2000))}
                  rows={5}
                  placeholder="What helped you learn? What would you change?"
                  className="w-full rounded-lg border border-slate-700 bg-slate-800 px-4 py-3 text-slate-100 placeholder-slate-500 focus:border-transparent focus:ring-2 focus:ring-amber-500"
                />
                <p className="mt-2 text-xs text-slate-500">{comment.length}/2000 characters</p>
              </div>

              <label className="mb-5 flex items-start gap-3 rounded-lg border border-slate-700 bg-slate-800/70 p-4">
                <input
                  type="checkbox"
                  checked={isAnonymous}
                  onChange={(event) => setIsAnonymous(event.target.checked)}
                  className="mt-0.5 h-4 w-4 rounded border-slate-600 bg-slate-900 text-amber-500 focus:ring-amber-500"
                />
                <span className="text-sm text-slate-300">
                  <span className="flex items-center gap-2 font-medium text-slate-200">
                    <EyeOff size={14} /> Submit anonymously
                  </span>
                  <span className="mt-1 block text-xs text-slate-500">
                    Your trainer sees the rating and comments but not your name. Institution
                    administrators can still see who submitted, so abusive feedback is traceable.
                  </span>
                </span>
              </label>

              <div className="flex gap-3">
                <button
                  onClick={handleSubmit}
                  disabled={submitting || !rating}
                  className="flex flex-1 items-center justify-center gap-2 rounded-lg bg-amber-600 px-6 py-3 font-medium text-white transition hover:bg-amber-700 disabled:opacity-50"
                >
                  <Send size={18} />
                  {submitting ? 'Sending...' : 'Send feedback'}
                </button>
                <button
                  onClick={resetForm}
                  className="rounded-lg bg-slate-800 px-5 py-3 text-sm text-slate-400 transition hover:bg-slate-700"
                >
                  Cancel
                </button>
              </div>
            </div>
          ) : (
            <div className="rounded-2xl border border-dashed border-slate-700 p-12 text-center">
              <MessageSquareQuote size={44} className="mx-auto mb-4 text-slate-600" />
              <p className="text-slate-500">Pick a trainer on the left to share your feedback.</p>
            </div>
          )}

          {/* Previously submitted */}
          {mine.length > 0 ? (
            <div className="rounded-2xl border border-slate-800 bg-slate-900 p-6">
              <h3 className="mb-4 text-base font-semibold text-slate-100">Feedback you have sent</h3>
              <div className="space-y-4">
                {mine.map((item) => (
                  <article key={item.id} className="rounded-xl border-l-4 border-amber-500 bg-slate-800/60 p-4">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div>
                        <p className="font-medium text-slate-100">{item.trainer_name}</p>
                        <p className="mt-0.5 text-xs text-slate-500">
                          {item.subject_code ? `${item.subject_code} — ` : ''}
                          {item.subject_name ?? 'General'}
                          {item.created_at ? ` • ${new Date(item.created_at).toLocaleDateString()}` : ''}
                          {item.is_anonymous ? ' • anonymous' : ''}
                        </p>
                      </div>
                      <div className="flex items-center gap-3">
                        <StarRating value={item.rating} size={14} readOnly />
                        <button
                          onClick={() => handleWithdraw(item)}
                          title="Withdraw this feedback"
                          className="text-slate-500 transition hover:text-red-400"
                        >
                          <Trash2 size={15} />
                        </button>
                      </div>
                    </div>
                    {item.comment ? (
                      <p className="mt-3 whitespace-pre-line text-sm text-slate-300">{item.comment}</p>
                    ) : null}
                    {item.trainer_response ? (
                      <div className="mt-3 rounded-lg border border-teal-500/30 bg-teal-500/10 p-3">
                        <p className="text-xs font-semibold uppercase tracking-wider text-teal-300">
                          Trainer replied
                        </p>
                        <p className="mt-1 whitespace-pre-line text-sm text-slate-200">{item.trainer_response}</p>
                      </div>
                    ) : null}
                  </article>
                ))}
              </div>
            </div>
          ) : null}
        </section>
      </div>
    </div>
  );
}
