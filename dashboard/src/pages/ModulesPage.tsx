import { useEffect, useMemo, useState, FormEvent } from 'react';
import { Plus, X } from 'lucide-react';
import { apiRequest } from '../api/client';
import { useAuth } from '../auth/AuthContext';
import type { Module, Course } from '../types/backend';
import { useTableControls } from '../hooks/useTableControls';
import { TableFooter, SortableTh } from '../components/ui/TableControls';

const emptyForm: Omit<Module, 'id'> = {
  name: '',
  course_id: '',
  description: '',
};

const ModulesPage = () => {
  const { token, user } = useAuth();
  const [modules, setModules] = useState<Module[]>([]);
  const [courses, setCourses] = useState<Course[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [formState, setFormState] = useState(emptyForm);
  const [editId, setEditId] = useState<string | null>(null);

  const loadData = async () => {
    setIsLoading(true);
    setError(null);
    try {
      const role = (user?.role_name || '').toLowerCase();
      const isTrainer = role === 'trainer' || (user?.permissions && user.permissions['trainer_subjects.read']);
      let moduleData: Module[] = [];
      let courseData: Course[] = [];

      if (isTrainer) {
        // Fetch trainer subjects and derive modules
        const t = await apiRequest<any>('/trainer-subjects/me', { token });
        const subs = t.subjects || [];
        const moduleMap: Record<string, Module> = {};
        for (const s of subs) {
          if (s.module && s.module.id) {
            moduleMap[s.module.id] = { id: s.module.id, name: s.module.name, course_id: s.module.course_id || '' } as Module;
          }
        }
        moduleData = Object.values(moduleMap);
        // Load courses for derived modules if permitted
        if (user?.permissions?.['courses.read'] || user?.permissions?.['*']) {
          courseData = await apiRequest<Course[]>('/courses', { token });
        } else {
          const courseIds = Array.from(new Set(moduleData.map(m => m.course_id))).filter(Boolean);
          if (courseIds.length > 0) {
            const coursePromises = courseIds.map(id => apiRequest<Course>(`/courses/${id}`, { token }).catch(() => null));
            courseData = (await Promise.all(coursePromises)).filter(Boolean) as Course[];
          }
        }
      } else {
        const [mData, cData] = await Promise.all([
          apiRequest<Module[]>('/modules', { token }),
          apiRequest<Course[]>('/courses', { token }),
        ]);
        moduleData = mData;
        courseData = cData;
      }

      setModules(moduleData);
      setCourses(courseData);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to load modules';
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

  const filtered = useMemo(() => {
    const search = searchTerm.toLowerCase();
    return modules.filter((item) => {
      return (
        item.name.toLowerCase().includes(search) ||
        (item.description?.toLowerCase().includes(search) ?? false) ||
        courses.find((course) => course.id === item.course_id)?.name.toLowerCase().includes(search)
      );
    });
  }, [modules, courses, searchTerm]);

  const tc = useTableControls(
    filtered,
    15,
    (item, key) => key === 'course' ? courses.find(c => c.id === item.course_id)?.name ?? '' : (item as any)[key],
  );

  const openCreate = () => {
    setFormState(emptyForm);
    setEditId(null);
    setIsModalOpen(true);
  };

  const openEdit = (item: Module) => {
    setFormState({
      name: item.name,
      course_id: item.course_id,
      description: item.description ?? '',
    });
    setEditId(item.id);
    setIsModalOpen(true);
  };

  const closeModal = () => {
    setIsModalOpen(false);
    setFormState(emptyForm);
    setEditId(null);
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setIsSubmitting(true);
    setError(null);
    const payload = {
      name: formState.name.trim(),
      course_id: formState.course_id,
      description: formState.description?.trim() || undefined,
    };
    try {
      if (editId) {
        await apiRequest(`/modules/${editId}`, {
          method: 'PUT',
          token,
          body: payload,
        });
      } else {
        await apiRequest('/modules', {
          method: 'POST',
          token,
          body: payload,
        });
      }
      closeModal();
      await loadData();
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to save module';
      setError(message);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDelete = async (item: Module) => {
    setIsSubmitting(true);
    setError(null);
    try {
      await apiRequest(`/modules/${item.id}`, { method: 'DELETE', token });
      await loadData();
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to delete module';
      setError(message);
    } finally {
      setIsSubmitting(false);
    }
  };

  if (!user?.permissions?.['modules.read'] && !user?.permissions?.['*']) {
    return (
      <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
        You do not have permission to view modules.
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-slate-200">Modules</h1>
          <p className="text-sm text-slate-500">Manage modules for each course.</p>
        </div>
        {user?.permissions?.['modules.create'] || user?.permissions?.['*'] ? (
          <button
            onClick={openCreate}
            className="flex items-center px-4 py-2.5 text-sm font-bold text-white bg-indigo-600 rounded-lg hover:bg-indigo-700 transition-colors"
          >
            <Plus className="w-4 h-4 mr-2 text-white" />
            Add Module
          </button>
        ) : null}
      </div>

      <div className="bg-slate-900 border border-slate-800 rounded-2xl shadow-lg border border-slate-800 overflow-hidden">
        <div className="p-6 border-b border-slate-700">
          <input
            type="text"
            placeholder="Search by name, description, course..."
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
                <SortableTh label="Description" sortKey="description" sort={tc.sort} onSort={tc.setSort} />
                <th className="px-6 py-3"></th>
              </tr>
            </thead>
            <tbody className="bg-slate-900 divide-y divide-slate-800">
              {isLoading ? (
                <tr>
                  <td colSpan={5} className="px-6 py-4 text-center text-slate-500">Loading...</td>
                </tr>
              ) : tc.paged.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-6 py-4 text-center text-slate-500">No modules found.</td>
                </tr>
              ) : (
                tc.paged.map((item) => (
                  <tr key={item.id}>
                    <td className="px-6 py-4"><span className="font-mono text-xs bg-slate-700 text-indigo-300 px-2 py-0.5 rounded">{item.code ?? '—'}</span></td>
                    <td className="px-6 py-4 whitespace-nowrap">{item.name}</td>
                    <td className="px-6 py-4 whitespace-nowrap">{courses.find((c) => c.id === item.course_id)?.name ?? '-'}</td>
                    <td className="px-6 py-4 whitespace-nowrap">{item.description ?? '-'}</td>
                    <td className="px-6 py-4 whitespace-nowrap text-right space-x-2">
                      {(user?.permissions?.['modules.update'] || user?.permissions?.['*']) && (
                        <button
                          className="inline-flex items-center px-3 py-1.5 text-xs font-medium text-indigo-600 hover:underline"
                          onClick={() => openEdit(item)}
                        >
                          Edit
                        </button>
                      )}
                      {(user?.permissions?.['modules.delete'] || user?.permissions?.['*']) && (
                        <button
                          className="inline-flex items-center px-3 py-1.5 text-xs font-medium text-red-600 hover:underline"
                          onClick={() => handleDelete(item)}
                          disabled={isSubmitting}
                        >
                          Delete
                        </button>
                      )}
                      <button
                        className="inline-flex items-center px-3 py-1.5 text-xs font-medium text-green-600 hover:underline"
                        onClick={async () => {
                          try {
                            await apiRequest(`/modules/${item.id}/sync-subjects`, { method: 'POST', token });
                            alert('Subjects synced to all students in this module.');
                          } catch (err) {
                            alert('Failed to sync subjects.');
                          }
                        }}
                      >
                        Sync Subjects to All Students
                      </button>
                    </td>
                  </tr>
                ))
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
            <h2 className="text-xl font-bold mb-4">{editId ? 'Edit Module' : 'Add Module'}</h2>
            {error && <div className="mb-4 text-red-600 text-sm">{error}</div>}
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-300 mb-1">Name</label>
                <input
                  type="text"
                  className="w-full px-4 py-2 rounded-lg border border-slate-700 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  value={formState.name}
                  onChange={(e) => setFormState((f) => ({ ...f, name: e.target.value }))}
                  required
                  disabled={isSubmitting}
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-300 mb-1">Course</label>
                <select
                  className="w-full px-4 py-2 rounded-lg border border-slate-700 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  value={formState.course_id}
                  onChange={(e) => setFormState((f) => ({ ...f, course_id: e.target.value }))}
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
                <label className="block text-sm font-medium text-slate-300 mb-1">Description</label>
                <textarea
                  className="w-full px-4 py-2 rounded-lg border border-slate-700 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  value={formState.description}
                  onChange={(e) => setFormState((f) => ({ ...f, description: e.target.value }))}
                  rows={3}
                  disabled={isSubmitting}
                />
              </div>
              <div className="flex justify-end">
                <button
                  type="submit"
                  className="px-6 py-2 rounded-lg bg-indigo-600 text-white font-bold hover:bg-indigo-700 transition-colors"
                  disabled={isSubmitting}
                >
                  {editId ? 'Update' : 'Create'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default ModulesPage;
