// Predefined roles with ideal permissions
export const PREDEFINED_ROLES: Array<{
  role_name: string;
  category: string;
  permissions: Record<string, boolean>;
}> = [
  {
    role_name: 'Admin',
    category: 'System',
    permissions: { '*': true },
  },
  {
    role_name: 'Student',
    category: 'Academic',
    permissions: {
      'students.read': true,
      'students.update': false,
      'students_view_own_subjects': true,
      'student_subjects.read': true,
      'student_subjects.create': false,
      'student_subjects.update': false,
      'student_subjects.delete': false,
      // Add more as needed
    },
  },
  {
    role_name: 'Trainer',
    category: 'Academic',
    permissions: {
      'trainers.read': true,
      'trainers.update': true,
      'students.read': true,
      'subjects.read': true,
      // Add more as needed
    },
  },
  {
    role_name: 'Manager',
    category: 'Management',
    permissions: {
      'departments.read': true,
      'departments.update': true,
      'courses.read': true,
      'courses.update': true,
      'students.read': true,
      'subjects.read': true,
      // Add more as needed
    },
  },
];
import { FormEvent, useEffect, useMemo, useState } from 'react';
import { Plus, X } from 'lucide-react';
import { apiRequest } from '../api/client';
import { useAuth } from '../auth/AuthContext';
import { useTableControls } from '../hooks/useTableControls';
import { TableFooter, SortableTh } from '../components/ui/TableControls';

type Role = {
  id: string;
  role_name: string;
  permissions: Record<string, boolean>;
};

type RoleForm = {
  id?: string;
  role_name: string;
  permissions: string;
};

type PermissionDefinition = {
  key: string;
  label: string;
};

const ENTITY_LABELS: Record<string, string> = {
  users: 'Users',
  roles: 'Roles',
  institutions: 'Institutions',
  departments: 'Departments',
  courses: 'Courses',
  students: 'Students',
  trainers: 'Trainers',
  notifications: 'Notifications',
  student_subjects: 'Student Subjects',
  students_view_own_subjects: 'View Own Subjects', // Custom right for students to see only their allocated subjects
};

const CRUD_LABELS: Record<string, string> = {
  create: 'Create',
  read: 'Read',
  update: 'Update',
  delete: 'Delete',
};

const PERMISSIONS: PermissionDefinition[] = Object.entries(ENTITY_LABELS).flatMap(([entity, label]) => {
  return Object.entries(CRUD_LABELS).map(([action, actionLabel]) => ({
    key: `${entity}.${action}`,
    label: `${actionLabel} ${label}`,
  }));
});

const emptyForm: RoleForm = {
  role_name: '',
  permissions: '',
};

