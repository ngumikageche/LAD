import { useEffect, useMemo, useState } from 'react';
import { apiRequest } from '../api/client';
import { useAuth } from '../auth/AuthContext';

type Course = {
  id: string;
  name: string;
  cbet_level: string;
  department_id: string;
};

type Student = {
  id: string;
  course_id: string;
  registration_number: string;
  enrollment_year: number;
  user: {
    id: string;
    name: string;
    email: string;
  };
};

type Notification = {
  id: string;
  title: string;
  message: string;
  is_read: boolean;
  created_at: string | null;
};

const TrainerDashboardPage = () => {
  const { user, token } = useAuth();
  const permissions = user?.permissions ?? {};
  const [courses, setCourses] = useState<Course[]>([]);
  const [students, setStudents] = useState<Student[]>([]);
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [selectedCourseId, setSelectedCourseId] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const hasPermission = (key: string) => {
    if (permissions['*']) {
      return true;
    }
    return Boolean(permissions[key]);
  };

  useEffect(() => {
    const loadData = async () => {
      if (!token) {
        return;
      }
      setIsLoading(true);
      setError(null);
      try {
        const [courseData, studentData, notificationData] = await Promise.all([
          hasPermission('courses.read') ? apiRequest<Course[]>('/trainers/me/courses', { token }) : Promise.resolve([]),
          hasPermission('students.read') ? apiRequest<Student[]>('/trainers/me/students', { token }) : Promise.resolve([]),
          hasPermission('notifications.read') && user?.id
            ? apiRequest<Notification[]>(`/notifications?user_id=${user.id}`, { token })
            : Promise.resolve([]),
        ]);
        setCourses(courseData);
        setStudents(studentData);
        setNotifications(notificationData);
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Failed to load trainer data';
        setError(message);
      } finally {
        setIsLoading(false);
      }
    };

    loadData();
  }, [token, user?.id, permissions]);

  const sections = useMemo(
    () => [
      {
        title: 'Course & Teaching Management',
        description: 'View assigned courses, review syllabi, and organize students by course.',
        permission: 'courses.read',
        actions: ['Assigned courses', 'Course details', 'Class organization'],
      },
      {
        title: 'Student Management',
        description: 'Track class rosters, student profiles, and filter by course or department.',
        permission: 'students.read',
        actions: ['Class roster', 'Student profiles', 'Filters'],
      },
      {
        title: 'Assessment & Grading',
        description: 'Record and edit scores, grade per course, and upload assessments.',
        permission: 'students.update',
        actions: ['Record scores', 'Edit grades', 'Upload results'],
      },
      {
        title: 'Performance Monitoring',
        description: 'Spot trends, compare subjects, and identify low performers.',
        permission: 'students.read',
        actions: ['Trends', 'Comparisons', 'Low performers'],
      },
      {
        title: 'Alerts & Intervention',
        description: 'Receive alerts, track attendance, and document interventions.',
        permission: 'notifications.read',
        actions: ['Alerts', 'Attendance signals', 'Interventions'],
      },
      {
        title: 'Feedback & Communication',
        description: 'Share feedback, recommendations, and communicate results.',
        permission: 'students.update',
        actions: ['Feedback', 'Recommendations', 'Messaging'],
      },
      {
        title: 'Reporting',
        description: 'Generate class reports, export results, and summarize analytics.',
        permission: 'courses.read',
        actions: ['Class reports', 'Exports', 'Summaries'],
      },
      {
        title: 'Department & Institutional Context',
        description: 'Align with department standards and benchmark performance.',
        permission: 'departments.read',
        actions: ['Department scope', 'Benchmarks', 'Standards'],
      },
      {
        title: 'Smart Insights',
        description: 'Automated insights and predicted at-risk students.',
        permission: 'students.read',
        actions: ['Insights', 'Predictions', 'Recommendations'],
      },
      {
        title: 'Trainer Dashboard',
        description: 'Visual summaries with charts and class highlights.',
        permission: 'students.read',
        actions: ['Charts', 'KPIs', 'Highlights'],
      },
    ],
    []
  );

  const isTrainer = user?.role_name === 'Trainer' || hasPermission('trainers.read');

  const visibleStudents = useMemo(() => {
    if (!selectedCourseId) {
      return students;
    }
    return students.filter((student) => student.course_id === selectedCourseId);
  }, [students, selectedCourseId]);

  if (!isTrainer) {
    return (
      <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
        You do not have permission to view the trainer dashboard.
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-4xl font-bold text-gray-900">Trainer Hub</h1>
        <p className="mt-2 text-gray-600">
          Manage teaching, students, assessments, and analytics based on your assigned permissions.
        </p>
      </div>

      {error ? (
        <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
          {error}
        </div>
      ) : null}

      {isLoading ? (
        <div className="rounded-xl border border-gray-200 bg-white p-6 text-sm text-gray-600">
          Loading trainer workspace...
        </div>
      ) : null}

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
        {sections.map((section) => {
          const allowed = hasPermission(section.permission);
          return (
            <div
              key={section.title}
              className={`relative overflow-hidden rounded-2xl border bg-white p-6 shadow-sm transition-all ${
                allowed ? 'border-gray-100' : 'border-amber-100 bg-amber-50/40'
              }`}
            >
              <div className="flex items-start justify-between">
                <div>
                  <h3 className="text-lg font-semibold text-gray-900">{section.title}</h3>
                  <p className="mt-2 text-sm text-gray-600">{section.description}</p>
                </div>
                <span
                  className={`rounded-full px-3 py-1 text-xs font-semibold ${
                    allowed ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'
                  }`}
                >
                  {allowed ? 'Enabled' : 'Limited'}
                </span>
              </div>
              <ul className="mt-4 space-y-2 text-sm text-gray-600">
                {section.actions.map((action) => (
                  <li key={action} className="flex items-center gap-2">
                    <span className="h-1.5 w-1.5 rounded-full bg-indigo-500" />
                    {action}
                  </li>
                ))}
              </ul>
              {!allowed ? (
                <div className="mt-4 rounded-lg border border-amber-200 bg-amber-100/60 px-3 py-2 text-xs text-amber-700">
                  Access restricted by your role permissions.
                </div>
              ) : null}
            </div>
          );
        })}
      </div>

      {hasPermission('courses.read') ? (
        <div className="rounded-2xl border border-gray-100 bg-white p-6 shadow-sm">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-xl font-semibold text-gray-900">Assigned Courses</h2>
              <p className="text-sm text-gray-500">Courses tied to your department.</p>
            </div>
            <span className="text-sm text-gray-500">{courses.length} courses</span>
          </div>
          <div className="mt-4 grid gap-3 md:grid-cols-2">
            {courses.map((course) => (
              <div key={course.id} className="rounded-xl border border-gray-100 px-4 py-3">
                <p className="text-sm font-semibold text-gray-900">{course.name}</p>
                <p className="text-xs text-gray-500">CBET level: {course.cbet_level}</p>
              </div>
            ))}
            {courses.length === 0 ? (
              <p className="text-sm text-gray-500">No courses assigned yet.</p>
            ) : null}
          </div>
        </div>
      ) : null}

      {hasPermission('students.read') ? (
        <div className="rounded-2xl border border-gray-100 bg-white p-6 shadow-sm">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-xl font-semibold text-gray-900">Class Roster</h2>
              <p className="text-sm text-gray-500">Students in your assigned courses.</p>
            </div>
            <div className="flex items-center gap-3">
              <select
                value={selectedCourseId}
                onChange={(event) => setSelectedCourseId(event.target.value)}
                className="rounded-lg border border-gray-200 px-3 py-2 text-sm text-gray-700 focus:outline-none focus:ring-2 focus:ring-indigo-500"
              >
                <option value="">All courses</option>
                {courses.map((course) => (
                  <option key={course.id} value={course.id}>
                    {course.name}
                  </option>
                ))}
              </select>
              <span className="text-sm text-gray-500">{visibleStudents.length} students</span>
            </div>
          </div>
          <div className="mt-4 overflow-x-auto">
            <table className="w-full text-left">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-4 py-3 text-xs font-semibold text-gray-600 uppercase">Student</th>
                  <th className="px-4 py-3 text-xs font-semibold text-gray-600 uppercase">Email</th>
                  <th className="px-4 py-3 text-xs font-semibold text-gray-600 uppercase">Reg No</th>
                  <th className="px-4 py-3 text-xs font-semibold text-gray-600 uppercase">Year</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {visibleStudents.map((student) => (
                  <tr key={student.id} className="hover:bg-gray-50">
                    <td className="px-4 py-3 text-sm font-medium text-gray-900">{student.user.name}</td>
                    <td className="px-4 py-3 text-sm text-gray-600">{student.user.email}</td>
                    <td className="px-4 py-3 text-sm text-gray-600">{student.registration_number}</td>
                    <td className="px-4 py-3 text-sm text-gray-600">{student.enrollment_year}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {visibleStudents.length === 0 ? (
              <p className="mt-4 text-sm text-gray-500">No students found.</p>
            ) : null}
          </div>
        </div>
      ) : null}

      {hasPermission('notifications.read') ? (
        <div className="rounded-2xl border border-gray-100 bg-white p-6 shadow-sm">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-xl font-semibold text-gray-900">Alerts & Notifications</h2>
              <p className="text-sm text-gray-500">Latest notifications tied to your account.</p>
            </div>
            <span className="text-sm text-gray-500">{notifications.length} alerts</span>
          </div>
          <div className="mt-4 space-y-3">
            {notifications.map((notice) => (
              <div key={notice.id} className="rounded-xl border border-gray-100 px-4 py-3">
                <div className="flex items-center justify-between">
                  <p className="text-sm font-semibold text-gray-900">{notice.title}</p>
                  <span className="text-xs text-gray-500">{notice.is_read ? 'Read' : 'New'}</span>
                </div>
                <p className="mt-1 text-sm text-gray-600">{notice.message}</p>
              </div>
            ))}
            {notifications.length === 0 ? (
              <p className="text-sm text-gray-500">No notifications yet.</p>
            ) : null}
          </div>
        </div>
      ) : null}
    </div>
  );
};

export default TrainerDashboardPage;
