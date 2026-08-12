import type { HeatmapCell } from '../../services/analyticsApi';
import { Fragment } from 'react';

type Props = {
  items: HeatmapCell[];
  limitRows?: number;
};

const colorMap: Record<string, string> = {
  low: 'bg-red-500/15 text-red-300 border border-red-500/25',
  medium: 'bg-amber-500/15 text-amber-300 border border-amber-500/25',
  high: 'bg-green-500/15 text-green-300 border border-green-500/25',
  // A competency nobody has sat yet is not a failure — it reads as neutral,
  // so an in-progress module does not look like a wall of red.
  unassessed: 'bg-slate-700/30 text-slate-500 border border-slate-700',
};

export default function CompetencyHeatmap({ items, limitRows = 8 }: Props) {
  const studentNames = Array.from(new Set(items.map((item) => item.student_name))).slice(0, limitRows);
  const competencyNames = Array.from(new Set(items.map((item) => item.competency_name)));
  const lookup = new Map(items.map((item) => [`${item.student_name}__${item.competency_name}`, item]));

  if (studentNames.length === 0 || competencyNames.length === 0) {
    return <div className="rounded-2xl border border-dashed border-slate-700 p-6 text-sm text-slate-400">No competency evidence yet.</div>;
  }

  return (
    <div className="overflow-x-auto">
      <div className="min-w-[640px]">
        <div className="grid gap-2" style={{ gridTemplateColumns: `180px repeat(${competencyNames.length}, minmax(88px, 1fr))` }}>
          <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">Student</div>
          {competencyNames.map((name) => (
            <div key={name} className="text-center text-xs font-semibold uppercase tracking-wide text-slate-500">{name}</div>
          ))}

          {studentNames.map((studentName) => (
            <Fragment key={studentName}>
              <div className="flex items-center rounded-2xl bg-slate-800 px-3 py-2 text-sm font-medium text-slate-200 border border-slate-700">
                {studentName}
              </div>
              {competencyNames.map((competencyName) => {
                const cell = lookup.get(`${studentName}__${competencyName}`);
                const level = cell?.mastery_level ?? 'unassessed';
                const measured = Boolean(cell) && level !== 'unassessed';
                return (
                  <div
                    key={`${studentName}-${competencyName}`}
                    className={`rounded-2xl px-2 py-3 text-center text-sm font-semibold ${colorMap[level] ?? colorMap.unassessed}`}
                    title={
                      measured
                        ? `${studentName} / ${competencyName}: ${cell?.score ?? 0}%`
                        : `${studentName} / ${competencyName}: not assessed yet`
                    }
                  >
                    {measured ? `${cell!.score.toFixed(0)}%` : '—'}
                  </div>
                );
              })}
            </Fragment>
          ))}
        </div>
      </div>
    </div>
  );
}