const RolesPage = () => {
  const { token, user } = useAuth();
  const [roles, setRoles] = useState<Role[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [formState, setFormState] = useState<RoleForm>(emptyForm);
  const [permissionMap, setPermissionMap] = useState<Record<string, boolean>>({});

  const loadData = async () => {
    setIsLoading(true);
    setError(null);
    try {
      const data = await apiRequest<Role[]>('/roles', { token });
      setRoles(data);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to load roles';
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
    return roles.filter((item) => item.role_name.toLowerCase().includes(search));
  }, [roles, searchTerm]);

  const tc = useTableControls(filtered);

  const openCreate = () => {
    setFormState(emptyForm);
    setPermissionMap({});
    setIsModalOpen(true);
  };

  const openEdit = (item: Role) => {
    const map = item.permissions ?? {};
    setFormState({
      id: item.id,
      role_name: item.role_name,
      permissions: JSON.stringify(map, null, 2),
    });
    setPermissionMap(map);
    setIsModalOpen(true);
  };

  const closeModal = () => {
    setIsModalOpen(false);
    setFormState(emptyForm);
    setPermissionMap({});
  };

  const handlePermissionToggle = (key: string) => {
    const next = { ...permissionMap, [key]: !permissionMap[key] };
    setPermissionMap(next);
    setFormState({ ...formState, permissions: JSON.stringify(next, null, 2) });
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setIsSubmitting(true);
    setError(null);

    let permissions: Record<string, boolean> = {};
    if (formState.permissions.trim()) {
      try {
        const parsed = JSON.parse(formState.permissions);
        if (typeof parsed !== 'object' || Array.isArray(parsed) || parsed === null) {
          throw new Error('Permissions must be a JSON object.');
        }
        permissions = parsed as Record<string, boolean>;
        setPermissionMap(permissions);
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Invalid permissions JSON';
        setError(message);
        setIsSubmitting(false);
        return;
      }
    }

    const payload = {
      role_name: formState.role_name.trim(),
      permissions,
    };

    try {
      if (formState.id) {
        await apiRequest(`/roles/${formState.id}`, {
          method: 'PUT',
          token,
          body: payload,
        });
      } else {
        await apiRequest('/roles', {
          method: 'POST',
          token,
          body: payload,
        });
      }
      closeModal();
      await loadData();
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to save role';
      setError(message);
    } finally {
      setIsSubmitting(false);
    }
  };

  if (!user?.permissions?.['roles.read'] && !user?.permissions?.['*']) {
    return (
      <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
        You do not have permission to view roles.
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-slate-200">Roles</h1>
          <p className="text-sm text-slate-500">Create roles and permissions.</p>
        </div>
        {user?.permissions?.['roles.create'] || user?.permissions?.['*'] ? (
          <button
            onClick={openCreate}
            className="flex items-center px-4 py-2.5 text-sm font-bold text-white bg-indigo-600 rounded-lg hover:bg-indigo-700 transition-colors"
          >
            <Plus className="w-4 h-4 mr-2 text-white" />
            Add Role
          </button>
        ) : null}
      </div>

      <div className="bg-slate-900 border border-slate-800 rounded-2xl shadow-lg border border-slate-800 overflow-hidden">
        <div className="p-6 border-b border-slate-700">
          <input
            type="text"
            placeholder="Search by role name..."
            className="w-full max-w-md px-4 py-2.5 rounded-lg border border-slate-700 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition-all"
            value={searchTerm}
            onChange={(event) => setSearchTerm(event.target.value)}
          />
        </div>
        {isLoading ? (
          <div className="p-6 text-sm text-slate-400">Loading roles...</div>
        ) : error ? (
          <div className="p-6 text-sm text-red-600">{error}</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left">
              <thead className="bg-slate-800 border-b border-slate-700">
                <tr>
                  <SortableTh label="Role" sortKey="role_name" sort={tc.sort} onSort={tc.setSort} />
                  <th className="px-6 py-4 text-xs font-bold text-slate-400 uppercase tracking-wider">Permissions</th>
                  <th className="px-6 py-4 text-xs font-bold text-slate-400 uppercase tracking-wider">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800">
                {tc.paged.map((item) => (
                  <tr key={item.id} className="hover:bg-slate-800 transition-colors">
                    <td className="px-6 py-4 font-medium text-slate-100">{item.role_name}</td>
                    <td className="px-6 py-4 text-slate-400">
                      {Object.keys(item.permissions ?? {}).length ? (
                        <span className="text-xs text-slate-500">Custom permissions</span>
                      ) : (
                        <span className="text-xs text-slate-500">No permissions</span>
                      )}
                    </td>
                    <td className="px-6 py-4 text-slate-400">
                      {user?.permissions?.['roles.update'] || user?.permissions?.['*'] ? (
                        <button
                          className="text-indigo-600 hover:text-indigo-700 text-sm font-medium"
                          onClick={() => openEdit(item)}
                        >
                          Edit
                        </button>
                      ) : null}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <TableFooter page={tc.page} totalPages={tc.totalPages} total={tc.total} pageSize={tc.pageSize} onPage={tc.setPage} />
      </div>

      {isModalOpen ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-2 sm:p-4 overflow-y-auto">
          <div className="w-full max-w-2xl rounded-2xl bg-slate-900 border border-slate-800 p-4 sm:p-8 shadow-xl mx-auto flex flex-col">
            <div className="flex items-center justify-between mb-4 sm:mb-6">
              <h2 className="text-xl sm:text-2xl font-bold text-slate-200">
                {formState.id ? 'Update Role' : 'Create Role'}
              </h2>
              <button onClick={closeModal} className="p-2 rounded-full hover:bg-slate-800">
                <X className="text-slate-400" />
              </button>
            </div>
            <form className="space-y-3 sm:space-y-4" onSubmit={handleSubmit}>
              <div>
                <label className="block text-sm font-medium text-slate-300">Role name</label>
                <input
                  type="text"
                  required
                  value={formState.role_name}
                  onChange={(event) => setFormState({ ...formState, role_name: event.target.value })}
                  className="mt-1 block w-full rounded-md border border-slate-700 px-3 py-2 shadow-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent text-sm"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-300">Permissions (JSON)</label>
                <textarea
                  rows={4}
                  value={formState.permissions}
                  onChange={(event) => setFormState({ ...formState, permissions: event.target.value })}
                  className="mt-1 block w-full rounded-md border border-slate-700 px-3 py-2 font-mono text-xs shadow-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent resize-none"
                  placeholder='{"students.read": true}'
                />
              </div>
              <div>
                <p className="text-sm font-medium text-slate-300">Quick permissions</p>
                <div className="mt-3 grid gap-2 grid-cols-1 sm:grid-cols-2 md:grid-cols-3">
                  {PERMISSIONS.map((permission) => (
                    <label key={permission.key} className="flex items-center gap-2 text-sm text-slate-400">
                      <input
                        type="checkbox"
                        className="h-4 w-4 text-indigo-600 border-slate-700 rounded"
                        checked={Boolean(permissionMap[permission.key])}
                        onChange={() => handlePermissionToggle(permission.key)}
                      />
                      {permission.label}
                    </label>
                  ))}
                </div>
              </div>
              {error ? <p className="text-sm text-red-600">{error}</p> : null}
              <div className="flex flex-col sm:flex-row justify-end gap-2 sm:gap-3 pt-4">
                <button
                  type="button"
                  onClick={closeModal}
                  className="px-4 py-2 text-sm font-medium text-slate-300 bg-slate-800 rounded-md hover:bg-slate-700 w-full sm:w-auto"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="px-4 py-2 text-sm font-medium text-white bg-indigo-600 rounded-md hover:bg-indigo-700 disabled:opacity-70 w-full sm:w-auto"
                >
                  {isSubmitting ? 'Saving...' : 'Save role'}
                </button>
              </div>
            </form>
          </div>
        </div>
      ) : null}
    </div>
  );
};

export default RolesPage;
