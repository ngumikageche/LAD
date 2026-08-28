import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { Plus, X } from 'lucide-react';
import { apiRequest } from '../api/client';
import { useAuth } from '../auth/AuthContext';
import { useTableControls } from '../hooks/useTableControls';
import { TableFooter, SortableTh } from '../components/ui/TableControls';

// ── Predefined role templates ─────────────────────────────────────────────────

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
      'student_subjects.delete': false,
      'scores.read': true,
      'announcements.read': true,
      'notifications.read': true,
      'documents.read': true,
      'attendance.read': true,
      'analytics.read': true,
      'reports.student.term.view': true,
      'reports.student.attendance.view': true,
      'feedback.trainer.submit': true,
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
      'courses.read': true,
      'scores.read': true,
      'scores.create': true,
      'scores.update': true,
      'modules.read': true,
      // Needed to pick the competency an assessment evidences; without it the
      // picker is empty and marks never reach the mastery heatmap.
      'competencies.read': true,
      'announcements.read': true,
      'announcements.create': true,
      'notifications.read': true,
      // Lets a trainer message the learners in a subject they teach. The API
      // refuses the school-wide and by-role targets for a scoped trainer, so
      // this grant cannot become a broadcast.
      'notifications.create': true,
      'documents.read': true,
      'documents.create': true,
      'documents.delete': true,
      'attendance.create': true,
      'attendance.read': true,
      'attendance.write': true,
      'analytics.read': true,
      'trainer_subjects.read': true,
      'terms.read': true,
      'alerts.read': true,
      'alerts.manage': true,
      'reports.class.performance.view': true,
      'reports.class.performance.print': true,
      'reports.class.performance.export': true,
      'reports.teacher.syllabus.view': true,
      'reports.teacher.attendance.view': true,
      'reports.student.discipline.view': true,
      'reports.student.discipline.print': true,
      'reports.student.discipline.export': true,
      'reports.student.write': true,
      'practical.assessments.manage': true,
      'online_exams.manage': true,
      'reports.practical.assessment': true,
      'reports.practical.assessment.view': true,
      'reports.practical.assessment.print': true,
      'reports.practical.assessment.export': true,
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
      'trainers.read': true,
      'subjects.read': true,
      'modules.read': true,
      'competencies.read': true,
      'scores.read': true,
      'analytics.read': true,
      'announcements.read': true,
      'announcements.create': true,
      'notifications.read': true,
      'notifications.create': true,
      'documents.read': true,
      'attendance.read': true,
      'reports.admin.pass_rate.view': true,
      'reports.admin.enrolment.view': true,
      'reports.class.performance.view': true,
      'reports.class.at_risk.view': true,
      'reports.student.write': true,
      'feedback.trainer.view': true,
      'terms.read': true,
      'terms.update': true,
      'alerts.read': true,
      'alerts.manage': true,
      'admin.analytics.read': true,
      'attendance.report.view': true,
      'reports.practical.assessment': true,
      'reports.practical.assessment.view': true,
      'reports.practical.assessment.export': true,
    },
  },
];

// ── Permission definitions grouped by tab ────────────────────────────────────

type PermDef = { key: string; label: string };

