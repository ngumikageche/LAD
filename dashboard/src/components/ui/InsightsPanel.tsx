import { useMemo, useState } from 'react';
import type { Recommendation } from '../../services/analyticsApi';
import theme from '../../theme/theme';

type Props = {
  items: Recommendation[];
  previewCount?: number;
};

export default function InsightsPanel({ items, previewCount = 4 }: Props) {
  const [expanded, setExpanded] = useState(false);
  const visibleItems = useMemo(
    () => (expanded ? items : items.slice(0, previewCount)),
    [expanded, items, previewCount]
  );
  const hiddenCount = Math.max(items.length - previewCount, 0);

  return (
    <div className="space-y-3">
      {items.length === 0 ? (
        <div className={`${theme.surface.subtle} p-4 text-sm text-slate-400`}>No recommendations yet.</div>
      ) : (
        <>
          {visibleItems.map((item, index) => (
            <div key={`${item.recommendation_type}-${index}`} className={`${theme.surface.subtle} p-4`}>
              <p className="text-xs font-semibold uppercase tracking-wide text-teal-300">{item.recommendation_type.replaceAll('_', ' ')}</p>
              <p className="mt-2 text-sm text-slate-300">{item.message}</p>
            </div>
          ))}
          {hiddenCount > 0 ? (
            <button
              type="button"
              onClick={() => setExpanded((value) => !value)}
              className="rounded-2xl border border-slate-700 bg-slate-800 px-4 py-3 text-sm font-medium text-slate-300 transition-all duration-200 hover:border-slate-600 hover:text-slate-100"
            >
              {expanded ? 'Show fewer recommendations' : `Show ${hiddenCount} more recommendation${hiddenCount === 1 ? '' : 's'}`}
            </button>
          ) : null}
        </>
      )}
    </div>
  );
}
