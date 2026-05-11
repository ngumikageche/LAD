import colors from './colors';

const theme = {
  layout: {
    app: 'bg-blue-950 text-slate-200',
    shell: 'bg-blue-950',
    sidebar: 'bg-blue-900 border-blue-800 text-slate-200',
    navbar: 'bg-blue-900 border-blue-800 text-slate-100',
    main: 'bg-blue-950',
    canvas: 'bg-blue-950',
    page: 'min-h-screen bg-blue-950 p-6',
  },
  surface: {
    card: 'bg-slate-900 border border-slate-800 rounded-xl shadow-lg shadow-blue-950/20',
    panel: 'bg-slate-900 border border-slate-800 rounded-xl',
    elevated: 'bg-slate-800 border border-slate-700 rounded-xl',
    subtle: 'bg-slate-800/80 border border-slate-700 rounded-xl',
    input: 'bg-slate-800 border border-slate-700 text-slate-200 placeholder:text-slate-500',
    overlay: 'bg-blue-950/70',
  },
  text: {
    primary: 'text-slate-200',
    secondary: 'text-slate-400',
    muted: 'text-slate-500',
    inverse: 'text-white',
    heading: 'text-slate-100',
  },
  accent: {
    primary: 'bg-teal-500 hover:bg-teal-400 text-slate-950',
    primarySoft: 'bg-teal-500/15 text-teal-300 border border-teal-500/30',
    success: 'text-green-400',
    successSoft: 'bg-green-500/15 text-green-300 border border-green-500/30',
    danger: 'text-red-400',
    dangerSoft: 'bg-red-500/15 text-red-300 border border-red-500/30',
    warning: 'text-amber-400',
    warningSoft: 'bg-amber-500/15 text-amber-300 border border-amber-500/30',
    infoSoft: 'bg-blue-500/15 text-blue-300 border border-blue-500/30',
  },
  table: {
    wrapper: 'overflow-x-auto rounded-xl border border-slate-800 bg-slate-900',
    head: 'bg-slate-800 border-b border-slate-700',
    headCell: 'text-xs font-medium text-slate-400 uppercase',
    row: 'border-b border-slate-800 text-slate-300 hover:bg-slate-800/60 transition-all duration-200',
    cell: 'text-slate-300',
    cellMuted: 'text-slate-400',
    empty: 'text-slate-500',
  },
  interactive: {
    base: 'transition-all duration-200',
    hover: 'hover:border-slate-600 hover:bg-slate-800',
  },
  // convenience re-export
  colors,
};

export default theme;
