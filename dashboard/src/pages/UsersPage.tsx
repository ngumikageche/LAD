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

type Course = {
  id: string;
  name: string;
};

type Department = {
  id: string;
  name: string;
};

type StudentRecord = {
  id: string;
  user_id: string;
  course_id: string;
  registration_number: string;
  enrollment_year: number;
};

type TrainerRecord = {
  id: string;
  user_id: string;
  department_id: string;
  specialization: string | null;
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

type UserType = 'none' | 'student' | 'trainer';

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
  const [courses, setCourses] = useState<Course[]>([]);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [studentRecords, setStudentRecords] = useState<StudentRecord[]>([]);
  const [trainerRecords, setTrainerRecords] = useState<TrainerRecord[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [formState, setFormState] = useState<UserFormState>(emptyForm);
  const [userType, setUserType] = useState<UserType>('none');
  const [studentCourseId, setStudentCourseId] = useState('');
  const [enrollmentYear, setEnrollmentYear] = useState('');
  const [trainerDepartmentId, setTrainerDepartmentId] = useState('');
  const [trainerSpecialization, setTrainerSpecialization] = useState('');
  const [studentRecordId, setStudentRecordId] = useState('');
  const [trainerRecordId, setTrainerRecordId] = useState('');

  const canReadStudents = Boolean(user?.permissions?.['students.read'] || user?.permissions?.['*']);
  const canReadTrainers = Boolean(user?.permissions?.['trainers.read'] || user?.permissions?.['*']);
  const canWriteStudents = Boolean(
    user?.permissions?.['students.create'] || user?.permissions?.['students.update'] || user?.permissions?.['*']
  );
  const canWriteTrainers = Boolean(
    user?.permissions?.['trainers.create'] || user?.permissions?.['trainers.update'] || user?.permissions?.['*']
  );
  const canDeleteStudents = Boolean(user?.permissions?.['students.delete'] || user?.permissions?.['*']);
  const canDeleteTrainers = Boolean(user?.permissions?.['trainers.delete'] || user?.permissions?.['*']);

  const loadData = async () => {
    setIsLoading(true);
    setError(null);
    try {
      const [usersData, rolesData, institutionsData, coursesData, departmentsData, studentsData, trainersData] =
        await Promise.all([
          apiRequest<UserItem[]>('/users', { token }),
          apiRequest<Role[]>('/roles', { token }),
          apiRequest<Institution[]>('/institutions', { token }),
          apiRequest<Course[]>('/courses', { token }),
          apiRequest<Department[]>('/departments', { token }),
          canReadStudents ? apiRequest<StudentRecord[]>('/students', { token }) : Promise.resolve([]),
          canReadTrainers ? apiRequest<TrainerRecord[]>('/trainers', { token }) : Promise.resolve([]),
        ]);
      setUsers(usersData);
      setRoles(rolesData);
      setInstitutions(institutionsData);
      setCourses(coursesData);
      setDepartments(departmentsData);
      setStudentRecords(studentsData);
      setTrainerRecords(trainersData);
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
  }, [token, canReadStudents, canReadTrainers]);

  const studentsByUserId = useMemo(() => {
    return studentRecords.reduce<Record<string, StudentRecord>>((acc, record) => {
      acc[record.user_id] = record;
      return acc;
    }, {});
  }, [studentRecords]);

  const trainersByUserId = useMemo(() => {
    return trainerRecords.reduce<Record<string, TrainerRecord>>((acc, record) => {
      acc[record.user_id] = record;
      return acc;
    }, {});
  }, [trainerRecords]);

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
    setUserType('none');
    setStudentCourseId('');
    setEnrollmentYear('');
    setTrainerDepartmentId('');
    setTrainerSpecialization('');
    setStudentRecordId('');
    setTrainerRecordId('');
    setIsModalOpen(true);
  };

  const openEditModal = (item: UserItem) => {
    const studentRecord = studentsByUserId[item.id];
    const trainerRecord = trainersByUserId[item.id];
    setFormState({
      id: item.id,
      name: item.name,
      email: item.email,
      phone: item.phone ?? '',
      password: '',
      role_id: item.role_id,
      institution_id: item.institution_id ?? '',
    });
    if (studentRecord) {
      setUserType('student');
      setStudentCourseId(studentRecord.course_id);
      setEnrollmentYear(String(studentRecord.enrollment_year));
      setStudentRecordId(studentRecord.id);
      setTrainerRecordId('');
    } else if (trainerRecord) {
      setUserType('trainer');
      setTrainerDepartmentId(trainerRecord.department_id);
      setTrainerSpecialization(trainerRecord.specialization ?? '');
      setTrainerRecordId(trainerRecord.id);
      setStudentRecordId('');
    } else {
      setUserType('none');
      setStudentCourseId('');
      setEnrollmentYear('');
      setTrainerDepartmentId('');
      setTrainerSpecialization('');
      setStudentRecordId('');
      setTrainerRecordId('');
    }
    setIsModalOpen(true);
  };

  const closeModal = () => {
    setIsModalOpen(false);
    setFormState(emptyForm);
    setUserType('none');
    setStudentCourseId('');
    setEnrollmentYear('');
    setTrainerDepartmentId('');
    setTrainerSpecialization('');
    setStudentRecordId('');
    setTrainerRecordId('');
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

      let targetUserId = formState.id;

      if (formState.id) {
        await apiRequest(`/users/${formState.id}`, {
          method: 'PUT',
          token,
          body: payload,
        });
      } else {
        const created = await apiRequest<UserItem>('/users', {
          method: 'POST',
          token,
          body: { ...payload, password: formState.password },
        });
        targetUserId = created.id;
      }

      if (userType === 'student') {
        if (trainerRecordId) {
          if (!canDeleteTrainers) {
            throw new Error('You do not have permission to remove trainer assignments.');
          }
          await apiRequest(`/trainers/${trainerRecordId}`, {
            method: 'DELETE',
            token,
          });
          setTrainerRecordId('');
        }
        const yearNumber = Number(enrollmentYear);
        if (!Number.isInteger(yearNumber)) {
          throw new Error('Enrollment year must be a number.');
        }
        if (studentRecordId) {
          await apiRequest(`/students/${studentRecordId}`, {
            method: 'PUT',
            token,
            body: {
              user_id: targetUserId,
              course_id: studentCourseId,
              enrollment_year: yearNumber,
            },
          });
        } else {
          await apiRequest('/students', {
            method: 'POST',
            token,
            body: {
              user_id: targetUserId,
              course_id: studentCourseId,
              enrollment_year: yearNumber,
            },
          });
        }
      }

      if (userType === 'trainer') {
        if (studentRecordId) {
          if (!canDeleteStudents) {
            throw new Error('You do not have permission to remove student assignments.');
          }
          await apiRequest(`/students/${studentRecordId}`, {
            method: 'DELETE',
            token,
          });
          setStudentRecordId('');
        }
        if (trainerRecordId) {
          await apiRequest(`/trainers/${trainerRecordId}`, {
            method: 'PUT',
            token,
            body: {
              user_id: targetUserId,
              department_id: trainerDepartmentId,
              specialization: trainerSpecialization.trim() || null,
            },
          });
        } else {
          await apiRequest('/trainers', {
            method: 'POST',
            token,
            body: {
              user_id: targetUserId,
              department_id: trainerDepartmentId,
              specialization: trainerSpecialization.trim() || null,
            },
          });
        }
      }

      if (userType === 'none') {
        if (studentRecordId) {
          if (!canDeleteStudents) {
            throw new Error('You do not have permission to remove student assignments.');
          }
          await apiRequest(`/students/${studentRecordId}`, {
            method: 'DELETE',
            token,
          });
          setStudentRecordId('');
        }
        if (trainerRecordId) {
          if (!canDeleteTrainers) {
            throw new Error('You do not have permission to remove trainer assignments.');
          }
          await apiRequest(`/trainers/${trainerRecordId}`, {
            method: 'DELETE',
            token,
          });
          setTrainerRecordId('');
        }
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
                <div>
                  <label className="block text-sm font-medium text-gray-700">User type</label>
                  <select
                    value={userType}
                    onChange={(event) => setUserType(event.target.value as UserType)}
                    className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 shadow-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                  >
                    <option value="none">Not assigned</option>
                    {canWriteStudents ? <option value="student">Student</option> : null}
                    {canWriteTrainers ? <option value="trainer">Trainer</option> : null}
                  </select>
                </div>
                {userType === 'student' ? (
                  <>
                    <div>
                      <label className="block text-sm font-medium text-gray-700">Course</label>
                      <select
                        required
                        value={studentCourseId}
                        onChange={(event) => setStudentCourseId(event.target.value)}
                        className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 shadow-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                      >
                        <option value="">Select course</option>
                        {courses.map((course) => (
                          <option key={course.id} value={course.id}>
                            {course.name}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700">Enrollment year</label>
                      <input
                        type="number"
                        required
                        value={enrollmentYear}
                        onChange={(event) => setEnrollmentYear(event.target.value)}
                        className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 shadow-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                      />
                      <p className="mt-1 text-xs text-gray-500">
                        Registration number will be generated automatically.
                      </p>
                    </div>
                  </>
                ) : null}
                {userType === 'trainer' ? (
                  <>
                    <div>
                      <label className="block text-sm font-medium text-gray-700">Department</label>
                      <select
                        required
                        value={trainerDepartmentId}
                        onChange={(event) => setTrainerDepartmentId(event.target.value)}
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
                    <div>
                      <label className="block text-sm font-medium text-gray-700">Specialization</label>
                      <input
                        type="text"
                        value={trainerSpecialization}
                        onChange={(event) => setTrainerSpecialization(event.target.value)}
                        className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 shadow-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                      />
                    </div>
                  </>
                ) : null}
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
