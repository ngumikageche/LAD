import { useState, useEffect } from 'react';
import { useAuth } from '../auth/AuthContext';
import { apiRequest } from '../api/client';
import { BookOpen, TrendingUp, AlertCircle, Award } from 'lucide-react';
import StatCard from '../components/ui/StatCard';
import PerformanceLineChart from '../components/charts/PerformanceLineChart';
import SubjectBarChart from '../components/charts/SubjectBarChart';

interface Subject {
  id: string;
  name: string;
  description: string;
  module: {
    id: string;
    name: string;
    description: string;
  };
  trainers: Array<{
    id: string;
    name: string;
    email: string;
    specialization: string;
  }>;
}

interface Assessment {
  id: string;
  student_id: string;
  score: number;
  recorded_at: string;
  status: string;
  competency: {
    id: string;
    name: string;
  };
  module: {
    id: string;
    name: string;
  };
}

const StudentDashboardPage = () => {
  const { user, token } = useAuth();
  const [enrolledSubjects, setEnrolledSubjects] = useState<Subject[]>([]);
  const [recentScores, setRecentScores] = useState<Assessment[]>([]);
  const [averageScore, setAverageScore] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    const loadStudentData = async () => {
      if (!user?.id) return;
      
      try {
        setLoading(true);
        setError('');

        // Fetch enrolled subjects with trainer info
        const subjectsRes = await apiRequest<{
          student_id: string;
          subjects: Subject[];
          total: number;
        }>(`/students/${user.id}/subjects`, { token });
        
        setEnrolledSubjects(subjectsRes.subjects);

        // Fetch recent scores
        const scoresRes = await apiRequest<{
          student_id: string;
          scores: Assessment[];
          total: number;
          average: number;
        }>(`/scores/student/${user.id}/scores`, { token });
        
        setRecentScores(scoresRes.scores.slice(0, 5)); // Show last 5
        setAverageScore(scoresRes.average);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load student data');
      } finally {
        setLoading(false);
      }
    };

    loadStudentData();
  }, [user, token]);

  const poorPerformingSubjects = enrolledSubjects.filter(subject => {
    const subjectScores = recentScores.filter(
      score => score.module.id === subject.module.id
    );
    if (subjectScores.length === 0) return false;
    const avg = subjectScores.reduce((sum, s) => sum + s.score, 0) / subjectScores.length;
    return avg < 60;
  });

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-4xl font-bold text-gray-900 mb-2">Welcome, {user?.name}</h1>
        <p className="text-gray-600">Your Academic Performance Dashboard</p>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-4 text-red-800">
          {error}
        </div>
      )}

      {loading ? (
        <div className="flex items-center justify-center h-64">
          <div className="animate-spin">
            <div className="w-12 h-12 border-4 border-indigo-200 border-t-indigo-600 rounded-full"></div>
          </div>
        </div>
      ) : (
        <>
          {/* Key Metrics */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
            <StatCard 
              title="Average Score" 
              value={`${averageScore.toFixed(1)}%`} 
              icon={<Award className="h-6 w-6 text-indigo-600" />} 
              colorScheme="indigo" 
            />
            <StatCard 
              title="Enrolled Subjects" 
              value={enrolledSubjects.length.toString()} 
              icon={<BookOpen className="h-6 w-6 text-emerald-600" />} 
              colorScheme="emerald" 
            />
            <StatCard 
              title="Recent Assessments" 
              value={recentScores.length.toString()} 
              icon={<TrendingUp className="h-6 w-6 text-amber-600" />} 
              colorScheme="amber" 
            />
            <StatCard 
              title="Subjects at Risk" 
              value={poorPerformingSubjects.length.toString()} 
              icon={<AlertCircle className="h-6 w-6 text-red-600" />} 
              colorScheme="red" 
            />
          </div>

          {/* Enrolled Subjects */}
          <div className="bg-white rounded-2xl shadow-lg border border-gray-100 p-8">
            <h2 className="text-2xl font-bold text-gray-900 mb-6">Enrolled Subjects</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {enrolledSubjects.length > 0 ? (
                enrolledSubjects.map(subject => (
                  <div key={subject.id} className="border border-gray-200 rounded-lg p-6 hover:shadow-md transition-shadow">
                    <h3 className="font-bold text-lg text-gray-900 mb-2">{subject.name}</h3>
                    <p className="text-sm text-gray-600 mb-3">{subject.description}</p>
                    
                    <div className="mb-3">
                      <p className="text-xs font-semibold text-gray-500 mb-1">Module:</p>
                      <p className="text-sm text-gray-700">{subject.module.name}</p>
                    </div>

                    {subject.trainers.length > 0 && (
                      <div>
                        <p className="text-xs font-semibold text-gray-500 mb-1">Trainer:</p>
                        <div className="space-y-1">
                          {subject.trainers.map(trainer => (
                            <p key={trainer.id} className="text-sm text-gray-700">
                              {trainer.name}
                              {trainer.specialization && (
                                <span className="text-xs text-gray-500 ml-1">({trainer.specialization})</span>
                              )}
                            </p>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                ))
              ) : (
                <p className="col-span-full text-gray-500 text-center py-8">
                  No subjects enrolled yet
                </p>
              )}
            </div>
          </div>

          {/* Performance Charts */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div className="bg-white rounded-2xl shadow-lg border border-gray-100 p-8">
              <h3 className="text-xl font-bold text-gray-900 mb-6">Performance Over Time</h3>
              <PerformanceLineChart />
            </div>
            <div className="bg-white rounded-2xl shadow-lg border border-gray-100 p-8">
              <h3 className="text-xl font-bold text-gray-900 mb-6">Subject Comparison</h3>
              <SubjectBarChart />
            </div>
          </div>

          {/* Recent Scores */}
          <div className="bg-white rounded-2xl shadow-lg border border-gray-100 p-8">
            <h2 className="text-2xl font-bold text-gray-900 mb-6">Recent Assessments</h2>
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-gray-200">
                    <th className="text-left py-3 px-4 font-semibold text-gray-700">Competency</th>
                    <th className="text-left py-3 px-4 font-semibold text-gray-700">Subject</th>
                    <th className="text-left py-3 px-4 font-semibold text-gray-700">Score</th>
                    <th className="text-left py-3 px-4 font-semibold text-gray-700">Date</th>
                    <th className="text-left py-3 px-4 font-semibold text-gray-700">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {recentScores.length > 0 ? (
                    recentScores.map(score => (
                      <tr key={score.id} className="border-b border-gray-100 hover:bg-gray-50">
                        <td className="py-3 px-4 text-gray-700">{score.competency.name}</td>
                        <td className="py-3 px-4 text-gray-700">{score.module.name}</td>
                        <td className="py-3 px-4">
                          <span className={`font-bold ${score.score >= 70 ? 'text-emerald-600' : score.score >= 50 ? 'text-amber-600' : 'text-red-600'}`}>
                            {score.score.toFixed(1)}%
                          </span>
                        </td>
                        <td className="py-3 px-4 text-gray-600 text-sm">
                          {new Date(score.recorded_at).toLocaleDateString()}
                        </td>
                        <td className="py-3 px-4">
                          <span className={`inline-block px-3 py-1 rounded-full text-xs font-semibold ${
                            score.status === 'active' ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-800'
                          }`}>
                            {score.status}
                          </span>
                        </td>
                      </tr>
                    ))
                  ) : (
                    <tr>
                      <td colSpan={5} className="py-8 text-center text-gray-500">
                        No assessments yet
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>

          {/* Alerts for Poor Performance */}
          {poorPerformingSubjects.length > 0 && (
            <div className="bg-red-50 border-2 border-red-200 rounded-2xl p-8">
              <div className="flex items-start gap-4">
                <AlertCircle className="h-6 w-6 text-red-600 flex-shrink-0 mt-1" />
                <div>
                  <h3 className="text-lg font-bold text-red-900 mb-2">Performance Alert</h3>
                  <p className="text-red-800 mb-3">
                    You're performing below average in {poorPerformingSubjects.length} subject(s):
                  </p>
                  <ul className="space-y-2">
                    {poorPerformingSubjects.map(subject => (
                      <li key={subject.id} className="text-red-800">
                        • <strong>{subject.name}</strong> - Consider reaching out to your trainer for additional support
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
};

export default StudentDashboardPage;
