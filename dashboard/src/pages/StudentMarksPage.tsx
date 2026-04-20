import { useState, useEffect } from 'react';
import { useAuth } from '../auth/AuthContext';
import { apiRequest } from '../api/client';
import { BarChart3, TrendingUp, Calendar } from 'lucide-react';

interface ScoresByTerm {
  [key: string]: Array<{
    id: string;
    score: number;
    recorded_at: string;
    competency: { id: string; name: string };
  }>;
}

interface SubjectScore {
  student_id: string;
  subject_id: string;
  subject_name: string;
  scores_by_term: ScoresByTerm;
  total_scores: number;
  average: number;
}

interface TermScores {
  student_id: string;
  term: string;
  scores: Array<{
    id: string;
    score: number;
    recorded_at: string;
    competency: { id: string; name: string };
    module: { id: string; name: string };
  }>;
  total: number;
  average: number;
}

interface Subject {
  id: string;
  name: string;
  module: { id: string; name: string };
}

const StudentMarksPage = () => {
  const { user, token } = useAuth();
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [selectedSubjectId, setSelectedSubjectId] = useState('');
  const [selectedTerm, setSelectedTerm] = useState('');
  const [viewMode, setViewMode] = useState<'subject' | 'term'>('subject');
  
  const [subjectScores, setSubjectScores] = useState<SubjectScore | null>(null);
  const [termScores, setTermScores] = useState<TermScores | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  // Load enrolled subjects
  useEffect(() => {
    const loadSubjects = async () => {
      if (!user?.id) return;
      try {
        const res = await apiRequest<{ subjects: Subject[] }>(`/students/me/subjects`, { token });
        setSubjects(res.subjects);
        if (res.subjects.length > 0) {
          setSelectedSubjectId(res.subjects[0].id);
        }
      } catch (err) {
        console.error('Failed to load subjects', err);
      }
    };
    loadSubjects();
  }, [user, token]);

  // Load subject scores
  const loadSubjectScores = async () => {
    if (!user?.id || !selectedSubjectId) return;
    try {
      setLoading(true);
      setError('');
      const res = await apiRequest<SubjectScore>(
        `/scores/me/subjects/${selectedSubjectId}/scores`,
        { token }
      );
      setSubjectScores(res);
      setTermScores(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load scores');
    } finally {
      setLoading(false);
    }
  };

  // Load term scores
  const loadTermScores = async () => {
    if (!user?.id || !selectedTerm) return;
    try {
      setLoading(true);
      setError('');
      const res = await apiRequest<TermScores>(
        `/scores/me/term/${selectedTerm}`,
        { token }
      );
      setTermScores(res);
      setSubjectScores(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load scores');
    } finally {
      setLoading(false);
    }
  };

  // Load scores when selections change
  useEffect(() => {
    if (viewMode === 'subject' && selectedSubjectId) {
      loadSubjectScores();
    }
  }, [viewMode, selectedSubjectId]);

  useEffect(() => {
    if (viewMode === 'term' && selectedTerm) {
      loadTermScores();
    }
  }, [viewMode, selectedTerm]);

  const allTerms = Array.from(
    new Set([
      ...Object.keys(subjectScores?.scores_by_term || {}),
      ...termScores?.scores.map(s => {
        const date = new Date(s.recorded_at);
        return `${date.getFullYear()}-Q${Math.ceil((date.getMonth() + 1) / 3)}`;
      }) || []
    ])
  ).sort().reverse();

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-4xl font-bold text-gray-900 mb-2">View My Marks</h1>
        <p className="text-gray-600">Review your scores and performance by subject or term</p>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-4 text-red-800">
          {error}
        </div>
      )}

      {/* View Mode Selection */}
      <div className="bg-white rounded-xl shadow-lg border border-gray-100 p-6">
        <div className="flex gap-4 mb-6">
          <button
            onClick={() => setViewMode('subject')}
            className={`px-6 py-2 rounded-lg font-medium transition-all ${
              viewMode === 'subject'
                ? 'bg-indigo-600 text-white shadow-md'
                : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
            }`}
          >
            <BarChart3 className="inline mr-2 h-4 w-4" />
            View by Subject
          </button>
          <button
            onClick={() => setViewMode('term')}
            className={`px-6 py-2 rounded-lg font-medium transition-all ${
              viewMode === 'term'
                ? 'bg-indigo-600 text-white shadow-md'
                : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
            }`}
          >
            <Calendar className="inline mr-2 h-4 w-4" />
            View by Term
          </button>
        </div>

        {/* Subject Selection */}
        {viewMode === 'subject' && (
          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-3">Select Subject:</label>
            <select
              value={selectedSubjectId}
              onChange={(e) => setSelectedSubjectId(e.target.value)}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
            >
              <option value="">-- Choose a subject --</option>
              {subjects.map(subject => (
                <option key={subject.id} value={subject.id}>
                  {subject.name} ({subject.module.name})
                </option>
              ))}
            </select>
          </div>
        )}

        {/* Term Selection */}
        {viewMode === 'term' && (
          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-3">Select Term:</label>
            <select
              value={selectedTerm}
              onChange={(e) => setSelectedTerm(e.target.value)}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
            >
              <option value="">-- Choose a term --</option>
              {allTerms.map(term => (
                <option key={term} value={term}>
                  {term}
                </option>
              ))}
            </select>
          </div>
        )}
      </div>

      {/* Results */}
      {loading ? (
        <div className="flex items-center justify-center h-64">
          <div className="animate-spin">
            <div className="w-12 h-12 border-4 border-indigo-200 border-t-indigo-600 rounded-full"></div>
          </div>
        </div>
      ) : (
        <>
          {/* Subject View */}
          {viewMode === 'subject' && subjectScores && (
            <div className="bg-white rounded-2xl shadow-lg border border-gray-100 p-8">
              <div className="mb-6">
                <h2 className="text-2xl font-bold text-gray-900 mb-2">{subjectScores.subject_name}</h2>
                <div className="flex gap-4">
                  <div className="bg-indigo-50 rounded-lg p-4">
                    <p className="text-sm text-gray-600">Average Score</p>
                    <p className="text-3xl font-bold text-indigo-600">
                      {subjectScores.average.toFixed(1)}%
                    </p>
                  </div>
                  <div className="bg-emerald-50 rounded-lg p-4">
                    <p className="text-sm text-gray-600">Total Assessments</p>
                    <p className="text-3xl font-bold text-emerald-600">
                      {subjectScores.total_scores}
                    </p>
                  </div>
                </div>
              </div>

              {/* Scores by Term */}
              <div className="space-y-6">
                {Object.entries(subjectScores.scores_by_term).map(([term, scores]) => (
                  <div key={term}>
                    <h3 className="text-lg font-semibold text-gray-800 mb-3 pb-2 border-b border-gray-200">
                      {term || 'Unspecified Term'}
                    </h3>
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                      {scores.map(score => (
                        <div key={score.id} className="border border-gray-200 rounded-lg p-4 hover:shadow-md transition-shadow">
                          <p className="text-sm text-gray-600 mb-2">{score.competency.name}</p>
                          <p className={`text-3xl font-bold mb-2 ${
                            score.score >= 70 ? 'text-emerald-600' :
                            score.score >= 50 ? 'text-amber-600' : 'text-red-600'
                          }`}>
                            {score.score.toFixed(1)}%
                          </p>
                          <p className="text-xs text-gray-500">
                            {new Date(score.recorded_at).toLocaleDateString()}
                          </p>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Term View */}
          {viewMode === 'term' && termScores && (
            <div className="bg-white rounded-2xl shadow-lg border border-gray-100 p-8">
              <div className="mb-6">
                <h2 className="text-2xl font-bold text-gray-900 mb-2">Term: {termScores.term}</h2>
                <div className="flex gap-4">
                  <div className="bg-indigo-50 rounded-lg p-4">
                    <p className="text-sm text-gray-600">Average Score</p>
                    <p className="text-3xl font-bold text-indigo-600">
                      {termScores.average.toFixed(1)}%
                    </p>
                  </div>
                  <div className="bg-emerald-50 rounded-lg p-4">
                    <p className="text-sm text-gray-600">Assessments</p>
                    <p className="text-3xl font-bold text-emerald-600">
                      {termScores.total}
                    </p>
                  </div>
                </div>
              </div>

              {/* Scores Table */}
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="border-b border-gray-200">
                      <th className="text-left py-3 px-4 font-semibold text-gray-700">Subject</th>
                      <th className="text-left py-3 px-4 font-semibold text-gray-700">Competency</th>
                      <th className="text-left py-3 px-4 font-semibold text-gray-700">Score</th>
                      <th className="text-left py-3 px-4 font-semibold text-gray-700">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {termScores.scores.map(score => (
                      <tr key={score.id} className="border-b border-gray-100 hover:bg-gray-50">
                        <td className="py-3 px-4 text-gray-700">{score.module.name}</td>
                        <td className="py-3 px-4 text-gray-700">{score.competency.name}</td>
                        <td className="py-3 px-4">
                          <span className={`font-bold text-lg ${
                            score.score >= 70 ? 'text-emerald-600' :
                            score.score >= 50 ? 'text-amber-600' : 'text-red-600'
                          }`}>
                            {score.score.toFixed(1)}%
                          </span>
                        </td>
                        <td className="py-3 px-4">
                          <span className="inline-block px-3 py-1 rounded-full text-xs font-semibold bg-green-100 text-green-800">
                            Recorded
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
};

export default StudentMarksPage;