const PERMISSION_TABS: Array<{ label: string; permissions: PermDef[] }> = [
  {
    // Every other key answers "what may this role open?". These answer "whose
    // records does it see once it is open?". Without `data.master`, a role is
    // held to its own institution, and a trainer to the subjects assigned to
    // them; with it, the same screens show every institution's data.
    label: 'Data Scope',
    permissions: [
      { key: 'data.master',   label: 'View Master Data — all institutions, all trainers’ subjects' },
      // The department counterpart: it widens a trainer from their own subjects
      // to their whole department, and narrows a manager from the college to
      // the same. A role named "HOD" or "Head of Department" gets it implicitly.
      { key: 'data.department', label: 'Head of Department — own department, across its trainers' },
      { key: 'alerts.read',   label: 'Read Performance & Attendance Alerts' },
      { key: 'alerts.manage', label: 'Run & Resolve Alerts' },
    ],
  },
  {
    // Each key here opens the matching admin destination — its sidebar entry,
    // its route, and its API — to whichever role is granted it. Grant these to
    // give a trainer, a manager, or a learner access to an admin screen without
    // making them an admin.
    label: 'Admin Access',
    permissions: [
      { key: 'admin.analytics.read',      label: 'Admin Dashboard & System Analytics' },
      { key: 'notifications.read',        label: 'Notifications Console' },
      { key: 'attendance.report.view',    label: 'Attendance Report' },
      { key: 'roles.read',                label: 'Open Roles & Permissions' },
      { key: 'institutions.read',         label: 'Open Institutions' },
      { key: 'departments.read',          label: 'Open Departments' },
      { key: 'admin.scores.read',         label: 'Open Score Management' },
      { key: 'users.read',                label: 'Open User Management' },
      { key: 'data.import',               label: 'Open Data Import' },
      { key: 'documents.read',            label: 'Open Document Library' },
      { key: 'practical.assessments.manage', label: 'Author Practical Assessments' },
      { key: 'online_exams.manage',       label: 'Author Online Exams' },
      { key: 'reports.admin.compliance',  label: 'Open Compliance Report' },
      { key: 'reports.practical.assessment', label: 'Open Practical Assessment Reports' },
      { key: 'reports.admin.pass_rate',   label: 'Open Exam Results & Analysis' },
      { key: 'reports.admin.enrolment',   label: 'Open Enrolment Report' },
      { key: 'terms.read',                label: 'Open Academic Terms' },
    ],
  },
  {
    label: 'People',
    permissions: [
      { key: 'users.create',    label: 'Create Users' },
      { key: 'users.read',      label: 'Read Users' },
      { key: 'users.update',    label: 'Update Users' },
      { key: 'users.delete',    label: 'Delete Users' },
      { key: 'roles.create',    label: 'Create Roles' },
      { key: 'roles.read',      label: 'Read Roles' },
      { key: 'roles.update',    label: 'Update Roles' },
      { key: 'students.create', label: 'Create Students' },
      { key: 'students.read',   label: 'Read Students' },
      { key: 'students.update', label: 'Update Students' },
      { key: 'students.delete', label: 'Delete Students' },
      { key: 'trainers.create', label: 'Create Trainers' },
      { key: 'trainers.read',   label: 'Read Trainers' },
      { key: 'trainers.update', label: 'Update Trainers' },
      { key: 'trainers.delete', label: 'Delete Trainers' },
      { key: 'data.import',     label: 'Import Data' },
    ],
  },
  {
    label: 'Institution',
    permissions: [
      { key: 'institutions.create', label: 'Create Institutions' },
      { key: 'institutions.read',   label: 'Read Institutions' },
      { key: 'institutions.update', label: 'Update Institutions' },
      { key: 'institutions.delete', label: 'Delete Institutions' },
      { key: 'departments.create',  label: 'Create Departments' },
      { key: 'departments.read',    label: 'Read Departments' },
      { key: 'departments.update',  label: 'Update Departments' },
      { key: 'departments.delete',  label: 'Delete Departments' },
      { key: 'courses.create',      label: 'Create Courses' },
      { key: 'courses.read',        label: 'Read Courses' },
      { key: 'courses.update',      label: 'Update Courses' },
      { key: 'courses.delete',      label: 'Delete Courses' },
      { key: 'modules.create',      label: 'Create Modules' },
      { key: 'modules.read',        label: 'Read Modules' },
      { key: 'modules.update',      label: 'Update Modules' },
      { key: 'modules.delete',      label: 'Delete Modules' },
      { key: 'subjects.create',     label: 'Create Subjects' },
      { key: 'subjects.read',       label: 'Read Subjects' },
      { key: 'subjects.update',     label: 'Update Subjects' },
      { key: 'subjects.delete',     label: 'Delete Subjects' },
      { key: 'competencies.create', label: 'Create Competencies' },
      { key: 'competencies.read',   label: 'Read Competencies' },
      { key: 'competencies.update', label: 'Update Competencies' },
      { key: 'competencies.delete', label: 'Delete Competencies' },
      { key: 'terms.read',          label: 'Read Academic Terms' },
      { key: 'terms.create',        label: 'Create Academic Terms' },
      { key: 'terms.update',        label: 'Update Terms & Set The Current Term' },
      { key: 'terms.delete',        label: 'Delete Academic Terms' },
    ],
  },
  {
    label: 'Academics',
    permissions: [
      { key: 'scores.create',              label: 'Create Scores (incl. Bulk Marks Upload)' },
      { key: 'scores.read',                label: 'Read Scores' },
      { key: 'scores.update',              label: 'Update Scores' },
      { key: 'admin.scores.read',          label: 'Open Score Management' },
      { key: 'admin.scores.update',        label: 'Edit Any Score' },
      { key: 'admin.scores.delete',        label: 'Delete Any Score' },
      { key: 'student_subjects.create',    label: 'Assign Student Subjects' },
      { key: 'student_subjects.read',      label: 'Read Student Subjects' },
      { key: 'student_subjects.delete',    label: 'Remove Student Subjects' },
      { key: 'trainer_subjects.read',      label: 'Read Trainer Subjects' },
      { key: 'analytics.read',             label: 'Read Analytics' },
      { key: 'admin.analytics.read',       label: 'Read Admin Analytics' },
      { key: 'practical.assessments.manage', label: 'Author Practical Assessments' },
      { key: 'online_exams.manage',        label: 'Author Online Exams' },
    ],
  },
  {
    label: 'Attendance',
    permissions: [
      { key: 'attendance.create',      label: 'Create Sessions' },
      { key: 'attendance.read',        label: 'Read Attendance' },
      { key: 'attendance.write',       label: 'Manage Sessions (End/Regenerate)' },
      { key: 'attendance.report.view', label: 'Open Attendance Report' },
    ],
  },
  {
    label: 'Content',
    permissions: [
      { key: 'documents.create',       label: 'Upload Documents' },
      { key: 'documents.read',         label: 'Read Documents' },
      { key: 'documents.delete',       label: 'Delete Documents' },
      { key: 'announcements.create',   label: 'Create Announcements' },
      { key: 'announcements.read',     label: 'Read Announcements' },
      { key: 'notifications.create',   label: 'Create Notifications' },
      { key: 'notifications.read',     label: 'Read Notifications' },
      { key: 'notifications.update',   label: 'Update Notifications' },
      { key: 'notifications.delete',   label: 'Delete Notifications' },
    ],
  },
  {
    label: 'Reports',
    permissions: [
      { key: 'reports.student.term.view',          label: 'View Student Report Cards' },
      { key: 'reports.student.term.print',         label: 'Print Student Report Cards' },
      { key: 'reports.student.term.export',        label: 'Export Student Report Cards' },
      { key: 'reports.student.transcript.view',    label: 'View Student Transcripts' },
      { key: 'reports.student.transcript.print',   label: 'Print Student Transcripts' },
      { key: 'reports.student.transcript.export',  label: 'Export Student Transcripts' },
      { key: 'reports.student.attendance.view',    label: 'View Student Attendance Reports' },
      { key: 'reports.student.attendance.print',   label: 'Print Student Attendance Reports' },
      { key: 'reports.student.attendance.export',  label: 'Export Student Attendance Reports' },
      { key: 'reports.student.fees.view',          label: 'View Student Fee Statements' },
      { key: 'reports.student.fees.print',         label: 'Print Student Fee Statements' },
      { key: 'reports.student.fees.export',        label: 'Export Student Fee Statements' },
      { key: 'reports.student.discipline.view',    label: 'View Student Discipline Reports' },
      { key: 'reports.student.discipline.print',   label: 'Print Student Discipline Reports' },
      { key: 'reports.student.discipline.export',  label: 'Export Student Discipline Reports' },
      { key: 'reports.student.write',              label: 'Write Reports for Students' },
      { key: 'reports.class.performance.view',     label: 'View Class Performance Reports' },
      { key: 'reports.class.performance.print',    label: 'Print Class Performance Reports' },
      { key: 'reports.class.performance.export',   label: 'Export Class Performance Reports' },
      { key: 'reports.class.at_risk.view',         label: 'View Class At-Risk Reports' },
      { key: 'reports.class.at_risk.print',        label: 'Print Class At-Risk Reports' },
      { key: 'reports.class.at_risk.export',       label: 'Export Class At-Risk Reports' },
      { key: 'reports.teacher.syllabus.view',      label: 'View Syllabus Coverage Reports' },
      { key: 'reports.teacher.syllabus.print',     label: 'Print Syllabus Coverage Reports' },
      { key: 'reports.teacher.syllabus.export',    label: 'Export Syllabus Coverage Reports' },
      { key: 'reports.teacher.attendance.view',    label: 'View Teacher Attendance Reports' },
      { key: 'reports.teacher.attendance.print',   label: 'Print Teacher Attendance Reports' },
      { key: 'reports.teacher.attendance.export',  label: 'Export Teacher Attendance Reports' },
      { key: 'reports.teacher.appraisal.view',     label: 'View Teacher Appraisal Reports' },
      { key: 'reports.teacher.appraisal.print',    label: 'Print Teacher Appraisal Reports' },
      { key: 'reports.teacher.appraisal.export',   label: 'Export Teacher Appraisal Reports' },
      { key: 'reports.admin.pass_rate.view',       label: 'View Admin Exam Results' },
      { key: 'reports.admin.pass_rate.print',      label: 'Print Admin Exam Results' },
      { key: 'reports.admin.pass_rate.export',     label: 'Export Admin Exam Results' },
      { key: 'reports.admin.enrolment.view',       label: 'View Admin Enrolment Reports' },
      { key: 'reports.admin.enrolment.print',      label: 'Print Admin Enrolment Reports' },
      { key: 'reports.admin.enrolment.export',     label: 'Export Admin Enrolment Reports' },
      { key: 'reports.admin.fees',                 label: 'Open Fee Collection Report' },
      { key: 'reports.admin.fees.view',            label: 'View Fee Collection Report' },
      { key: 'reports.admin.fees.print',           label: 'Print Fee Collection Report' },
      { key: 'reports.admin.fees.export',          label: 'Export Fee Collection Report' },
      { key: 'reports.admin.safeguarding.view',    label: 'View Safeguarding Reports' },
      { key: 'reports.admin.safeguarding.print',   label: 'Print Safeguarding Reports' },
      { key: 'reports.admin.safeguarding.export',  label: 'Export Safeguarding Reports' },
      { key: 'reports.admin.compliance.view',      label: 'View Compliance Reports' },
      { key: 'reports.admin.compliance.print',     label: 'Print Compliance Reports' },
      { key: 'reports.admin.compliance.export',    label: 'Export Compliance Reports' },
      { key: 'reports.practical.assessment',       label: 'Open Practical Assessment Reports' },
      { key: 'reports.practical.assessment.view',  label: 'View Practical Assessment Reports' },
      { key: 'reports.practical.assessment.print', label: 'Print Practical Assessment Reports' },
      { key: 'reports.practical.assessment.export', label: 'Export Practical Assessment Reports' },
    ],
  },
  {
    label: 'Feedback',
    permissions: [
      { key: 'feedback.trainer.submit',   label: 'Submit Feedback About Trainers' },
      { key: 'feedback.trainer.view',     label: 'View All Trainer Feedback' },
      { key: 'feedback.trainer.moderate', label: 'Reveal Identity On Anonymous Feedback' },
    ],
  },
];

