import { useState, useEffect } from 'react';
import { Download, Filter, Calendar, TrendingUp, Award } from 'lucide-react';
import { scoresAPI, studentAnalytics } from '../api/student';
import { useAuth } from '../auth/AuthContext';

interface Score {
  id: string;
  enrollment_id: string;
  assessment_id: string;
  marks_obtained: number;
  grade: string;
  is_passed: boolean;
  feedback?: string;
  created_at: string;
}

interface GroupedScores {
  [key: string]: Score[];
}

export default function ResultsPage() {
  const { user } = useAuth();
  const [scores, setScores] = useState<Score[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filterTerm, setFilterTerm] = useState('all');
  const [sortOrder, setSortOrder] = useState<'newest' | 'oldest' | 'best' | 'worst'>(
    'newest'
  );
  const [performance, setPerformance] = useState<any>(null);

  useEffect(() => {
    const loadData = async () => {
      try {
        setLoading(true);
        setError(null);

        const [scoresData, perfData] = await Promise.all([
          scoresAPI.listScores(),
          studentAnalytics.getPerformanceSummary(user?.id || ''),
        ]);

        setScores(Array.isArray(scoresData) ? scoresData : []);
        setPerformance(perfData);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load results');
      } finally {
        setLoading(false);
      }
    };

    loadData();
  }, [user?.id]);

  // Group scores by term
  const groupedByTerm: GroupedScores = {};
  scores.forEach((score) => {
    const date = new Date(score.created_at);
    const month = date.toLocaleString('default', { month: 'long', year: 'numeric' });
    if (!groupedByTerm[month]) {
      groupedByTerm[month] = [];
    }
    groupedByTerm[month].push(score);
  });

  // Sort scores based on user selection
  const sortScores = (scoresToSort: Score[]) => {
    const sorted = [...scoresToSort];
    switch (sortOrder) {
      case 'newest':
        return sorted.sort(
          (a, b) =>
            new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
        );
      case 'oldest':
        return sorted.sort(
          (a, b) =>
            new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
        );
      case 'best':
        return sorted.sort((a, b) => b.marks_obtained - a.marks_obtained);
      case 'worst':
        return sorted.sort((a, b) => a.marks_obtained - b.marks_obtained);
      default:
        return sorted;
    }
  };

  // Filter and sort data
  const filteredScores =
    filterTerm === 'all'
      ? scores
      : groupedByTerm[filterTerm] || [];

  const sortedScores = sortScores(filteredScores);

  // Calculate term stats
  const termStats = Object.entries(groupedByTerm).map(([term, termScores]) => ({
    term,
    count: termScores.length,
    avg: (
      termScores.reduce((sum, s) => sum + s.marks_obtained, 0) / termScores.length
    ).toFixed(1),
    passed: termScores.filter((s) => s.is_passed).length,
  }));

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
          <h1 className="text-3xl font-bold text-gray-900 flex items-center gap-2">
            <Award size={32} className="text-amber-500" />
            Academic Results History
          </h1>
          <p className="text-gray-600 mt-2">Review your past examination results</p>
        </div>

        {/* Overall Stats */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-8">
          <div className="bg-white rounded-lg shadow p-6">
            <p className="text-gray-600 text-sm font-medium">Total Results</p>
            <p className="text-3xl font-bold text-gray-900 mt-2">{scores.length}</p>
          </div>
          <div className="bg-green-50 rounded-lg shadow p-6">
            <p className="text-green-700 text-sm font-medium">Passed</p>
            <p className="text-3xl font-bold text-green-700 mt-2">
              {scores.filter((s) => s.is_passed).length}
            </p>
          </div>
          <div className="bg-blue-50 rounded-lg shadow p-6">
            <p className="text-blue-700 text-sm font-medium">Overall Average</p>
            <p className="text-3xl font-bold text-blue-700 mt-2">
              {performance?.overall_avg.toFixed(1)}%
            </p>
          </div>
          <div className="bg-purple-50 rounded-lg shadow p-6">
            <p className="text-purple-700 text-sm font-medium">Pass Rate</p>
            <p className="text-3xl font-bold text-purple-700 mt-2">
              {scores.length > 0
                ? (
                    (scores.filter((s) => s.is_passed).length / scores.length) *
                    100
                  ).toFixed(0)
                : 0}
              %
            </p>
          </div>
        </div>

        {/* Controls */}
        <div className="bg-white rounded-lg shadow p-6 mb-8">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {/* Filter by Term */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                <Calendar size={16} className="inline mr-2" />
                Filter by Period
              </label>
              <select
                value={filterTerm}
                onChange={(e) => setFilterTerm(e.target.value)}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              >
                <option value="all">All Periods</option>
                {Object.keys(groupedByTerm)
                  .reverse()
                  .map((term) => (
                    <option key={term} value={term}>
                      {term}
                    </option>
                  ))}
              </select>
            </div>

            {/* Sort */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                <Filter size={16} className="inline mr-2" />
                Sort By
              </label>
              <select
                value={sortOrder}
                onChange={(e) =>
                  setSortOrder(
                    e.target.value as 'newest' | 'oldest' | 'best' | 'worst'
                  )
                }
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              >
                <option value="newest">Newest First</option>
                <option value="oldest">Oldest First</option>
                <option value="best">Best Scores First</option>
                <option value="worst">Worst Scores First</option>
              </select>
            </div>

            {/* Export */}
            <div className="flex items-end">
              <button className="w-full px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition flex items-center justify-center gap-2">
                <Download size={18} />
                Export Results
              </button>
            </div>
          </div>
        </div>

        {/* Period Tabs */}
        {termStats.length > 0 && (
          <div className="mb-6 flex gap-2 overflow-x-auto pb-2">
            <button
              onClick={() => setFilterTerm('all')}
              className={`px-4 py-2 rounded-lg whitespace-nowrap font-medium transition ${
                filterTerm === 'all'
                  ? 'bg-blue-600 text-white'
                  : 'bg-white text-gray-700 border border-gray-300 hover:border-gray-400'
              }`}
            >
              All ({scores.length})
            </button>
            {termStats.map((stat) => (
              <button
                key={stat.term}
                onClick={() => setFilterTerm(stat.term)}
                className={`px-4 py-2 rounded-lg whitespace-nowrap font-medium transition ${
                  filterTerm === stat.term
                    ? 'bg-blue-600 text-white'
                    : 'bg-white text-gray-700 border border-gray-300 hover:border-gray-400'
                }`}
              >
                {stat.term} ({stat.count})
              </button>
            ))}
          </div>
        )}

        {/* Results List */}
        {error && (
          <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-lg text-red-700">
            {error}
          </div>
        )}

        {sortedScores.length === 0 ? (
          <div className="bg-white rounded-lg shadow p-12 text-center">
            <Award size={48} className="mx-auto text-gray-300 mb-4" />
            <p className="text-gray-500 text-lg">No results found</p>
            <p className="text-gray-400">
              {filterTerm === 'all'
                ? 'Your examination results will appear here once they are graded'
                : `No results found for ${filterTerm}`}
            </p>
          </div>
        ) : (
          <div className="space-y-4">
            {sortedScores.map((score) => (
              <div
                key={score.id}
                className="bg-white rounded-lg shadow hover:shadow-md transition p-6"
              >
                <div className="flex items-center justify-between">
                  {/* Score Info */}
                  <div className="flex-1">
                    <div className="flex items-center gap-4">
                      <div className="text-4xl font-bold text-gray-900">
                        {score.marks_obtained.toFixed(0)}%
                      </div>
                      <div>
                        <p className="font-semibold text-gray-900">
                          Assessment
                        </p>
                        <p className="text-gray-600 text-sm">
                          {new Date(score.created_at).toLocaleDateString(
                            'en-US',
                            {
                              year: 'numeric',
                              month: 'long',
                              day: 'numeric',
                            }
                          )}
                        </p>
                      </div>
                    </div>
                  </div>

                  {/* Status & Grade */}
                  <div className="text-right">
                    <div className="mb-2">
                      <span
                        className={`px-4 py-1 rounded-full text-sm font-bold ${
                          score.grade >= 'C'
                            ? 'bg-green-100 text-green-800'
                            : score.grade >= 'D'
                              ? 'bg-yellow-100 text-yellow-800'
                              : 'bg-red-100 text-red-800'
                        }`}
                      >
                        Grade {score.grade}
                      </span>
                    </div>
                    <div>
                      {score.is_passed ? (
                        <p className="text-green-600 font-medium">✓ Passed</p>
                      ) : (
                        <p className="text-red-600 font-medium">✗ Failed</p>
                      )}
                    </div>
                  </div>
                </div>

                {/* Feedback if available */}
                {score.feedback && (
                  <div className="mt-4 pt-4 border-t border-gray-200">
                    <p className="text-sm font-medium text-gray-700 mb-2">
                      Feedback:
                    </p>
                    <p className="text-sm text-gray-600 italic">
                      "{score.feedback}"
                    </p>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}

        {/* Trend Analysis */}
        {scores.length > 0 && (
          <div className="mt-8 bg-white rounded-lg shadow p-6">
            <h2 className="text-xl font-bold text-gray-900 mb-4 flex items-center gap-2">
              <TrendingUp size={24} className="text-blue-500" />
              Performance by Period
            </h2>
            <div className="space-y-3">
              {termStats.map((stat) => (
                <div key={stat.term} className="flex items-center gap-4">
                  <div className="flex-1">
                    <p className="font-medium text-gray-900">{stat.term}</p>
                    <p className="text-xs text-gray-600">
                      {stat.count} assessments, {stat.passed} passed
                    </p>
                  </div>
                  <div className="w-32">
                    <div className="w-full bg-gray-200 rounded-full h-2">
                      <div
                        className={`h-2 rounded-full transition-all ${
                          parseFloat(stat.avg) >= 70
                            ? 'bg-green-500'
                            : parseFloat(stat.avg) >= 50
                              ? 'bg-yellow-500'
                              : 'bg-red-500'
                        }`}
                        style={{ width: `${parseFloat(stat.avg)}%` }}
                      ></div>
                    </div>
                  </div>
                  <div className="text-right w-16">
                    <p className="font-bold text-gray-900">{stat.avg}%</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
