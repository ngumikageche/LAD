const ClassSummaryPanel = () => {
  return (
    <div className="bg-white p-6 rounded-2xl shadow-lg border border-gray-100">
      <h3 className="text-lg font-bold text-gray-900 mb-5">Class 8A Summary</h3>
      <div className="space-y-4">
        <div className="flex items-center justify-between pb-4 border-b border-gray-100">
          <p className="text-sm font-medium text-gray-600">Average Score</p>
          <p className="text-2xl font-bold text-emerald-600">85.2%</p>
        </div>
        <div className="flex items-center justify-between pb-4 border-b border-gray-100">
          <p className="text-sm font-medium text-gray-600">Attendance</p>
          <p className="text-lg font-bold text-indigo-600">98%</p>
        </div>
        <div className="flex items-center justify-between pb-4 border-b border-gray-100">
          <p className="text-sm font-medium text-gray-600">Top Performer</p>
          <p className="text-sm font-semibold text-indigo-600">John Smith</p>
        </div>
        <div className="flex items-center justify-between">
          <p className="text-sm font-medium text-gray-600">Students At Risk</p>
          <span className="px-3 py-1 bg-red-100 text-red-700 text-sm font-bold rounded-full">3</span>
        </div>
      </div>
    </div>
  );
};

export default ClassSummaryPanel;
