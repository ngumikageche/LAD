import { useEffect, useMemo, useState } from 'react';
import { ArrowDownAZ, ArrowUpAZ, X } from 'lucide-react';
import { apiRequest } from '../../api/client';
import { useAuth } from '../../auth/AuthContext';

type PreviewLevel = 'course' | 'module' | 'subject';
type SortMode = 'name' | 'code' | 'hierarchy';

type Institution = { id: string; name: string };
type Department = { id: string; institution_id: string; name: string };
type Course = { id: string; code?: string; department_id: string; name: string; cbet_level?: string };
type Module = { id: string; code?: string; course_id: string; name: string; description?: string };
type Subject = { id: string; code?: string; module_id: string; name: string };

type PreviewRow = {
  id: string;
  code: string;
  name: string;
  institutionId: string;
  institution: string;
  department: string;
  courseId: string;
  course: string;
  moduleId: string;
  module: string;
  detail: string;
};

const selectClass =
  'block w-full rounded-md border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-slate-200 focus:outline-none focus:ring-2 focus:ring-cyan-500';

export default function AcademicStructurePreviewModal({
  open,
  onClose,
  level,
  initialInstitutionId = '',
}: {
  open: boolean;
  onClose: () => void;
  level: PreviewLevel;
  initialInstitutionId?: string;
}) {
  if (!open) return null;
  return (
    <AcademicStructurePreviewContent
      onClose={onClose}
      level={level}
      initialInstitutionId={initialInstitutionId}
    />
  );
}

