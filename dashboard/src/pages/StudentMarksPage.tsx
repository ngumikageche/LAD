import { useEffect, useMemo, useState } from 'react';
import { Filter, Search } from 'lucide-react';
import { studentApi, type StudentScore, type StudentSubject } from '../services/studentApi';

const StudentMarksPage = () => {
  const [subjects, setSubjects] = useState<StudentSubject[]>([]);
  const [scores, setScores] = useState<StudentScore[]>([]);
  const [pagination, setPagination] = useState({ page: 1, per_page: 10, total: 0, total_pages: 1 });
  const [selectedSubjectId, setSelectedSubjectId] = useState('');
  const [termFilter, setTermFilter] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const loadPage = async (page = 1) => {
    try {
      setLoading(true);
      setError('');
      const response = await studentApi.getResults({
        page,
        per_page: pagination.per_page,
        ...(selectedSubjectId ? { subject_id: selectedSubjectId } : {}),
        ...(termFilter.trim() ? { term: termFilter.trim() } : {}),
      });
      setScores(response.items);
      setPagination(response.pagination);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load scores');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    const loadSubjects = async () => {
      try {
        const response = await studentApi.getSubjects();
        setSubjects(response.items);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load subjects');
      }
    };

    loadSubjects();
  }, []);

  useEffect(() => {
    loadPage(1);
  }, [selectedSubjectId, termFilter]);

  const averageScore = useMemo(() => {
    if (scores.length === 0) {
      return 0;
    }
    return scores.reduce((sum, item) => sum + item.score, 0) / scores.length;
  }, [scores]);

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-4xl font-bold text-slate-900">My Scores</h1>
        <p className="mt-2 text-slate-600">Filter your academic results by subject or term.</p>
      </div>

      {error ? <div className="rounded-2xl border border-red-200 bg-red-50 p-4 text-red-700">{error}</div> : null}

      <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
        <div className="grid gap-4 lg:grid-cols-[1fr_1fr_auto]">
          <div>
            <label className="mb-2 block text-sm font-medium text-slate-700">Subject</label>
            <select
              value={selectedSubjectId}
              onChange={(event) => setSelectedSubjectId(event.target.value)}
              className="w-full rounded-2xl border border-slate-300 px-4 py-3 outline-none transition focus:border-slate-700"
            >
              <option value="">All subjects</option>
              {subjects.map((subject) => (
                <option key={subject.id} value={subject.id}>
                  {subject.name}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="mb-2 block text-sm font-medium text-slate-700">Term</label>
            <div className="relative">
              <Search className="absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <input
                value={termFilter}
                onChange={(event) => setTermFilter(event.target.value)}
                placeholder="e.g. Term 1"
                className="w-full rounded-2xl border border-slate-300 py-3 pl-11 pr-4 outline-none transition focus:border-slate-700"
              />
            </div>
          </div>

          <div className="flex items-end">
            <button
              onClick={() => loadPage(1)}
              className="inline-flex items-center gap-2 rounded-2xl bg-slate-900 px-5 py-3 font-medium text-white transition hover:bg-slate-800"
            >
              <Filter className="h-4 w-4" />
              Apply Filters
            </button>
          </div>
        </div>
      </section>

      <div className="grid gap-5 md:grid-cols-3">
        <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
          <p className="text-sm text-slate-500">Displayed average</p>
          <p className="mt-3 text-3xl font-bold text-slate-900">{averageScore.toFixed(1)}%</p>
        </div>
        <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
          <p className="text-sm text-slate-500">Records</p>
          <p className="mt-3 text-3xl font-bold text-slate-900">{pagination.total}</p>
        </div>
        <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
          <p className="text-sm text-slate-500">Current page</p>
          <p className="mt-3 text-3xl font-bold text-slate-900">
            {pagination.page} / {pagination.total_pages}
          </p>
        </div>
      </div>

      <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
        {loading ? (
          <div className="flex h-48 items-center justify-center">
            <div className="h-12 w-12 animate-spin rounded-full border-4 border-slate-200 border-t-slate-700"></div>
          </div>
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[720px]">
                <thead>
                  <tr className="border-b border-slate-200 text-left text-sm text-slate-500">
                    <th className="pb-3">Subject</th>
                    <th className="pb-3">Assessment</th>
                    <th className="pb-3">Term</th>
                    <th className="pb-3">Score</th>
                    <th className="pb-3">Grade</th>
                    <th className="pb-3">Feedback</th>
                    <th className="pb-3">Date</th>
                  </tr>
                </thead>
                <tbody>
                  {scores.map((score) => (
                    <tr key={score.id} className="border-b border-slate-100 text-sm text-slate-700">
                      <td className="py-4">{score.subject?.name || 'Unknown subject'}</td>
                      <td className="py-4">{score.assessment?.name || 'Direct entry'}</td>
                      <td className="py-4">{score.term || 'Unspecified'}</td>
                      <td className="py-4 font-semibold">{score.score.toFixed(1)}%</td>
                      <td className="py-4">{score.grade || '--'}</td>
                      <td className="py-4">{score.feedback || 'No feedback yet'}</td>
                      <td className="py-4">
                        {score.recorded_at ? new Date(score.recorded_at).toLocaleDateString() : 'Unknown'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {scores.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-slate-300 p-8 text-center text-slate-500">
                No results match the current filters.
              </div>
            ) : null}

            <div className="mt-6 flex items-center justify-between">
              <p className="text-sm text-slate-500">
                Showing page {pagination.page} of {pagination.total_pages}
              </p>
              <div className="flex gap-3">
                <button
                  onClick={() => loadPage(Math.max(1, pagination.page - 1))}
                  disabled={pagination.page <= 1}
                  className="rounded-2xl border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  Previous
                </button>
                <button
                  onClick={() => loadPage(Math.min(pagination.total_pages, pagination.page + 1))}
                  disabled={pagination.page >= pagination.total_pages}
                  className="rounded-2xl bg-slate-900 px-4 py-2 text-sm font-medium text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  Next
                </button>
              </div>
            </div>
          </>
        )}
      </section>
    </div>
  );
};

export default StudentMarksPage;
