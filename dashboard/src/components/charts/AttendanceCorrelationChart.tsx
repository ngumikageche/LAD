import { CartesianGrid, Label, ResponsiveContainer, Scatter, ScatterChart, Tooltip, XAxis, YAxis } from 'recharts';
import type { AttendancePerformancePoint } from '../../services/analyticsApi';

/**
 * One dot on the chart. A cohort view plots learners, so the point carries the
 * learner; a learner's own dashboard has only themselves to plot, so it plots
 * their assigned subjects instead and names them through `label`.
 */
export type CorrelationPoint = {
  attendance_rate: number;
  average_score: number;
  label?: string;
  student_id?: string;
  student_name?: string;
};

type Props = {
  items: CorrelationPoint[] | AttendancePerformancePoint[];
  /** What a single dot stands for, which is also what the integrity note counts. */
  unit?: 'learner' | 'subject';
};

const pointName = (point: CorrelationPoint) => point.label ?? point.student_name ?? '';

export default function AttendanceCorrelationChart({ items, unit = 'learner' }: Props) {
  const points = items as CorrelationPoint[];
  if (points.length === 0) {
    return <div className="rounded-2xl border border-dashed border-slate-700 p-6 text-sm text-slate-400">No attendance-performance data yet.</div>;
  }
  const irregularities = points.filter((item) => item.attendance_rate <= 0 && item.average_score >= 60);

  return (
    <div>
      {irregularities.length > 0 ? (
        <div className="mb-3 rounded-xl border border-rose-400/30 bg-rose-500/10 px-4 py-3 text-sm text-rose-200">
          Assessment-integrity review: {irregularities.length} {unit}{irregularities.length === 1 ? '' : 's'} recorded 0% attendance with a score of 60% or higher.
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
          <Tooltip
            cursor={{ strokeDasharray: '3 3' }}
            content={({ active, payload }) => {
              if (!active || !payload?.length) return null;
              const point = payload[0].payload as CorrelationPoint;
              return (
                <div className="rounded-xl border border-slate-700 bg-slate-900/95 px-3 py-2 text-xs text-slate-200 shadow-lg">
                  <p className="font-semibold text-slate-100">{pointName(point) || `Unnamed ${unit}`}</p>
                  <p className="mt-1">Attendance {point.attendance_rate.toFixed(1)}%</p>
                  <p>Average score {point.average_score.toFixed(1)}%</p>
                </div>
              );
            }}
          />
          <Scatter data={points} fill="#0f766e" />
          <Scatter data={irregularities} fill="#e11d48" />
        </ScatterChart>
      </ResponsiveContainer>
    </div>
  );
}
