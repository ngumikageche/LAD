import { CartesianGrid, ResponsiveContainer, Scatter, ScatterChart, Tooltip, XAxis, YAxis } from 'recharts';
import type { AttendancePerformancePoint } from '../../services/analyticsApi';

type Props = {
  items: AttendancePerformancePoint[];
};

export default function AttendanceCorrelationChart({ items }: Props) {
  if (items.length === 0) {
    return <div className="rounded-2xl border border-dashed border-slate-700 p-6 text-sm text-slate-400">No attendance-performance data yet.</div>;
  }

  return (
    <ResponsiveContainer width="100%" height={240}>
      <ScatterChart>
        <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
        <XAxis dataKey="attendance_rate" type="number" unit="%" domain={[0, 100]} tick={{ fontSize: 12 }} name="Attendance" />
        <YAxis dataKey="average_score" type="number" unit="%" domain={[0, 100]} tick={{ fontSize: 12 }} name="Score" />
        <Tooltip cursor={{ strokeDasharray: '3 3' }} formatter={(value) => `${Number(value ?? 0).toFixed(1)}%`} />
        <Scatter data={items} fill="#0f766e" />
      </ScatterChart>
    </ResponsiveContainer>
  );
}
