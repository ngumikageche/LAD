import type { ElementType, ReactNode } from 'react';

function cx(...parts: Array<string | false | null | undefined>) {
  return parts.filter(Boolean).join(' ');
}

type AnalyticsHeroProps = {
  eyebrow: string;
  title: string;
  description: string;
  children?: ReactNode;
};

export function AnalyticsHero({ eyebrow, title, description, children }: AnalyticsHeroProps) {
  return (
    <section className="relative overflow-hidden rounded-[2rem] border border-slate-700/80 bg-[radial-gradient(circle_at_top_left,rgba(20,184,166,0.18),transparent_34%),radial-gradient(circle_at_85%_15%,rgba(59,130,246,0.16),transparent_28%),linear-gradient(135deg,#020617_0%,#0f172a_48%,#111827_100%)] p-4 shadow-[0_24px_80px_-28px_rgba(15,23,42,0.75)] sm:p-6 lg:p-8">
      <div className="pointer-events-none absolute inset-0 opacity-70">
        <div className="absolute -left-16 top-0 h-40 w-40 rounded-full bg-teal-400/10 blur-3xl" />
        <div className="absolute right-0 top-6 h-44 w-44 rounded-full bg-blue-500/10 blur-3xl" />
        <div className="absolute bottom-0 left-1/3 h-36 w-36 rounded-full bg-amber-400/10 blur-3xl" />
      </div>
      <div className="relative flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
        <div className="max-w-3xl">
          <p className="text-xs uppercase tracking-[0.35em] text-teal-300">{eyebrow}</p>
          <h1 className="mt-3 text-2xl font-bold tracking-tight text-slate-50 sm:text-3xl lg:text-4xl">{title}</h1>
          <p className="mt-3 text-sm leading-6 text-slate-300">{description}</p>
        </div>
        {children ? <div className="relative">{children}</div> : null}
      </div>
    </section>
  );
}

type Accent = 'cyan' | 'emerald' | 'amber' | 'violet' | 'rose' | 'slate';

const accentMap: Record<Accent, string> = {
  cyan: 'border-cyan-400/20 bg-cyan-400/10 text-cyan-100',
  emerald: 'border-emerald-400/20 bg-emerald-400/10 text-emerald-100',
  amber: 'border-amber-400/20 bg-amber-400/10 text-amber-100',
  violet: 'border-violet-400/20 bg-violet-400/10 text-violet-100',
  rose: 'border-rose-400/20 bg-rose-400/10 text-rose-100',
  slate: 'border-white/10 bg-white/[0.04] text-slate-100',
};

type AnalyticsMetricTileProps = {
  label: string;
  value: ReactNode;
  helper?: ReactNode;
  icon?: ElementType;
  accent?: Accent;
};

export function AnalyticsMetricTile({
  label,
  value,
  helper,
  icon: Icon,
  accent = 'slate',
}: AnalyticsMetricTileProps) {
  return (
    <div className="rounded-3xl border border-slate-700 bg-slate-900 p-4 shadow-sm sm:p-5 lg:p-6">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-sm font-medium text-slate-400">{label}</p>
          <div className="mt-3 text-2xl font-bold text-slate-100 sm:text-3xl">{value}</div>
          {helper ? <div className="mt-3 text-xs text-slate-500">{helper}</div> : null}
        </div>
        {Icon ? (
          <div className={cx('rounded-2xl border p-3', accentMap[accent])}>
            <Icon className="h-5 w-5" />
          </div>
        ) : null}
      </div>
    </div>
  );
}

type AnalyticsSectionProps = {
  title: string;
  description?: string;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
};

export function AnalyticsSection({
  title,
  description,
  action,
  children,
  className,
}: AnalyticsSectionProps) {
  return (
    <section className={cx('rounded-3xl border border-slate-700 bg-slate-900 p-4 shadow-sm sm:p-5 lg:p-6', className)}>
      <div className="mb-5 flex flex-col items-start justify-between gap-4 sm:flex-row">
        <div>
          <h2 className="text-xl font-semibold text-slate-100 sm:text-2xl">{title}</h2>
          {description ? <p className="mt-1 text-sm text-slate-400">{description}</p> : null}
        </div>
        {action ? <div className="shrink-0">{action}</div> : null}
      </div>
      {children}
    </section>
  );
}

type AnalyticsNarrativeProps = {
  title: string;
  items: string[];
  tone?: 'neutral' | 'good' | 'warn' | 'danger';
};

const narrativeToneMap = {
  neutral: 'border-slate-700 bg-slate-900',
  good: 'border-emerald-400/30 bg-emerald-500/10',
  warn: 'border-amber-400/30 bg-amber-500/10',
  danger: 'border-rose-400/30 bg-rose-500/10',
};

export function AnalyticsNarrative({ title, items, tone = 'neutral' }: AnalyticsNarrativeProps) {
  return (
    <div className={cx('rounded-3xl border p-5 shadow-sm', narrativeToneMap[tone])}>
      <h3 className="text-lg font-semibold text-slate-100">{title}</h3>
      <div className="mt-4 space-y-3">
        {items.map((item) => (
          <div key={item} className="rounded-2xl border border-white/5 bg-black/10 px-4 py-3 text-sm text-slate-200">
            {item}
          </div>
        ))}
      </div>
    </div>
  );
}
