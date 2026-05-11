import { useEffect, useMemo, useState } from 'react';
import { Search } from 'lucide-react';
import { apiRequest } from '../../api/client';
import { useAuth } from '../../auth/AuthContext';
import type { Course, Module } from '../../types/backend';

// The /students endpoint returns students with an embedded user object
interface StudentWithUser {
  id: string;
  user_id: string;
  registration_number: string;
  course_id: string;
  enrollment_year: number;
  user?: { id: string; name: string; email: string };
  // some API responses may also return these flat
  name?: string;
  email?: string;
}

function studentName(s: StudentWithUser) {
  return s.user?.name ?? s.name ?? '—';
}
function studentEmail(s: StudentWithUser) {
  return s.user?.email ?? s.email ?? '—';
}
import { useTableControls } from '../../hooks/useTableControls';
import { TableFooter, SortableTh } from '../ui/TableControls';

const StudentsTable = () => {
  const { token } = useAuth();
  const [searchTerm, setSearchTerm] = useState('');
  const [students, setStudents] = useState<StudentWithUser[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isEditOpen, setIsEditOpen] = useState(false);
  const [editStudent, setEditStudent] = useState<StudentWithUser | null>(null);
  const [isViewOpen, setIsViewOpen] = useState(false);
  const [viewStudent, setViewStudent] = useState<StudentWithUser | null>(null);
  const [viewSubjects, setViewSubjects] = useState<any[]>([]);
  const [viewCourse, setViewCourse] = useState<string>('');
  const [viewModule, setViewModule] = useState<string>('');
  const [courses, setCourses] = useState<Course[]>([]);
  const [modules, setModules] = useState<Module[]>([]);
  const [selectedCourseId, setSelectedCourseId] = useState('');
  const [selectedModuleId, setSelectedModuleId] = useState('');
  const [subjects, setSubjects] = useState<any[]>([]);

  useEffect(() => {
    const loadAll = async () => {
      try {
        const [studentData, courseData, moduleData] = await Promise.all([
          apiRequest<StudentWithUser[]>('/students', { token }),
          apiRequest<Course[]>('/courses', { token }),
          apiRequest<Module[]>('/modules', { token }),
        ]);
        setStudents(studentData);
        setCourses(courseData);
        setModules(moduleData);
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Failed to load students';
        setError(message);
      } finally {
        setIsLoading(false);
      }
    };
    loadAll();
  }, [token]);

  const filteredStudents = useMemo(() => {
    const search = searchTerm.toLowerCase();
    return students.filter((student) => {
      return (
        studentName(student).toLowerCase().includes(search) ||
        studentEmail(student).toLowerCase().includes(search) ||
        student.registration_number.toLowerCase().includes(search)
      );
    });
  }, [searchTerm, students]);

  const tc = useTableControls(
    filteredStudents,
    15,
    (item, key) => {
      if (key === 'name') return studentName(item);
      if (key === 'email') return studentEmail(item);
      return (item as any)[key];
    },
  );

  return (
    <div className="bg-slate-900 rounded-2xl shadow-lg border border-slate-800 overflow-hidden">
      <div className="p-6 border-b border-slate-700">
        <div className="flex justify-between items-center gap-4">
          <div className="relative flex-1 max-w-md">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-indigo-500 h-5 w-5" />
            <input
              type="text"
              placeholder="Search students..."
              className="w-full pl-10 pr-4 py-2.5 rounded-lg border border-slate-700 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition-all"
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>
        </div>
      </div>
      {isLoading ? (
        <div className="p-6 text-sm text-slate-400">Loading students...</div>
      ) : error ? (
        <div className="p-6 text-sm text-red-600">{error}</div>
      ) : (
      <div className="overflow-x-auto">
        <table className="w-full text-left">
          <thead className="bg-slate-800 border-b border-slate-700">
            <tr>
              <SortableTh label="Name" sortKey="name" sort={tc.sort} onSort={tc.setSort} />
              <SortableTh label="Email" sortKey="email" sort={tc.sort} onSort={tc.setSort} />
              <SortableTh label="Reg No" sortKey="registration_number" sort={tc.sort} onSort={tc.setSort} />
              <SortableTh label="Enrollment Year" sortKey="enrollment_year" sort={tc.sort} onSort={tc.setSort} />
              <th className="px-6 py-4 text-xs font-bold text-slate-400 uppercase tracking-wider">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-800">
            {tc.paged.map(student => (
              <tr key={student.id} className="hover:bg-slate-800 transition-colors">
                <td className="px-6 py-4 font-medium text-slate-100">{studentName(student)}</td>
                <td className="px-6 py-4 text-slate-400">{studentEmail(student)}</td>
                <td className="px-6 py-4 text-slate-400">{student.registration_number}</td>
                <td className="px-6 py-4 text-slate-400">{student.enrollment_year}</td>
                <td className="px-6 py-4 flex gap-2">
                  <button
                    className="px-3 py-1.5 text-xs font-medium text-blue-600 hover:underline rounded"
                    onClick={async () => {
                      setViewStudent(student);
                      // Find course and module
                      const course = courses.find(c => c.id === student.course_id);
                      setViewCourse(course ? course.name : '');
                      // Find module by enrollment (if you have enrollment data, otherwise skip or adjust)
                      // For demo, just pick first module in course
                      const module = modules.find(m => m.course_id === student.course_id);
                      setViewModule(module ? module.name : '');
                      // Fetch subjects for the module
                      let subs: any[] = [];
                      if (module) {
                        try {
                          subs = await apiRequest<any[]>(`/subjects?module_id=${module.id}`, { token });
                        } catch {}
                      }
                      setViewSubjects(subs);
                      setIsViewOpen(true);
                    }}
                  >View</button>
                  <button
                    className="px-3 py-1.5 text-xs font-medium text-indigo-600 hover:underline rounded"
                    onClick={() => {
                      setEditStudent(student);
                      setSelectedCourseId(student.course_id || '');
                      // Find the student's current module (if any)
                      // You may want to fetch this from enrollments if available
                      setSelectedModuleId('');
                      setIsEditOpen(true);
                    }}
                  >Edit</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {/* View Modal */}
        {isViewOpen && viewStudent && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-2 sm:p-4 overflow-y-auto">
            <div className="w-full max-w-lg rounded-2xl bg-slate-900 p-4 sm:p-8 shadow-xl mx-auto flex flex-col">
              <div className="flex items-center justify-between mb-4 sm:mb-6">
                <h2 className="text-xl sm:text-2xl font-bold text-slate-200">Student Details</h2>
                <button onClick={() => setIsViewOpen(false)} className="p-2 rounded-full hover:bg-slate-800">
                  <span className="text-slate-400">&times;</span>
                </button>
              </div>
              <div className="space-y-3">
                <div><span className="font-medium">Name:</span> {studentName(viewStudent)}</div>
                <div><span className="font-medium">Email:</span> {studentEmail(viewStudent)}</div>
                <div><span className="font-medium">Reg No:</span> {viewStudent.registration_number}</div>
                <div><span className="font-medium">Enrollment Year:</span> {viewStudent.enrollment_year}</div>
                <div><span className="font-medium">Course:</span> {viewCourse}</div>
                <div><span className="font-medium">Module:</span> {viewModule}</div>
                <div>
                  <span className="font-medium">Subjects:</span>
                  <ul className="list-disc pl-5 mt-1 text-sm text-slate-300">
                    {viewSubjects.length > 0 ? viewSubjects.map(sub => (
                      <li key={sub.id}>{sub.name}</li>
                    )) : <li className="text-slate-500">No subjects found</li>}
                  </ul>
                </div>
              </div>
              <div className="flex justify-end pt-4">
                <button
                  type="button"
                  onClick={() => setIsViewOpen(false)}
                  className="px-4 py-2 text-sm font-medium text-slate-300 bg-slate-800 rounded-md hover:bg-slate-700 w-full sm:w-auto"
                >
                  Close
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
      )}
      <TableFooter page={tc.page} totalPages={tc.totalPages} total={tc.total} pageSize={tc.pageSize} onPage={tc.setPage} />

      {/* Edit Modal */}
      {isEditOpen && editStudent && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-2 sm:p-4 overflow-y-auto">
          <div className="w-full max-w-lg rounded-2xl bg-slate-900 p-4 sm:p-8 shadow-xl mx-auto flex flex-col">
            <div className="flex items-center justify-between mb-4 sm:mb-6">
              <h2 className="text-xl sm:text-2xl font-bold text-slate-200">Edit Student</h2>
              <button onClick={() => setIsEditOpen(false)} className="p-2 rounded-full hover:bg-slate-800">
                <span className="text-slate-400">&times;</span>
              </button>
            </div>
            <form
              className="space-y-4"
              onSubmit={async (e) => {
                e.preventDefault();
                if (!editStudent) return;
                // Update student course/module assignment
                await apiRequest(`/students/${editStudent.id}/enroll`, {
                  method: 'POST',
                  token,
                  body: {
                    course_id: selectedCourseId,
                    module_id: selectedModuleId,
                  },
                });
                setIsEditOpen(false);
                // Optionally reload students list
                // await loadAll();
              }}
            >
              <div>
                <label className="block text-sm font-medium text-slate-300">Course</label>
                <select
                  className="mt-1 block w-full rounded-md border border-slate-700 px-3 py-2 shadow-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                  value={selectedCourseId}
                  onChange={e => setSelectedCourseId(e.target.value)}
                >
                  <option value="">Select course...</option>
                  {courses.map(course => (
                    <option key={course.id} value={course.id}>{course.name}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-300">Module</label>
                <select
                  className="mt-1 block w-full rounded-md border border-slate-700 px-3 py-2 shadow-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                  value={selectedModuleId}
                  onChange={e => setSelectedModuleId(e.target.value)}
                  disabled={!selectedCourseId}
                >
                  <option value="">Select module...</option>
                  {modules.filter(m => m.course_id === selectedCourseId).map(module => (
                    <option key={module.id} value={module.id}>{module.name}</option>
                  ))}
                </select>
              </div>
              <div className="flex flex-col sm:flex-row justify-end gap-2 sm:gap-3 pt-4">
                <button
                  type="button"
                  onClick={() => setIsEditOpen(false)}
                  className="px-4 py-2 text-sm font-medium text-slate-300 bg-slate-800 rounded-md hover:bg-slate-700 w-full sm:w-auto"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 text-sm font-medium text-white bg-indigo-600 rounded-md hover:bg-indigo-700 w-full sm:w-auto"
                >
                  Save
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default StudentsTable;
