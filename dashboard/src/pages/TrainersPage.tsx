import { FormEvent, useEffect, useMemo, useState } from 'react';
import { Plus, X } from 'lucide-react';
import { apiRequest } from '../api/client';
import { useAuth } from '../auth/AuthContext';
import { useTableControls } from '../hooks/useTableControls';
import { TableFooter, SortableTh } from '../components/ui/TableControls';
import BulkPeopleUploadPanel from '../components/admin/BulkPeopleUploadPanel';

type Department = {
  id: string;
  name: string;
};

type UserOption = {
  id: string;
  name: string;
  email: string;
};

type Trainer = {
  id: string;
  code?: string;
  user_id: string;
  department_id: string;
  specialization: string | null;
  user: {
    id: string;
    name: string;
    email: string;
  };
  created_at: string | null;
};

type TrainerForm = {
  id?: string;
  user_id: string;
  department_id: string;
  specialization: string;
};

const emptyForm: TrainerForm = {
  user_id: '',
  department_id: '',
  specialization: '',
};

type CourseOption = { id: string; name: string };
type ModuleOption = { id: string; name: string; course_id: string };
type SubjectOption = { id: string; name: string; module_id: string };
type AssignSubjectsModalProps = {
  isOpen: boolean;
  onClose: () => void;
  trainer: Trainer | null;
  token: string | null;
};

const AssignSubjectsModal = ({ isOpen, onClose, trainer, token }: AssignSubjectsModalProps) => {
  const [courses, setCourses] = useState<CourseOption[]>([]);
  const [modules, setModules] = useState<ModuleOption[]>([]);
  const [subjects, setSubjects] = useState<SubjectOption[]>([]);
  const [selectedCourseId, setSelectedCourseId] = useState('');
  const [selectedModuleId, setSelectedModuleId] = useState('');
  const [selectedSubjectIds, setSelectedSubjectIds] = useState<string[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [message, setMessage] = useState('');

  useEffect(() => {
    if (!isOpen) return;
    apiRequest<CourseOption[]>('/courses', { token })
      .then(setCourses)
      .catch(() => setCourses([]));
    apiRequest<ModuleOption[]>('/modules', { token })
      .then(setModules)
      .catch(() => setModules([]));
    apiRequest<SubjectOption[]>('/subjects', { token })
      .then(setSubjects)
      .catch(() => setSubjects([]));
    setSelectedCourseId('');
    setSelectedModuleId('');
    setSelectedSubjectIds([]);
  }, [isOpen, token]);

  const filteredModules = selectedCourseId
    ? modules.filter((m) => m.course_id === selectedCourseId)
    : [];

  const filteredSubjects = selectedModuleId
    ? subjects.filter((s) => s.module_id === selectedModuleId)
    : [];

  const handleAssign = async () => {
    if (!trainer?.id || selectedSubjectIds.length === 0) return;
    setIsSubmitting(true);
    setMessage('');
    try {
      await apiRequest(`/trainer-subjects/assign-multiple`, {
        method: 'POST',
        token,
        body: {
          trainer_id: trainer.id,
          subject_ids: selectedSubjectIds,
        },
      });
      setMessage('Subjects assigned successfully!');
      setTimeout(onClose, 1000);
    } catch (err) {
      setMessage(err instanceof Error ? err.message : 'Failed to assign subjects');
    } finally {
      setIsSubmitting(false);
    }
  };

  if (!isOpen) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="w-full max-w-lg rounded-2xl bg-slate-900 border border-slate-800 p-8 shadow-xl">
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-2xl font-bold text-slate-200">Assign Subjects to {trainer?.user?.name}</h2>
          <button onClick={onClose} className="p-2 rounded-full hover:bg-slate-800">
            <X className="text-slate-400" />
          </button>
        </div>
        <div className="mb-4">
          <label className="block mb-1 font-medium">Course</label>
          <select
            className="w-full border rounded p-2 mb-2"
            value={selectedCourseId}
            onChange={e => {
              setSelectedCourseId(e.target.value);
              setSelectedModuleId('');
              setSelectedSubjectIds([]);
            }}
          >
            <option value="">Select Course</option>
            {courses.map(course => (
              <option key={course.id} value={course.id}>{course.name}</option>
            ))}
          </select>
          <label className="block mb-1 font-medium">Module</label>
          <select
            className="w-full border rounded p-2 mb-2"
            value={selectedModuleId}
            onChange={e => {
              setSelectedModuleId(e.target.value);
              setSelectedSubjectIds([]);
            }}
            disabled={!selectedCourseId}
          >
            <option value="">Select Module</option>
            {filteredModules.map(module => (
              <option key={module.id} value={module.id}>{module.name}</option>
            ))}
          </select>
          <label className="block mb-1 font-medium">Subjects</label>
          <select
            className="w-full border rounded p-2"
            multiple
            value={selectedSubjectIds}
            onChange={e => {
              const options = Array.from(e.target.selectedOptions).map(opt => opt.value);
              setSelectedSubjectIds(options);
            }}
            disabled={!selectedModuleId}
          >
            {filteredSubjects.map(sub => (
              <option key={sub.id} value={sub.id}>{sub.name}</option>
            ))}
          </select>
        </div>
        <button
          className="bg-blue-600 text-white px-4 py-2 rounded disabled:opacity-50"
          onClick={handleAssign}
          disabled={isSubmitting || !trainer?.id || selectedSubjectIds.length === 0}
        >
          {isSubmitting ? 'Assigning...' : 'Assign Subjects'}
        </button>
        {message && <div className="mt-4 text-green-400">{message}</div>}
      </div>
    </div>
  );
};