// ── Types ─────────────────────────────────────────────────────────────────────

type Role = {
  id: string;
  role_name: string;
  permissions: Record<string, boolean>;
};

type RoleForm = {
  id?: string;
  role_name: string;
};

const emptyForm: RoleForm = { role_name: '' };

const inputCls = 'block w-full rounded-lg bg-slate-800 border border-slate-700 px-3 py-2 text-slate-200 placeholder:text-slate-500 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent';

// ── Permission tab panel ──────────────────────────────────────────────────────

function PermissionPanel({
  permissions,
  map,
  onChange,
  isWildcard,
}: {
  permissions: PermDef[];
  map: Record<string, boolean>;
  onChange: (key: string) => void;
  isWildcard: boolean;
}) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
      {permissions.map((p) => (
        <label
          key={p.key}
          className={`flex items-center gap-3 px-3 py-2.5 rounded-lg border cursor-pointer transition-colors ${
            isWildcard
              ? 'border-teal-500/30 bg-teal-500/10'
              : map[p.key]
              ? 'border-indigo-500/40 bg-indigo-500/10'
              : 'border-slate-700 bg-slate-800/50 hover:border-slate-600'
          }`}
        >
          <input
            type="checkbox"
            className="h-4 w-4 rounded accent-indigo-500 shrink-0"
            checked={isWildcard || Boolean(map[p.key])}
            disabled={isWildcard}
            onChange={() => onChange(p.key)}
          />
          <span className={`text-sm ${isWildcard ? 'text-teal-300' : map[p.key] ? 'text-indigo-200' : 'text-slate-400'}`}>
            {p.label}
          </span>
        </label>
      ))}
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────

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
  const [activeTab, setActiveTab] = useState(0);

  const isWildcard = Boolean(permissionMap['*']);

  const loadData = async () => {
    setIsLoading(true);
    setError(null);
    try {
      const data = await apiRequest<Role[]>('/roles', { token });
      setRoles(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load roles');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => { if (token) loadData(); }, [token]);

  const filtered = useMemo(() => {
    const q = searchTerm.toLowerCase();
    return roles.filter((r) => r.role_name.toLowerCase().includes(q));
  }, [roles, searchTerm]);

  const tc = useTableControls(filtered);

  const openCreate = () => {
    setFormState(emptyForm);
    setPermissionMap({});
    setActiveTab(0);
    setIsModalOpen(true);
  };

  const openEdit = (item: Role) => {
    setFormState({ id: item.id, role_name: item.role_name });
    setPermissionMap(item.permissions ?? {});
    setActiveTab(0);
    setIsModalOpen(true);
  };

  const closeModal = () => {
    setIsModalOpen(false);
    setFormState(emptyForm);
    setPermissionMap({});
    setError(null);
  };

  const togglePermission = (key: string) => {
    const next = { ...permissionMap, [key]: !permissionMap[key] };
    // Remove false entries to keep the object clean
    if (!next[key]) delete next[key];
    setPermissionMap(next);
  };

  const toggleWildcard = () => {
    if (isWildcard) {
      const next = { ...permissionMap };
      delete next['*'];
      setPermissionMap(next);
    } else {
      setPermissionMap({ '*': true });
    }
  };

  const activePermissions = PERMISSION_TABS[activeTab].permissions;
  const isActiveTabFullySelected = activePermissions.every((p) => permissionMap[p.key]);

  const toggleActiveTabPermissions = () => {
    const next = { ...permissionMap };

    activePermissions.forEach((permission) => {
      if (isActiveTabFullySelected) {
        delete next[permission.key];
      } else {
        next[permission.key] = true;
      }
    });

    setPermissionMap(next);
  };

  // Count enabled permissions per tab
  const tabCounts = PERMISSION_TABS.map((tab) =>
    isWildcard
      ? tab.permissions.length
      : tab.permissions.filter((p) => permissionMap[p.key]).length
  );

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setIsSubmitting(true);
    setError(null);
    const payload = {
      role_name: formState.role_name.trim(),
      permissions: permissionMap,
    };
    try {
      if (formState.id) {
        await apiRequest(`/roles/${formState.id}`, { method: 'PUT', token, body: payload });
      } else {
        await apiRequest('/roles', { method: 'POST', token, body: payload });
      }
      closeModal();
      await loadData();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save role');
    } finally {
      setIsSubmitting(false);
    }
  };

  if (!user?.permissions?.['roles.read'] && !user?.permissions?.['*']) {
    return (
      <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-4 text-sm text-amber-300">
        You do not have permission to view roles.
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-slate-200">Roles</h1>
          <p className="text-sm text-slate-500">Manage roles and their permissions.</p>
        </div>
        {(user?.permissions?.['roles.create'] || user?.permissions?.['*']) && (
          <button
            onClick={openCreate}
            className="flex items-center gap-2 px-4 py-2.5 text-sm font-bold text-white bg-indigo-600 rounded-lg hover:bg-indigo-700 transition-colors"
          >
            <Plus className="w-4 h-4" /> Add Role
          </button>
        )}
      </div>

      <div className="bg-slate-900 border border-slate-800 rounded-2xl shadow-lg overflow-hidden">
        <div className="p-5 border-b border-slate-800">
          <input
            type="text"
            placeholder="Search by role name..."
            className={inputCls + ' max-w-sm'}
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
        </div>

        {isLoading ? (
          <div className="p-6 text-sm text-slate-400">Loading roles...</div>
        ) : error ? (
          <div className="p-6 text-sm text-red-400">{error}</div>
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
                {tc.paged.map((item) => {
                  const isAdmin = item.permissions?.['*'] === true;
                  const count = Object.values(item.permissions ?? {}).filter(Boolean).length;
                  return (
                    <tr key={item.id} className="hover:bg-slate-800/60 transition-colors">
                      <td className="px-6 py-4 font-medium text-slate-100">{item.role_name}</td>
                      <td className="px-6 py-4">
                        {isAdmin ? (
                          <span className="px-2 py-1 rounded-full text-xs font-semibold bg-teal-500/15 text-teal-300 border border-teal-500/30">
                            Full Access (Wildcard)
                          </span>
                        ) : count > 0 ? (
                          <span className="text-xs text-slate-400">{count} permission{count !== 1 ? 's' : ''}</span>
                        ) : (
                          <span className="text-xs text-slate-600">No permissions</span>
                        )}
                      </td>
                      <td className="px-6 py-4">
                        {(user?.permissions?.['roles.update'] || user?.permissions?.['*']) && (
                          <button
                            className="text-indigo-400 hover:text-indigo-300 text-sm font-medium transition-colors"
                            onClick={() => openEdit(item)}
                          >
                            Edit
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })}
                {tc.paged.length === 0 && (
                  <tr>
                    <td colSpan={3} className="px-6 py-10 text-center text-slate-500 text-sm">No roles found.</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}
        <TableFooter page={tc.page} totalPages={tc.totalPages} total={tc.total} pageSize={tc.pageSize} onPage={tc.setPage} />
      </div>

      {/* ── Modal ── */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
          <div className="w-full max-w-2xl max-h-[calc(100vh-2rem)] rounded-2xl bg-slate-900 border border-slate-800 shadow-2xl flex flex-col overflow-hidden">
            {/* Header */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-800 shrink-0">
              <h2 className="text-xl font-bold text-slate-100">
                {formState.id ? 'Update Role' : 'Create Role'}
              </h2>
              <button onClick={closeModal} className="p-2 rounded-lg hover:bg-slate-800 text-slate-400 hover:text-slate-200 transition">
                <X size={18} />
              </button>
            </div>

            <form onSubmit={handleSubmit} className="flex min-h-0 flex-1 flex-col">
              <div className="min-h-0 flex-1 overflow-y-auto px-6 py-5 space-y-5">
                {/* Role name */}
                <div>
                  <label className="block text-sm font-medium text-slate-300 mb-1.5">Role name</label>
                  <input
                    type="text"
                    required
                    value={formState.role_name}
                    onChange={(e) => setFormState({ ...formState, role_name: e.target.value })}
                    className={inputCls}
                    placeholder="e.g. Trainer, Student, Manager"
                  />
                </div>

                {/* Wildcard toggle */}
                <label className={`flex items-center gap-3 px-4 py-3 rounded-xl border cursor-pointer transition-colors ${
                  isWildcard ? 'border-teal-500/40 bg-teal-500/10' : 'border-slate-700 hover:border-slate-600'
                }`}>
                  <input
                    type="checkbox"
                    className="h-4 w-4 rounded accent-teal-500"
                    checked={isWildcard}
                    onChange={toggleWildcard}
                  />
                  <div>
                    <p className={`text-sm font-semibold ${isWildcard ? 'text-teal-300' : 'text-slate-300'}`}>
                      Full Access (Wildcard)
                    </p>
                    <p className="text-xs text-slate-500 mt-0.5">
                      Grants all permissions — use only for Admin roles
                    </p>
                  </div>
                </label>

                {/* Permission tabs */}
                <div>
                  <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                    <p className="text-sm font-medium text-slate-300">Permissions</p>
                    <button
                      type="button"
                      onClick={toggleActiveTabPermissions}
                      disabled={isWildcard}
                      className="rounded-lg border border-slate-700 bg-slate-800 px-3 py-1.5 text-xs font-semibold text-slate-300 transition hover:border-indigo-500/50 hover:text-indigo-300 disabled:cursor-not-allowed disabled:border-teal-500/20 disabled:bg-teal-500/10 disabled:text-teal-300"
                    >
                      {isWildcard
                        ? 'All granted'
                        : isActiveTabFullySelected
                        ? `Clear ${PERMISSION_TABS[activeTab].label}`
                        : `Select all ${PERMISSION_TABS[activeTab].label}`}
                    </button>
                  </div>

                  {/* Tab bar */}
                  <div className="flex gap-1 border-b border-slate-800 mb-4 overflow-x-auto">
                    {PERMISSION_TABS.map((tab, i) => (
                      <button
                        key={tab.label}
                        type="button"
                        onClick={() => setActiveTab(i)}
                        className={`px-4 py-2 text-sm font-medium whitespace-nowrap transition-colors border-b-2 -mb-px ${
                          activeTab === i
                            ? 'border-indigo-500 text-indigo-300'
                            : 'border-transparent text-slate-500 hover:text-slate-300'
                        }`}
                      >
                        {tab.label}
                        {tabCounts[i] > 0 && (
                          <span className={`ml-1.5 px-1.5 py-0.5 rounded-full text-xs font-bold ${
                            isWildcard ? 'bg-teal-500/20 text-teal-400' : 'bg-indigo-500/20 text-indigo-400'
                          }`}>
                            {tabCounts[i]}
                          </span>
                        )}
                      </button>
                    ))}
                  </div>

                  {/* Active tab content */}
                  <PermissionPanel
                    permissions={activePermissions}
                    map={permissionMap}
                    onChange={togglePermission}
                    isWildcard={isWildcard}
                  />
                </div>

                {error && (
                  <p className="text-sm text-red-400 bg-red-500/10 border border-red-500/30 rounded-lg px-3 py-2">{error}</p>
                )}
              </div>

              {/* Footer */}
              <div className="flex justify-end gap-3 px-6 py-4 border-t border-slate-800 shrink-0">
                <button
                  type="button"
                  onClick={closeModal}
                  className="px-4 py-2 text-sm font-medium text-slate-300 bg-slate-800 rounded-lg hover:bg-slate-700 transition"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="px-4 py-2 text-sm font-medium text-white bg-indigo-600 rounded-lg hover:bg-indigo-700 disabled:opacity-60 transition"
                >
                  {isSubmitting ? 'Saving...' : 'Save Role'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default RolesPage;
