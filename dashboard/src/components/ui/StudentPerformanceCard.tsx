const StudentPerformanceCard = () => {
  return (
    <div className="bg-white p-6 rounded-2xl shadow-lg border border-gray-100 hover:shadow-xl transition-shadow duration-300">
      <h3 className="text-lg font-bold text-gray-900 mb-4 flex items-center">
        <span className="w-1 h-6 bg-gradient-to-b from-indigo-600 to-blue-600 rounded-full mr-3"></span>
        Top Performer
      </h3>
      <div className="flex items-center space-x-4 mb-6 p-4 bg-gradient-to-r from-indigo-50 to-blue-50 rounded-xl">
        <img
          className="w-14 h-14 rounded-full border-2 border-indigo-300 shadow-md"
          src="https://i.pravatar.cc/150?u=a042581f4e29026704d"
          alt="Student"
        />
        <div>
          <p className="font-bold text-gray-900">Jane Doe</p>
          <p className="text-sm text-gray-500">Class 8A</p>
        </div>
      </div>
      <div className="space-y-4">
        <div>
          <div className="flex justify-between text-xs font-semibold text-gray-700 mb-1.5">
            <span>Mathematics</span>
            <span className="text-indigo-600 bg-indigo-100 px-2 py-1 rounded">95%</span>
          </div>
          <div className="w-full bg-gray-200 rounded-full h-2.5">
            <div className="bg-gradient-to-r from-indigo-500 to-indigo-600 h-2.5 rounded-full" style={{ width: '95%' }}></div>
          </div>
        </div>
        <div>
          <div className="flex justify-between text-xs font-semibold text-gray-700 mb-1.5">
            <span>Science</span>
            <span className="text-emerald-600 bg-emerald-100 px-2 py-1 rounded">88%</span>
          </div>
          <div className="w-full bg-gray-200 rounded-full h-2.5">
            <div className="bg-gradient-to-r from-emerald-500 to-emerald-600 h-2.5 rounded-full" style={{ width: '88%' }}></div>
          </div>
        </div>
        <div>
          <div className="flex justify-between text-xs font-semibold text-gray-700 mb-1.5">
            <span>English</span>
            <span className="text-amber-600 bg-amber-100 px-2 py-1 rounded">92%</span>
          </div>
          <div className="w-full bg-gray-200 rounded-full h-2.5">
            <div className="bg-gradient-to-r from-amber-500 to-amber-600 h-2.5 rounded-full" style={{ width: '92%' }}></div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default StudentPerformanceCard;
