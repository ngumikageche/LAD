import type { ButtonHTMLAttributes, CSSProperties, ElementType, ReactNode } from 'react';
import { FileText, type LucideIcon } from 'lucide-react';

function cx(...classes: Array<string | false | null | undefined>) {
  return classes.filter(Boolean).join(' ');
}

type ReportPageProps = {
  children: ReactNode;
  className?: string;
};

export function ReportPage({ children, className }: ReportPageProps) {
  return (
    <div className={cx('min-h-screen bg-slate-950 text-slate-100 print:bg-slate-900', className)}>
      <div aria-hidden className="pointer-events-none fixed inset-0 overflow-hidden print:hidden">
        <div className="absolute inset-x-0 top-0 h-64 bg-[radial-gradient(circle_at_top,rgba(34,197,94,0.18),transparent_55%)]" />
        <div className="absolute -left-24 top-24 h-72 w-72 rounded-full bg-cyan-400/10 blur-3xl" />
        <div className="absolute right-0 top-32 h-80 w-80 rounded-full bg-blue-500/10 blur-3xl" />
        <div className="absolute inset-x-0 bottom-0 h-72 bg-[linear-gradient(180deg,transparent,rgba(15,23,42,0.88))]" />
      </div>
      <div className="relative px-4 py-4 sm:px-6 sm:py-6 lg:px-8 lg:py-8 print:p-0">{children}</div>
    </div>
  );
}

type ReportToolbarProps = {
  title: string;
  description?: string;
  eyebrow?: string;
  maxWidth?: string;
  children?: ReactNode;
};

export function ReportToolbar({
  title,
  description,
  eyebrow = 'Report Workspace',
  maxWidth = 'max-w-6xl',
  children,
}: ReportToolbarProps) {
  return (
    <section
      className={cx(
        'mx-auto mb-6 flex flex-col gap-4 rounded-[28px] border border-white/10 bg-white/5 p-4 shadow-[0_20px_80px_rgba(2,12,27,0.45)] backdrop-blur-xl print:hidden sm:p-5 lg:flex-row lg:items-end lg:justify-between',
        maxWidth,
      )}
    >
      <div className="min-w-0">
        <p className="text-[11px] font-semibold uppercase tracking-[0.28em] text-cyan-200/75">{eyebrow}</p>
        <h1 className="mt-2 text-2xl font-semibold tracking-tight text-white sm:text-3xl">{title}</h1>
        {description ? <p className="mt-2 max-w-2xl text-sm text-slate-300 sm:text-[15px]">{description}</p> : null}
      </div>
      {children ? (
        <div className="flex w-full flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-stretch lg:w-auto lg:justify-end">
          {children}
        </div>
      ) : null}
    </section>
  );
}

const buttonVariants = {
  primary:
    'border-cyan-400/40 bg-cyan-400/15 text-cyan-50 hover:border-cyan-300/60 hover:bg-cyan-300/20 disabled:border-cyan-500/20 disabled:bg-cyan-500/10',
  secondary:
    'border-white/10 bg-slate-900/80 text-slate-100 hover:border-white/20 hover:bg-slate-800/90 disabled:border-white/5 disabled:bg-slate-900/50',
  success:
    'border-emerald-400/30 bg-emerald-400/15 text-emerald-50 hover:border-emerald-300/50 hover:bg-emerald-300/20 disabled:border-emerald-500/20 disabled:bg-emerald-500/10',
  warning:
    'border-amber-400/30 bg-amber-400/15 text-amber-50 hover:border-amber-300/50 hover:bg-amber-300/20 disabled:border-amber-500/20 disabled:bg-amber-500/10',
};

type ReportActionButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  icon?: ElementType;
  variant?: keyof typeof buttonVariants;
};

export function ReportActionButton({
  icon: Icon,
  variant = 'secondary',
  className,
  children,
  ...props
}: ReportActionButtonProps) {
  return (
    <button
      className={cx(
        'inline-flex w-full items-center justify-center gap-2 rounded-2xl border px-4 py-3 text-sm font-semibold transition duration-200 disabled:cursor-not-allowed disabled:opacity-50 sm:w-auto',
        buttonVariants[variant],
        className,
      )}
      {...props}
    >
      {Icon ? <Icon size={16} /> : null}
      {children}
    </button>
  );
}

type ReportSurfaceProps = {
  children: ReactNode;
  maxWidth?: string;
  className?: string;
  style?: CSSProperties;
};

