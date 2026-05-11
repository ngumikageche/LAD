import { useState, useEffect } from 'react';
import { Search, Filter, TrendingUp, AlertCircle, CheckCircle2 } from 'lucide-react';
import { scoresAPI } from '../api/student';
import { useAuth } from '../auth/AuthContext';
import { useTableControls } from '../hooks/useTableControls';
import { TableFooter, SortableTh } from '../components/ui/TableControls';

interface Score {
  id: string;
  student_id: string | null;
  subject_id: string | null;
  subject: { id: string; name: string } | null;
  score: number;
  grade: string | null;
  term: string | null;
  feedback: string | null;
  is_passed: boolean | null;
  assessment: { id: string; name: string; type: string } | null;
  recorded_at: string | null;
}

export default function ScoresPage() {
  const { user } = useAuth();
  const [scores, setScores] = useState<Score[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [sortBy, setSortBy] = useState<'date' | 'marks' | 'subject'>('date');

  useEffect(() => {
    const loadScores = async () => {
      try {
        setLoading(true);
        setError(null);
        const data = await scoresAPI.listScores() as { items: Score[] };
        setScores(Array.isArray(data?.items) ? data.items : []);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load scores');
      } finally {
        setLoading(false);
      }
    };

    loadScores();
  }, []);

  const filteredScores = scores
    .filter((score) =>
      searchTerm === ''
        ? true
        : JSON.stringify(score).toLowerCase().includes(searchTerm.toLowerCase())
    )
    .sort((a, b) => {
      switch (sortBy) {
        case 'marks':
          return b.score - a.score;
        case 'date':
          return (
            new Date(b.recorded_at ?? 0).getTime() -
            new Date(a.recorded_at ?? 0).getTime()
          );
        default:
          return 0;
      }
    });

  const tc = useTableControls(filteredScores);

  const stats = {
    total: scores.length,
    passed: scores.filter((s) => s.is_passed).length,
    failed: scores.filter((s) => !s.is_passed).length,
    average:
      scores.length > 0
        ? (
            scores.reduce((sum, s) => sum + s.score, 0) /
            scores.length
          ).toFixed(1)
        : 0,
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500"></div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-50 p-6">
      <div className="max-w-6xl mx-auto">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-slate-100">My Scores</h1>
          <p className="text-slate-400 mt-2">View all your assessment scores</p>
        </div>

        {/* Stats Cards */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
          <div className="bg-slate-900 border border-slate-800 rounded-lg shadow p-4">
            <p className="text-slate-400 text-sm">Total Assessments</p>
            <p className="text-2xl font-bold text-slate-100">{stats.total}</p>
          </div>
          <div className="bg-green-500/10 rounded-lg shadow p-4">
            <p className="text-green-300 text-sm">Passed</p>
            <p className="text-2xl font-bold text-green-300">{stats.passed}</p>
          </div>
          <div className="bg-red-500/10 rounded-lg shadow p-4">
            <p className="text-red-300 text-sm">Failed</p>
            <p className="text-2xl font-bold text-red-300">{stats.failed}</p>
          </div>
          <div className="bg-blue-500/10 rounded-lg shadow p-4">
            <p className="text-blue-300 text-sm">Average Score</p>
            <p className="text-2xl font-bold text-blue-300">{stats.average}%</p>
          </div>
        </div>

        {/* Filters & Search */}
        <div className="bg-slate-900 border border-slate-800 rounded-lg shadow p-6 mb-6">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {/* Search */}
            <div className="relative">
              <Search
                size={20}
                className="absolute left-3 top-3 text-slate-500"
              />
              <input
                type="text"
                placeholder="Search scores..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full pl-10 pr-4 py-2 border border-slate-700 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
            </div>

            {/* Sort */}
            <div className="relative">
              <Filter size={20} className="absolute left-3 top-3 text-slate-500" />
              <select
                value={sortBy}
                onChange={(e) =>
                  setSortBy(e.target.value as 'date' | 'marks' | 'subject')
                }
                className="w-full pl-10 pr-4 py-2 border border-slate-700 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              >
                <option value="date">Sort by Date</option>
                <option value="marks">Sort by Marks (High to Low)</option>
              </select>
            </div>

            {/* Export */}
            <button className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition">
              📥 Export as CSV
            </button>
          </div>
        </div>

        {/* Scores Table */}
        {error && (
          <div className="mb-6 p-4 bg-red-500/10 border border-red-500/30 rounded-lg flex items-center gap-2 text-red-300">
            <AlertCircle size={20} />
            {error}
          </div>
        )}

        {filteredScores.length === 0 ? (
          <div className="bg-slate-900 border border-slate-800 rounded-lg shadow p-12 text-center">
            <p className="text-slate-500 text-lg">No scores found</p>
            <p className="text-slate-500">Once assessments are graded, they'll appear here</p>
          </div>
        ) : (
          <div className="bg-slate-900 border border-slate-800 rounded-lg shadow overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-slate-800 border-b border-slate-700">
                  <tr>
                    <SortableTh label="Assessment" sortKey="assessment" sort={tc.sort} onSort={tc.setSort} />
                    <SortableTh label="Marks" sortKey="score" sort={tc.sort} onSort={tc.setSort} />
                    <SortableTh label="Grade" sortKey="grade" sort={tc.sort} onSort={tc.setSort} />
                    <SortableTh label="Status" sortKey="is_passed" sort={tc.sort} onSort={tc.setSort} />
                    <SortableTh label="Date" sortKey="recorded_at" sort={tc.sort} onSort={tc.setSort} />
                    <th className="px-6 py-3 text-left text-xs font-medium text-slate-300 uppercase">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800">
                  {tc.paged.map((score) => (
                    <tr key={score.id} className="hover:bg-slate-800 transition">
                      <td className="px-6 py-4 text-sm font-medium text-slate-100">
                        {score.assessment?.name ?? 'N/A'}
                        {score.subject && (
                          <span className="block text-xs text-slate-500">{score.subject.name}</span>
                        )}
                      </td>
                      <td className="px-6 py-4 text-sm text-slate-100 font-bold">
                        {score.score.toFixed(1)}
                      </td>
                      <td className="px-6 py-4 text-sm">
                        {score.grade ? (
                          <span
                            className={`px-3 py-1 rounded-full text-sm font-medium ${
                              score.grade >= 'C'
                                ? 'bg-green-500/15 text-green-300'
                                : 'bg-amber-500/15 text-amber-300'
                            }`}
                          >
                            Grade {score.grade}
                          </span>
                        ) : (
                          <span className="text-slate-500">—</span>
                        )}
                      </td>
                      <td className="px-6 py-4 text-sm">
                        <div className="flex items-center gap-2">
                          {score.is_passed ? (
                            <>
                              <CheckCircle2
                                size={18}
                                className="text-green-400"
                              />
                              <span className="text-green-300">Passed</span>
                            </>
                          ) : (
                            <>
                              <AlertCircle
                                size={18}
                                className="text-red-400"
                              />
                              <span className="text-red-300">Failed</span>
                            </>
                          )}
                        </div>
                      </td>
                      <td className="px-6 py-4 text-sm text-slate-400">
                        {score.recorded_at ? new Date(score.recorded_at).toLocaleDateString() : '—'}
                      </td>
                      <td className="px-6 py-4 text-sm">
                        <button className="text-blue-400 hover:text-blue-300 font-medium">
                          View Details
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <TableFooter page={tc.page} totalPages={tc.totalPages} total={tc.total} pageSize={tc.pageSize} onPage={tc.setPage} />
          </div>
        )}

        {/* Recent Feedback Section */}
        <div className="mt-8 bg-slate-900 border border-slate-800 rounded-lg shadow p-6">
          <h2 className="text-xl font-bold text-slate-100 mb-4 flex items-center gap-2">
            <TrendingUp size={24} className="text-blue-500" />
            Recent Feedback
          </h2>
          {filteredScores
            .filter((s) => s.feedback)
            .slice(0, 3)
            .map((score) => (
              <div
                key={score.id}
                className="p-4 mb-3 bg-blue-500/10 border-l-4 border-blue-500 rounded"
              >
                <p className="text-slate-100 font-medium">{score.assessment?.name ?? 'Assessment'}</p>
                <p className="text-slate-300 text-sm mt-2">{score.feedback}</p>
                <p className="text-xs text-slate-500 mt-2">
                  {score.recorded_at ? new Date(score.recorded_at).toLocaleDateString() : '—'}
                </p>
              </div>
            ))}
          {filteredScores.filter((s) => s.feedback).length === 0 && (
            <p className="text-slate-500">No feedback received yet</p>
          )}
        </div>
      </div>
    </div>
  );
}