const TrainersPage = () => {
    const [assignModalOpen, setAssignModalOpen] = useState(false);
    const [selectedTrainer, setSelectedTrainer] = useState<Trainer | null>(null);
  const { token, user } = useAuth();
  const [trainers, setTrainers] = useState<Trainer[]>([]);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [users, setUsers] = useState<UserOption[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [formState, setFormState] = useState<TrainerForm>(emptyForm);

  const canReadTrainers = Boolean(user?.permissions?.['trainers.read'] || user?.permissions?.['*']);
  const canCreateTrainers = Boolean(user?.permissions?.['trainers.create'] || user?.permissions?.['*']);
  const canCreateUsers = Boolean(user?.permissions?.['users.create'] || user?.permissions?.['*']);
  const canUpdateTrainers = Boolean(user?.permissions?.['trainers.update'] || user?.permissions?.['*']);
  const canDeleteTrainers = Boolean(user?.permissions?.['trainers.delete'] || user?.permissions?.['*']);
  const canReadUsers = Boolean(user?.permissions?.['users.read'] || user?.permissions?.['*']);
  const canImportData = Boolean(user?.permissions?.['data.import'] || user?.permissions?.['*']);

  const loadData = async () => {
    setIsLoading(true);
    setError(null);
    try {
      const [trainerData, departmentData, userData] = await Promise.all([
        apiRequest<Trainer[]>('/trainers', { token }),
        apiRequest<Department[]>('/departments', { token }),
        canReadUsers ? apiRequest<UserOption[]>('/users', { token }) : Promise.resolve([]),
      ]);
      setTrainers(trainerData);
      setDepartments(departmentData);
      setUsers(userData);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to load trainers';
      setError(message);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    if (token && canReadTrainers) {
      loadData();
    }
  }, [token, canReadTrainers, canReadUsers]);

  const filtered = useMemo(() => {
    const search = searchTerm.toLowerCase();
    return trainers.filter((item) => {
      const departmentName = departments.find((dept) => dept.id === item.department_id)?.name ?? '';
      return (
        item.user.name.toLowerCase().includes(search) ||
        item.user.email.toLowerCase().includes(search) ||
        departmentName.toLowerCase().includes(search)
      );
    });
  }, [trainers, departments, searchTerm]);

  const tc = useTableControls(
    filtered,
    15,
    (item, key) => {
      if (key === 'name') return item.user.name;
      if (key === 'email') return item.user.email;
      if (key === 'department') return departments.find(d => d.id === item.department_id)?.name ?? '';
      return (item as any)[key];
    },
  );

  const openCreate = () => {
    setFormState(emptyForm);
    setIsModalOpen(true);
  };

  const openEdit = (item: Trainer) => {
    setFormState({
      id: item.id,
      user_id: item.user_id,
      department_id: item.department_id,
      specialization: item.specialization ?? '',
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
      user_id: formState.user_id,
      department_id: formState.department_id,
      specialization: formState.specialization.trim() || null,
    };

    try {
      if (formState.id) {
        await apiRequest(`/trainers/${formState.id}`, {
          method: 'PUT',
          token,
          body: payload,
        });
      } else {
        await apiRequest('/trainers', {
          method: 'POST',
          token,
          body: payload,
        });
      }
      closeModal();
      await loadData();
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to save trainer';
      setError(message);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDelete = async (item: Trainer) => {
    setIsSubmitting(true);
    setError(null);
    try {
      await apiRequest(`/trainers/${item.id}`, { method: 'DELETE', token });
      await loadData();
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to delete trainer';
      setError(message);
    } finally {
      setIsSubmitting(false);
    }
  };

  if (!canReadTrainers) {
    return (
      <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-4 text-sm text-amber-300">
        You do not have permission to view trainers.
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-slate-200">Trainers</h1>
          <p className="text-sm text-slate-500">Manage trainer assignments and departments.</p>
        </div>
        {canCreateTrainers ? (
          <button
            onClick={openCreate}
            className="flex items-center px-4 py-2.5 text-sm font-bold text-white bg-indigo-600 rounded-lg hover:bg-indigo-700 transition-colors"
          >
            <Plus className="w-4 h-4 mr-2 text-white" />
            Add Trainer
          </button>
        ) : null}
      </div>

      {canImportData ? (
        <BulkPeopleUploadPanel
          personLabel="trainers"
          uploadPath="/trainers/bulk-upload"
          templatePath="/trainers/import-template"
          templateFilename="LAD-trainers-template.xlsx"
          requiredColumns="Name, Email, Department; Staff No and Subjects are optional"
          onComplete={loadData}
        />
      ) : null}

      <div className="bg-slate-900 border border-slate-800 rounded-2xl shadow-lg border border-slate-800 overflow-hidden">
        <div className="p-6 border-b border-slate-700">
          <input
            type="text"
            placeholder="Search by name, email, or department..."
            className="w-full max-w-md px-4 py-2.5 rounded-lg border border-slate-700 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition-all"
            value={searchTerm}
            onChange={(event) => setSearchTerm(event.target.value)}
          />
        </div>
        {isLoading ? (
          <div className="p-6 text-sm text-slate-400">Loading trainers...</div>
        ) : error ? (
          <div className="p-6 text-sm text-red-400">{error}</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left">
              <thead className="bg-slate-800 border-b border-slate-700">
                <tr>
                  <SortableTh label="ID" sortKey="code" sort={tc.sort} onSort={tc.setSort} />
                  <SortableTh label="Name" sortKey="name" sort={tc.sort} onSort={tc.setSort} />
                  <SortableTh label="Email" sortKey="email" sort={tc.sort} onSort={tc.setSort} />
                  <SortableTh label="Department" sortKey="department" sort={tc.sort} onSort={tc.setSort} />
                  <SortableTh label="Specialization" sortKey="specialization" sort={tc.sort} onSort={tc.setSort} />
                  <th className="px-6 py-4 text-xs font-bold text-slate-400 uppercase tracking-wider">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800">
                {tc.paged.map((item) => (
                  <tr key={item.id} className="hover:bg-slate-800 transition-colors">
                    <td className="px-6 py-4"><span className="font-mono text-xs bg-slate-700 text-indigo-300 px-2 py-0.5 rounded">{item.code ?? '—'}</span></td>
                    <td className="px-6 py-4 font-medium text-slate-100">{item.user.name}</td>
                    <td className="px-6 py-4 text-slate-400">{item.user.email}</td>
                    <td className="px-6 py-4 text-slate-400">
                      {departments.find((dept) => dept.id === item.department_id)?.name ?? '—'}
                    </td>
                    <td className="px-6 py-4 text-slate-400">{item.specialization ?? '—'}</td>
                    <td className="px-6 py-4 text-slate-400">
                      <div className="flex items-center gap-3">
                        {canUpdateTrainers ? (
                          <>
                            <button
                              className="text-indigo-400 hover:text-indigo-300 text-sm font-medium"
                              onClick={() => openEdit(item)}
                            >
                              Edit
                            </button>
                            <button
                              className="ml-2 text-blue-400 hover:text-blue-300 text-sm font-medium"
                              onClick={() => { setSelectedTrainer(item); setAssignModalOpen(true); }}
                            >
                              Assign Subjects
                            </button>
                          </>
                        ) : null}
                        {canDeleteTrainers ? (
                          <button
                            className="text-red-400 hover:text-red-300 text-sm font-medium disabled:opacity-50"
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
        <TableFooter page={tc.page} totalPages={tc.totalPages} total={tc.total} pageSize={tc.pageSize} onPage={tc.setPage} />
      </div>

      {isModalOpen ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-xl rounded-2xl bg-slate-900 border border-slate-800 p-8 shadow-xl">
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-2xl font-bold text-slate-200">
                {formState.id ? 'Update Trainer' : 'Create Trainer'}
              </h2>
              <button onClick={closeModal} className="p-2 rounded-full hover:bg-slate-800">
                <X className="text-slate-400" />
              </button>
            </div>
            <form className="space-y-4" onSubmit={handleSubmit}>
              <div className="grid gap-4 md:grid-cols-2">
                <div>
                  <label className="block text-sm font-medium text-slate-300">User</label>
                  {canReadUsers ? (
                    <select
                      required
                      value={formState.user_id}
                      onChange={(event) => setFormState({ ...formState, user_id: event.target.value })}
                      className="mt-1 block w-full rounded-md border border-slate-700 px-3 py-2 shadow-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                    >
                      <option value="">Select user</option>
                      {users.map((item) => (
                        <option key={item.id} value={item.id}>
                          {item.name} ({item.email})
                        </option>
                      ))}
                    </select>
                  ) : (
                    <p className="mt-2 text-xs text-amber-600">
                      You do not have permission to select users.
                    </p>
                  )}
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-300">Department</label>
                  <select
                    required
                    value={formState.department_id}
                    onChange={(event) => setFormState({ ...formState, department_id: event.target.value })}
                    className="mt-1 block w-full rounded-md border border-slate-700 px-3 py-2 shadow-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                  >
                    <option value="">Select department</option>
                    {departments.map((dept) => (
                      <option key={dept.id} value={dept.id}>
                        {dept.name}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="md:col-span-2">
                  <label className="block text-sm font-medium text-slate-300">Specialization</label>
                  <input
                    type="text"
                    value={formState.specialization}
                    onChange={(event) => setFormState({ ...formState, specialization: event.target.value })}
                    className="mt-1 block w-full rounded-md border border-slate-700 px-3 py-2 shadow-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                  />
                </div>
              </div>
              {error ? <p className="text-sm text-red-400">{error}</p> : null}
              <div className="flex justify-end gap-3 pt-4">
                <button
                  type="button"
                  onClick={closeModal}
                  className="px-4 py-2 text-sm font-medium text-slate-300 bg-slate-800 rounded-md hover:bg-slate-700"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="px-4 py-2 text-sm font-medium text-white bg-indigo-600 rounded-md hover:bg-indigo-700 disabled:opacity-70"
                >
                  {isSubmitting ? 'Saving...' : 'Save trainer'}
                </button>
              </div>
            </form>
          </div>
        </div>
      ) : null}
      {assignModalOpen && (
        <AssignSubjectsModal
          isOpen={assignModalOpen}
          onClose={() => setAssignModalOpen(false)}
          trainer={selectedTrainer}
          token={token}
        />
      )}
    </div>
  );
};

export default TrainersPage;
