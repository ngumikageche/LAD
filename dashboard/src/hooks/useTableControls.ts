import { useMemo, useState } from 'react';

export type SortDir = 'asc' | 'desc';

export interface SortState {
  key: string;
  dir: SortDir;
}

export interface TableControls<T> {
  page: number;
  setPage: (p: number) => void;
  pageSize: number;
  sort: SortState | null;
  setSort: (key: string) => void;
  paged: T[];
  totalPages: number;
  total: number;
}

export function useTableControls<T>(
  data: T[],
  pageSize = 15,
  getValue?: (item: T, key: string) => unknown,
): TableControls<T> {
  const [page, setPageRaw] = useState(1);
  const [sort, setSortRaw] = useState<SortState | null>(null);

  const setPage = (p: number) => setPageRaw(p);

  const setSort = (key: string) => {
    setSortRaw((prev) =>
      prev?.key === key
        ? { key, dir: prev.dir === 'asc' ? 'desc' : 'asc' }
        : { key, dir: 'asc' },
    );
    setPageRaw(1);
  };

  const sorted = useMemo(() => {
    if (!sort) return data;
    return [...data].sort((a, b) => {
      const av = getValue ? getValue(a, sort.key) : (a as any)[sort.key];
      const bv = getValue ? getValue(b, sort.key) : (b as any)[sort.key];
      if (av == null && bv == null) return 0;
      if (av == null) return 1;
      if (bv == null) return -1;
      const cmp =
        typeof av === 'number' && typeof bv === 'number'
          ? av - bv
          : String(av).localeCompare(String(bv), undefined, { sensitivity: 'base' });
      return sort.dir === 'asc' ? cmp : -cmp;
    });
  }, [data, sort, getValue]);

  const totalPages = Math.max(1, Math.ceil(sorted.length / pageSize));
  const safePage = Math.min(page, totalPages);

  const paged = useMemo(
    () => sorted.slice((safePage - 1) * pageSize, safePage * pageSize),
    [sorted, safePage, pageSize],
  );

  return { page: safePage, setPage, pageSize, sort, setSort, paged, totalPages, total: data.length };
}
