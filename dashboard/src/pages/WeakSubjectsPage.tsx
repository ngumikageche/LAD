import { useState, useEffect } from 'react';
import { AlertTriangle, TrendingUp, Target, BookOpen } from 'lucide-react';
import { studentAnalytics } from '../api/student';
import { useAuth } from '../auth/AuthContext';

interface WeakSubject {
  subject: string;
  avg_score: number;
  status: 'poor' | 'fair' | 'needs_improvement' | 'good';
}

interface ImprovementTip {
  subject: string;
  tip: string;
  priority: 'high' | 'medium' | 'low';
}

export default function WeakSubjectsPage() {
  const { user } = useAuth();
  const [weakSubjects, setWeakSubjects] = useState<WeakSubject[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const loadWeakSubjects = async () => {
      try {
        setLoading(true);
        setError(null);
        const data = await studentAnalytics.getWeakSubjects(user?.id || '');
        setWeakSubjects(data.weak_subjects || []);
      } catch (err) {
        setError(
          err instanceof Error ? err.message : 'Failed to load weak subjects'
        );
      } finally {
        setLoading(false);
      }
    };

    loadWeakSubjects();
  }, [user?.id]);

  const getStatusColor = (
    status: 'poor' | 'fair' | 'needs_improvement' | 'good'
  ) => {
    switch (status) {
      case 'poor':
        return { bg: 'bg-red-50', border: 'border-red-200', text: 'text-red-700' };
      case 'fair':
        return {
          bg: 'bg-yellow-50',
          border: 'border-yellow-200',
          text: 'text-yellow-700',
        };
      case 'needs_improvement':
        return {
          bg: 'bg-orange-50',
          border: 'border-orange-200',
          text: 'text-orange-700',
        };
      case 'good':
        return { bg: 'bg-green-50', border: 'border-green-200', text: 'text-green-700' };
    }
  };

  const getStatusBadge = (status: string) => {
    const colors = getStatusColor(
      status as 'poor' | 'fair' | 'needs_improvement' | 'good'
    );
    return (
      <span
        className={`px-3 py-1 rounded-full text-xs font-bold uppercase ${colors.bg} ${colors.text}`}
      >
        {status.replace('_', ' ')}
      </span>
    );
  };

  const getScoreGrade = (score: number) => {
    if (score >= 90) return 'A';
    if (score >= 80) return 'B';
    if (score >= 70) return 'C';
    if (score >= 60) return 'D';
    return 'F';
  };

  const improvementTips: ImprovementTip[] = [
    { subject: 'Mathematics', tip: 'Focus on practice problems daily', priority: 'high' },
    { subject: 'Physics', tip: 'Watch video tutorials for concepts', priority: 'high' },
    { subject: 'Chemistry', tip: 'Create concept maps', priority: 'medium' },
    { subject: 'English', tip: 'Read more and practice writing', priority: 'medium' },
  ];

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500"></div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-50 p-6">
      <div className="max-w-5xl mx-auto">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-slate-100 flex items-center gap-2">
            <Target size={32} className="text-orange-500" />
            Areas for Improvement
          </h1>
          <p className="text-slate-400 mt-2">
            Focus on these subjects to enhance your academic performance
          </p>
        </div>

        {/* Error */}
        {error && (
          <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-lg text-red-700">
            {error}
          </div>
        )}

        {/* Summary Card */}
        <div className="bg-slate-900 border border-slate-800 rounded-lg shadow-md p-6 mb-8">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="text-center">
              <p className="text-slate-400 text-sm">Subjects Needing Help</p>
              <p className="text-3xl font-bold text-orange-600">
                {weakSubjects.length}
              </p>
            </div>
            <div className="text-center">
              <p className="text-slate-400 text-sm">Critical Priority</p>
              <p className="text-3xl font-bold text-red-600">
                {weakSubjects.filter((s) => s.status === 'poor').length}
              </p>
            </div>
            <div className="text-center">
              <p className="text-slate-400 text-sm">Average in Weak Areas</p>
              <p className="text-3xl font-bold text-yellow-600">
                {weakSubjects.length > 0
                  ? (
                      weakSubjects.reduce((sum, s) => sum + s.avg_score, 0) /
                      weakSubjects.length
                    ).toFixed(1)
                  : '0'}
                %
              </p>
            </div>
          </div>
        </div>

        {/* Weak Subjects List */}
        {weakSubjects.length === 0 ? (
          <div className="bg-slate-900 border border-slate-800 rounded-lg shadow p-12 text-center">
            <TrendingUp size={48} className="mx-auto text-green-400 mb-4" />
            <p className="text-slate-500 text-lg font-medium">
              Excellent! All your subjects are performing well!
            </p>
            <p className="text-slate-500 mt-2">
              Keep up the great work and maintain this momentum
            </p>
          </div>
        ) : (
          <div className="space-y-4 mb-8">
            {weakSubjects.map((subject, idx) => {
              const colors = getStatusColor(subject.status);
              return (
                <div
                  key={idx}
                  className={`rounded-lg shadow-md overflow-hidden border-l-4 ${colors.border}`}
                >
                  <div className={`${colors.bg} p-6`}>
                    <div className="flex items-center justify-between mb-4">
                      <div className="flex items-center gap-4">
                        <div className="text-4xl font-bold text-slate-100">
                          {getScoreGrade(subject.avg_score)}
                        </div>
                        <div>
                          <h3 className="text-xl font-bold text-slate-100">
                            {subject.subject}
                          </h3>
                          <p className="text-slate-300">
                            Average: {subject.avg_score.toFixed(1)}%
                          </p>
                        </div>
                      </div>
                      <div className="text-right">
                        {getStatusBadge(subject.status)}
                      </div>
                    </div>

                    {/* Progress Bar */}
                    <div className="w-full bg-slate-700 rounded-full h-2">
                      <div
                        className={`h-2 rounded-full transition-all ${
                          subject.avg_score >= 70
                            ? 'bg-green-500'
                            : subject.avg_score >= 50
                              ? 'bg-yellow-500'
                              : 'bg-red-500'
                        }`}
                        style={{ width: `${subject.avg_score}%` }}
                      ></div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* Improvement Tips */}
        {weakSubjects.length > 0 && (
          <div className="bg-slate-900 border border-slate-800 rounded-lg shadow-md p-8">
            <h2 className="text-2xl font-bold text-slate-100 mb-6 flex items-center gap-2">
              <AlertTriangle size={28} className="text-amber-500" />
              Actionable Improvement Tips
            </h2>

            <div className="space-y-4">
              {/* Study Time Recommendation */}
              <div className="p-4 bg-blue-50 border-l-4 border-blue-500 rounded">
                <p className="font-semibold text-blue-900 mb-2">📚 Study Plan</p>
                <ul className="text-blue-800 text-sm space-y-1">
                  <li>• Dedicate 2-3 hours weekly to each weak subject</li>
                  <li>• Focus on fundamentals before advanced concepts</li>
                  <li>• Use active recall and spaced repetition</li>
                  <li>• Join study groups or seek tutoring help</li>
                </ul>
              </div>

              {/* Subject-Specific Tips */}
              <div className="p-4 bg-amber-50 border-l-4 border-amber-500 rounded">
                <p className="font-semibold text-amber-900 mb-2">💡 Subject Tips</p>
                <div className="space-y-2">
                  {weakSubjects.slice(0, 3).map((subject, idx) => (
                    <div key={idx} className="text-sm text-amber-800">
                      <span className="font-medium">{subject.subject}:</span>
                      {subject.subject.includes('Math')
                        ? ' Practice problems daily, master fundamentals'
                        : subject.subject.includes('Science')
                          ? ' Understand concepts, do lab work'
                          : ' Read regularly, practice writing'}
                    </div>
                  ))}
                </div>
              </div>

              {/* Resource Recommendations */}
              <div className="p-4 bg-purple-50 border-l-4 border-purple-500 rounded">
                <p className="font-semibold text-purple-900 mb-2">🎓 Resources</p>
                <ul className="text-purple-800 text-sm space-y-1">
                  <li>• Khan Academy - Free video lessons</li>
                  <li>• Textbook practice questions and exercises</li>
                  <li>• Office hours with instructors</li>
                  <li>• Peer study groups and tutoring services</li>
                </ul>
              </div>

              {/* Motivation */}
              <div className="p-4 bg-green-50 border-l-4 border-green-500 rounded">
                <p className="font-semibold text-green-900 mb-2">🚀 Remember</p>
                <p className="text-green-800 text-sm">
                  Every expert was once a beginner. With consistent effort and the
                  right strategies, you can improve any subject. Track your progress
                  regularly and celebrate small wins!
                </p>
              </div>
            </div>
          </div>
        )}

        {/* Action Buttons */}
        {weakSubjects.length > 0 && (
          <div className="mt-8 flex gap-4">
            <button className="flex-1 px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition font-medium">
              📅 Create Study Schedule
            </button>
            <button className="flex-1 px-6 py-3 bg-green-600 text-white rounded-lg hover:bg-green-700 transition font-medium">
              🤝 Find Study Partners
            </button>
            <button className="flex-1 px-6 py-3 bg-purple-600 text-white rounded-lg hover:bg-purple-700 transition font-medium">
              📞 Request Tutoring
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
