import { FormEvent, useEffect, useMemo, useState } from 'react';
import { Plus, X } from 'lucide-react';
import { apiRequest } from '../api/client';
import { useAuth } from '../auth/AuthContext';

type Department = {
  id: string;
  name: string;
};

type Course = {
  id: string;
  name: string;
  cbet_level: string;
  department_id: string;
  created_at: string | null;
};

type CourseForm = {
  id?: string;
  name: string;
  cbet_level: string;
  department_id: string;
};

const emptyForm: CourseForm = {
  name: '',
  cbet_level: '',
  department_id: '',
};

const CoursesPage = () => {
  const { token, user } = useAuth();
  const [courses, setCourses] = useState<Course[]>([]);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [formState, setFormState] = useState<CourseForm>(emptyForm);

  const loadData = async () => {
    setIsLoading(true);
    setError(null);
    try {
      const [courseData, departmentData] = await Promise.all([
        apiRequest<Course[]>('/courses', { token }),
        apiRequest<Department[]>('/departments', { token }),
      ]);
      setCourses(courseData);
      setDepartments(departmentData);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to load courses';
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
    return courses.filter((item) => {
      return (
        item.name.toLowerCase().includes(search) ||
        item.cbet_level.toLowerCase().includes(search) ||
        departments.find((dept) => dept.id === item.department_id)?.name.toLowerCase().includes(search)
      );
    });
  }, [courses, departments, searchTerm]);

  const openCreate = () => {
    setFormState(emptyForm);
    setIsModalOpen(true);
  };

  const openEdit = (item: Course) => {
    setFormState({
      id: item.id,
      name: item.name,
      cbet_level: item.cbet_level,
      department_id: item.department_id,
    });
    setIsModalOpen(true);
  };

  const closeModal = () => {
    setIsModalOpen(false);
    setFormState(emptyForm);
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setIsSubmitting(true);
    setError(null);

    const payload = {
      name: formState.name.trim(),
      cbet_level: formState.cbet_level.trim(),
      department_id: formState.department_id,
    };

    try {
      if (formState.id) {
        await apiRequest(`/courses/${formState.id}`, {
          method: 'PUT',
          token,
          body: payload,
        });
      } else {
        await apiRequest('/courses', {
          method: 'POST',
          token,
          body: payload,
        });
      }
      closeModal();
      await loadData();
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to save course';
      setError(message);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDelete = async (item: Course) => {
    setIsSubmitting(true);
    setError(null);
    try {
      await apiRequest(`/courses/${item.id}`, { method: 'DELETE', token });
      await loadData();
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to delete course';
      setError(message);
    } finally {
      setIsSubmitting(false);
    }
  };

  if (!user?.permissions?.['courses.read'] && !user?.permissions?.['*']) {
    return (
      <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
        You do not have permission to view courses.
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-gray-800">Courses</h1>
          <p className="text-sm text-gray-500">Define courses and CBET levels.</p>
        </div>
        {user?.permissions?.['courses.create'] || user?.permissions?.['*'] ? (
          <button
            onClick={openCreate}
            className="flex items-center px-4 py-2.5 text-sm font-bold text-white bg-indigo-600 rounded-lg hover:bg-indigo-700 transition-colors"
          >
            <Plus className="w-4 h-4 mr-2 text-white" />
            Add Course
          </button>
        ) : null}
      </div>

      <div className="bg-white rounded-2xl shadow-lg border border-gray-100 overflow-hidden">
        <div className="p-6 border-b border-gray-200">
          <input
            type="text"
            placeholder="Search by name, CBET level, department..."
            className="w-full max-w-md px-4 py-2.5 rounded-lg border border-gray-300 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition-all"
            value={searchTerm}
            onChange={(event) => setSearchTerm(event.target.value)}
          />
        </div>
        {isLoading ? (
          <div className="p-6 text-sm text-gray-600">Loading courses...</div>
        ) : error ? (
          <div className="p-6 text-sm text-red-600">{error}</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr>
                  <th className="px-6 py-4 text-xs font-bold text-gray-600 uppercase tracking-wider">Name</th>
                  <th className="px-6 py-4 text-xs font-bold text-gray-600 uppercase tracking-wider">CBET Level</th>
                  <th className="px-6 py-4 text-xs font-bold text-gray-600 uppercase tracking-wider">Department</th>
                  <th className="px-6 py-4 text-xs font-bold text-gray-600 uppercase tracking-wider">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {filtered.map((item) => (
                  <tr key={item.id} className="hover:bg-gray-50 transition-colors">
                    <td className="px-6 py-4 font-medium text-gray-900">{item.name}</td>
                    <td className="px-6 py-4 text-gray-600">{item.cbet_level}</td>
                    <td className="px-6 py-4 text-gray-600">
                      {departments.find((dept) => dept.id === item.department_id)?.name ?? '—'}
                    </td>
                    <td className="px-6 py-4 text-gray-600">
                      <div className="flex items-center gap-3">
                        {user?.permissions?.['courses.update'] || user?.permissions?.['*'] ? (
                          <button
                            className="text-indigo-600 hover:text-indigo-700 text-sm font-medium"
                            onClick={() => openEdit(item)}
                          >
                            Edit
                          </button>
                        ) : null}
                        {user?.permissions?.['courses.delete'] || user?.permissions?.['*'] ? (
                          <button
                            className="text-red-600 hover:text-red-700 text-sm font-medium disabled:opacity-50"
                            onClick={() => handleDelete(item)}
                            disabled={isSubmitting}
                          >
                            Delete
                          </button>
                        ) : null}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {isModalOpen ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-xl rounded-2xl bg-white p-8 shadow-xl">
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-2xl font-bold text-gray-800">
                {formState.id ? 'Update Course' : 'Create Course'}
              </h2>
              <button onClick={closeModal} className="p-2 rounded-full hover:bg-gray-100">
                <X className="text-gray-600" />
              </button>
            </div>
            <form className="space-y-4" onSubmit={handleSubmit}>
              <div className="grid gap-4 md:grid-cols-2">
                <div>
                  <label className="block text-sm font-medium text-gray-700">Name</label>
                  <input
                    type="text"
                    required
                    value={formState.name}
                    onChange={(event) => setFormState({ ...formState, name: event.target.value })}
                    className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 shadow-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700">CBET Level</label>
                  <input
                    type="text"
                    required
                    value={formState.cbet_level}
                    onChange={(event) => setFormState({ ...formState, cbet_level: event.target.value })}
                    className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 shadow-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                  />
                </div>
                <div className="md:col-span-2">
                  <label className="block text-sm font-medium text-gray-700">Department</label>
                  <select
                    required
                    value={formState.department_id}
                    onChange={(event) => setFormState({ ...formState, department_id: event.target.value })}
                    className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 shadow-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                  >
                    <option value="">Select department</option>
                    {departments.map((dept) => (
                      <option key={dept.id} value={dept.id}>
                        {dept.name}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
              {error ? <p className="text-sm text-red-600">{error}</p> : null}
              <div className="flex justify-end gap-3 pt-4">
                <button
                  type="button"
                  onClick={closeModal}
                  className="px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 rounded-md hover:bg-gray-200"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="px-4 py-2 text-sm font-medium text-white bg-indigo-600 rounded-md hover:bg-indigo-700 disabled:opacity-70"
                >
                  {isSubmitting ? 'Saving...' : 'Save course'}
                </button>
              </div>
            </form>
          </div>
        </div>
      ) : null}
    </div>
  );
};

export default CoursesPage;
