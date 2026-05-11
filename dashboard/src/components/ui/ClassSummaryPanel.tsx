import { useEffect, useState } from 'react';
import type { DashboardMetric, Alert } from '../../types/backend';
import { apiRequest } from '../../api/client';
import { useAuth } from '../../auth/AuthContext';

const ClassSummaryPanel = () => {
  const [metrics, setMetrics] = useState<DashboardMetric | null>(null);
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [loading, setLoading] = useState(true);
  const [classTitle, setClassTitle] = useState<string>('Class Summary');
  const { token, user } = useAuth();

  useEffect(() => {
    const fetchData = async () => {
      try {
        const role = (user?.role_name || '').toLowerCase();
        const isStudent = role === 'student' || (user?.permissions && user.permissions['students_view_own_subjects']);
        if (!isStudent) {
          setMetrics({ average_score: 0, at_risk_count: 0 } as unknown as DashboardMetric);
          setAlerts([]);
          setClassTitle('Class Summary');
          setLoading(false);
          return;
        }

        // Get enrolled subjects for the current student
        const subjectsResp = await apiRequest<any>('/students/me/subjects', { token });
        const subjects = subjectsResp.subjects || [];
        if (subjects.length === 0) {
          setMetrics({ average_score: 0, at_risk_count: 0 } as unknown as DashboardMetric);
          setAlerts([]);
          setClassTitle('Class Summary');
          return;
        }
        // For simplicity use first subject to compute metrics from marks
        const firstSubject = subjects[0];
        // derive a friendly class/subject title
        const title = (firstSubject.module && firstSubject.module.name) ? firstSubject.module.name : (firstSubject.name || 'Class Summary');
        setClassTitle(title);
        const marksResp = await apiRequest<any>(`/subjects/${firstSubject.id}/marks`, { token });
        const marks = marksResp.marks || [];
        const values = marks.map((m: any) => Number(m.value)).filter((v: number) => !isNaN(v));
        const avg = values.length ? (values.reduce((a: number, b: number) => a + b, 0) / values.length) : 0;
        const atRisk = values.filter((v: number) => v < 50).length;
        setMetrics({ average_score: Math.round(avg * 10) / 10, at_risk_count: atRisk } as unknown as DashboardMetric);
        setAlerts([]);
      } catch (e) {
        // handle error silently
      } finally {
        setLoading(false);
      }
    };
    fetchData();
  }, [token, user]);

  if (loading) return <div>Loading...</div>;
  if (!metrics) return <div>No data available</div>;

  return (
    <div className="bg-slate-900 p-6 rounded-2xl shadow-lg border border-slate-800">
      <h3 className="text-lg font-bold text-slate-100 mb-5">{classTitle} Summary</h3>
      <div className="space-y-4">
        <div className="flex items-center justify-between pb-4 border-b border-slate-800">
          <p className="text-sm font-medium text-slate-400">Average Score</p>
          <p className="text-2xl font-bold text-emerald-600">{metrics.average_score}%</p>
        </div>
        <div className="flex items-center justify-between pb-4 border-b border-slate-800">
          <p className="text-sm font-medium text-slate-400">Attendance</p>
          <p className="text-lg font-bold text-indigo-600">--</p>
        </div>
        <div className="flex items-center justify-between pb-4 border-b border-slate-800">
          <p className="text-sm font-medium text-slate-400">Top Performer</p>
          <p className="text-sm font-semibold text-indigo-600">--</p>
        </div>
        <div className="flex items-center justify-between">
          <p className="text-sm font-medium text-slate-400">Students At Risk</p>
          <span className="px-3 py-1 bg-red-100 text-red-700 text-sm font-bold rounded-full">{metrics.at_risk_count}</span>
        </div>
      </div>
    </div>
  );
};

export default ClassSummaryPanel;
