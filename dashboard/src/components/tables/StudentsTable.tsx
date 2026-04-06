import { useEffect, useMemo, useState } from 'react';
import { Search } from 'lucide-react';
import { apiRequest } from '../../api/client';
import { useAuth } from '../../auth/AuthContext';
type Student = {
  id: string;
  registration_number: string;
  course_id: string;
  enrollment_year: number;
  user: {
    id: string;
    name: string;
    email: string;
    phone: string | null;
  };
};

const StudentsTable = () => {
  const { token } = useAuth();
  const [searchTerm, setSearchTerm] = useState('');
  const [students, setStudents] = useState<Student[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const loadStudents = async () => {
      try {
        const data = await apiRequest<Student[]>('/students', { token });
        setStudents(data);
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Failed to load students';
        setError(message);
      } finally {
        setIsLoading(false);
      }
    };

    loadStudents();
  }, [token]);

  const filteredStudents = useMemo(() => {
    const search = searchTerm.toLowerCase();
    return students.filter((student) => {
      return (
        student.user.name.toLowerCase().includes(search) ||
        student.user.email.toLowerCase().includes(search) ||
        student.registration_number.toLowerCase().includes(search)
      );
    });
  }, [searchTerm, students]);

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
        </div>
      </div>
      {isLoading ? (
        <div className="p-6 text-sm text-gray-600">Loading students...</div>
      ) : error ? (
        <div className="p-6 text-sm text-red-600">{error}</div>
      ) : (
      <div className="overflow-x-auto">
        <table className="w-full text-left">
          <thead className="bg-gray-50 border-b border-gray-200">
            <tr>
              <th className="px-6 py-4 text-xs font-bold text-gray-600 uppercase tracking-wider">Name</th>
              <th className="px-6 py-4 text-xs font-bold text-gray-600 uppercase tracking-wider">Email</th>
              <th className="px-6 py-4 text-xs font-bold text-gray-600 uppercase tracking-wider">Reg No</th>
              <th className="px-6 py-4 text-xs font-bold text-gray-600 uppercase tracking-wider">Enrollment Year</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-200">
            {filteredStudents.map(student => (
              <tr key={student.id} className="hover:bg-gray-50 transition-colors">
                <td className="px-6 py-4 font-medium text-gray-900">{student.user.name}</td>
                <td className="px-6 py-4 text-gray-600">{student.user.email}</td>
                <td className="px-6 py-4 text-gray-600">{student.registration_number}</td>
                <td className="px-6 py-4 text-gray-600">{student.enrollment_year}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      )}
      <div className="flex justify-between items-center p-6 border-t border-gray-200 bg-gray-50">
        <span className="text-sm text-gray-600">Showing {filteredStudents.length} of {students.length} students</span>
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
