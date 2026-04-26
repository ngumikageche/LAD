import { useEffect, useState } from 'react';
import { AlertTriangle, BookOpen, ClipboardList, Users } from 'lucide-react';
import ScoreForm from './ScoreForm';
import ScoresTable from './ScoresTable';
import { trainerApi, type AtRiskStudent, type TrainerDashboardResponse, type TrainerSubject } from '../../services/trainerApi';

const TrainerDashboard = () => {
  const [dashboard, setDashboard] = useState<TrainerDashboardResponse | null>(null);
  const [subjects, setSubjects] = useState<TrainerSubject[]>([]);
  const [atRiskStudents, setAtRiskStudents] = useState<AtRiskStudent[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [refreshToken, setRefreshToken] = useState(0);

  const loadDashboard = async () => {
    try {
      setIsLoading(true);
      setError(null);
      const [dashboardData, subjectData, atRiskData] = await Promise.all([
        trainerApi.getDashboard(),
        trainerApi.getSubjects(),
        trainerApi.getAtRiskStudents(),
      ]);
      setDashboard(dashboardData);
      setSubjects(subjectData);
      setAtRiskStudents(atRiskData);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load trainer dashboard.');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadDashboard();
  }, [refreshToken]);

  return (
    <div className="space-y-8">
      <div className="rounded-[2rem] bg-[radial-gradient(circle_at_top_left,_rgba(16,185,129,0.18),_transparent_35%),linear-gradient(135deg,#f7fee7_0%,#eff6ff_55%,#ffffff_100%)] p-8 shadow-sm ring-1 ring-emerald-100">
        <h1 className="text-4xl font-bold tracking-tight text-gray-900">Trainer Dashboard</h1>
        <p className="mt-3 max-w-3xl text-sm leading-6 text-gray-600">
          Manage assigned subjects, upload validated scores, review recent grading activity, and intervene early for at-risk students.
        </p>
      </div>

      {error ? (
        <div className="rounded-3xl border border-red-200 bg-red-50 px-5 py-4 text-sm text-red-700">
          {error}
        </div>
      ) : null}

      <div className="grid gap-4 md:grid-cols-3">
        <div className="rounded-3xl border border-gray-200 bg-white p-6 shadow-sm">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-500">Assigned Subjects</p>
              <p className="mt-3 text-4xl font-bold text-gray-900">{dashboard?.subjects_assigned ?? 0}</p>
            </div>
            <BookOpen className="text-emerald-500" size={28} />
          </div>
        </div>

        <div className="rounded-3xl border border-gray-200 bg-white p-6 shadow-sm">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-500">Total Students</p>
              <p className="mt-3 text-4xl font-bold text-gray-900">{dashboard?.total_students ?? 0}</p>
            </div>
            <Users className="text-sky-500" size={28} />
          </div>
        </div>

        <div className="rounded-3xl border border-gray-200 bg-white p-6 shadow-sm">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-500">Recent Scores</p>
              <p className="mt-3 text-4xl font-bold text-gray-900">{dashboard?.recent_scores.length ?? 0}</p>
            </div>
            <ClipboardList className="text-amber-500" size={28} />
          </div>
        </div>
      </div>

      <div className="grid gap-6 xl:grid-cols-[1.1fr_0.9fr]">
        <ScoreForm
          subjects={subjects}
          onCreated={async () => {
            setRefreshToken((value) => value + 1);
          }}
        />

        <div className="rounded-3xl border border-gray-200 bg-white p-6 shadow-sm">
          <div className="mb-6 flex items-center gap-3">
            <div className="rounded-2xl bg-red-50 p-3 text-red-600">
              <AlertTriangle size={20} />
            </div>
            <div>
              <h2 className="text-2xl font-semibold text-gray-900">At-Risk Students</h2>
              <p className="text-sm text-gray-600">Students below the pass threshold.</p>
            </div>
          </div>

          {isLoading ? (
            <p className="text-sm text-gray-500">Loading risk analysis...</p>
          ) : atRiskStudents.length === 0 ? (
            <p className="text-sm text-gray-500">No at-risk students detected for your current subject set.</p>
          ) : (
            <div className="space-y-3">
              {atRiskStudents.slice(0, 6).map((student) => (
                <div key={student.student_id} className="rounded-2xl border border-red-100 bg-red-50/70 p-4">
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <p className="font-semibold text-gray-900">{student.student_name}</p>
                      <p className="text-xs text-gray-600">{student.student_email}</p>
                    </div>
                    <span className="rounded-full bg-white px-3 py-1 text-xs font-semibold text-red-700 shadow-sm">
                      {student.average_score.toFixed(2)}%
                    </span>
                  </div>
                  <p className="mt-3 text-xs text-gray-600">
                    Weak subjects: {student.weak_subjects.length > 0 ? student.weak_subjects.join(', ') : 'None listed'}
                  </p>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      <ScoresTable subjects={subjects} refreshToken={refreshToken} />

      <div className="rounded-3xl border border-gray-200 bg-white p-6 shadow-sm">
        <h2 className="text-2xl font-semibold text-gray-900">Assigned Subjects</h2>
        <div className="mt-6 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {isLoading ? (
            <p className="text-sm text-gray-500">Loading assigned subjects...</p>
          ) : subjects.length === 0 ? (
            <p className="text-sm text-gray-500">No subjects assigned to this trainer.</p>
          ) : (
            subjects.map((subject) => (
              <div key={subject.id} className="rounded-2xl border border-gray-200 bg-gray-50/80 p-5">
                <p className="text-lg font-semibold text-gray-900">{subject.name}</p>
                <p className="mt-1 text-sm text-gray-600">{subject.course_name ?? 'Unmapped course'}</p>
                <div className="mt-4 flex items-center justify-between text-sm text-gray-600">
                  <span>{subject.students_count} students</span>
                  <span>{subject.average_score.toFixed(2)} avg</span>
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
};

export default TrainerDashboard;
