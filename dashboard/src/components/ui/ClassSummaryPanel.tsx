import { useEffect, useState } from 'react';
import { DashboardMetric, Alert} from '../../types/backend';
import { apiRequest } from '../../api/client';

const ClassSummaryPanel = () => {
  const [metrics, setMetrics] = useState<DashboardMetric | null>(null);
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchData = async () => {
      try {
        // Example: fetch dashboard metrics for a module (id hardcoded for demo)
        const metricData = await apiRequest<DashboardMetric>('/extra/modules/1/metrics');
        setMetrics(metricData);
        const alertData = await apiRequest<Alert[]>('/extra/modules/1/alerts');
        setAlerts(alertData);
      } catch (e) {
        // handle error
      } finally {
        setLoading(false);
      }
    };
    fetchData();
  }, []);

  if (loading) return <div>Loading...</div>;
  if (!metrics) return <div>No data available</div>;

  return (
    <div className="bg-white p-6 rounded-2xl shadow-lg border border-gray-100">
      <h3 className="text-lg font-bold text-gray-900 mb-5">Class 8A Summary</h3>
      <div className="space-y-4">
        <div className="flex items-center justify-between pb-4 border-b border-gray-100">
          <p className="text-sm font-medium text-gray-600">Average Score</p>
          <p className="text-2xl font-bold text-emerald-600">{metrics.average_score}%</p>
        </div>
        <div className="flex items-center justify-between pb-4 border-b border-gray-100">
          <p className="text-sm font-medium text-gray-600">Attendance</p>
          <p className="text-lg font-bold text-indigo-600">--</p>
        </div>
        <div className="flex items-center justify-between pb-4 border-b border-gray-100">
          <p className="text-sm font-medium text-gray-600">Top Performer</p>
          <p className="text-sm font-semibold text-indigo-600">--</p>
        </div>
        <div className="flex items-center justify-between">
          <p className="text-sm font-medium text-gray-600">Students At Risk</p>
          <span className="px-3 py-1 bg-red-100 text-red-700 text-sm font-bold rounded-full">{metrics.at_risk_count}</span>
        </div>
      </div>
    </div>
  );
};

export default ClassSummaryPanel;
