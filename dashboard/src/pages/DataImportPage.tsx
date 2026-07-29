import BulkPeopleUploadPanel from '../components/admin/BulkPeopleUploadPanel';
import { useAuth } from '../auth/AuthContext';

const DataImportPage = () => {
  const { user } = useAuth();
  const canImport = Boolean(user?.permissions?.['data.import'] || user?.permissions?.['*']);

  if (!canImport) {
    return (
      <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 p-4 text-sm text-amber-300">
        You do not have permission to import data.
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold text-slate-200">Data Import</h1>
        <p className="mt-1 text-sm text-slate-500">Review spreadsheet rows, then save them to LAD.</p>
      </div>
      <BulkPeopleUploadPanel
        personLabel="learners"
        uploadPath="/students/bulk-upload"
        templatePath="/students/import-template"
        templateFilename="LAD-learners-template.xlsx"
        requiredColumns="Registration Number, Name, Email, Course ID"
      />
      <BulkPeopleUploadPanel
        personLabel="trainers"
        uploadPath="/trainers/bulk-upload"
        templatePath="/trainers/import-template"
        templateFilename="LAD-trainers-template.xlsx"
        requiredColumns="Name, Email, Department; Staff No and Subjects are optional"
      />
    </div>
  );
};

export default DataImportPage;
