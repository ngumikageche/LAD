import StudentsTable from '../components/tables/StudentsTable';

import { useAuth } from '../auth/AuthContext';

const StudentsPage = () => {
  const { user } = useAuth();
  if (!user?.permissions?.['students.read'] && !user?.permissions?.['*']) {
    return (
      <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
        You do not have permission to view students.
      </div>
    );
  }

  return (
    <div>
      <h1 className="text-3xl font-bold text-gray-800 mb-6">Students</h1>
      <StudentsTable />
    </div>
  );
};

export default StudentsPage;
