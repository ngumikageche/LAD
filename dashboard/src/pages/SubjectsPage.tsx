import { useEffect, useMemo, useState, FormEvent } from 'react';
import { Plus, X } from 'lucide-react';
import ViewMarksModal, { type Mark } from '../components/ViewMarksModal';
import { apiRequest } from '../api/client';
import { useAuth } from '../auth/AuthContext';
import type { Module, Course } from '../types/backend';
import { useTableControls } from '../hooks/useTableControls';
import { TableFooter, SortableTh } from '../components/ui/TableControls';



type Subject = {
  id?: string;
  code?: string;
  name: string;
  module_id: string;
  course_id?: string | null;
  course_name?: string | null;
  department_id?: string | null;
  department_name?: string | null;
  description?: string;
  syllabus_topics?: string[];
};

const emptySubjectForm = {
  name: '',
  module_id: '',
  description: '',
  syllabus_topics: [],
};

type ModuleForm = {
  id?: string;
  name: string;
  course_id: string;
  description?: string;
};

const emptyForm: ModuleForm = {
  name: '',
  course_id: '',
  description: '',
};

const SubjectsPage = () => {
  const { token, user } = useAuth();
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [modules, setModules] = useState<Module[]>([]);
  const [courses, setCourses] = useState<Course[]>([]);
  const [subjectForm, setSubjectForm] = useState<Subject>(emptySubjectForm);
  const [selectedCourseId, setSelectedCourseId] = useState('');
  const [competencies, setCompetencies] = useState<{id:string;name:string}[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [uploadModalOpen, setUploadModalOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  // View Marks Modal state/hooks must be inside the component
  const [marksModalOpen, setMarksModalOpen] = useState(false);
  const [marks, setMarks] = useState<Mark[]>([]);
  const [marksSubjectName, setMarksSubjectName] = useState('');
  const [autoOpened, setAutoOpened] = useState(false);

  // Fetch marks for a subject
  const handleViewMarks = async (subject: Subject) => {
    setMarksModalOpen(true);
    setMarksSubjectName(subject.name);
    try {
      const data = await apiRequest<{marks: Mark[]}>(`/subjects/${subject.id}/marks`, { token });
      setMarks(data.marks ?? []);
    } catch (err) {
      setMarks([]);
    }
  };

  const loadData = async () => {
    setIsLoading(true);
    setError(null);
    try {
      let subjectData: Subject[] = [];
      let moduleData: Module[] = [];
      let courseData: Course[] = [];

      const isStudent = user?.role_name?.toLowerCase() === 'student';
      const isTrainer = user?.role_name?.toLowerCase() === 'trainer' || (user?.permissions && user.permissions['trainer_subjects.read']);

      if (isTrainer) {
        // Fetch trainer-assigned subjects only
        const t = await apiRequest<any>('/trainer-subjects/me', { token });
        const subs = t.subjects || [];
        subjectData = subs.map((s: any) => ({ id: s.id, name: s.name, module_id: s.module?.id || '', description: s.description || '' }));
        // derive module list from subjects
        const moduleMap: Record<string, Module> = {};
        for (const s of subs) {
          if (s.module && s.module.id) {
            moduleMap[s.module.id] = { id: s.module.id, name: s.module.name, course_id: s.module.course_id || '' } as Module;
          }
        }
        moduleData = Object.values(moduleMap);
      } else if (isStudent) {
        // For students: fetch only enrolled subjects (student self-view)
        const resp = await apiRequest<any>('/students/me/subjects', { token });
        const subs = resp?.subjects || [];
        subjectData = subs.map((s: any) => ({ id: s.id, name: s.name, module_id: s.module?.id || '', description: s.description || '' }));
        // derive module list from subjects
        const moduleMap: Record<string, Module> = {};
        for (const s of subs) {
          if (s.module && s.module.id) {
            moduleMap[s.module.id] = { id: s.module.id, name: s.module.name, course_id: s.module.course_id || '' } as Module;
          }
        }
        moduleData = Object.values(moduleMap);
      } else {
        // default: fetch all subjects
        subjectData = await apiRequest<Subject[]>('/subjects', { token });
      }

      // Load modules if permitted, otherwise derive for students
      if (user?.permissions?.['modules.read'] || user?.permissions?.['*']) {
        moduleData = await apiRequest<Module[]>('/modules', { token });
      } else if (isStudent && subjectData.length > 0 && moduleData.length === 0) {
        const moduleIds = Array.from(new Set(subjectData.map(s => s.module_id))).filter(Boolean);
        if (moduleIds.length > 0) {
          const modulePromises = moduleIds.map(id => apiRequest<Module>(`/modules/${id}`, { token }).catch(() => null));
          moduleData = (await Promise.all(modulePromises)).filter(Boolean) as Module[];
        }
      }

      // Load courses if permitted, otherwise derive for students/trainers
      if (user?.permissions?.['courses.read'] || user?.permissions?.['*']) {
        courseData = await apiRequest<Course[]>('/courses', { token });
      } else if ((isStudent || isTrainer) && moduleData.length > 0) {
        const courseIds = Array.from(new Set(moduleData.map(m => m.course_id))).filter(Boolean);
        if (courseIds.length > 0) {
          const coursePromises = courseIds.map(id => apiRequest<Course>(`/courses/${id}`, { token }).catch(() => null));
          courseData = (await Promise.all(coursePromises)).filter(Boolean) as Course[];
        }
      }

      setSubjects(subjectData);
      setModules(moduleData);
      setCourses(courseData);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to load subjects';
      setError(message);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    if (token) {
      loadData();
    }
  }, [token]);

  // Auto-open first enrolled subject for students when subjects load
  useEffect(() => {
    const isStudent = user?.role_name?.toLowerCase() === 'student';
    if (isStudent && !autoOpened && subjects.length > 0) {
      setAutoOpened(true);
      // open marks modal for first subject
      handleViewMarks(subjects[0]);
    }
  }, [subjects, user, autoOpened]);

  const filtered = useMemo(() => {
    const search = searchTerm.toLowerCase();
    return subjects.filter((item) => {
      const moduleObj = modules.find((m) => m.id === item.module_id);
      const courseObj = moduleObj ? courses.find((c) => c.id === moduleObj.course_id) : undefined;
      return (
        item.name.toLowerCase().includes(search) ||
        (item.description?.toLowerCase().includes(search) ?? false) ||
        (item.department_name?.toLowerCase().includes(search) ?? false) ||
        (moduleObj?.name.toLowerCase().includes(search) ?? false) ||
        (courseObj?.name.toLowerCase().includes(search) ?? false)
      );
    });
  }, [subjects, modules, courses, searchTerm]);

  const tc = useTableControls(
    filtered,
    15,
    (item, key) => {
      if (key === 'course') {
        const mod = modules.find(m => m.id === item.module_id);
        return mod ? courses.find(c => c.id === mod.course_id)?.name ?? '' : '';
      }
      if (key === 'department') return item.department_name ?? '';
      return (item as any)[key];
    },
  );

  const openCreate = () => {
    setSubjectForm(emptySubjectForm);
    setSelectedCourseId('');
    setIsModalOpen(true);
  };

  // Editing subjects is not implemented in this patch (add if needed)

  const closeModal = () => {
    setIsModalOpen(false);
    setSubjectForm(emptySubjectForm);
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setIsSubmitting(true);
    setError(null);

    const payload = {
      name: subjectForm.name.trim(),
      module_id: subjectForm.module_id,
      description: subjectForm.description?.trim() || undefined,
      syllabus_topics: subjectForm.syllabus_topics ?? [],
    };

    try {
      await apiRequest('/subjects', {
        method: 'POST',
        token,
        body: payload,
      });
      closeModal();
      await loadData();
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to save subject';
      setError(message);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDelete = async (item: Subject) => {
    setIsSubmitting(true);
    setError(null);
    try {
      await apiRequest(`/subjects/${item.id}`, { method: 'DELETE', token });
      await loadData();
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to delete subject';
      setError(message);
    } finally {
      setIsSubmitting(false);
    }
  };

  // Allow access if user has any of the following:
  // - subjects.read (admin, manager, trainer, etc.)
  // - * (superuser)
  // - students_view_own_subjects.read (student self-view)
  // - student_subjects.read (student assigned subjects)
  if (
    !user?.permissions?.['subjects.read'] &&
    !user?.permissions?.['*'] &&
    !user?.permissions?.['students_view_own_subjects.read'] &&
    !user?.permissions?.['student_subjects.read']
  ) {
    return (
      <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
        You do not have permission to view subjects.
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-slate-200">Subjects</h1>
          <p className="text-sm text-slate-500">Define subjects (modules) for each course.</p>
        </div>
        {user?.permissions?.['subjects.create'] || user?.permissions?.['*'] ? (
          <button
            onClick={openCreate}
            className="flex items-center px-4 py-2.5 text-sm font-bold text-white bg-indigo-600 rounded-lg hover:bg-indigo-700 transition-colors"
          >
            <Plus className="w-4 h-4 mr-2 text-white" />
            Add Subject
          </button>
        ) : null}
        {user?.permissions?.['scores.create'] || user?.permissions?.['*'] ? (
          <button
            onClick={() => setUploadModalOpen(true)}
            className="ml-3 flex items-center px-4 py-2.5 text-sm font-bold text-white bg-emerald-600 rounded-lg hover:bg-emerald-700 transition-colors"
          >
            Upload Marks
          </button>
        ) : null}
      </div>

      <div className="bg-slate-900 border border-slate-800 rounded-2xl shadow-lg border border-slate-800 overflow-hidden">
        <div className="p-6 border-b border-slate-700">
          <input
            type="text"
            placeholder="Search by name, description, course, or department..."
            className="w-full max-w-md px-4 py-2.5 rounded-lg border border-slate-700 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition-all"
            value={searchTerm}
            onChange={(event) => setSearchTerm(event.target.value)}
          />
        </div>
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-slate-800">
            <thead className="bg-slate-800 border-b border-slate-700">
              <tr>
                <SortableTh label="ID" sortKey="code" sort={tc.sort} onSort={tc.setSort} />
                <SortableTh label="Name" sortKey="name" sort={tc.sort} onSort={tc.setSort} />
                <SortableTh label="Course" sortKey="course" sort={tc.sort} onSort={tc.setSort} />
                <SortableTh label="Department" sortKey="department" sort={tc.sort} onSort={tc.setSort} />
                <SortableTh label="Description" sortKey="description" sort={tc.sort} onSort={tc.setSort} />
                <th className="px-6 py-3"></th>
              </tr>
            </thead>
            <tbody className="bg-slate-900 divide-y divide-slate-800">
              {isLoading ? (
                <tr>
                  <td colSpan={6} className="px-6 py-4 text-center text-slate-500">Loading...</td>
                </tr>
              ) : tc.paged.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-6 py-4 text-center text-slate-500">No subjects found.</td>
                </tr>
              ) : (
                tc.paged.map((item) => {
                  const moduleObj = modules.find((m) => m.id === item.module_id);
                  const courseObj = moduleObj ? courses.find((c) => c.id === moduleObj.course_id) : undefined;
                  return (
                    <tr key={item.id}>
                      <td className="px-6 py-4"><span className="font-mono text-xs bg-slate-700 text-indigo-300 px-2 py-0.5 rounded">{item.code ?? '—'}</span></td>
                      <td className="px-6 py-4 whitespace-nowrap">{item.name}</td>
                      <td className="px-6 py-4 whitespace-nowrap">{courseObj?.name ?? '-'}</td>
                      <td className="px-6 py-4 whitespace-nowrap">{item.department_name ?? '-'}</td>
                      <td className="px-6 py-4 whitespace-nowrap">{item.description ?? '-'}</td>
                      <td className="px-6 py-4 whitespace-nowrap text-right space-x-2">
                        <button
                          className="inline-flex items-center px-3 py-1.5 text-xs font-medium text-blue-600 hover:underline"
                          onClick={() => handleViewMarks(item)}
                        >
                          View Marks
                        </button>
                        {/* Students can never add their own marks. No add marks button for students. */}
                        {(user?.permissions?.['subjects.update'] || user?.permissions?.['*']) && (
                          <button
                            className="inline-flex items-center px-3 py-1.5 text-xs font-medium text-indigo-600 hover:underline"
                            // onClick={() => openEdit(item)}
                            disabled
                          >
                            Edit
                          </button>
                        )}
                        {(user?.permissions?.['subjects.delete'] || user?.permissions?.['*']) && (
                          <button
                            className="inline-flex items-center px-3 py-1.5 text-xs font-medium text-red-600 hover:underline"
                            onClick={() => handleDelete(item)}
                            disabled={isSubmitting}
                          >
                            Delete
                          </button>
                        )}
                      </td>
                          {/* View Marks Modal */}
                          <ViewMarksModal
                            open={marksModalOpen}
                            onClose={() => setMarksModalOpen(false)}
                            marks={marks}
                            subjectName={marksSubjectName}
                          />
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
        <TableFooter page={tc.page} totalPages={tc.totalPages} total={tc.total} pageSize={tc.pageSize} onPage={tc.setPage} />
      </div>

      {/* Modal for create/edit */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-30">
          <div className="bg-slate-900 border border-slate-800 rounded-xl shadow-lg p-8 w-full max-w-md relative">
            <button
              className="absolute top-4 right-4 text-slate-500 hover:text-slate-400"
              onClick={closeModal}
              disabled={isSubmitting}
            >
              <X className="w-5 h-5" />
            </button>
            <h2 className="text-xl font-bold mb-4">{subjectForm.id ? 'Edit Subject' : 'Add Subject'}</h2>
            {error && <div className="mb-4 text-red-600 text-sm">{error}</div>}
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-300 mb-1">Course</label>
                <select
                  className="w-full px-4 py-2 rounded-lg border border-slate-700 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  value={selectedCourseId}
                  onChange={(e) => {
                    setSelectedCourseId(e.target.value);
                    setSubjectForm((f) => ({ ...f, module_id: '' }));
                  }}
                  required
                  disabled={isSubmitting}
                >
                  <option value="">Select course...</option>
                  {courses.map((course) => (
                    <option key={course.id} value={course.id}>{course.name}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-300 mb-1">Module</label>
                <select
                  className="w-full px-4 py-2 rounded-lg border border-slate-700 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  value={subjectForm.module_id}
                  onChange={(e) => setSubjectForm((f) => ({ ...f, module_id: e.target.value }))}
                  required
                  disabled={isSubmitting || !selectedCourseId}
                >
                  <option value="">Select module...</option>
                  {modules.filter((m) => m.course_id === selectedCourseId).map((module) => (
                    <option key={module.id} value={module.id}>{module.name}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-300 mb-1">Subject Name</label>
                <input
                  type="text"
                  className="w-full px-4 py-2 rounded-lg border border-slate-700 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  value={subjectForm.name}
                  onChange={(e) => setSubjectForm((f) => ({ ...f, name: e.target.value }))}
                  required
                  disabled={isSubmitting}
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-300 mb-1">Description</label>
                <textarea
                  className="w-full px-4 py-2 rounded-lg border border-slate-700 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  value={subjectForm.description}
                  onChange={(e) => setSubjectForm((f) => ({ ...f, description: e.target.value }))}
                  rows={3}
                  disabled={isSubmitting}
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-300 mb-1">
                  Syllabus Topics (one per line)
                </label>
                <textarea
                  className="w-full px-4 py-2 rounded-lg border border-slate-700 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  value={(subjectForm.syllabus_topics ?? []).join('\n')}
                  onChange={(event) => setSubjectForm((form) => ({
                    ...form,
                    syllabus_topics: event.target.value.split('\n').map((topic) => topic.trim()).filter(Boolean),
                  }))}
                  rows={7}
                  placeholder="Topic 1&#10;Topic 2&#10;Topic 3"
                  disabled={isSubmitting}
                />
                <p className="mt-1 text-xs text-slate-500">Add the official 7–10 unit topics used by the trainer checklist.</p>
              </div>
              <div className="flex justify-end">
                <button
                  type="submit"
                  className="px-6 py-2 rounded-lg bg-indigo-600 text-white font-bold hover:bg-indigo-700 transition-colors"
                  disabled={isSubmitting}
                >
                  {subjectForm.id ? 'Update' : 'Create'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Upload Marks Modal (single + bulk CSV) */}
      {uploadModalOpen && (
        <UploadMarksModal
          open={uploadModalOpen}
          onClose={() => setUploadModalOpen(false)}
          token={token ?? undefined}
          modules={modules}
          courses={courses}
          subjects={subjects}
        />
      )}
    </div>
  );
};

type UploadMarksModalProps = {
  open: boolean;
  onClose: () => void;
  token?: string;
  modules: Module[];
  courses: Course[];
  subjects: Subject[];
};

function UploadMarksModal({ open, onClose, token, modules, courses, subjects }: UploadMarksModalProps) {
  const [tab, setTab] = useState<'single' | 'bulk'>('single');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  // single form state
  const [studentId, setStudentId] = useState('');
  const [trainerId, setTrainerId] = useState('');
  const [selectedCourseId, setSelectedCourseId] = useState('');
  const [selectedSubjectId, setSelectedSubjectId] = useState('');
  const [moduleId, setModuleId] = useState('');
  const [competencyId, setCompetencyId] = useState('');
  const [students, setStudents] = useState<any[]>([]);
  const [trainers, setTrainers] = useState<any[]>([]);
  const [competencyOptions, setCompetencyOptions] = useState<{id:string;name:string}[]>([]);
  const [score, setScore] = useState<string>('');
  const [term, setTerm] = useState('');
  const [assessmentTasks, setAssessmentTasks] = useState('');
  const [performanceLevel, setPerformanceLevel] = useState<string | null>(null);
  const { user: currentUser } = useAuth();

  const handleSingleSubmit = async (e?: FormEvent) => {
    e?.preventDefault();
    setError(null);
    setSuccessMessage(null);
    setIsSubmitting(true);
    try {
      const payload = {
        student_id: studentId,
        trainer_id: trainerId,
        module_id: moduleId || (selectedSubjectId ? (subjects.find(s => s.id === selectedSubjectId) as any)?.module_id : undefined),
        // competency will be auto-created server-side; do not send name
        assessment_tasks: assessmentTasks ? assessmentTasks.split(/\r?\n/).map(s => s.trim()).filter(Boolean) : undefined,
        performance_level: performanceLevel !== null ? performanceLevel : undefined,
        score: parseFloat(score),
        term: term || undefined,
      } as any;

      await apiRequest('/scores', { method: 'POST', token, body: payload });
      setSuccessMessage('Score uploaded');
      // clear form
      setStudentId('');
      setTrainerId('');
      setModuleId('');
      setCompetencyId('');
      setScore('');
      setTerm('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to upload score');
    } finally {
      setIsSubmitting(false);
    }
  };

  // CSV bulk upload: parse CSV in browser and POST each row to /scores
  const handleBulkFile = async (file?: File) => {
    if (!file) return;
    setError(null);
    setSuccessMessage(null);
    setIsSubmitting(true);

    const text = await file.text();
    const lines = text.split(/\r?\n/).filter(Boolean);
    if (lines.length === 0) {
      setError('CSV is empty');
      setIsSubmitting(false);
      return;
    }
    const header = lines[0].split(',').map(h => h.trim());
    const required = ['student_id', 'trainer_id', 'module_id', 'score'];
    const missing = required.filter(r => !header.includes(r));
    if (missing.length > 0) {
      setError(`CSV missing required columns: ${missing.join(', ')}`);
      setIsSubmitting(false);
      return;
    }

    let success = 0;
    const failures: string[] = [];

    // iterate rows
    for (let i = 1; i < lines.length; i++) {
      const row = lines[i].split(',').map(c => c.trim());
      if (row.length === 0) continue;
      const obj: Record<string, string> = {};
      header.forEach((h, idx) => {
        obj[h] = row[idx] ?? '';
      });

      // Build payload
      const payload: any = {
        student_id: obj['student_id'],
        trainer_id: obj['trainer_id'],
        module_id: obj['module_id'],
        competency_id: obj['competency_id'] || undefined,
        assessment_tasks: obj['assessment_tasks'] ? obj['assessment_tasks'].split(/;|\|/)?.map(s => s.trim()).filter(Boolean) : undefined,
        performance_level: obj['performance_level'] || undefined,
        score: parseFloat(obj['score']),
      };
      if (obj['term']) payload.term = obj['term'];

      try {
        await apiRequest('/scores', { method: 'POST', token, body: payload });
        success += 1;
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'upload error';
        failures.push(`line ${i + 1}: ${msg}`);
      }
    }

    setSuccessMessage(`${success} records uploaded. ${failures.length} failures.`);
    if (failures.length > 0) setError(failures.slice(0, 5).join('; '));
    setIsSubmitting(false);
  };

  // Load students for selected course and trainers list
  useEffect(() => {
    const loadLists = async () => {
      setError(null);
      try {
        // If a subject is selected and current user is a trainer, load students for that subject only
        const isTrainer = (currentUser?.role_name || '').toLowerCase() === 'trainer' || (currentUser?.permissions && currentUser.permissions['trainer_subjects.read']);
        if (selectedSubjectId && token && isTrainer) {
          const res = await apiRequest<any>(`/subjects/${selectedSubjectId}/students`, { token });
          setStudents(res?.students ?? []);
        } else if (selectedCourseId && token) {
          const res = await apiRequest<any[]>(`/students?course_id=${selectedCourseId}`, { token });
          setStudents(res ?? []);
        } else {
          setStudents([]);
        }
        // Load trainers (all) and let user choose; filtering by subject assignment isn't available server-side
        if (token) {
          const tr = await apiRequest<any[]>('/trainers', { token });
          setTrainers(tr ?? []);
        }
      } catch (err) {
        // ignore individual load errors
      }
    };
    loadLists();
  }, [selectedCourseId, selectedSubjectId, token, currentUser?.id]);

  // When subject changes, fetch competencies for its module and trainers for the subject
  useEffect(() => {
    const loadCompetenciesAndTrainers = async () => {
      setError(null);
      try {
        if (selectedSubjectId && token) {
          // fetch trainers assigned to this subject
          try {
            const trRes = await apiRequest<{trainers:{id:string;name?:string}[]}>(`/subjects/${selectedSubjectId}/trainers`, { token });
            const tlist = trRes?.trainers ?? [];
            setTrainers(tlist);
            if (tlist.length === 1) setTrainerId(tlist[0].id);
          } catch (e) {
            // fallback: keep previously loaded trainers
          }
        }
      } catch (err) {
        // ignore
      }
    };
    loadCompetenciesAndTrainers();
  }, [selectedSubjectId, subjects, token]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-30">
      <div className="bg-slate-900 border border-slate-800 rounded-xl shadow-lg p-6 w-full max-w-2xl relative">
        <button className="absolute top-4 right-4 text-slate-500 hover:text-slate-400" onClick={onClose} disabled={isSubmitting}>
          <X className="w-5 h-5" />
        </button>
        <h2 className="text-xl font-bold mb-4">Upload Marks</h2>
        <div className="mb-4 flex items-center gap-3">
          <button className={`px-3 py-1 mr-2 rounded-md ${tab === 'single' ? 'bg-indigo-600 text-white shadow' : 'bg-slate-800'}`} onClick={() => setTab('single')}>Single</button>
          <button className={`px-3 py-1 rounded-md ${tab === 'bulk' ? 'bg-indigo-600 text-white shadow' : 'bg-slate-800'}`} onClick={() => setTab('bulk')}>Bulk (CSV)</button>
        </div>
        {error && <div className="mb-3 text-red-600 text-sm">{error}</div>}
        {successMessage && <div className="mb-3 text-green-600 text-sm">{successMessage}</div>}

        {tab === 'single' ? (
          <form onSubmit={(e) => { e.preventDefault(); handleSingleSubmit(e); }} className="space-y-4">
            <div className="grid grid-cols-3 gap-3">
              <div>
                <label className="block text-sm font-medium text-slate-300">Course</label>
                <select value={selectedCourseId} onChange={(e) => { setSelectedCourseId(e.target.value); setSelectedSubjectId(''); }} className="mt-1 block w-full px-3 py-2 border rounded-md">
                  <option value="">Select course...</option>
                  {courses.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-300">Subject</label>
                <select value={selectedSubjectId} onChange={(e) => setSelectedSubjectId(e.target.value)} className="mt-1 block w-full px-3 py-2 border rounded-md">
                  <option value="">Select subject...</option>
                  {subjects.filter(s => {
                    const mod = modules.find(m => m.id === s.module_id);
                    return mod ? mod.course_id === selectedCourseId : false;
                  }).map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-300">Module</label>
                <select value={moduleId} onChange={(e) => setModuleId(e.target.value)} className="mt-1 block w-full px-3 py-2 border rounded-md">
                  <option value="">Select module...</option>
                  {modules.filter(m => m.course_id === selectedCourseId).map(m => <option key={m.id} value={m.id}>{m.name}</option>)}
                </select>
              </div>
            </div>

            <div className="grid grid-cols-3 gap-3">
              <div>
                <label className="block text-sm font-medium text-slate-300">Student</label>
                <select value={studentId} onChange={(e) => setStudentId(e.target.value)} className="mt-1 block w-full px-3 py-2 border rounded-md">
                  <option value="">Select student...</option>
                  {students.map(s => <option key={s.id} value={s.id}>{s.user?.name ?? s.registration_number}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-300">Trainer</label>
                <select value={trainerId} onChange={(e) => setTrainerId(e.target.value)} className="mt-1 block w-full px-3 py-2 border rounded-md">
                  <option value="">Select trainer...</option>
                  {trainers.map(t => <option key={t.id} value={t.id}>{t.user?.name ?? t.id}</option>)}
                </select>
              </div>
              {/* competency is always created from name; no selection */}
            </div>

            <div className="grid grid-cols-1 gap-3">
              <div>
                <label className="block text-sm font-medium text-slate-300">Assessment Tasks (one per line)</label>
                <textarea value={assessmentTasks} onChange={(e) => setAssessmentTasks(e.target.value)} placeholder="Task 1\nTask 2" className="mt-1 block w-full px-3 py-2 border rounded-md" rows={3} />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-300">Performance Level</label>
                <select value={performanceLevel ?? ''} onChange={(e) => setPerformanceLevel(e.target.value || null)} className="mt-1 block w-full px-3 py-2 border rounded-md">
                  <option value="">Select level...</option>
                  <option value="4">4 — Exceeds Expectations (EE)</option>
                  <option value="3">3 — Meets Expectations (ME)</option>
                  <option value="2">2 — Approaching Expectations (AE)</option>
                  <option value="1">1 — Below Expectations (BE)</option>
                </select>
              </div>
            </div>

            <div className="grid grid-cols-3 gap-3">
              <div>
                <label className="block text-sm font-medium text-slate-300">Score</label>
                <input placeholder="0 - 100" value={score} onChange={(e) => setScore(e.target.value)} className="mt-1 block w-full px-3 py-2 border rounded-md" required />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-300">Term (optional)</label>
                <input placeholder="2026-Q2" value={term} onChange={(e) => setTerm(e.target.value)} className="mt-1 block w-full px-3 py-2 border rounded-md" />
              </div>
              <div className="flex items-end justify-end">
                <button type="submit" className="px-4 py-2 bg-indigo-600 text-white rounded-md shadow" disabled={isSubmitting}>Upload</button>
              </div>
            </div>
          </form>
        ) : (
          <div className="space-y-3">
            <p className="text-sm text-slate-400">CSV must include header row with columns: <strong>student_id,trainer_id,module_id,score</strong>. <strong>competency_id</strong> is optional; if missing the system will auto-create a competency. Optional: <strong>term</strong></p>
            <div className="mt-2 p-4 border-2 border-dashed border-slate-700 rounded-lg text-center">
              <input type="file" accept="text/csv" onChange={(e) => handleBulkFile(e.target.files?.[0])} className="mx-auto" />
              <p className="text-xs text-slate-500 mt-2">Drop a CSV file here or click to select</p>
            </div>
            <div className="flex justify-end">
              <button className="px-4 py-2 bg-slate-700 rounded-md" onClick={() => { /* noop */ }} disabled={isSubmitting}>Close when done</button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export default SubjectsPage;
