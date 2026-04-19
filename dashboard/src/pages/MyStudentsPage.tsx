import { useState, useEffect } from 'react';
import { Users, Search, Filter, Mail, BookOpen, TrendingDown, AlertCircle } from 'lucide-react';
import { trainerStudentsAPI, trainerPerformanceAPI } from '../api/trainer';
import { useAuth } from '../auth/AuthContext';

interface StudentInfo {
  id: string;
  name: string;
  email: string;
  student_id: string;
  enrollment_status: string;
  subjects: string[];
  overall_avg: number;
  assessments_taken: number;
}

export default function MyStudentsPage() {
  const { user } = useAuth();
  const [students, setStudents] = useState<StudentInfo[]>([]);
  const [filteredStudents, setFilteredStudents] = useState<StudentInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [filterSubject, setFilterSubject] = useState('all');
  const [sortBy, setSortBy] = useState<'name' | 'performance' | 'assessments'>('name');
  const [subjects, setSubjects] = useState<string[]>([]);

  useEffect(() => {
    const loadStudents = async () => {
      try {
        setLoading(true);
        setError(null);
        const data = await trainerStudentsAPI.getStudentsInSubjects();
        const studentList = Array.isArray(data) ? data : [];
        setStudents(studentList);

        // Extract unique subjects
        const uniqueSubjects = Array.from(
          new Set(studentList.flatMap((s) => s.subjects))
        );
        setSubjects(uniqueSubjects);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load students');
      } finally {
        setLoading(false);
      }
    };

    loadStudents();
  }, []);

  // Filter and sort students
  useEffect(() => {
    let result = [...students];

    // Search filter
    if (searchTerm) {
      result = result.filter(
        (s) =>
          s.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
          s.email.toLowerCase().includes(searchTerm.toLowerCase()) ||
          s.student_id.toLowerCase().includes(searchTerm.toLowerCase())
      );
    }

    // Subject filter
    if (filterSubject !== 'all') {
      result = result.filter((s) => s.subjects.includes(filterSubject));
    }

    // Sorting
    result.sort((a, b) => {
      switch (sortBy) {
        case 'performance':
          return b.overall_avg - a.overall_avg;
        case 'assessments':
          return b.assessments_taken - a.assessments_taken;
        case 'name':
        default:
          return a.name.localeCompare(b.name);
      }
    });

    setFilteredStudents(result);
  }, [students, searchTerm, filterSubject, sortBy]);

  const stats = {
    total: students.length,
    avg: students.length > 0
      ? (students.reduce((sum, s) => sum + s.overall_avg, 0) / students.length).toFixed(1)
      : 0,
    lowPerformers: students.filter((s) => s.overall_avg < 60).length,
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500"></div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-50 p-6">
      <div className="max-w-6xl mx-auto">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-gray-900 flex items-center gap-2">
            <Users size={32} className="text-green-500" />
            My Students
          </h1>
          <p className="text-gray-600 mt-2">
            Manage and monitor students in your subjects
          </p>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
          <div className="bg-white rounded-lg shadow p-6">
            <p className="text-gray-600 text-sm">Total Students</p>
            <p className="text-3xl font-bold text-gray-900 mt-2">{stats.total}</p>
          </div>
          <div className="bg-white rounded-lg shadow p-6">
            <p className="text-gray-600 text-sm">Average Performance</p>
            <p className="text-3xl font-bold text-blue-600 mt-2">{stats.avg}%</p>
          </div>
          <div className="bg-red-50 rounded-lg shadow p-6">
            <p className="text-red-700 text-sm">Low Performers (&lt;60%)</p>
            <p className="text-3xl font-bold text-red-600 mt-2">{stats.lowPerformers}</p>
          </div>
        </div>

        {/* Filters & Search */}
        <div className="bg-white rounded-lg shadow p-6 mb-8">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            {/* Search */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2 flex items-center gap-1">
                <Search size={16} />
                Search
              </label>
              <input
                type="text"
                placeholder="Name, email, ID..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
            </div>

            {/* Subject Filter */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2 flex items-center gap-1">
                <Filter size={16} />
                Subject
              </label>
              <select
                value={filterSubject}
                onChange={(e) => setFilterSubject(e.target.value)}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              >
                <option value="all">All Subjects</option>
                {subjects.map((subject) => (
                  <option key={subject} value={subject}>
                    {subject}
                  </option>
                ))}
              </select>
            </div>

            {/* Sort */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Sort By
              </label>
              <select
                value={sortBy}
                onChange={(e) =>
                  setSortBy(e.target.value as 'name' | 'performance' | 'assessments')
                }
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              >
                <option value="name">Name</option>
                <option value="performance">Performance (High to Low)</option>
                <option value="assessments">Assessments Taken</option>
              </select>
            </div>

            {/* View Low Performers */}
            <div className="flex items-end">
              <button className="w-full px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition font-medium flex items-center justify-center gap-2">
                <AlertCircle size={18} />
                Low Performers
              </button>
            </div>
          </div>
        </div>

        {/* Error */}
        {error && (
          <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-lg flex items-center gap-2 text-red-700">
            <AlertCircle size={20} />
            {error}
          </div>
        )}

        {/* Students Table */}
        {filteredStudents.length === 0 ? (
          <div className="bg-white rounded-lg shadow p-12 text-center">
            <Users size={48} className="mx-auto text-gray-300 mb-4" />
            <p className="text-gray-500 text-lg">No students found</p>
            <p className="text-gray-400">
              {searchTerm || filterSubject !== 'all'
                ? 'Try adjusting your filters'
                : 'No students enrolled in your subjects yet'}
            </p>
          </div>
        ) : (
          <div className="bg-white rounded-lg shadow overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-gray-50 border-b">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-700 uppercase">
                      Name
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-700 uppercase">
                      Email
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-700 uppercase">
                      Student ID
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-700 uppercase">
                      Subjects
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-700 uppercase">
                      Performance
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-700 uppercase">
                      Assessments
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-700 uppercase">
                      Action
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {filteredStudents.map((student) => (
                    <tr key={student.id} className="hover:bg-gray-50 transition">
                      <td className="px-6 py-4 text-sm font-medium text-gray-900">
                        {student.name}
                      </td>
                      <td className="px-6 py-4 text-sm text-gray-600">
                        <a href={`mailto:${student.email}`} className="text-blue-600 hover:underline">
                          {student.email}
                        </a>
                      </td>
                      <td className="px-6 py-4 text-sm text-gray-600">
                        {student.student_id}
                      </td>
                      <td className="px-6 py-4 text-sm">
                        <div className="flex flex-wrap gap-1">
                          {student.subjects.slice(0, 2).map((subj, idx) => (
                            <span
                              key={idx}
                              className="inline-block px-2 py-1 bg-blue-100 text-blue-800 rounded text-xs"
                            >
                              {subj}
                            </span>
                          ))}
                          {student.subjects.length > 2 && (
                            <span className="inline-block px-2 py-1 text-xs text-gray-600">
                              +{student.subjects.length - 2} more
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="px-6 py-4 text-sm">
                        <div
                          className={`inline-block px-3 py-1 rounded-full font-bold ${
                            student.overall_avg >= 70
                              ? 'bg-green-100 text-green-800'
                              : student.overall_avg >= 60
                                ? 'bg-yellow-100 text-yellow-800'
                                : 'bg-red-100 text-red-800'
                          }`}
                        >
                          {student.overall_avg.toFixed(1)}%
                        </div>
                      </td>
                      <td className="px-6 py-4 text-sm text-gray-600">
                        {student.assessments_taken}
                      </td>
                      <td className="px-6 py-4 text-sm">
                        <button className="text-blue-600 hover:text-blue-800 font-medium">
                          View Profile
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Pagination Info */}
        <div className="mt-4 text-sm text-gray-600 text-center">
          Showing {filteredStudents.length} of {students.length} students
        </div>
      </div>
    </div>
  );
}
