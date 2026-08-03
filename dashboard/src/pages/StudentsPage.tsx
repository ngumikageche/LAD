import { useState } from 'react';
import StudentsTable from '../components/tables/StudentsTable';
import BulkPeopleUploadPanel from '../components/admin/BulkPeopleUploadPanel';
import { useAuth } from '../auth/AuthContext';

const StudentsPage = () => {
  const { user } = useAuth();
  const [refreshKey, setRefreshKey] = useState(0);
  if (!user?.permissions?.['students.read'] && !user?.permissions?.['*']) {
    return (
      <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-4 text-sm text-amber-300">
        You do not have permission to view students.
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <h1 className="text-3xl font-bold text-slate-200 mb-6">Students</h1>
      {user.permissions?.['data.import'] || user.permissions?.['*'] ? (
        <BulkPeopleUploadPanel
          personLabel="learners"
          uploadPath="/students/bulk-upload"
          templatePath="/students/import-template"
          templateFilename="LAD-learners-template.xlsx"
          requiredColumns="Registration Number, Name, Email, Course Code, Module Code"
          onComplete={() => setRefreshKey((value) => value + 1)}
        />
      ) : null}
      <StudentsTable key={refreshKey} />
    </div>
  );
};

export default StudentsPage;
