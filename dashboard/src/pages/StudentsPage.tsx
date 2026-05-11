import StudentsTable from '../components/tables/StudentsTable';

import { useAuth } from '../auth/AuthContext';

const StudentsPage = () => {
  const { user } = useAuth();
  if (!user?.permissions?.['students.read'] && !user?.permissions?.['*']) {
    return (
      <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-4 text-sm text-amber-300">
        You do not have permission to view students.
      </div>
    );
  }

  return (
    <div>
      <h1 className="text-3xl font-bold text-slate-200 mb-6">Students</h1>
      <StudentsTable />
    </div>
  );
};

export default StudentsPage;
