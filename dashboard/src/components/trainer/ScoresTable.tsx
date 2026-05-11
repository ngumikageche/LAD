import { useEffect, useState } from 'react';
import { AlertCircle, Search } from 'lucide-react';
import { trainerApi, type PaginatedScores, type TrainerSubject } from '../../services/trainerApi';
import { SortableTh } from '../ui/TableControls';
import type { SortState } from '../../hooks/useTableControls';

type ScoresTableProps = {
  subjects: TrainerSubject[];
  refreshToken: number;
};

const ScoresTable = ({ subjects, refreshToken }: ScoresTableProps) => {
  const [scores, setScores] = useState<PaginatedScores | null>(null);
  const [subjectId, setSubjectId] = useState('');
  const [term, setTerm] = useState('');
  const [studentId, setStudentId] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [page, setPage] = useState(1);

  const [sort, setSort] = useState<SortState | null>(null);

  const handleSort = (key: string) => {
    setSort((prev) =>
      prev?.key === key ? { key, dir: prev.dir === 'asc' ? 'desc' : 'asc' } : { key, dir: 'asc' },
    );
    setPage(1);
  };

  useEffect(() => {
    const loadScores = async () => {
      try {
        setIsLoading(true);
        setError(null);
        const data = await trainerApi.getScores({
          ...(subjectId ? { subject_id: subjectId } : {}),
          ...(term.trim() ? { term: term.trim() } : {}),
          ...(studentId.trim() ? { student_id: studentId.trim() } : {}),
          page,
          per_page: 10,
        });
        setScores(data);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load scores.');
      } finally {
        setIsLoading(false);
      }
    };

    loadScores();
  }, [page, refreshToken, studentId, subjectId, term]);

  return (
    <div className="rounded-3xl border border-slate-700 bg-slate-900 p-6 shadow-sm">
      <div className="mb-6 flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <h2 className="text-2xl font-semibold text-slate-100">Scores</h2>
          <p className="mt-1 text-sm text-slate-400">Filter by subject, term, or student for fast review.</p>
        </div>

        <div className="grid gap-3 md:grid-cols-3">
          <label className="block">
            <span className="mb-2 block text-sm font-medium text-slate-300">Subject</span>
            <select
              value={subjectId}
              onChange={(event) => {
                setPage(1);
                setSubjectId(event.target.value);
              }}
              className="w-full rounded-2xl border border-slate-700 px-4 py-3 text-sm text-slate-100 outline-none transition focus:border-sky-500 focus:ring-2 focus:ring-sky-100"
            >
              <option value="">All subjects</option>
              {subjects.map((subject) => (
                <option key={subject.id} value={subject.id}>
                  {subject.name}
                </option>
              ))}
            </select>
          </label>

          <label className="block">
            <span className="mb-2 block text-sm font-medium text-slate-300">Term</span>
            <input
              value={term}
              onChange={(event) => {
                setPage(1);
                setTerm(event.target.value);
              }}
              className="w-full rounded-2xl border border-slate-700 px-4 py-3 text-sm text-slate-100 outline-none transition focus:border-sky-500 focus:ring-2 focus:ring-sky-100"
              placeholder="Term 1"
            />
          </label>

          <label className="block">
            <span className="mb-2 block text-sm font-medium text-slate-300">Student</span>
            <div className="relative">
              <Search className="pointer-events-none absolute left-4 top-3.5 text-slate-500" size={16} />
              <input
                value={studentId}
                onChange={(event) => {
                  setPage(1);
                  setStudentId(event.target.value);
                }}
                className="w-full rounded-2xl border border-slate-700 py-3 pl-10 pr-4 text-sm text-slate-100 outline-none transition focus:border-sky-500 focus:ring-2 focus:ring-sky-100"
                placeholder="Search by name or ID"
              />
            </div>
          </label>
        </div>
      </div>

      {error ? (
        <div className="mb-4 flex items-center gap-2 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          <AlertCircle size={18} />
          <span>{error}</span>
        </div>
      ) : null}

      <div className="overflow-x-auto rounded-2xl border border-slate-700">
        <table className="min-w-full divide-y divide-slate-800">
          <thead className="bg-slate-800">
            <tr>
              <SortableTh label="Student" sortKey="student" sort={sort} onSort={handleSort} className="px-4 py-3" />
              <SortableTh label="Subject" sortKey="subject" sort={sort} onSort={handleSort} className="px-4 py-3" />
              <SortableTh label="Term" sortKey="term" sort={sort} onSort={handleSort} className="px-4 py-3" />
              <SortableTh label="Score" sortKey="score" sort={sort} onSort={handleSort} className="px-4 py-3" />
              <SortableTh label="Status" sortKey="is_passed" sort={sort} onSort={handleSort} className="px-4 py-3" />
              <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-400">Feedback</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-800 bg-slate-900">
            {isLoading ? (
              <tr>
                <td className="px-4 py-8 text-sm text-slate-500" colSpan={6}>
                  Loading scores...
                </td>
              </tr>
            ) : null}

            {!isLoading && (scores?.items.length ?? 0) === 0 ? (
              <tr>
                <td className="px-4 py-8 text-sm text-slate-500" colSpan={6}>
                  No scores match the current filters.
                </td>
              </tr>
            ) : null}

            {!isLoading
              ? scores?.items.map((item) => (
                  <tr key={item.id}>
                    <td className="px-4 py-4 text-sm text-slate-100">
                      <div className="font-medium">{item.student?.name ?? 'Unknown student'}</div>
                      <div className="text-xs text-slate-500">{item.student?.registration_number ?? item.student_id}</div>
                    </td>
                    <td className="px-4 py-4 text-sm text-slate-300">{item.subject?.name ?? '-'}</td>
                    <td className="px-4 py-4 text-sm text-slate-300">{item.term ?? '-'}</td>
                    <td className="px-4 py-4 text-sm font-semibold text-slate-100">{item.score.toFixed(2)}</td>
                    <td className="px-4 py-4 text-sm">
                      <span
                        className={`rounded-full px-3 py-1 text-xs font-semibold ${
                          (item.is_passed ?? item.score >= 50)
                            ? 'bg-emerald-100 text-emerald-700'
                            : 'bg-red-100 text-red-700'
                        }`}
                      >
                        {(item.is_passed ?? item.score >= 50) ? 'Pass' : 'At Risk'}
                      </span>
                    </td>
                    <td className="px-4 py-4 text-sm text-slate-400">{item.feedback || 'No feedback yet'}</td>
                  </tr>
                ))
              : null}
          </tbody>
        </table>
      </div>

      {scores ? (
        <div className="mt-4 flex items-center justify-between text-sm text-slate-400">
          <span>
            Page {scores.pagination.page} of {scores.pagination.total_pages}
          </span>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setPage((current) => Math.max(1, current - 1))}
              disabled={scores.pagination.page <= 1}
              className="rounded-xl border border-slate-700 px-4 py-2 transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60"
            >
              Previous
            </button>
            <button
              type="button"
              onClick={() => setPage((current) => Math.min(scores.pagination.total_pages, current + 1))}
              disabled={scores.pagination.page >= scores.pagination.total_pages}
              className="rounded-xl border border-slate-700 px-4 py-2 transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60"
            >
              Next
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
};

export default ScoresTable;
