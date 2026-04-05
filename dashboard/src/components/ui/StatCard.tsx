import type { ReactNode } from 'react';

interface StatCardProps {
  title: string;
  value: string;
  icon: ReactNode;
  colorScheme?: 'indigo' | 'emerald' | 'amber' | 'red';
}

const StatCard = ({ title, value, icon, colorScheme = 'indigo' }: StatCardProps) => {
  const colorConfigs = {
    indigo: {
      bg: 'from-indigo-100 via-blue-50 to-indigo-50',
      text: 'text-indigo-600',
      title: 'group-hover:text-indigo-600'
    },
    emerald: {
      bg: 'from-emerald-100 via-green-50 to-emerald-50',
      text: 'text-emerald-600',
      title: 'group-hover:text-emerald-600'
    },
    amber: {
      bg: 'from-amber-100 via-yellow-50 to-amber-50',
      text: 'text-amber-600',
      title: 'group-hover:text-amber-600'
    },
    red: {
      bg: 'from-red-100 via-rose-50 to-red-50',
      text: 'text-red-600',
      title: 'group-hover:text-red-600'
    }
  };

  const config = colorConfigs[colorScheme];
  return (
    <div className="bg-white p-6 rounded-2xl shadow-md hover:shadow-xl transition-all duration-300 flex items-start justify-between border border-gray-100 group">
      <div className="flex-1">
        <p className={`text-xs font-bold text-gray-500 uppercase tracking-widest mb-2.5 ${config.title} transition-colors`}>{title}</p>
        <p className="text-4xl font-bold bg-gradient-to-r from-gray-900 to-gray-700 bg-clip-text text-transparent">{value}</p>
      </div>
      <div className={`bg-gradient-to-br ${config.bg} p-4 rounded-2xl ml-4 group-hover:shadow-lg transition-all duration-300`}>
        <div className={`${config.text} drop-shadow-sm`}>
          {icon}
        </div>
      </div>
    </div>
  );
};

export default StatCard;