export function ReportSurface({
  children,
  maxWidth = 'max-w-6xl',
  className,
  style,
}: ReportSurfaceProps) {
  return (
    <section
      className={cx(
        'report-sheet mx-auto overflow-hidden rounded-[32px] border border-white/10 bg-slate-900/90 p-4 shadow-[0_30px_90px_rgba(2,12,27,0.55)] ring-1 ring-white/5 backdrop-blur print:max-w-none print:rounded-none print:border-0 print:bg-slate-900 print:shadow-none print:ring-0 sm:p-6 lg:p-10',
        maxWidth,
        className,
      )}
      style={style}
    >
      {children}
    </section>
  );
}

type ReportNoticeProps = {
  children: ReactNode;
  icon?: ElementType;
  tone?: 'error' | 'info' | 'success' | 'warning';
  className?: string;
};

const noticeToneClasses = {
  error: 'border-red-400/25 bg-red-500/10 text-red-100',
  info: 'border-cyan-400/20 bg-cyan-400/10 text-cyan-100',
  success: 'border-emerald-400/20 bg-emerald-500/10 text-emerald-100',
  warning: 'border-amber-400/20 bg-amber-500/10 text-amber-100',
};

export function ReportNotice({
  children,
  icon: Icon,
  tone = 'info',
  className,
}: ReportNoticeProps) {
  return (
    <div
      className={cx(
        'rounded-2xl border px-4 py-3 text-sm shadow-[0_10px_40px_rgba(2,12,27,0.2)] print:hidden',
        noticeToneClasses[tone],
        className,
      )}
    >
      <div className="flex items-start gap-3">
        {Icon ? <Icon size={18} className="mt-0.5 shrink-0" /> : null}
        <div className="min-w-0 flex-1">{children}</div>
      </div>
    </div>
  );
}

type ReportEmptyStateProps = {
  title: string;
  description: string;
  icon?: LucideIcon;
  maxWidth?: string;
};

export function ReportEmptyState({
  title,
  description,
  icon: Icon = FileText,
  maxWidth = 'max-w-6xl',
}: ReportEmptyStateProps) {
  return (
    <div
      className={cx(
        'mx-auto rounded-[28px] border border-dashed border-white/10 bg-white/[0.03] px-6 py-14 text-center shadow-[0_18px_60px_rgba(2,12,27,0.3)] backdrop-blur print:hidden',
        maxWidth,
      )}
    >
      <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl border border-cyan-400/20 bg-cyan-400/10 text-cyan-200">
        <Icon size={24} />
      </div>
      <h2 className="mt-5 text-xl font-semibold text-white">{title}</h2>
      <p className="mx-auto mt-2 max-w-xl text-sm leading-6 text-slate-400 sm:text-[15px]">{description}</p>
    </div>
  );
}

type ReportMetricCardProps = {
  label: string;
  value: ReactNode;
  icon?: ElementType;
  accent?: 'cyan' | 'emerald' | 'violet' | 'amber' | 'rose' | 'slate';
  helper?: ReactNode;
};

const metricAccentClasses = {
  cyan: 'border-cyan-400/20 bg-cyan-400/10 text-cyan-100',
  emerald: 'border-emerald-400/20 bg-emerald-400/10 text-emerald-100',
  violet: 'border-violet-400/20 bg-violet-400/10 text-violet-100',
  amber: 'border-amber-400/20 bg-amber-400/10 text-amber-100',
  rose: 'border-rose-400/20 bg-rose-400/10 text-rose-100',
  slate: 'border-white/10 bg-white/[0.03] text-slate-100',
};

export function ReportMetricCard({
  label,
  value,
  icon: Icon,
  accent = 'slate',
  helper,
}: ReportMetricCardProps) {
  return (
    <div className="rounded-3xl border border-white/10 bg-white/[0.03] p-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)] sm:p-5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-slate-500">{label}</p>
          <div className="mt-3 text-2xl font-semibold tracking-tight text-white sm:text-3xl">{value}</div>
          {helper ? <div className="mt-2 text-xs text-slate-400">{helper}</div> : null}
        </div>
        {Icon ? (
          <div className={cx('rounded-2xl border p-2.5', metricAccentClasses[accent])}>
            <Icon size={18} />
          </div>
        ) : null}
      </div>
    </div>
  );
}

export function ReportSectionTitle({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <h3 className={cx('mb-3 text-sm font-semibold uppercase tracking-[0.22em] text-slate-300', className)}>
      {children}
    </h3>
  );
}

export function ReportPrintStyles() {
  return (
    <style>{`
      @media print {
        body * { visibility: hidden; }
        .report-sheet, .report-sheet * { visibility: visible; }
        .report-sheet {
          position: absolute;
          left: 0;
          top: 0;
          width: 100%;
          padding: 16mm !important;
        }
        .print\\:hidden { display: none !important; }
      }
    `}</style>
  );
}
