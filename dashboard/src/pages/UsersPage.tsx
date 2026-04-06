import { FormEvent, useEffect, useMemo, useState } from 'react';
import { Plus, X } from 'lucide-react';
import { apiRequest } from '../api/client';
import { useAuth } from '../auth/AuthContext';

type Role = {
  id: string;
  role_name: string;
};

type Institution = {
  id: string;
  name: string;
};

type UserItem = {
  id: string;
  name: string;
  email: string;
  phone: string | null;
  role_id: string;
  role_name: string | null;
  institution_id: string | null;
  created_at: string | null;
  disabled_at: string | null;
};

type UserFormState = {
  id?: string;
  name: string;
  email: string;
  phone: string;
  password: string;
  role_id: string;
  institution_id: string;
};

const emptyForm: UserFormState = {
  name: '',
  email: '',
  phone: '',
  password: '',
  role_id: '',
  institution_id: '',
};

const UsersPage = () => {
  const { token, user } = useAuth();
  const [users, setUsers] = useState<UserItem[]>([]);
  const [roles, setRoles] = useState<Role[]>([]);
  const [institutions, setInstitutions] = useState<Institution[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [formState, setFormState] = useState<UserFormState>(emptyForm);

  const loadData = async () => {
    setIsLoading(true);
    setError(null);
    try {
      const [usersData, rolesData, institutionsData] = await Promise.all([
        apiRequest<UserItem[]>('/users', { token }),
        apiRequest<Role[]>('/roles', { token }),
        apiRequest<Institution[]>('/institutions', { token }),
      ]);
      setUsers(usersData);
      setRoles(rolesData);
      setInstitutions(institutionsData);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to load users';
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

  const filteredUsers = useMemo(() => {
    const search = searchTerm.toLowerCase();
    return users.filter((item) => {
      return (
        item.name.toLowerCase().includes(search) ||
        item.email.toLowerCase().includes(search) ||
        (item.phone ?? '').toLowerCase().includes(search)
      );
    });
  }, [searchTerm, users]);

  const openCreateModal = () => {
    setFormState(emptyForm);
    setIsModalOpen(true);
  };

  const openEditModal = (item: UserItem) => {
    setFormState({
      id: item.id,
      name: item.name,
      email: item.email,
      phone: item.phone ?? '',
      password: '',
      role_id: item.role_id,
      institution_id: item.institution_id ?? '',
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

    try {
      const payload = {
        name: formState.name.trim(),
        email: formState.email.trim(),
        phone: formState.phone.trim() ? formState.phone.trim() : null,
        password: formState.password ? formState.password : undefined,
        role_id: formState.role_id,
        institution_id: formState.institution_id.trim() ? formState.institution_id.trim() : null,
      };

      if (formState.id) {
        await apiRequest(`/users/${formState.id}`, {
          method: 'PUT',
          token,
          body: payload,
        });
      } else {
        await apiRequest('/users', {
          method: 'POST',
          token,
          body: { ...payload, password: formState.password },
        });
      }

      closeModal();
      await loadData();
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to save user';
      setError(message);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDisable = async (item: UserItem) => {
    setIsSubmitting(true);
    setError(null);
    try {
      await apiRequest(`/users/${item.id}/disable`, { method: 'PUT', token });
      await loadData();
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to disable user';
      setError(message);
    } finally {
      setIsSubmitting(false);
    }
  };

  if (!user?.permissions?.['users.read'] && !user?.permissions?.['*']) {
    return (
      <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
        You do not have permission to view users.
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-gray-800">Users</h1>
          <p className="text-sm text-gray-500">Create, update, and disable accounts.</p>
        </div>
        {user?.permissions?.['users.create'] || user?.permissions?.['*'] ? (
          <button
            onClick={openCreateModal}
            className="flex items-center px-4 py-2.5 text-sm font-bold text-white bg-indigo-600 rounded-lg hover:bg-indigo-700 transition-colors"
          >
            <Plus className="w-4 h-4 mr-2 text-white" />
            Add User
          </button>
        ) : null}
      </div>

      <div className="bg-white rounded-2xl shadow-lg border border-gray-100 overflow-hidden">
        <div className="p-6 border-b border-gray-200">
          <input
            type="text"
            placeholder="Search by name, email, phone..."
            className="w-full max-w-md px-4 py-2.5 rounded-lg border border-gray-300 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition-all"
            value={searchTerm}
            onChange={(event) => setSearchTerm(event.target.value)}
          />
        </div>
        {isLoading ? (
          <div className="p-6 text-sm text-gray-600">Loading users...</div>
        ) : error ? (
          <div className="p-6 text-sm text-red-600">{error}</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr>
                  <th className="px-6 py-4 text-xs font-bold text-gray-600 uppercase tracking-wider">Name</th>
                  <th className="px-6 py-4 text-xs font-bold text-gray-600 uppercase tracking-wider">Email</th>
                  <th className="px-6 py-4 text-xs font-bold text-gray-600 uppercase tracking-wider">Role</th>
                  <th className="px-6 py-4 text-xs font-bold text-gray-600 uppercase tracking-wider">Institution</th>
                  <th className="px-6 py-4 text-xs font-bold text-gray-600 uppercase tracking-wider">Status</th>
                  <th className="px-6 py-4 text-xs font-bold text-gray-600 uppercase tracking-wider">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {filteredUsers.map((item) => (
                  <tr key={item.id} className="hover:bg-gray-50 transition-colors">
                    <td className="px-6 py-4 font-medium text-gray-900">{item.name}</td>
                    <td className="px-6 py-4 text-gray-600">{item.email}</td>
                    <td className="px-6 py-4 text-gray-600">{item.role_name ?? item.role_id}</td>
                    <td className="px-6 py-4 text-gray-600">
                      {institutions.find((inst) => inst.id === item.institution_id)?.name ?? '—'}
                    </td>
                    <td className="px-6 py-4 text-gray-600">
                      {item.disabled_at ? 'Disabled' : 'Active'}
                    </td>
                    <td className="px-6 py-4 text-gray-600">
                      <div className="flex items-center gap-3">
                        {user?.permissions?.['users.update'] || user?.permissions?.['*'] ? (
                          <button
                            className="text-indigo-600 hover:text-indigo-700 text-sm font-medium"
                            onClick={() => openEditModal(item)}
                          >
                            Edit
                          </button>
                        ) : null}
                        {user?.permissions?.['users.update'] || user?.permissions?.['*'] ? (
                          <button
                            className="text-amber-600 hover:text-amber-700 text-sm font-medium disabled:opacity-50"
                            onClick={() => handleDisable(item)}
                            disabled={isSubmitting || Boolean(item.disabled_at)}
                          >
                            Disable
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
                {formState.id ? 'Update User' : 'Create User'}
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
                  <label className="block text-sm font-medium text-gray-700">Email</label>
                  <input
                    type="email"
                    required
                    value={formState.email}
                    onChange={(event) => setFormState({ ...formState, email: event.target.value })}
                    className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 shadow-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700">Phone</label>
                  <input
                    type="text"
                    value={formState.phone}
                    onChange={(event) => setFormState({ ...formState, phone: event.target.value })}
                    className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 shadow-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700">Password</label>
                  <input
                    type="password"
                    required={!formState.id}
                    value={formState.password}
                    onChange={(event) => setFormState({ ...formState, password: event.target.value })}
                    className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 shadow-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                  />
                  {formState.id ? (
                    <p className="mt-1 text-xs text-gray-500">Leave blank to keep current password.</p>
                  ) : null}
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700">Role</label>
                  <select
                    required
                    value={formState.role_id}
                    onChange={(event) => setFormState({ ...formState, role_id: event.target.value })}
                    className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 shadow-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                  >
                    <option value="">Select role</option>
                    {roles.map((role) => (
                      <option key={role.id} value={role.id}>
                        {role.role_name}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700">Institution</label>
                  <select
                    value={formState.institution_id}
                    onChange={(event) => setFormState({ ...formState, institution_id: event.target.value })}
                    className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 shadow-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                  >
                    <option value="">No institution</option>
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
                  {isSubmitting ? 'Saving...' : 'Save user'}
                </button>
              </div>
            </form>
          </div>
        </div>
      ) : null}
    </div>
  );
};

export default UsersPage;
