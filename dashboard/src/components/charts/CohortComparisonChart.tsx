import { Bar, BarChart, CartesianGrid, Label, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';

type Props = {
  items: Array<{ subject_name: string; average_score: number }>;
};

export default function CohortComparisonChart({ items }: Props) {
  if (items.length === 0) {
    return <div className="rounded-2xl border border-dashed border-slate-700 p-6 text-sm text-slate-400">Comparison becomes available once two cohorts are selected.</div>;
  }

  return (
    <ResponsiveContainer width="100%" height={220}>
      <BarChart data={items}>
        <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
        <XAxis dataKey="subject_name" tick={{ fontSize: 12 }}>
          <Label value="Cohort / Subject" position="insideBottom" offset={-2} />
        </XAxis>
        <YAxis domain={[0, 100]} tick={{ fontSize: 12 }}>
          <Label value="Average Score (%)" angle={-90} position="insideLeft" />
        </YAxis>
        <Tooltip formatter={(value) => `${Number(value ?? 0).toFixed(1)}%`} />
        <Bar dataKey="average_score" fill="#2563eb" radius={[8, 8, 0, 0]} />
      </BarChart>
    </ResponsiveContainer>
  );
}
