import { ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight, ChevronUp, ChevronDown } from 'lucide-react';
import type { SortState } from '../../hooks/useTableControls';

// ── Pagination footer ──────────────────────────────────────────────────────────

interface TableFooterProps {
  page: number;
  totalPages: number;
  total: number;
  pageSize: number;
  onPage: (p: number) => void;
}

export function TableFooter({ page, totalPages, total, pageSize, onPage }: TableFooterProps) {
  const from = Math.min((page - 1) * pageSize + 1, total);
  const to = Math.min(page * pageSize, total);

  const pages = buildPageList(page, totalPages);

  return (
    <div className="flex flex-wrap items-center justify-between gap-3 px-6 py-4 border-t border-slate-800 bg-slate-900/60">
      <span className="text-sm text-slate-400">
        {total === 0 ? 'No results' : `${from}–${to} of ${total}`}
      </span>
      <div className="flex items-center gap-1">
        <NavBtn onClick={() => onPage(1)} disabled={page === 1} title="First">
          <ChevronsLeft size={15} />
        </NavBtn>
        <NavBtn onClick={() => onPage(page - 1)} disabled={page === 1} title="Previous">
          <ChevronLeft size={15} />
        </NavBtn>

        {pages.map((p, i) =>
          p === '...' ? (
            <span key={`ellipsis-${i}`} className="px-2 text-slate-500 select-none">…</span>
          ) : (
            <button
              key={p}
              onClick={() => onPage(p as number)}
              className={`min-w-[32px] h-8 px-2 rounded text-sm font-medium transition-colors ${
                p === page
                  ? 'bg-blue-600 text-white'
                  : 'text-slate-400 hover:bg-slate-800 hover:text-slate-200'
              }`}
            >
              {p}
            </button>
          ),
        )}

        <NavBtn onClick={() => onPage(page + 1)} disabled={page === totalPages} title="Next">
          <ChevronRight size={15} />
        </NavBtn>
        <NavBtn onClick={() => onPage(totalPages)} disabled={page === totalPages} title="Last">
          <ChevronsRight size={15} />
        </NavBtn>
      </div>
    </div>
  );
}

function NavBtn({
  onClick,
  disabled,
  title,
  children,
}: {
  onClick: () => void;
  disabled: boolean;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      title={title}
      className="h-8 w-8 flex items-center justify-center rounded text-slate-400 hover:bg-slate-800 hover:text-slate-200 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
    >
      {children}
    </button>
  );
}

function buildPageList(current: number, total: number): (number | '...')[] {
  if (total <= 7) return Array.from({ length: total }, (_, i) => i + 1);
  const pages: (number | '...')[] = [1];
  if (current > 3) pages.push('...');
  for (let p = Math.max(2, current - 1); p <= Math.min(total - 1, current + 1); p++) pages.push(p);
  if (current < total - 2) pages.push('...');
  pages.push(total);
  return pages;
}

// ── Sortable <th> ──────────────────────────────────────────────────────────────

interface SortableThProps {
  label: string;
  sortKey: string;
  sort: SortState | null;
  onSort: (key: string) => void;
  className?: string;
}

export function SortableTh({ label, sortKey, sort, onSort, className = '' }: SortableThProps) {
  const active = sort?.key === sortKey;
  return (
    <th
      onClick={() => onSort(sortKey)}
      className={`px-6 py-4 text-xs font-bold text-slate-400 uppercase tracking-wider cursor-pointer select-none hover:text-slate-200 transition-colors ${className}`}
    >
      <span className="inline-flex items-center gap-1">
        {label}
        <span className="inline-flex flex-col leading-none">
          <ChevronUp
            size={10}
            className={active && sort?.dir === 'asc' ? 'text-blue-400' : 'text-slate-600'}
          />
          <ChevronDown
            size={10}
            className={active && sort?.dir === 'desc' ? 'text-blue-400' : 'text-slate-600'}
          />
        </span>
      </span>
    </th>
  );
}
