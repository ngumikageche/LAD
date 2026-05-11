import type { ReactNode } from 'react';
import theme from '../../theme/theme';

interface StatCardProps {
  title: string;
  value: string;
  icon: ReactNode;
  colorScheme?: 'indigo' | 'emerald' | 'amber' | 'red';
}

const StatCard = ({ title, value, icon, colorScheme = 'indigo' }: StatCardProps) => {
  const colorConfigs = {
    indigo: {
      bg: 'bg-blue-500/15 border border-blue-500/20',
      text: 'text-blue-300',
      title: 'group-hover:text-blue-300'
    },
    emerald: {
      bg: 'bg-green-500/15 border border-green-500/20',
      text: 'text-green-300',
      title: 'group-hover:text-green-300'
    },
    amber: {
      bg: 'bg-amber-500/15 border border-amber-500/20',
      text: 'text-amber-300',
      title: 'group-hover:text-amber-300'
    },
    red: {
      bg: 'bg-red-500/15 border border-red-500/20',
      text: 'text-red-300',
      title: 'group-hover:text-red-300'
    }
  };

  const config = colorConfigs[colorScheme];
  return (
    <div className={`${theme.surface.card} p-4 sm:p-6 hover:border-slate-600 transition-all duration-200 flex items-start justify-between group`}>
      <div className="flex-1">
        <p className={`text-xs font-bold text-slate-400 uppercase tracking-widest mb-2.5 ${config.title} transition-colors`}>{title}</p>
        <p className="text-3xl sm:text-4xl font-bold text-slate-100">{value}</p>
      </div>
      <div className={`${config.bg} p-4 rounded-2xl ml-4 group-hover:shadow-lg transition-all duration-200`}>
        <div className={`${config.text} drop-shadow-sm`}>
          {icon}
        </div>
      </div>
    </div>
  );
};

export default StatCard;
