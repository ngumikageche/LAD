import { useEffect, useState } from 'react';
import { AlertTriangle, BookOpen, ClipboardList, Users } from 'lucide-react';
import ScoreForm from './ScoreForm';
import ScoresTable from './ScoresTable';
import { trainerApi, type AtRiskStudent, type TrainerDashboardResponse, type TrainerSubject } from '../../services/trainerApi';
import CompetencyHeatmap from '../charts/CompetencyHeatmap';
import AttendanceCorrelationChart from '../charts/AttendanceCorrelationChart';
import CohortComparisonChart from '../charts/CohortComparisonChart';
import InsightsPanel from '../ui/InsightsPanel';
import PortfolioStatusPanel from '../ui/PortfolioStatusPanel';
import WidgetHelp from '../ui/WidgetHelp';
import { loadCachedDashboard, saveCachedDashboard } from '../../utils/dashboardCache';
import type { CohortComparisonResponse } from '../../services/analyticsApi';

const CACHE_KEY = 'lad.trainer.dashboard.v2';

const TrainerDashboard = () => {
  const [dashboard, setDashboard] = useState<TrainerDashboardResponse | null>(null);
  const [subjects, setSubjects] = useState<TrainerSubject[]>([]);
  const [atRiskStudents, setAtRiskStudents] = useState<AtRiskStudent[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [refreshToken, setRefreshToken] = useState(0);
  const [comparison, setComparison] = useState<CohortComparisonResponse | null>(null);

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
      const nextComparison: CohortComparisonResponse | null = dashboardData.analytics?.cohort_comparison ?? null;
      setComparison(nextComparison);
      saveCachedDashboard(CACHE_KEY, { dashboardData, subjectData, atRiskData, comparison: nextComparison });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load trainer dashboard.');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    const cached = loadCachedDashboard<{
      dashboardData: TrainerDashboardResponse;
      subjectData: TrainerSubject[];
      atRiskData: AtRiskStudent[];
      comparison: CohortComparisonResponse | null;
    }>(CACHE_KEY);
    if (cached) {
      setDashboard(cached.dashboardData);
      setSubjects(cached.subjectData);
      setAtRiskStudents(cached.atRiskData);
      setComparison(cached.comparison);
      setIsLoading(false);
    }
    loadDashboard();
  }, [refreshToken]);

  return (
    <div className="space-y-8">
      <div className="rounded-[2rem] bg-[radial-gradient(circle_at_top_left,_rgba(16,185,129,0.18),_transparent_35%),linear-gradient(135deg,#f7fee7_0%,#eff6ff_55%,#ffffff_100%)] p-8 shadow-sm ring-1 ring-emerald-100">
        <h1 className="text-4xl font-bold tracking-tight text-slate-100">Trainer Dashboard</h1>
        <p className="mt-3 max-w-3xl text-sm leading-6 text-slate-400">
          Manage assigned subjects, upload validated scores, review recent grading activity, and intervene early for at-risk students.
        </p>
      </div>

      {error ? (
        <div className="rounded-3xl border border-red-200 bg-red-50 px-5 py-4 text-sm text-red-700">
          {error}
        </div>
      ) : null}

      <div className="grid gap-4 md:grid-cols-4">
        <div className="rounded-3xl border border-slate-700 bg-slate-900 p-6 shadow-sm">
          <div className="flex items-center justify-between">
            <div>
              <div className="flex items-center gap-2">
                <p className="text-sm text-slate-500">Assigned Subjects</p>
                <WidgetHelp title="Assigned Subjects" description="Shows how many subjects are currently assigned to you for teaching, grading, and monitoring." />
              </div>
              <p className="mt-3 text-4xl font-bold text-slate-100">{dashboard?.subjects_assigned ?? 0}</p>
            </div>
            <BookOpen className="text-emerald-500" size={28} />
          </div>
        </div>

        <div className="rounded-3xl border border-slate-700 bg-slate-900 p-6 shadow-sm">
          <div className="flex items-center justify-between">
            <div>
              <div className="flex items-center gap-2">
                <p className="text-sm text-slate-500">Total Students</p>
                <WidgetHelp title="Total Students" description="Shows the total number of distinct learners across your currently assigned subjects." />
              </div>
              <p className="mt-3 text-4xl font-bold text-slate-100">{dashboard?.total_students ?? 0}</p>
            </div>
            <Users className="text-sky-500" size={28} />
          </div>
        </div>

        <div className="rounded-3xl border border-slate-700 bg-slate-900 p-6 shadow-sm">
          <div className="flex items-center justify-between">
            <div>
              <div className="flex items-center gap-2">
                <p className="text-sm text-slate-500">Class Average</p>
                <WidgetHelp title="Class Average" description="Shows the mean score across the scores recorded in your teaching scope. It is a quick snapshot of current class performance." />
              </div>
              <p className="mt-3 text-4xl font-bold text-slate-100">{(dashboard?.average_score ?? 0).toFixed(1)}%</p>
            </div>
            <ClipboardList className="text-amber-500" size={28} />
          </div>
        </div>

        <div className="rounded-3xl border border-slate-700 bg-slate-900 p-6 shadow-sm">
          <div className="flex items-center justify-between">
            <div>
              <div className="flex items-center gap-2">
                <p className="text-sm text-slate-500">Mastery Rate</p>
                <WidgetHelp title="Mastery Rate" description="Shows the share of competency observations that are currently classified as high mastery in your dashboard scope." />
              </div>
              <p className="mt-3 text-4xl font-bold text-slate-100">{(dashboard?.summary_panel?.mastery_rate ?? 0).toFixed(1)}%</p>
            </div>
            <AlertTriangle className="text-green-500" size={28} />
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

        <div className="rounded-3xl border border-slate-700 bg-slate-900 p-6 shadow-sm">
          <div className="mb-6 flex items-start justify-between gap-3">
            <div className="flex items-center gap-3">
              <div className="rounded-2xl bg-red-50 p-3 text-red-600">
                <AlertTriangle size={20} />
              </div>
              <div>
                <h2 className="text-2xl font-semibold text-slate-100">At-Risk Students</h2>
                <p className="text-sm text-slate-400">Students below the pass threshold.</p>
              </div>
            </div>
            <WidgetHelp title="At-Risk Students" description="Shows learners whose performance and attendance signals suggest they may need early intervention, remediation, or closer follow-up." />
          </div>

          {isLoading ? (
            <p className="text-sm text-slate-500">Loading risk analysis...</p>
          ) : atRiskStudents.length === 0 ? (
            <p className="text-sm text-slate-500">No at-risk students detected for your current subject set.</p>
          ) : (
            <div className="space-y-3">
              {atRiskStudents.slice(0, 6).map((student) => (
                <div key={student.student_id} className="rounded-2xl border border-red-100 bg-red-50/70 p-4">
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <p className="font-semibold text-slate-100">{student.student_name}</p>
                      <p className="text-xs text-slate-400">{student.student_email}</p>
                    </div>
                    <span className="rounded-full bg-slate-900 px-3 py-1 text-xs font-semibold text-red-700 shadow-sm">
                      {student.average_score.toFixed(2)}%
                    </span>
                  </div>
                  <p className="mt-3 text-xs text-slate-400">
                    Weak subjects: {student.weak_subjects.length > 0 ? student.weak_subjects.join(', ') : 'None listed'}
                  </p>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      <ScoresTable subjects={subjects} refreshToken={refreshToken} />

      <div className="grid gap-6 xl:grid-cols-[1.2fr_0.8fr]">
        <section className="rounded-3xl border border-slate-700 bg-slate-900 p-6 shadow-sm">
          <div className="mb-4 flex items-start justify-between gap-3">
            <div>
              <h2 className="text-2xl font-semibold text-slate-100">Competency Heatmap</h2>
              <p className="text-sm text-slate-400">Student by competency mastery at a glance.</p>
            </div>
            <WidgetHelp title="Competency Heatmap" description="Maps students against competencies with color-coded mastery levels. It helps you quickly identify learning gaps by competency and by learner." />
          </div>
          <CompetencyHeatmap items={dashboard?.analytics?.heatmap?.items || []} />
        </section>

        <section className="rounded-3xl border border-slate-700 bg-slate-900 p-6 shadow-sm">
          <div className="mb-4 flex items-start justify-between gap-3">
            <div>
              <h2 className="text-2xl font-semibold text-slate-100">Instructional Recommendations</h2>
              <p className="text-sm text-slate-400">Rule-based interventions from performance and attendance signals.</p>
            </div>
            <WidgetHelp title="Instructional Recommendations" description="Shows suggested teaching actions based on low competency scores, at-risk patterns, and wider cohort learning signals." />
          </div>
          <InsightsPanel items={dashboard?.analytics?.recommendations?.items || []} />
        </section>
      </div>

      <div className="grid gap-6 xl:grid-cols-[1fr_1fr]">
        <section className="rounded-3xl border border-slate-700 bg-slate-900 p-6 shadow-sm">
          <div className="mb-4 flex items-start justify-between gap-3">
            <div>
              <h2 className="text-2xl font-semibold text-slate-100">Attendance vs Performance</h2>
              <span className="text-xs text-slate-500">
                Correlation {dashboard?.analytics?.attendance_correlation?.correlation?.value ?? 0}
              </span>
            </div>
            <WidgetHelp title="Attendance vs Performance" description="Plots attendance rates against average scores so you can see whether attendance is strongly linked to learning outcomes in your cohort." />
          </div>
          <AttendanceCorrelationChart items={dashboard?.analytics?.attendance_correlation?.items || []} />
        </section>

        <section className="rounded-3xl border border-slate-700 bg-slate-900 p-6 shadow-sm">
          <div className="mb-4 flex items-center justify-between gap-3">
            <h2 className="text-2xl font-semibold text-slate-100">Portfolio Completion</h2>
            <WidgetHelp title="Portfolio Completion" description="Shows submitted evidence versus expected portfolio items, helping you monitor missing learner submissions." />
          </div>
          <PortfolioStatusPanel portfolio={dashboard?.analytics?.portfolio || { items: [], last_updated: '' }} />
        </section>
      </div>

      <section className="rounded-3xl border border-slate-700 bg-slate-900 p-6 shadow-sm">
        <div className="mb-4 flex items-start justify-between gap-3">
          <div>
            <h2 className="text-2xl font-semibold text-slate-100">Cohort Comparison</h2>
            <p className="text-sm text-slate-400">Compare the first two assigned subjects by average score.</p>
          </div>
          <WidgetHelp title="Cohort Comparison" description="Compares two cohorts or subjects side by side using average score so you can spot relative strengths and weaker groups." />
        </div>
        <CohortComparisonChart items={(comparison?.cohorts || []).map((cohort) => ({ subject_name: cohort.subject_name, average_score: cohort.average_score }))} />
      </section>

      <div className="rounded-3xl border border-slate-700 bg-slate-900 p-6 shadow-sm">
        <div className="mb-6 flex items-center justify-between gap-3">
          <h2 className="text-2xl font-semibold text-slate-100">Assigned Subjects</h2>
          <WidgetHelp title="Assigned Subjects" description="Lists your teaching subjects together with their student counts and current average performance." />
        </div>
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {isLoading ? (
            <p className="text-sm text-slate-500">Loading assigned subjects...</p>
          ) : subjects.length === 0 ? (
            <p className="text-sm text-slate-500">No subjects assigned to this trainer.</p>
          ) : (
            subjects.map((subject) => (
              <div key={subject.id} className="rounded-2xl border border-slate-700 bg-slate-800/80 p-5">
                <p className="text-lg font-semibold text-slate-100">{subject.name}</p>
                <p className="mt-1 text-sm text-slate-400">{subject.course_name ?? 'Unmapped course'}</p>
                <div className="mt-4 flex items-center justify-between text-sm text-slate-400">
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
