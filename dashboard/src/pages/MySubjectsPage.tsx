import { useState, useEffect } from 'react';
import { BookOpen, Filter, Users, BarChart3, ChevronRight, AlertCircle } from 'lucide-react';
import { trainerSubjectsAPI } from '../api/trainer';
import { useAuth } from '../auth/AuthContext';

interface Subject {
  id: string;
  subject_name: string;
  subject_code: string;
  course_name: string;
  department_name: string;
  term_name: string;
  students_count: number;
  total_assessments: number;
  avg_score: number;
}

export default function MySubjectsPage() {
  const { user } = useAuth();
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filterDept, setFilterDept] = useState('all');
  const [filterTerm, setFilterTerm] = useState('all');
  const [searchTerm, setSearchTerm] = useState('');

  useEffect(() => {
    const loadSubjects = async () => {
      try {
        setLoading(true);
        setError(null);
        const data = await trainerSubjectsAPI.getAssignedSubjects();
        setSubjects(Array.isArray(data) ? data : []);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load subjects');
      } finally {
        setLoading(false);
      }
    };

    loadSubjects();
  }, []);

  // Get unique departments and terms for filters
  const departments = Array.from(
    new Set(subjects.map((s) => s.department_name))
  );
  const terms = Array.from(new Set(subjects.map((s) => s.term_name)));

  // Filter subjects
  const filteredSubjects = subjects.filter((subject) => {
    const matchDept = filterDept === 'all' || subject.department_name === filterDept;
    const matchTerm = filterTerm === 'all' || subject.term_name === filterTerm;
    const matchSearch =
      searchTerm === ''
        ? true
        : subject.subject_name
            .toLowerCase()
            .includes(searchTerm.toLowerCase()) ||
          subject.subject_code.toLowerCase().includes(searchTerm.toLowerCase());

    return matchDept && matchTerm && matchSearch;
  });

  // Calculate stats
  const stats = {
    total: subjects.length,
    totalStudents: subjects.reduce((sum, s) => sum + s.students_count, 0),
    avgPerformance: (
      subjects.reduce((sum, s) => sum + s.avg_score, 0) / subjects.length
    ).toFixed(1),
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
            <BookOpen size={32} className="text-blue-500" />
            My Subjects
          </h1>
          <p className="text-gray-600 mt-2">
            Manage all subjects assigned to you
          </p>
        </div>

        {/* Statistics */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
          <div className="bg-white rounded-lg shadow p-6">
            <p className="text-gray-600 text-sm">Total Subjects</p>
            <p className="text-3xl font-bold text-gray-900 mt-2">{stats.total}</p>
          </div>
          <div className="bg-white rounded-lg shadow p-6">
            <p className="text-gray-600 text-sm">Total Students</p>
            <p className="text-3xl font-bold text-green-600 mt-2">
              {stats.totalStudents}
            </p>
          </div>
          <div className="bg-white rounded-lg shadow p-6">
            <p className="text-gray-600 text-sm">Average Performance</p>
            <p className="text-3xl font-bold text-blue-600 mt-2">
              {stats.avgPerformance}%
            </p>
          </div>
        </div>

        {/* Filters */}
        <div className="bg-white rounded-lg shadow p-6 mb-8">
          <h3 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
            <Filter size={20} />
            Filters & Search
          </h3>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {/* Search */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Search Subject
              </label>
              <input
                type="text"
                placeholder="Search by name or code..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
            </div>

            {/* Department Filter */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Department
              </label>
              <select
                value={filterDept}
                onChange={(e) => setFilterDept(e.target.value)}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              >
                <option value="all">All Departments</option>
                {departments.map((dept) => (
                  <option key={dept} value={dept}>
                    {dept}
                  </option>
                ))}
              </select>
            </div>

            {/* Term Filter */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Term
              </label>
              <select
                value={filterTerm}
                onChange={(e) => setFilterTerm(e.target.value)}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              >
                <option value="all">All Terms</option>
                {terms.map((term) => (
                  <option key={term} value={term}>
                    {term}
                  </option>
                ))}
              </select>
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

        {/* Subjects Grid */}
        {filteredSubjects.length === 0 ? (
          <div className="bg-white rounded-lg shadow p-12 text-center">
            <BookOpen size={48} className="mx-auto text-gray-300 mb-4" />
            <p className="text-gray-500 text-lg">No subjects found</p>
            <p className="text-gray-400">
              {searchTerm || filterDept !== 'all' || filterTerm !== 'all'
                ? 'Try adjusting your filters'
                : 'You are not assigned to any subjects yet'}
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {filteredSubjects.map((subject) => (
              <div
                key={subject.id}
                className="bg-white rounded-lg shadow hover:shadow-lg transition overflow-hidden"
              >
                <div className="p-6">
                  {/* Header */}
                  <div className="mb-4">
                    <h3 className="text-lg font-bold text-gray-900">
                      {subject.subject_name}
                    </h3>
                    <p className="text-sm text-gray-600">{subject.subject_code}</p>
                  </div>

                  {/* Meta Info */}
                  <div className="space-y-2 mb-4 pb-4 border-t border-gray-200 pt-4">
                    <div className="text-sm text-gray-600">
                      <span className="font-medium">Course:</span> {subject.course_name}
                    </div>
                    <div className="text-sm text-gray-600">
                      <span className="font-medium">Department:</span>{' '}
                      {subject.department_name}
                    </div>
                    <div className="text-sm text-gray-600">
                      <span className="font-medium">Term:</span> {subject.term_name}
                    </div>
                  </div>

                  {/* Stats */}
                  <div className="grid grid-cols-3 gap-2 mb-4 pb-4 border-t border-gray-200 pt-4">
                    <div className="text-center">
                      <p className="text-sm text-gray-600">Students</p>
                      <p className="text-lg font-bold text-gray-900">
                        {subject.students_count}
                      </p>
                    </div>
                    <div className="text-center">
                      <p className="text-sm text-gray-600">Assessments</p>
                      <p className="text-lg font-bold text-gray-900">
                        {subject.total_assessments}
                      </p>
                    </div>
                    <div className="text-center">
                      <p className="text-sm text-gray-600">Avg Score</p>
                      <p className="text-lg font-bold text-blue-600">
                        {subject.avg_score.toFixed(0)}%
                      </p>
                    </div>
                  </div>

                  {/* Action Buttons */}
                  <div className="grid grid-cols-2 gap-2">
                    <button className="px-3 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition text-sm font-medium flex items-center justify-center gap-1">
                      <Users size={16} />
                      Students
                    </button>
                    <button className="px-3 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 transition text-sm font-medium flex items-center justify-center gap-1">
                      <BarChart3 size={16} />
                      Analytics
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Help Section */}
        <div className="mt-12 bg-blue-50 rounded-lg p-6 border border-blue-200">
          <h3 className="font-semibold text-blue-900 mb-2">💡 Quick Tips</h3>
          <ul className="text-blue-800 text-sm space-y-1">
            <li>• Click on a subject to view detailed information and student performance</li>
            <li>• Use filters to organize subjects by department or term</li>
            <li>• The average score shows class performance across all assessments</li>
            <li>• Upload scores and view analytics directly from the subject card</li>
          </ul>
        </div>
      </div>
    </div>
  );
}
