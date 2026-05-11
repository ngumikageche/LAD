import { useState, useEffect } from 'react';
import { BookOpen, User, Calendar, Users, ChevronRight, AlertCircle } from 'lucide-react';
import { useAuth } from '../auth/AuthContext';

interface EnrolledCourse {
  id: string;
  course_name: string;
  course_code: string;
  description?: string;
  trainer_name: string;
  term: string;
  status: 'active' | 'completed' | 'pending';
  enrollment_date: string;
  credits?: number;
  students_count?: number;
}

export default function EnrolledSubjectsPage() {
  const { user } = useAuth();
  const [courses, setCourses] = useState<EnrolledCourse[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<'all' | 'active' | 'completed' | 'pending'>('active');

  useEffect(() => {
    // Mock data for enrolled courses
    const mockCourses: EnrolledCourse[] = [
      {
        id: '1',
        course_name: 'Advanced Mathematics',
        course_code: 'MATH-301',
        description: 'Comprehensive study of calculus and differential equations',
        trainer_name: 'Dr. James Smith',
        term: 'Fall 2024',
        status: 'active',
        enrollment_date: '2024-08-15',
        credits: 4,
        students_count: 45,
      },
      {
        id: '2',
        course_name: 'Physics II: Waves and Optics',
        course_code: 'PHYS-102',
        description: 'Study of wave mechanics, sound, and light phenomena',
        trainer_name: 'Prof. Sarah Johnson',
        term: 'Fall 2024',
        status: 'active',
        enrollment_date: '2024-08-16',
        credits: 4,
        students_count: 38,
      },
      {
        id: '3',
        course_name: 'Chemistry: Organic Compounds',
        course_code: 'CHEM-201',
        description: 'Principles of organic chemistry and reaction mechanisms',
        trainer_name: 'Dr. Michael Lee',
        term: 'Fall 2024',
        status: 'active',
        enrollment_date: '2024-08-17',
        credits: 3,
        students_count: 42,
      },
      {
        id: '4',
        course_name: 'Introduction to Programming',
        course_code: 'CS-101',
        description: 'Fundamentals of programming using Python',
        trainer_name: 'Prof. Emma Davis',
        term: 'Fall 2024',
        status: 'active',
        enrollment_date: '2024-08-18',
        credits: 3,
        students_count: 60,
      },
      {
        id: '5',
        course_name: 'English Literature: Classics',
        course_code: 'ENG-205',
        description: 'Analysis of classic literary works and their impact',
        trainer_name: 'Dr. Robert Wilson',
        term: 'Spring 2024',
        status: 'completed',
        enrollment_date: '2024-01-10',
        credits: 3,
        students_count: 35,
      },
      {
        id: '6',
        course_name: 'History of World Civilizations',
        course_code: 'HIST-150',
        description: 'Survey of major world civilizations and historical events',
        trainer_name: 'Prof. Linda Martinez',
        term: 'Spring 2024',
        status: 'completed',
        enrollment_date: '2024-01-12',
        credits: 3,
        students_count: 50,
      },
    ];

    // Simulate loading
    setTimeout(() => {
      setCourses(mockCourses);
      setLoading(false);
    }, 500);
  }, []);

  const filteredCourses = courses.filter(
    (course) => filter === 'all' || course.status === filter
  );

  const statusConfig = {
    active: { color: 'bg-green-500/10 border-green-500/30', text: 'text-green-300', badge: 'bg-green-500/15' },
    completed: { color: 'bg-blue-500/10 border-blue-500/30', text: 'text-blue-300', badge: 'bg-blue-500/15' },
    pending: { color: 'bg-amber-500/10 border-amber-500/30', text: 'text-amber-300', badge: 'bg-amber-500/15' },
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
            <BookOpen size={32} className="text-blue-500" />
            My Courses & Subjects
          </h1>
          <p className="text-slate-400 mt-2">
            View all courses you're currently enrolled in
          </p>
        </div>

        {/* Summary Cards */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-8">
          <div className="bg-slate-900 border border-slate-800 rounded-lg shadow p-4">
            <p className="text-slate-400 text-sm">Total Courses</p>
            <p className="text-2xl font-bold text-slate-100">{courses.length}</p>
          </div>
          <div className="bg-green-500/10 rounded-lg shadow p-4">
            <p className="text-green-300 text-sm">Active</p>
            <p className="text-2xl font-bold text-green-300">
              {courses.filter((c) => c.status === 'active').length}
            </p>
          </div>
          <div className="bg-blue-500/10 rounded-lg shadow p-4">
            <p className="text-blue-300 text-sm">Completed</p>
            <p className="text-2xl font-bold text-blue-300">
              {courses.filter((c) => c.status === 'completed').length}
            </p>
          </div>
          <div className="bg-amber-500/10 rounded-lg shadow p-4">
            <p className="text-amber-300 text-sm">Pending</p>
            <p className="text-2xl font-bold text-amber-300">
              {courses.filter((c) => c.status === 'pending').length}
            </p>
          </div>
        </div>

        {/* Filter Tabs */}
        <div className="flex gap-2 mb-6">
          {(['all', 'active', 'completed', 'pending'] as const).map((f) => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={`px-4 py-2 rounded-lg font-medium transition ${
                filter === f
                  ? 'bg-blue-600 text-white'
                  : 'bg-slate-900 text-slate-300 border border-slate-700 hover:border-slate-600'
              }`}
            >
              {f.charAt(0).toUpperCase() + f.slice(1)} ({
                courses.filter((c) => (f === 'all' ? true : c.status === f)).length
              })
            </button>
          ))}
        </div>

        {/* Error */}
        {error && (
          <div className="mb-6 p-4 bg-red-500/10 border border-red-500/30 rounded-lg flex items-center gap-2 text-red-300">
            <AlertCircle size={20} />
            {error}
          </div>
        )}

        {/* Courses Grid */}
        {filteredCourses.length === 0 ? (
          <div className="bg-slate-900 border border-slate-800 rounded-lg shadow p-12 text-center">
            <BookOpen size={48} className="mx-auto text-slate-500 mb-4" />
            <p className="text-slate-500 text-lg">No courses found</p>
            <p className="text-slate-500">
              You are not enrolled in any {filter !== 'all' ? filter : ''} courses yet
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {filteredCourses.map((course) => {
              const config = statusConfig[course.status];
              return (
                <div
                  key={course.id}
                  className={`rounded-lg shadow-md overflow-hidden hover:shadow-lg transition border ${config.color}`}
                >
                  <div className="p-6">
                    {/* Header with Status */}
                    <div className="flex items-start justify-between mb-3">
                      <div className="flex-1">
                        <h3 className="text-lg font-bold text-slate-100">
                          {course.course_name}
                        </h3>
                        <p className="text-sm text-slate-400 mt-1">
                          {course.course_code}
                        </p>
                      </div>
                      <span
                        className={`px-3 py-1 rounded-full text-xs font-bold uppercase whitespace-nowrap ml-2 ${config.badge} ${config.text}`}
                      >
                        {course.status}
                      </span>
                    </div>

                    {/* Description */}
                    <p className="text-slate-300 text-sm mb-4">
                      {course.description}
                    </p>

                    {/* Meta Information */}
                    <div className="space-y-2 mb-4 pb-4 border-t border-slate-700 pt-4">
                      <div className="flex items-center gap-2 text-slate-300 text-sm">
                        <User size={16} className="flex-shrink-0" />
                        <span className="font-medium">Trainer:</span>
                        <span>{course.trainer_name}</span>
                      </div>

                      <div className="flex items-center gap-2 text-slate-300 text-sm">
                        <Calendar size={16} className="flex-shrink-0" />
                        <span className="font-medium">Term:</span>
                        <span>{course.term}</span>
                      </div>

                      {course.students_count && (
                        <div className="flex items-center gap-2 text-slate-300 text-sm">
                          <Users size={16} className="flex-shrink-0" />
                          <span className="font-medium">Class Size:</span>
                          <span>{course.students_count} students</span>
                        </div>
                      )}

                      {course.credits && (
                        <div className="flex items-center gap-2 text-slate-300 text-sm">
                          <BookOpen size={16} className="flex-shrink-0" />
                          <span className="font-medium">Credits:</span>
                          <span>{course.credits}</span>
                        </div>
                      )}
                    </div>

                    {/* Action Button */}
                    <button className={`w-full py-2 px-4 rounded-lg font-medium transition flex items-center justify-center gap-2 ${
                      course.status === 'active'
                        ? 'bg-blue-600 text-white hover:bg-blue-700'
                        : 'bg-slate-600 text-slate-300 hover:bg-slate-600'
                    }`}>
                      View Details
                      <ChevronRight size={18} />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* Statistics */}
        {courses.length > 0 && (
          <div className="mt-8 bg-slate-900 border border-slate-800 rounded-lg shadow-md p-6">
            <h2 className="text-xl font-bold text-slate-100 mb-4">
              Course Statistics
            </h2>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              <div>
                <p className="text-slate-400 text-sm mb-2">Total Credits</p>
                <p className="text-3xl font-bold text-blue-400">
                  {courses.reduce((sum, c) => sum + (c.credits || 0), 0)}
                </p>
              </div>
              <div>
                <p className="text-slate-400 text-sm mb-2">Average Class Size</p>
                <p className="text-3xl font-bold text-green-400">
                  {Math.round(
                    courses.reduce((sum, c) => sum + (c.students_count || 0), 0) /
                      courses.length
                  )}
                </p>
              </div>
              <div>
                <p className="text-slate-400 text-sm mb-2">Workload</p>
                <p className="text-3xl font-bold text-purple-400">
                  {courses.filter((c) => c.status === 'active').length} Active
                </p>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
