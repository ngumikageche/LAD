import { CircleHelp } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import theme from '../../theme/theme';

type Props = {
  title: string;
  description: string;
};

export default function WidgetHelp({ title, description }: Props) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!open) {
      return;
    }

    const handleClick = (event: MouseEvent) => {
      if (ref.current && !ref.current.contains(event.target as Node)) {
        setOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [open]);

  return (
    <div ref={ref} className="relative shrink-0">
      <button
        type="button"
        aria-label={`About ${title}`}
        onClick={() => setOpen((value) => !value)}
        className="flex h-7 w-7 items-center justify-center rounded-full border border-slate-700 bg-slate-800 text-slate-400 transition-all duration-200 hover:border-slate-600 hover:text-slate-200"
      >
        <CircleHelp className="h-4 w-4" />
      </button>
      {open ? (
        <div className={`absolute right-0 top-9 z-20 w-64 ${theme.surface.card} p-3 text-left shadow-xl`}>
          <p className="text-sm font-semibold text-slate-100">{title}</p>
          <p className="mt-2 text-xs leading-5 text-slate-400">{description}</p>
        </div>
      ) : null}
    </div>
  );
}