function AcademicStructurePreviewContent({
  onClose,
  level,
  initialInstitutionId,
}: {
  onClose: () => void;
  level: PreviewLevel;
  initialInstitutionId: string;
}) {
  const { token } = useAuth();
  const [institutions, setInstitutions] = useState<Institution[]>([]);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [courses, setCourses] = useState<Course[]>([]);
  const [modules, setModules] = useState<Module[]>([]);
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [institutionId, setInstitutionId] = useState(initialInstitutionId);
  const [courseId, setCourseId] = useState('');
  const [moduleId, setModuleId] = useState('');
  const [sortMode, setSortMode] = useState<SortMode>('name');
  const [ascending, setAscending] = useState(true);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    Promise.all([
      apiRequest<Institution[]>('/institutions', { token }),
      apiRequest<Department[]>('/departments', { token }),
      apiRequest<Course[]>('/courses', { token }),
      level === 'course' ? Promise.resolve([] as Module[]) : apiRequest<Module[]>('/modules', { token }),
      level === 'subject' ? apiRequest<Subject[]>('/subjects', { token }) : Promise.resolve([] as Subject[]),
    ])
      .then(([institutionData, departmentData, courseData, moduleData, subjectData]) => {
        setInstitutions(institutionData);
        setDepartments(departmentData);
        setCourses(courseData);
        setModules(moduleData);
        setSubjects(subjectData);
      })
      .catch((err) => setError(err instanceof Error ? err.message : 'Failed to load linked academic data'))
      .finally(() => setLoading(false));
  }, [level, token]);

  const departmentMap = useMemo(
    () => new Map(departments.map((department) => [department.id, department])),
    [departments],
  );
  const courseMap = useMemo(() => new Map(courses.map((course) => [course.id, course])), [courses]);
  const moduleMap = useMemo(() => new Map(modules.map((module) => [module.id, module])), [modules]);

  const institutionCourses = useMemo(
    () =>
      institutionId
        ? courses.filter((course) => departmentMap.get(course.department_id)?.institution_id === institutionId)
        : [],
    [courses, departmentMap, institutionId],
  );
  const courseModules = useMemo(
    () => (courseId ? modules.filter((module) => module.course_id === courseId) : []),
    [courseId, modules],
  );

  const rows = useMemo(() => {
    if (!institutionId) return [];
    const institutionName = institutions.find((institution) => institution.id === institutionId)?.name ?? '';
    let values: PreviewRow[] = [];

    if (level === 'course') {
      values = courses.map((course) => {
        const department = departmentMap.get(course.department_id);
        return {
          id: course.id,
          code: course.code ?? '',
          name: course.name,
          institutionId: department?.institution_id ?? '',
          institution: institutions.find((item) => item.id === department?.institution_id)?.name ?? '',
          department: department?.name ?? '',
          courseId: course.id,
          course: course.name,
          moduleId: '',
          module: '',
          detail: course.cbet_level ?? '',
        };
      });
    } else if (level === 'module') {
      values = modules.map((module) => {
        const course = courseMap.get(module.course_id);
        const department = course ? departmentMap.get(course.department_id) : undefined;
        return {
          id: module.id,
          code: module.code ?? '',
          name: module.name,
          institutionId: department?.institution_id ?? '',
          institution: institutions.find((item) => item.id === department?.institution_id)?.name ?? '',
          department: department?.name ?? '',
          courseId: course?.id ?? '',
          course: course?.name ?? '',
          moduleId: module.id,
          module: module.name,
          detail: module.description ?? '',
        };
      });
    } else {
      values = subjects.map((subject) => {
        const module = moduleMap.get(subject.module_id);
        const course = module ? courseMap.get(module.course_id) : undefined;
        const department = course ? departmentMap.get(course.department_id) : undefined;
        return {
          id: subject.id,
          code: subject.code ?? '',
          name: subject.name,
          institutionId: department?.institution_id ?? '',
          institution: institutions.find((item) => item.id === department?.institution_id)?.name ?? '',
          department: department?.name ?? '',
          courseId: course?.id ?? '',
          course: course?.name ?? '',
          moduleId: module?.id ?? '',
          module: module?.name ?? '',
          detail: '',
        };
      });
    }

    values = values.filter((row) => row.institutionId === institutionId && row.institution === institutionName);
    if (courseId) values = values.filter((row) => row.courseId === courseId);
    if (moduleId) values = values.filter((row) => row.moduleId === moduleId);

    const valueFor = (row: PreviewRow) => {
      if (sortMode === 'code') return row.code;
      if (sortMode === 'hierarchy') {
        return `${row.institution}\u0000${row.department}\u0000${row.course}\u0000${row.module}\u0000${row.name}`;
      }
      return row.name;
    };
    return [...values].sort((left, right) => {
      const result = valueFor(left).localeCompare(valueFor(right), undefined, { numeric: true });
      return ascending ? result : -result;
    });
  }, [
    ascending,
    courseId,
    courseMap,
    courses,
    departmentMap,
    institutionId,
    institutions,
    level,
    moduleId,
    moduleMap,
    modules,
    sortMode,
    subjects,
  ]);

  const title = `${level[0].toUpperCase()}${level.slice(1)} Preview`;

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/70 p-4" role="dialog" aria-modal="true">
      <div className="flex max-h-[90vh] w-full max-w-6xl flex-col overflow-hidden rounded-lg border border-slate-700 bg-slate-900 shadow-2xl">
        <div className="flex items-center justify-between border-b border-slate-700 px-5 py-4">
          <div>
            <h2 className="text-xl font-bold text-slate-100">{title}</h2>
            <p className="text-sm text-slate-400">{rows.length} linked {level}{rows.length === 1 ? '' : 's'}</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="inline-flex h-9 w-9 items-center justify-center rounded-md text-slate-400 hover:bg-slate-800 hover:text-white"
            aria-label="Close preview"
          >
            <X size={19} />
          </button>
        </div>

        <div className="grid gap-3 border-b border-slate-700 px-5 py-4 md:grid-cols-4">
          <label className="text-xs font-semibold uppercase text-slate-400">
            Institution
            <select
              value={institutionId}
              onChange={(event) => {
                setInstitutionId(event.target.value);
                setCourseId('');
                setModuleId('');
              }}
              className={`${selectClass} mt-1`}
            >
              <option value="">Select institution...</option>
              {institutions.map((institution) => (
                <option key={institution.id} value={institution.id}>{institution.name}</option>
              ))}
            </select>
          </label>

          {level !== 'course' ? (
            <label className="text-xs font-semibold uppercase text-slate-400">
              Course
              <select
                value={courseId}
                onChange={(event) => {
                  setCourseId(event.target.value);
                  setModuleId('');
                }}
                disabled={!institutionId}
                className={`${selectClass} mt-1 disabled:opacity-50`}
              >
                <option value="">All courses</option>
                {institutionCourses.map((course) => (
                  <option key={course.id} value={course.id}>{course.name}</option>
                ))}
              </select>
            </label>
          ) : <div />}

          {level === 'subject' ? (
            <label className="text-xs font-semibold uppercase text-slate-400">
              Module
              <select
                value={moduleId}
                onChange={(event) => setModuleId(event.target.value)}
                disabled={!courseId}
                className={`${selectClass} mt-1 disabled:opacity-50`}
              >
                <option value="">All modules</option>
                {courseModules.map((module) => (
                  <option key={module.id} value={module.id}>{module.name}</option>
                ))}
              </select>
            </label>
          ) : <div />}

          <div className="flex items-end gap-2">
            <label className="flex-1 text-xs font-semibold uppercase text-slate-400">
              Sort
              <select
                value={sortMode}
                onChange={(event) => setSortMode(event.target.value as SortMode)}
                className={`${selectClass} mt-1`}
              >
                <option value="name">Name</option>
                <option value="code">Code</option>
                <option value="hierarchy">Hierarchy</option>
              </select>
            </label>
            <button
              type="button"
              onClick={() => setAscending((value) => !value)}
              className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-md border border-slate-700 text-slate-300 hover:bg-slate-800"
              title={ascending ? 'Sort descending' : 'Sort ascending'}
              aria-label={ascending ? 'Sort descending' : 'Sort ascending'}
            >
              {ascending ? <ArrowDownAZ size={18} /> : <ArrowUpAZ size={18} />}
            </button>
          </div>
        </div>

        <div className="min-h-64 flex-1 overflow-auto">
          {loading ? (
            <p className="p-6 text-sm text-slate-400">Loading linked data...</p>
          ) : error ? (
            <p className="p-6 text-sm text-red-300">{error}</p>
          ) : !institutionId ? (
            <p className="p-8 text-center text-sm text-slate-400">Select an institution to preview its linked {level}s.</p>
          ) : rows.length === 0 ? (
            <p className="p-8 text-center text-sm text-slate-500">No linked {level}s match this selection.</p>
          ) : (
            <table className="min-w-full text-left text-sm">
              <thead className="sticky top-0 bg-slate-800 text-xs uppercase text-slate-400">
                <tr>
                  <th className="px-4 py-3">Code</th>
                  <th className="px-4 py-3">Name</th>
                  <th className="px-4 py-3">Institution</th>
                  <th className="px-4 py-3">Department</th>
                  {level !== 'course' ? <th className="px-4 py-3">Course</th> : null}
                  {level === 'subject' ? <th className="px-4 py-3">Module</th> : null}
                  {level === 'course' ? <th className="px-4 py-3">CBET Level</th> : null}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800">
                {rows.map((row) => (
                  <tr key={row.id} className="hover:bg-slate-800/60">
                    <td className="px-4 py-3 font-mono text-xs text-cyan-300">{row.code || '-'}</td>
                    <td className="px-4 py-3 font-medium text-slate-100">{row.name}</td>
                    <td className="px-4 py-3 text-slate-300">{row.institution}</td>
                    <td className="px-4 py-3 text-slate-400">{row.department || '-'}</td>
                    {level !== 'course' ? <td className="px-4 py-3 text-slate-300">{row.course || '-'}</td> : null}
                    {level === 'subject' ? <td className="px-4 py-3 text-slate-400">{row.module || '-'}</td> : null}
                    {level === 'course' ? <td className="px-4 py-3 text-slate-400">{row.detail || '-'}</td> : null}
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  );
}
