import { useState } from 'react';
import { Search } from 'lucide-react';

const studentsData = [
  { id: 1, name: 'John Doe', class: '8A', score: 85, status: 'Good' },
  { id: 2, name: 'Jane Smith', class: '8B', score: 92, status: 'Good' },
  { id: 3, name: 'Mike Johnson', class: '8A', score: 72, status: 'Average' },
  { id: 4, name: 'Emily Davis', class: '8C', score: 65, status: 'At Risk' },
  { id: 5, name: 'Chris Lee', class: '8B', score: 88, status: 'Good' },
];

const StatusBadge = ({ status }: { status: string }) => {
  const baseClasses = "px-2 py-1 text-xs font-medium rounded-full";
  if (status === 'Good') return <span className={`${baseClasses} bg-emerald-100 text-emerald-800`}>Good</span>;
  if (status === 'Average') return <span className={`${baseClasses} bg-amber-100 text-amber-800`}>Average</span>;
  return <span className={`${baseClasses} bg-red-100 text-red-800`}>At Risk</span>;
};

const StudentsTable = () => {
  const [searchTerm, setSearchTerm] = useState('');
  const [filterClass, setFilterClass] = useState('All');

  const filteredStudents = studentsData
    .filter(student => student.name.toLowerCase().includes(searchTerm.toLowerCase()))
    .filter(student => filterClass === 'All' || student.class === filterClass);

  return (
    <div className="bg-white rounded-2xl shadow-lg border border-gray-100 overflow-hidden">
      <div className="p-6 border-b border-gray-200">
        <div className="flex justify-between items-center gap-4">
          <div className="relative flex-1 max-w-md">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-indigo-500 h-5 w-5" />
            <input
              type="text"
              placeholder="Search students..."
              className="w-full pl-10 pr-4 py-2.5 rounded-lg border border-gray-300 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition-all"
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>
          <select
            className="px-4 py-2.5 rounded-lg border border-gray-300 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition-all font-medium"
            onChange={(e) => setFilterClass(e.target.value)}
          >
            <option value="All">All Classes</option>
            <option value="8A">Class 8A</option>
            <option value="8B">Class 8B</option>
            <option value="8C">Class 8C</option>
          </select>
        </div>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-left">
          <thead className="bg-gray-50 border-b border-gray-200">
            <tr>
              <th className="px-6 py-4 text-xs font-bold text-gray-600 uppercase tracking-wider">Name</th>
              <th className="px-6 py-4 text-xs font-bold text-gray-600 uppercase tracking-wider">Class</th>
              <th className="px-6 py-4 text-xs font-bold text-gray-600 uppercase tracking-wider">Average Score</th>
              <th className="px-6 py-4 text-xs font-bold text-gray-600 uppercase tracking-wider">Status</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-200">
            {filteredStudents.map(student => (
              <tr key={student.id} className="hover:bg-gray-50 transition-colors">
                <td className="px-6 py-4 font-medium text-gray-900">{student.name}</td>
                <td className="px-6 py-4 text-gray-600">{student.class}</td>
                <td className="px-6 py-4 text-gray-600"><span className="font-bold">{student.score}%</span></td>
                <td className="px-6 py-4"><StatusBadge status={student.status} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="flex justify-between items-center p-6 border-t border-gray-200 bg-gray-50">
        <span className="text-sm text-gray-600">Showing 1 to {filteredStudents.length} of {studentsData.length} results</span>
        <div className="flex items-center space-x-2">
          <button className="px-4 py-2 rounded-lg border border-gray-300 hover:bg-gray-100 transition-colors font-medium">Previous</button>
          <button className="px-4 py-2 rounded-lg bg-indigo-600 text-white hover:bg-indigo-700 transition-colors font-medium">1</button>
          <button className="px-4 py-2 rounded-lg border border-gray-300 hover:bg-gray-100 transition-colors font-medium">Next</button>
        </div>
      </div>
    </div>
  );
};

export default StudentsTable;
