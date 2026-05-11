import { useState, useEffect } from 'react';
import { Users, Search, Filter, Mail, BookOpen, TrendingDown, AlertCircle } from 'lucide-react';
import { trainerStudentsAPI, trainerPerformanceAPI } from '../api/trainer';
import { useAuth } from '../auth/AuthContext';
import { useTableControls } from '../hooks/useTableControls';
import { TableFooter, SortableTh } from '../components/ui/TableControls';

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

  const tc = useTableControls(
    filteredStudents,
    15,
    (item, key) => (item as any)[key],
  );

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
          <h1 className="text-3xl font-bold text-slate-100 flex items-center gap-2">
            <Users size={32} className="text-green-500" />
            My Students
          </h1>
          <p className="text-slate-400 mt-2">
            Manage and monitor students in your subjects
          </p>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
          <div className="bg-slate-900 border border-slate-800 rounded-lg shadow p-6">
            <p className="text-slate-400 text-sm">Total Students</p>
            <p className="text-3xl font-bold text-slate-100 mt-2">{stats.total}</p>
          </div>
          <div className="bg-slate-900 border border-slate-800 rounded-lg shadow p-6">
            <p className="text-slate-400 text-sm">Average Performance</p>
            <p className="text-3xl font-bold text-blue-400 mt-2">{stats.avg}%</p>
          </div>
          <div className="bg-red-500/10 rounded-lg shadow p-6">
            <p className="text-red-300 text-sm">Low Performers (&lt;60%)</p>
            <p className="text-3xl font-bold text-red-400 mt-2">{stats.lowPerformers}</p>
          </div>
        </div>

        {/* Filters & Search */}
        <div className="bg-slate-900 border border-slate-800 rounded-lg shadow p-6 mb-8">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            {/* Search */}
            <div>
              <label className="block text-sm font-medium text-slate-300 mb-2 flex items-center gap-1">
                <Search size={16} />
                Search
              </label>
              <input
                type="text"
                placeholder="Name, email, ID..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full px-4 py-2 border border-slate-700 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
            </div>

            {/* Subject Filter */}
            <div>
              <label className="block text-sm font-medium text-slate-300 mb-2 flex items-center gap-1">
                <Filter size={16} />
                Subject
              </label>
              <select
                value={filterSubject}
                onChange={(e) => setFilterSubject(e.target.value)}
                className="w-full px-4 py-2 border border-slate-700 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
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
              <label className="block text-sm font-medium text-slate-300 mb-2">
                Sort By
              </label>
              <select
                value={sortBy}
                onChange={(e) =>
                  setSortBy(e.target.value as 'name' | 'performance' | 'assessments')
                }
                className="w-full px-4 py-2 border border-slate-700 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
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
          <div className="mb-6 p-4 bg-red-500/10 border border-red-500/30 rounded-lg flex items-center gap-2 text-red-300">
            <AlertCircle size={20} />
            {error}
          </div>
        )}

        {/* Students Table */}
        {filteredStudents.length === 0 ? (
          <div className="bg-slate-900 border border-slate-800 rounded-lg shadow p-12 text-center">
            <Users size={48} className="mx-auto text-slate-500 mb-4" />
            <p className="text-slate-500 text-lg">No students found</p>
            <p className="text-slate-500">
              {searchTerm || filterSubject !== 'all'
                ? 'Try adjusting your filters'
                : 'No students enrolled in your subjects yet'}
            </p>
          </div>
        ) : (
          <div className="bg-slate-900 border border-slate-800 rounded-lg shadow overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-slate-800 border-b border-slate-700">
                  <tr>
                    <SortableTh label="Name" sortKey="name" sort={tc.sort} onSort={tc.setSort} />
                    <SortableTh label="Email" sortKey="email" sort={tc.sort} onSort={tc.setSort} />
                    <SortableTh label="Student ID" sortKey="student_id" sort={tc.sort} onSort={tc.setSort} />
                    <th className="px-6 py-3 text-left text-xs font-medium text-slate-300 uppercase">Subjects</th>
                    <SortableTh label="Performance" sortKey="overall_avg" sort={tc.sort} onSort={tc.setSort} />
                    <SortableTh label="Assessments" sortKey="assessments_taken" sort={tc.sort} onSort={tc.setSort} />
                    <th className="px-6 py-3 text-left text-xs font-medium text-slate-300 uppercase">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800">
                  {tc.paged.map((student) => (
                    <tr key={student.id} className="hover:bg-slate-800 transition">
                      <td className="px-6 py-4 text-sm font-medium text-slate-100">
                        {student.name}
                      </td>
                      <td className="px-6 py-4 text-sm text-slate-400">
                        <a href={`mailto:${student.email}`} className="text-blue-400 hover:underline">
                          {student.email}
                        </a>
                      </td>
                      <td className="px-6 py-4 text-sm text-slate-400">
                        {student.student_id}
                      </td>
                      <td className="px-6 py-4 text-sm">
                        <div className="flex flex-wrap gap-1">
                          {student.subjects.slice(0, 2).map((subj, idx) => (
                            <span
                              key={idx}
                              className="inline-block px-2 py-1 bg-blue-500/15 text-blue-300 rounded text-xs"
                            >
                              {subj}
                            </span>
                          ))}
                          {student.subjects.length > 2 && (
                            <span className="inline-block px-2 py-1 text-xs text-slate-400">
                              +{student.subjects.length - 2} more
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="px-6 py-4 text-sm">
                        <div
                          className={`inline-block px-3 py-1 rounded-full font-bold ${
                            student.overall_avg >= 70
                              ? 'bg-green-500/15 text-green-300'
                              : student.overall_avg >= 60
                                ? 'bg-amber-500/15 text-amber-300'
                                : 'bg-red-500/15 text-red-300'
                          }`}
                        >
                          {student.overall_avg.toFixed(1)}%
                        </div>
                      </td>
                      <td className="px-6 py-4 text-sm text-slate-400">
                        {student.assessments_taken}
                      </td>
                      <td className="px-6 py-4 text-sm">
                        <button className="text-blue-400 hover:text-blue-300 font-medium">
                          View Profile
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <TableFooter page={tc.page} totalPages={tc.totalPages} total={tc.total} pageSize={tc.pageSize} onPage={tc.setPage} />
          </div>
        )}

        {/* Pagination Info */}
        <div className="mt-4 text-sm text-slate-400 text-center">
          Showing {tc.paged.length} of {tc.total} students
        </div>
      </div>
    </div>
  );
}
