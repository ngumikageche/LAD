import StatCard from '../components/ui/StatCard';
import { Users, Book, TrendingUp, AlertTriangle } from 'lucide-react';
import PerformanceLineChart from '../components/charts/PerformanceLineChart';
import SubjectBarChart from '../components/charts/SubjectBarChart';
import PerformancePieChart from '../components/charts/PerformancePieChart';
import StudentPerformanceCard from '../components/ui/StudentPerformanceCard';
import ClassSummaryPanel from '../components/ui/ClassSummaryPanel';

const DashboardPage = () => {
  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-4xl font-bold text-gray-900 mb-2">Dashboard</h1>
        <p className="text-gray-600">Learning Analytics Overview</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <StatCard title="Total Students" value="1,250" icon={<Users className="h-6 w-6 text-indigo-600" />} colorScheme="indigo" />
        <StatCard title="Average Score" value="82.5%" icon={<TrendingUp className="h-6 w-6 text-emerald-600" />} colorScheme="emerald" />
        <StatCard title="Top Subject" value="Mathematics" icon={<Book className="h-6 w-6 text-amber-600" />} colorScheme="amber" />
        <StatCard title="Students At Risk" value="32" icon={<AlertTriangle className="h-6 w-6 text-red-600" />} colorScheme="red" />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 bg-white p-8 rounded-2xl shadow-lg border border-gray-100">
          <h3 className="text-xl font-bold text-gray-900 mb-6">Performance Over Time</h3>
          <PerformanceLineChart />
        </div>
        <div className="bg-white p-8 rounded-2xl shadow-lg border border-gray-100">
          <h3 className="text-xl font-bold text-gray-900 mb-6">Performance Distribution</h3>
          <PerformancePieChart />
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 bg-white p-8 rounded-2xl shadow-lg border border-gray-100">
          <h3 className="text-xl font-bold text-gray-900 mb-6">Subject Comparison</h3>
          <SubjectBarChart />
        </div>
        <div className="space-y-6">
          <StudentPerformanceCard />
          <ClassSummaryPanel />
        </div>
      </div>
    </div>
  );
};

export default DashboardPage;
