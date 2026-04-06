import { FormEvent, useEffect, useMemo, useState } from 'react';
import { Plus, X } from 'lucide-react';
import { apiRequest } from '../api/client';
import { useAuth } from '../auth/AuthContext';

type Institution = {
  id: string;
  name: string;
};

type Department = {
  id: string;
  name: string;
  institution_id: string;
  created_at: string | null;
};

type DepartmentForm = {
  id?: string;
  name: string;
  institution_id: string;
};

const emptyForm: DepartmentForm = {
  name: '',
  institution_id: '',
};

const DepartmentsPage = () => {
  const { token, user } = useAuth();
  const [departments, setDepartments] = useState<Department[]>([]);
  const [institutions, setInstitutions] = useState<Institution[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [formState, setFormState] = useState<DepartmentForm>(emptyForm);

  const loadData = async () => {
    setIsLoading(true);
    setError(null);
    try {
      const [departmentData, institutionData] = await Promise.all([
        apiRequest<Department[]>('/departments', { token }),
        apiRequest<Institution[]>('/institutions', { token }),
      ]);
      setDepartments(departmentData);
      setInstitutions(institutionData);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to load departments';
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
    return departments.filter((item) => {
      return (
        item.name.toLowerCase().includes(search) ||
        institutions.find((inst) => inst.id === item.institution_id)?.name.toLowerCase().includes(search)
      );
    });
  }, [departments, institutions, searchTerm]);

  const openCreate = () => {
    setFormState(emptyForm);
    setIsModalOpen(true);
  };

  const openEdit = (item: Department) => {
    setFormState({ id: item.id, name: item.name, institution_id: item.institution_id });
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
      institution_id: formState.institution_id,
    };

    try {
      if (formState.id) {
        await apiRequest(`/departments/${formState.id}`, {
          method: 'PUT',
          token,
          body: payload,
        });
      } else {
        await apiRequest('/departments', {
          method: 'POST',
          token,
          body: payload,
        });
      }
      closeModal();
      await loadData();
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to save department';
      setError(message);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDelete = async (item: Department) => {
    setIsSubmitting(true);
    setError(null);
    try {
      await apiRequest(`/departments/${item.id}`, { method: 'DELETE', token });
      await loadData();
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to delete department';
      setError(message);
    } finally {
      setIsSubmitting(false);
    }
  };

  if (!user?.permissions?.['departments.read'] && !user?.permissions?.['*']) {
    return (
      <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
        You do not have permission to view departments.
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-gray-800">Departments</h1>
          <p className="text-sm text-gray-500">Organize departments under institutions.</p>
        </div>
        {user?.permissions?.['departments.create'] || user?.permissions?.['*'] ? (
          <button
            onClick={openCreate}
            className="flex items-center px-4 py-2.5 text-sm font-bold text-white bg-indigo-600 rounded-lg hover:bg-indigo-700 transition-colors"
          >
            <Plus className="w-4 h-4 mr-2 text-white" />
            Add Department
          </button>
        ) : null}
      </div>

      <div className="bg-white rounded-2xl shadow-lg border border-gray-100 overflow-hidden">
        <div className="p-6 border-b border-gray-200">
          <input
            type="text"
            placeholder="Search by name or institution..."
            className="w-full max-w-md px-4 py-2.5 rounded-lg border border-gray-300 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition-all"
            value={searchTerm}
            onChange={(event) => setSearchTerm(event.target.value)}
          />
        </div>
        {isLoading ? (
          <div className="p-6 text-sm text-gray-600">Loading departments...</div>
        ) : error ? (
          <div className="p-6 text-sm text-red-600">{error}</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr>
                  <th className="px-6 py-4 text-xs font-bold text-gray-600 uppercase tracking-wider">Name</th>
                  <th className="px-6 py-4 text-xs font-bold text-gray-600 uppercase tracking-wider">Institution</th>
                  <th className="px-6 py-4 text-xs font-bold text-gray-600 uppercase tracking-wider">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {filtered.map((item) => (
                  <tr key={item.id} className="hover:bg-gray-50 transition-colors">
                    <td className="px-6 py-4 font-medium text-gray-900">{item.name}</td>
                    <td className="px-6 py-4 text-gray-600">
                      {institutions.find((inst) => inst.id === item.institution_id)?.name ?? '—'}
                    </td>
                    <td className="px-6 py-4 text-gray-600">
                      <div className="flex items-center gap-3">
                        {user?.permissions?.['departments.update'] || user?.permissions?.['*'] ? (
                          <button
                            className="text-indigo-600 hover:text-indigo-700 text-sm font-medium"
                            onClick={() => openEdit(item)}
                          >
                            Edit
                          </button>
                        ) : null}
                        {user?.permissions?.['departments.delete'] || user?.permissions?.['*'] ? (
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
                {formState.id ? 'Update Department' : 'Create Department'}
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
                  <label className="block text-sm font-medium text-gray-700">Institution</label>
                  <select
                    required
                    value={formState.institution_id}
                    onChange={(event) => setFormState({ ...formState, institution_id: event.target.value })}
                    className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 shadow-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                  >
                    <option value="">Select institution</option>
                    {institutions.map((institution) => (
                      <option key={institution.id} value={institution.id}>
                        {institution.name}
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
                  {isSubmitting ? 'Saving...' : 'Save department'}
                </button>
              </div>
            </form>
          </div>
        </div>
      ) : null}
    </div>
  );
};

export default DepartmentsPage;
