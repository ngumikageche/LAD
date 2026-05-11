import type { PortfolioTrackingResponse } from '../../services/analyticsApi';
import theme from '../../theme/theme';

export default function PortfolioStatusPanel({ portfolio }: { portfolio: PortfolioTrackingResponse }) {
  return (
    <div className="space-y-3">
      {portfolio.items.slice(0, 6).map((item) => (
        <div key={item.student_id} className={`${theme.surface.subtle} p-4`}>
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="font-semibold text-slate-100">{item.student_name}</p>
              <p className="text-xs text-slate-400">
                {item.submitted_count}/{item.required_count} evidence items
              </p>
            </div>
            <span className="rounded-full bg-green-500/15 px-3 py-1 text-xs font-semibold text-green-300">
              {item.completion_rate.toFixed(0)}%
            </span>
          </div>
        </div>
      ))}
      {portfolio.items.length === 0 && <div className={`${theme.surface.subtle} p-4 text-sm text-slate-400`}>No portfolio data yet.</div>}
    </div>
  );
}
