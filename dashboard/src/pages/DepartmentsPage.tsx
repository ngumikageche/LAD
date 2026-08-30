import { Fragment, FormEvent, useEffect, useMemo, useState } from 'react';
import { ChevronDown, ChevronRight, Plus, X } from 'lucide-react';
import { apiRequest } from '../api/client';
import { useAuth } from '../auth/AuthContext';
import { useTableControls } from '../hooks/useTableControls';
import { TableFooter, SortableTh } from '../components/ui/TableControls';

type Institution = {
  id: string;
  name: string;
};

type Department = {
  id: string;
  code?: string;
  name: string;
  institution_id: string;
  created_at: string | null;
};

/** A subject three levels below the department: department → course → module → subject. */
type DepartmentSubject = {
  id: string;
  code: string | null;
  name: string;
  module_id: string;
  module_name: string | null;
  course_id: string | null;
  course_name: string | null;
};

type DepartmentSubjectsResponse = {
  department: { id: string; code: string | null; name: string };
  subjects: DepartmentSubject[];
};

/** Per-department load state for the expandable subject list. */
type SubjectsState = {
  status: 'loading' | 'ready' | 'error';
  subjects: DepartmentSubject[];
  error?: string;
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
  const [institutionFilter, setInstitutionFilter] = useState('all');
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [subjectsByDepartment, setSubjectsByDepartment] = useState<Record<string, SubjectsState>>({});
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

  const institutionNameById = useMemo(
    () => new Map(institutions.map((institution) => [institution.id, institution.name])),
    [institutions],
  );

  const filtered = useMemo(() => {
    const search = searchTerm.toLowerCase();
    return departments.filter((item) => {
      if (institutionFilter !== 'all' && item.institution_id !== institutionFilter) return false;
      if (!search) return true;
      const institutionName = institutionNameById.get(item.institution_id)?.toLowerCase() ?? '';
      return item.name.toLowerCase().includes(search) || institutionName.includes(search);
    });
  }, [departments, institutionNameById, institutionFilter, searchTerm]);

  /**
   * Subjects are fetched per department, on first expand, and kept after
   * collapse — reopening a row a second time should not re-hit the API.
   */
  const toggleSubjects = async (department: Department) => {
    if (expandedId === department.id) {
      setExpandedId(null);
      return;
    }
    setExpandedId(department.id);
    if (subjectsByDepartment[department.id]?.status === 'ready') return;

    setSubjectsByDepartment((current) => ({
      ...current,
      [department.id]: { status: 'loading', subjects: [] },
    }));
    try {
      const result = await apiRequest<DepartmentSubjectsResponse>(
        `/departments/${department.id}/subjects`,
        { token },
      );
      setSubjectsByDepartment((current) => ({
        ...current,
        [department.id]: { status: 'ready', subjects: result.subjects },
      }));
    } catch (err) {
      setSubjectsByDepartment((current) => ({
        ...current,
        [department.id]: {
          status: 'error',
          subjects: [],
          error: err instanceof Error ? err.message : 'Failed to load subjects',
        },
      }));
    }
  };

  const tc = useTableControls(
    filtered,
    15,
    (item, key) => key === 'institution' ? institutionNameById.get(item.institution_id) ?? '' : (item as any)[key],
  );

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
          <h1 className="text-3xl font-bold text-slate-200">Departments</h1>
          <p className="text-sm text-slate-500">Organize departments under institutions.</p>
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

      <div className="bg-slate-900 border border-slate-800 rounded-2xl shadow-lg border border-slate-800 overflow-hidden">
        <div className="p-6 border-b border-slate-700 flex flex-wrap gap-4">
          <input
            type="text"
            placeholder="Search by name or institution..."
            className="flex-1 min-w-[240px] max-w-md px-4 py-2.5 rounded-lg border border-slate-700 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition-all"
            value={searchTerm}
            onChange={(event) => setSearchTerm(event.target.value)}
          />
          <select
            value={institutionFilter}
            onChange={(event) => {
              setInstitutionFilter(event.target.value);
              // A row expanded in one college should not stay open behind
              // another college's list.
              setExpandedId(null);
            }}
            title="Show departments for a single institution"
            className="px-4 py-2.5 rounded-lg border border-slate-700 bg-slate-800 text-slate-200 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
          >
            <option value="all">All institutions</option>
            {institutions.map((institution) => (
              <option key={institution.id} value={institution.id}>{institution.name}</option>
            ))}
          </select>
        </div>
        {isLoading ? (
          <div className="p-6 text-sm text-slate-400">Loading departments...</div>
        ) : error ? (
          <div className="p-6 text-sm text-red-600">{error}</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left">
              <thead className="bg-slate-800 border-b border-slate-700">
                <tr>
                  <th className="w-10 px-3 py-4"><span className="sr-only">Show subjects</span></th>
                  <SortableTh label="ID" sortKey="code" sort={tc.sort} onSort={tc.setSort} />
                  <SortableTh label="Name" sortKey="name" sort={tc.sort} onSort={tc.setSort} />
                  <SortableTh label="Institution" sortKey="institution" sort={tc.sort} onSort={tc.setSort} />
                  <th className="px-6 py-4 text-xs font-bold text-slate-400 uppercase tracking-wider">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800">
                {tc.paged.map((item) => {
                  const expanded = expandedId === item.id;
                  const subjectState = subjectsByDepartment[item.id];
                  return (
                  <Fragment key={item.id}>
                  <tr className="hover:bg-slate-800 transition-colors">
                    <td className="px-3 py-4">
                      <button
                        type="button"
                        onClick={() => toggleSubjects(item)}
                        aria-expanded={expanded}
                        title={expanded ? 'Hide subjects' : 'Show subjects in this department'}
                        className="rounded p-1 text-slate-400 hover:bg-slate-700 hover:text-slate-200"
                      >
                        {expanded ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
                      </button>
                    </td>
                    <td className="px-6 py-4"><span className="font-mono text-xs bg-slate-700 text-indigo-300 px-2 py-0.5 rounded">{item.code ?? '—'}</span></td>
                    <td className="px-6 py-4 font-medium text-slate-100">{item.name}</td>
                    <td className="px-6 py-4 text-slate-400">
                      {institutionNameById.get(item.institution_id) ?? '—'}
                    </td>
                    <td className="px-6 py-4 text-slate-400">
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
                  {expanded ? (
                    <tr className="bg-slate-950/60">
                      <td colSpan={5} className="px-6 py-4">
                        {!subjectState || subjectState.status === 'loading' ? (
                          <p className="text-sm text-slate-500">Loading subjects…</p>
                        ) : subjectState.status === 'error' ? (
                          <p className="text-sm text-red-400">{subjectState.error}</p>
                        ) : subjectState.subjects.length === 0 ? (
                          <p className="text-sm text-slate-500">
                            No subjects are linked to this department yet. Subjects reach a
                            department through their course, so a course left without a
                            department will not appear here.
                          </p>
                        ) : (
                          <div>
                            <p className="mb-3 text-xs font-bold uppercase tracking-[0.2em] text-slate-500">
                              {subjectState.subjects.length} subject{subjectState.subjects.length === 1 ? '' : 's'} in {item.name}
                            </p>
                            <div className="overflow-x-auto">
                              <table className="w-full text-left text-sm">
                                <thead className="text-xs uppercase tracking-wider text-slate-500">
                                  <tr>
                                    <th className="px-3 py-2">Code</th>
                                    <th className="px-3 py-2">Subject</th>
                                    <th className="px-3 py-2">Module Name</th>
                                    <th className="px-3 py-2">Course</th>
                                  </tr>
                                </thead>
                                <tbody className="divide-y divide-slate-800">
                                  {subjectState.subjects.map((subject) => (
                                    <tr key={subject.id}>
                                      <td className="px-3 py-2">
                                        <span className="font-mono text-xs bg-slate-800 text-indigo-300 px-2 py-0.5 rounded">
                                          {subject.code ?? '—'}
                                        </span>
                                      </td>
                                      <td className="px-3 py-2 font-medium text-slate-200">{subject.name}</td>
                                      <td className="px-3 py-2 text-slate-400">{subject.module_name ?? '—'}</td>
                                      <td className="px-3 py-2 text-slate-400">{subject.course_name ?? '—'}</td>
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                            </div>
                          </div>
                        )}
                      </td>
                    </tr>
                  ) : null}
                  </Fragment>
                  );
                })}
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
                {formState.id ? 'Update Department' : 'Create Department'}
              </h2>
              <button onClick={closeModal} className="p-2 rounded-full hover:bg-slate-800">
                <X className="text-slate-400" />
              </button>
            </div>
            <form className="space-y-4" onSubmit={handleSubmit}>
              <div className="grid gap-4 md:grid-cols-2">
                <div>
                  <label className="block text-sm font-medium text-slate-300">Name</label>
                  <input
                    type="text"
                    required
                    value={formState.name}
                    onChange={(event) => setFormState({ ...formState, name: event.target.value })}
                    className="mt-1 block w-full rounded-md border border-slate-700 px-3 py-2 shadow-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-300">Institution</label>
                  <select
                    required
                    value={formState.institution_id}
                    onChange={(event) => setFormState({ ...formState, institution_id: event.target.value })}
                    className="mt-1 block w-full rounded-md border border-slate-700 px-3 py-2 shadow-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
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
                  className="px-4 py-2 text-sm font-medium text-slate-300 bg-slate-800 rounded-md hover:bg-slate-700"
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
