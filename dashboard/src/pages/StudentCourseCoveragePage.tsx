import { useCallback, useEffect, useMemo, useState } from 'react';
import { AlertCircle, BookOpenCheck, CheckCircle2, RefreshCw, Save, XCircle } from 'lucide-react';
import {
  syllabusCoverageAPI,
  type CoverageTopic,
  type StudentCoverageChecklist,
} from '../api/syllabusCoverage';

/**
 * The learner's half of course coverage validation.
 *
 * Coverage used to be reported by the trainer alone, which made a claim of
 * 100% impossible to contradict. This screen asks the class the same question
 * about the same topics, and the oversight report puts the two answers side by
 * side.
 */

type Draft = { was_covered: boolean; comment: string };

const fmtDate = (value: string | null) =>
  value ? new Date(value).toLocaleDateString() : '—';

export default function StudentCourseCoveragePage() {
  const [data, setData] = useState<StudentCoverageChecklist | null>(null);
  const [subjectId, setSubjectId] = useState('');
  const [drafts, setDrafts] = useState<Record<string, Draft>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const result = await syllabusCoverageAPI.getStudentChecklist(subjectId || undefined);
      setData(result);
      // Answers already on record seed the form, so revising one topic does not
      // silently resubmit the others.
      setDrafts({});
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load your coverage checklist.');
    } finally {
      setLoading(false);
    }
  }, [subjectId]);

  useEffect(() => { load(); }, [load]);

  const setAnswer = (topic: CoverageTopic, was_covered: boolean) => {
    setDrafts((current) => ({
      ...current,
      [topic.lesson_plan_id]: {
        was_covered,
        comment: current[topic.lesson_plan_id]?.comment ?? topic.my_comment ?? '',
      },
    }));
  };

  const setComment = (topic: CoverageTopic, comment: string) => {
    setDrafts((current) => {
      const existing = current[topic.lesson_plan_id];
      // A comment on its own has nothing to attach to, so it only counts once
      // the learner has actually answered yes or no.
      if (!existing && topic.my_answer === null) return current;
      return {
        ...current,
        [topic.lesson_plan_id]: {
          was_covered: existing?.was_covered ?? Boolean(topic.my_answer),
          comment,
        },
      };
    });
  };

  const pendingCount = Object.keys(drafts).length;

  const save = async () => {
    if (pendingCount === 0) return;
    try {
      setSaving(true);
      setError(null);
      setNotice(null);
      const responses = Object.entries(drafts).map(([lesson_plan_id, draft]) => ({
        lesson_plan_id,
        was_covered: draft.was_covered,
        comment: draft.comment.trim() || null,
      }));
      const result = await syllabusCoverageAPI.submitValidations(responses);
      setNotice(`Saved ${result.count} response${result.count === 1 ? '' : 's'}. Thank you.`);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save your responses.');
    } finally {
      setSaving(false);
    }
  };

  const grouped = useMemo(() => {
    const bySubject = new Map<string, { name: string; topics: CoverageTopic[] }>();
    for (const topic of data?.topics ?? []) {
      const entry = bySubject.get(topic.subject_id)
        ?? { name: topic.subject_name ?? 'Unnamed subject', topics: [] };
      entry.topics.push(topic);
      bySubject.set(topic.subject_id, entry);
    }
    return [...bySubject.entries()];
  }, [data]);

  const summary = data?.summary;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="flex items-center gap-3 text-3xl font-bold text-slate-200">
            <BookOpenCheck className="text-cyan-400" /> Course Coverage
          </h1>
          <p className="mt-1 max-w-2xl text-sm text-slate-400">
            Your trainers record which topics they have taught. Confirming what you actually
            covered in class is what turns that record into something the college can rely on.
            Your answers are reported to your department as a class total, never topic by topic
            with your name on it.
          </p>
        </div>
        <button
          type="button"
          onClick={load}
          className="flex items-center gap-2 rounded-xl border border-slate-700 px-4 py-2 text-sm text-slate-300 hover:bg-slate-800"
        >
          <RefreshCw size={16} /> Refresh
        </button>
      </div>

      {error && (
        <div className="flex items-center gap-2 rounded-2xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-200">
          <AlertCircle size={16} /> {error}
        </div>
      )}
      {notice && (
        <div className="flex items-center gap-2 rounded-2xl border border-emerald-500/30 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-200">
          <CheckCircle2 size={16} /> {notice}
        </div>
      )}

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {[
          { label: 'Topics to review', value: summary?.total ?? 0 },
          { label: 'You have answered', value: summary?.answered ?? 0 },
          { label: 'Confirmed as taught', value: summary?.confirmed ?? 0 },
          { label: 'Marked not taught', value: summary?.denied ?? 0 },
        ].map((tile) => (
          <div key={tile.label} className="rounded-2xl border border-slate-800 bg-slate-900 p-5">
            <p className="text-xs uppercase tracking-[0.2em] text-slate-500">{tile.label}</p>
            <p className="mt-2 text-3xl font-bold text-slate-100">{tile.value}</p>
          </div>
        ))}
      </div>

      <label className="block rounded-2xl border border-slate-800 bg-slate-900 p-5">
        <span className="block text-xs font-bold uppercase tracking-[0.22em] text-cyan-300">Subject</span>
        <select
          value={subjectId}
          onChange={(event) => setSubjectId(event.target.value)}
          className="mt-3 w-full rounded-xl border border-slate-700 bg-slate-950 px-4 py-3 text-slate-100 md:max-w-xl"
        >
          <option value="">All my subjects</option>
          {(data?.subjects ?? []).map((subject) => (
            <option key={subject.id} value={subject.id}>
              {subject.name}{subject.code ? ` (${subject.code})` : ''}
            </option>
          ))}
        </select>
      </label>

      {loading ? (
        <div className="flex h-40 items-center justify-center">
          <div className="h-10 w-10 animate-spin rounded-full border-4 border-slate-700 border-t-cyan-400" />
        </div>
      ) : grouped.length === 0 ? (
        <div className="rounded-2xl border border-slate-800 bg-slate-900 p-8 text-center text-sm text-slate-400">
          Nothing to review yet. Topics appear here once a trainer marks them as taught.
        </div>
      ) : (
        <div className="space-y-6">
          {grouped.map(([id, group]) => (
            <section key={id} className="rounded-2xl border border-slate-800 bg-slate-900 p-5">
              <h2 className="text-lg font-bold text-slate-100">{group.name}</h2>
              <div className="mt-4 space-y-3">
                {group.topics.map((topic) => {
                  const draft = drafts[topic.lesson_plan_id];
                  const answer = draft ? draft.was_covered : topic.my_answer;
                  const comment = draft ? draft.comment : (topic.my_comment ?? '');
                  return (
                    <div key={topic.lesson_plan_id} className="rounded-xl border border-slate-800 bg-slate-950 p-4">
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div className="min-w-0">
                          <p className="font-semibold text-slate-100">{topic.topic}</p>
                          {topic.description && (
                            <p className="mt-1 text-sm text-slate-400">{topic.description}</p>
                          )}
                          <p className="mt-1 text-xs text-slate-500">
                            Reported taught {fmtDate(topic.covered_date)}
                            {topic.trainer_name ? ` · ${topic.trainer_name}` : ''}
                          </p>
                        </div>
                        <div className="flex shrink-0 gap-2">
                          <button
                            type="button"
                            onClick={() => setAnswer(topic, true)}
                            aria-pressed={answer === true}
                            className={`flex items-center gap-1.5 rounded-lg px-3 py-2 text-xs font-bold transition ${
                              answer === true
                                ? 'bg-emerald-500 text-slate-950'
                                : 'border border-slate-700 text-slate-300 hover:bg-slate-800'
                            }`}
                          >
                            <CheckCircle2 size={14} /> Covered
                          </button>
                          <button
                            type="button"
                            onClick={() => setAnswer(topic, false)}
                            aria-pressed={answer === false}
                            className={`flex items-center gap-1.5 rounded-lg px-3 py-2 text-xs font-bold transition ${
                              answer === false
                                ? 'bg-rose-500 text-slate-950'
                                : 'border border-slate-700 text-slate-300 hover:bg-slate-800'
                            }`}
                          >
                            <XCircle size={14} /> Not covered
                          </button>
                        </div>
                      </div>
                      {answer !== null && (
                        <input
                          type="text"
                          value={comment}
                          maxLength={1000}
                          placeholder="Optional: what was missed, or how it was covered"
                          onChange={(event) => setComment(topic, event.target.value)}
                          className="mt-3 w-full rounded-lg border border-slate-800 bg-slate-900 px-3 py-2 text-sm text-slate-200 placeholder:text-slate-600"
                        />
                      )}
                    </div>
                  );
                })}
              </div>
            </section>
          ))}
        </div>
      )}

      {pendingCount > 0 && (
        <div className="sticky bottom-4 flex items-center justify-between gap-4 rounded-2xl border border-cyan-500/30 bg-slate-900/95 px-5 py-4 backdrop-blur">
          <p className="text-sm text-slate-300">
            {pendingCount} unsaved response{pendingCount === 1 ? '' : 's'}.
          </p>
          <button
            type="button"
            onClick={save}
            disabled={saving}
            className="flex items-center gap-2 rounded-xl bg-cyan-500 px-5 py-2.5 text-sm font-bold text-slate-950 hover:bg-cyan-400 disabled:opacity-50"
          >
            <Save size={16} /> {saving ? 'Saving…' : 'Submit responses'}
          </button>
        </div>
      )}
    </div>
  );
}
