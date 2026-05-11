/**
 * LAD Design System — Master Color Tokens
 *
 * All Tailwind color classes used across the app are defined here.
 * Import and use these instead of hardcoding class strings in pages/components.
 *
 * Usage:
 *   import colors from '../theme/colors';
 *   <div className={colors.page.bg}>...</div>
 */

const colors = {
  // ── Page / Layout ──────────────────────────────────────────────
  page: {
    bg: 'bg-blue-950',
    text: 'text-slate-200',
  },

  // ── Cards & Surfaces ───────────────────────────────────────────
  card: {
    bg: 'bg-slate-900',
    border: 'border border-slate-800',
    base: 'bg-slate-900 border border-slate-800 rounded-lg shadow',
    hover: 'hover:shadow-lg transition',
  },
  panel: {
    bg: 'bg-slate-900',
    border: 'border-slate-800',
  },

  // ── Typography ─────────────────────────────────────────────────
  text: {
    heading: 'text-slate-100',
    body: 'text-slate-300',
    secondary: 'text-slate-400',
    muted: 'text-slate-500',
    label: 'text-slate-400',
  },

  // ── Tables ─────────────────────────────────────────────────────
  table: {
    head: 'bg-slate-800 border-b border-slate-700',
    headCell: 'text-slate-400',
    row: 'border-b border-slate-800',
    rowHover: 'hover:bg-slate-800/60',
    cell: 'text-slate-300',
    cellMuted: 'text-slate-400',
    divider: 'divide-y divide-slate-800',
    empty: 'text-slate-500',
  },

  // ── Forms / Inputs ─────────────────────────────────────────────
  input: {
    base: 'bg-slate-800 border border-slate-700 text-slate-200 placeholder:text-slate-500 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500',
    label: 'text-slate-300',
    select: 'bg-slate-800 border border-slate-700 text-slate-200 rounded-lg',
  },

  // ── Borders ────────────────────────────────────────────────────
  border: {
    base: 'border-slate-800',
    subtle: 'border-slate-700',
    divider: 'divide-slate-800',
  },

  // ── Badges / Status ────────────────────────────────────────────
  badge: {
    blue:    'bg-blue-500/15 text-blue-300 border border-blue-500/30',
    teal:    'bg-teal-500/15 text-teal-300 border border-teal-500/30',
    green:   'bg-green-500/15 text-green-300 border border-green-500/30',
    amber:   'bg-amber-500/15 text-amber-300 border border-amber-500/30',
    red:     'bg-red-500/15 text-red-300 border border-red-500/30',
    purple:  'bg-purple-500/15 text-purple-300 border border-purple-500/30',
    slate:   'bg-slate-700 text-slate-300 border border-slate-600',
  },

  // ── Buttons ────────────────────────────────────────────────────
  button: {
    primary:   'bg-teal-500 hover:bg-teal-400 text-slate-950 font-semibold rounded-lg transition',
    secondary: 'bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 rounded-lg transition',
    danger:    'bg-red-500/15 hover:bg-red-500/25 text-red-300 border border-red-500/30 rounded-lg transition',
    ghost:     'hover:bg-slate-800 text-slate-400 hover:text-slate-200 rounded-lg transition',
  },

  // ── Alerts ─────────────────────────────────────────────────────
  alert: {
    error:   'bg-red-500/15 border border-red-500/30 text-red-300',
    warning: 'bg-amber-500/15 border border-amber-500/30 text-amber-300',
    success: 'bg-green-500/15 border border-green-500/30 text-green-300',
    info:    'bg-blue-500/15 border border-blue-500/30 text-blue-300',
  },

  // ── Score / Performance ────────────────────────────────────────
  score: {
    high:   'bg-green-500/15 text-green-300',
    medium: 'bg-amber-500/15 text-amber-300',
    low:    'bg-red-500/15 text-red-300',
  },
};

export default colors;
