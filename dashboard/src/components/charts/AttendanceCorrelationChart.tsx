import { CartesianGrid, Label, ResponsiveContainer, Scatter, ScatterChart, Tooltip, XAxis, YAxis } from 'recharts';
import type { AttendancePerformancePoint } from '../../services/analyticsApi';

type Props = {
  items: AttendancePerformancePoint[];
};

export default function AttendanceCorrelationChart({ items }: Props) {
  if (items.length === 0) {
    return <div className="rounded-2xl border border-dashed border-slate-700 p-6 text-sm text-slate-400">No attendance-performance data yet.</div>;
  }
  const irregularities = items.filter((item) => item.attendance_rate <= 0 && item.average_score >= 60);

  return (
    <div>
      {irregularities.length > 0 ? (
        <div className="mb-3 rounded-xl border border-rose-400/30 bg-rose-500/10 px-4 py-3 text-sm text-rose-200">
          Assessment-integrity review: {irregularities.length} learner{irregularities.length === 1 ? '' : 's'} recorded 0% attendance with a score of 60% or higher.
        </div>
      ) : null}
      <ResponsiveContainer width="100%" height={240}>
        <ScatterChart>
          <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
          <XAxis dataKey="attendance_rate" type="number" unit="%" domain={[0, 100]} tick={{ fontSize: 12 }} name="Attendance">
            <Label value="Attendance Rate (%)" position="insideBottom" offset={-5} />
          </XAxis>
          <YAxis dataKey="average_score" type="number" unit="%" domain={[0, 100]} tick={{ fontSize: 12 }} name="Score">
            <Label value="Average Score (%)" angle={-90} position="insideLeft" />
          </YAxis>
          <Tooltip cursor={{ strokeDasharray: '3 3' }} formatter={(value) => `${Number(value ?? 0).toFixed(1)}%`} />
          <Scatter data={items} fill="#0f766e" />
          <Scatter data={irregularities} fill="#e11d48" />
        </ScatterChart>
      </ResponsiveContainer>
    </div>
  );
}
