import { useEffect, useMemo, useRef, useState } from 'react';
import type { ChangeEvent } from 'react';
import { AlertCircle, BarChart3, Camera, CheckCircle2, ClipboardList, FileText, Mic, Plus, Printer, Save, Send, Trash2, Undo2, Upload, User, Video } from 'lucide-react';
import { useAuth } from '../auth/AuthContext';
import { Button } from '../components/ui/Button';
import { FormField, Input, Select, TextArea } from '../components/ui/Form';
import type { PracticalAssessmentPayload, PracticalAssessmentReport } from '../api/trainer';
import { trainerPracticalAssessmentsAPI, trainerStudentsAPI, trainerSubjectsAPI } from '../api/trainer';

type StudentOption = {
  id: string;
  name: string;
  email: string;
  student_id: string;
  enrollment_status: string;
  overall_avg: number;
  subjects?: string[];
};

type SubjectFilterOption = {
  id: string;
  subject_name: string;
};

type SectionType = 'narrative' | 'session' | 'oral';

type SectionItemForm = {
  prompt: string;
  expected_response: string;
  remark: string;
  details: string;
  score: string;
  max_score: string;
};

type SectionForm = {
  title: string;
  type: SectionType;
  description: string;
  content: string;
  duration_hours: string;
  assessment_date: string;
  assessment_venue: string;
  note: string;
  items: SectionItemForm[];
};

type FormState = {
  assessment_date: string;
  assessment_venue: string;
  status: PracticalAssessmentReport['status'];
};

const DEFAULT_FORM: FormState = {
  assessment_date: '',
  assessment_venue: '',
  status: 'draft',
};

const toNumber = (value: string) => {
  if (value.trim() === '') return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
};

const autoRemark = (score: number | null) => {
  if (score == null) return 'Score not recorded.';
  if (score >= 20) return 'Excellent - task completed to industry standard.';
  if (score >= 15) return 'Good - completed with minor corrections required.';
  if (score >= 10) return 'Fair - significant errors observed; remediation recommended.';
  return 'Unsatisfactory - task not adequately completed.';
};

const hasItemContent = (item: SectionItemForm) => (
  item.prompt.trim() !== ''
  || item.expected_response.trim() !== ''
  || item.remark.trim() !== ''
  || item.details.trim() !== ''
  || item.score.trim() !== ''
);

const emptyItem = (type: SectionType): SectionItemForm => ({
  prompt: '',
  expected_response: '',
  remark: '',
  details: '',
  score: '',
  max_score: type === 'oral' ? '1' : '2',
});

const sectionPreset = (type: SectionType): SectionForm => {
  if (type === 'session') {
    return {
      title: 'Session Title',
      type,
      description: '',
      content: '',
      duration_hours: '3',
      assessment_date: '',
      assessment_venue: '',
      note: '',
      items: [emptyItem(type)],
    };
  }
  if (type === 'oral') {
    return {
      title: 'Oral Assessment',
      type,
      description: 'Assessor to award marks for each correct response by the candidate in the table below.',
      content: '',
      duration_hours: '',
      assessment_date: '',
      assessment_venue: '',
      note: '',
      items: [emptyItem(type)],
    };
  }
  return {
    title: 'Practical Brief',
    type,
    description: '',
    content: '',
    duration_hours: '',
    assessment_date: '',
    assessment_venue: '',
    note: '',
    items: [],
  };
};

const cdaccTemplateSections = (): SectionForm[] => ([
  {
    title: 'Instructions to the Assessor',
    type: 'narrative',
    description: '',
    content: [
      '1. This assessment is to take place in the prescribed order as arranged in the tool.',
      '2. Capture clear photographs and/or videos of each candidate’s work at critical points as they perform the tasks and label all media files with Candidate Registration Number, Unit Code, Practical Session Number, and Date.',
      '3. Record candidate scores and assessor remarks in the observation checklists for each session.',
      '4. Store all completed checklists, media files, and candidate drawings in a secure digital or physical folder per candidate.',
    ].join('\n'),
    duration_hours: '',
    assessment_date: '',
    assessment_venue: '',
    note: '',
    items: [],
  },
  {
    title: 'Practical Brief',
    type: 'narrative',
    description: '',
    content: 'In this practical, the candidate will be required to demonstrate competence based on the provided drawing, procedure, or work instruction. The assessment will involve hands-on sessions and an oral assessment.',
    duration_hours: '',
    assessment_date: '',
    assessment_venue: '',
    note: '',
    items: [],
  },
  {
    title: 'Session 1',
    type: 'session',
    description: 'Practical checklist',
    content: '',
    duration_hours: '3',
    assessment_date: '',
    assessment_venue: '',
    note: 'Photos and videos should be taken at critical points during this session.',
    items: [emptyItem('session')],
  },
  {
    title: 'Session 2',
    type: 'session',
    description: 'Practical checklist',
    content: '',
    duration_hours: '3',
    assessment_date: '',
    assessment_venue: '',
    note: 'Photos and videos should be taken at critical points during this session.',
    items: [emptyItem('session')],
  },
  {
    title: 'Session 3',
    type: 'session',
    description: 'Practical checklist',
    content: '',
    duration_hours: '3',
    assessment_date: '',
    assessment_venue: '',
    note: 'Photos and videos should be taken at critical points during this session.',
    items: [emptyItem('session')],
  },
  {
    title: 'Oral Assessment',
    type: 'oral',
    description: 'Assessor to award marks for each correct response by the candidate in the table below.',
    content: '',
    duration_hours: '',
    assessment_date: '',
    assessment_venue: '',
    note: '',
    items: [emptyItem('oral')],
  },
]);

const reportSectionsToForm = (report: PracticalAssessmentReport): SectionForm[] => {
  if (report.report_sections?.length) {
    return report.report_sections.map((section) => ({
      title: section.title ?? '',
      type: section.type === 'checklist' ? 'session' : section.type,
      description: section.description ?? '',
      content: section.content ?? '',
      duration_hours: section.duration_hours == null ? '' : String(section.duration_hours),
      assessment_date: section.assessment_date ?? '',
      assessment_venue: section.assessment_venue ?? '',
      note: section.note ?? '',
      items: section.type === 'narrative'
        ? []
        : (section.items.length ? section.items : [null]).map((item) => ({
            prompt: item?.prompt ?? '',
            expected_response: item?.expected_response ?? '',
            remark: item?.remark ?? '',
            details: (item?.sub_items ?? []).join('\n'),
            score: item?.score == null ? '' : String(item.score),
            max_score: item?.max_score == null ? (section.type === 'oral' ? '1' : '2') : String(item.max_score),
          })),
    }));
  }
  return [sectionPreset('narrative')];
};

export default function TrainerPracticalAssessmentPage() {
  const { user } = useAuth();
  const isAdmin = user?.user_type === 'admin';
  const [allStudents, setAllStudents] = useState<StudentOption[]>([]);
  const [subjectOptions, setSubjectOptions] = useState<SubjectFilterOption[]>([]);
  const [selectedSubjectId, setSelectedSubjectId] = useState('');
  const [reports, setReports] = useState<PracticalAssessmentReport[]>([]);
  const [allReports, setAllReports] = useState<PracticalAssessmentReport[]>([]);
  const [selectedStudentId, setSelectedStudentId] = useState('');
  const [selectedReportId, setSelectedReportId] = useState('');
  const [form, setForm] = useState<FormState>(DEFAULT_FORM);
  const [sections, setSections] = useState<SectionForm[]>([sectionPreset('narrative')]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [releasing, setReleasing] = useState(false);
  const [mutating, setMutating] = useState(false);
  const [uploadingMedia, setUploadingMedia] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const mediaInputRef = useRef<HTMLInputElement | null>(null);

  const selectedSubject = useMemo(
    () => subjectOptions.find((subject) => subject.id === selectedSubjectId) ?? null,
    [selectedSubjectId, subjectOptions],
  );

  const students = useMemo(() => {
    if (!selectedSubject) return allStudents;
    return allStudents.filter((student) => student.subjects?.includes(selectedSubject.subject_name));
  }, [allStudents, selectedSubject]);

  const selectedStudent = useMemo(
    () => students.find((student) => student.id === selectedStudentId) ?? null,
    [selectedStudentId, students],
  );

  const selectedReport = useMemo(
    () => reports.find((report) => report.id === selectedReportId) ?? null,
    [reports, selectedReportId],
  );

  useEffect(() => {
    if (isAdmin) return undefined;
    let cancelled = false;
    trainerSubjectsAPI.getAssignedSubjects()
      .then((items) => {
        if (!cancelled) {
          setSubjectOptions(Array.isArray(items) ? items.map((item) => ({
            id: item.id,
            subject_name: item.subject_name,
          })) : []);
        }
      })
      .catch(() => {
        if (!cancelled) setSubjectOptions([]);
      });
    return () => {
      cancelled = true;
    };
  }, [isAdmin]);

  useEffect(() => {
    const loadStudents = async () => {
      try {
        setLoading(true);
        setError(null);
        const data = isAdmin
          ? await trainerStudentsAPI.getAllStudentsForReports()
          : await trainerStudentsAPI.getStudentsInSubjects();
        const items = Array.isArray(data) ? (data as StudentOption[]) : [];
        setAllStudents(items);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load students');
      } finally {
        setLoading(false);
      }
    };

    loadStudents();
  }, [isAdmin]);

  useEffect(() => {
    if (students.length === 0) {
      setSelectedStudentId('');
      setReports([]);
      resetEditor();
      return;
    }
    if (!students.some((student) => student.id === selectedStudentId)) {
      setSelectedStudentId(students[0].id);
    }
  }, [students, selectedStudentId]);

  const resetEditor = () => {
    setSelectedReportId('');
    setForm({ ...DEFAULT_FORM });
    setSections([sectionPreset('narrative')]);
  };

  const loadFormFromReport = (report: PracticalAssessmentReport) => {
    setForm({
      assessment_date: report.assessment_date ? report.assessment_date.slice(0, 10) : '',
      assessment_venue: report.assessment_venue ?? '',
      status: report.status,
    });
    setSections(reportSectionsToForm(report));
  };

  const refreshReports = async (studentId: string, preferredReportId?: string) => {
    if (!studentId) {
      setReports([]);
      resetEditor();
      return;
    }

    try {
      setError(null);
      const data = await trainerPracticalAssessmentsAPI.listPracticalAssessments({ student_id: studentId });
      const items = Array.isArray(data) ? data : [];
      setReports(items);
      const nextSelected =
        (preferredReportId && items.find((item) => item.id === preferredReportId)) ||
        items[0] ||
        null;
      if (nextSelected) {
        setSelectedReportId(nextSelected.id);
        loadFormFromReport(nextSelected);
      } else {
        resetEditor();
      }
    } catch (err) {
      setReports([]);
      resetEditor();
      setError(err instanceof Error ? err.message : 'Failed to load practical assessments');
    }
  };

  const refreshAnalyticsReports = async () => {
    try {
      const data = await trainerPracticalAssessmentsAPI.listPracticalAssessments();
      setAllReports(Array.isArray(data) ? data : []);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load practical analytics');
    }
  };

  useEffect(() => {
    refreshReports(selectedStudentId);
  }, [selectedStudentId]);

  useEffect(() => {
    if (!loading) {
      refreshAnalyticsReports();
    }
  }, [loading]);

  useEffect(() => {
    if (selectedReport) {
      loadFormFromReport(selectedReport);
    }
  }, [selectedReport]);

  const updateField = <K extends keyof FormState>(key: K, value: FormState[K]) => {
    setForm((current) => ({ ...current, [key]: value }));
  };

  const updateSection = <K extends keyof SectionForm>(sectionIndex: number, key: K, value: SectionForm[K]) => {
    setSections((current) => current.map((section, index) => (
      index === sectionIndex ? { ...section, [key]: value } : section
    )));
  };

  const changeSectionType = (sectionIndex: number, nextType: SectionType) => {
    setSections((current) => current.map((section, index) => {
      if (index !== sectionIndex) return section;
      if (section.type === nextType) return section;
      if (nextType === 'narrative') {
        return {
          ...section,
          type: nextType,
          duration_hours: '',
          note: '',
          items: [],
        };
      }
      const fallbackItems = section.items.length
        ? section.items.map((item) => ({
            ...item,
            max_score: item.max_score.trim() || (nextType === 'oral' ? '1' : '2'),
          }))
        : [emptyItem(nextType)];
      return {
        ...section,
        type: nextType,
        duration_hours: section.duration_hours || (nextType === 'oral' ? '' : '3'),
        items: fallbackItems,
      };
    }));
  };

  const updateItem = <K extends keyof SectionItemForm>(sectionIndex: number, itemIndex: number, key: K, value: SectionItemForm[K]) => {
    setSections((current) => current.map((section, index) => (
      index === sectionIndex
        ? {
            ...section,
            items: section.items.map((item, currentIndex) => (
              currentIndex === itemIndex ? { ...item, [key]: value } : item
            )),
          }
        : section
    )));
  };

  const addSection = (type: SectionType) => {
    setSections((current) => [...current, sectionPreset(type)]);
  };

  const loadCdaccTemplate = () => {
    setSections(cdaccTemplateSections());
    setSuccess('CDACC template loaded.');
    window.setTimeout(() => setSuccess(null), 2500);
  };

  const addItem = (sectionIndex: number) => {
    setSections((current) => current.map((section, index) => (
      index === sectionIndex ? { ...section, items: [...section.items, emptyItem(section.type)] } : section
    )));
  };

  const removeSection = (sectionIndex: number) => {
    setSections((current) => current.length > 1 ? current.filter((_, index) => index !== sectionIndex) : current);
  };

  const removeItem = (sectionIndex: number, itemIndex: number) => {
    setSections((current) => current.map((section, index) => (
      index === sectionIndex
        ? { ...section, items: section.items.length > 1 ? section.items.filter((_, currentIndex) => currentIndex !== itemIndex) : section.items }
        : section
    )));
  };

  const buildPayload = (statusOverride?: PracticalAssessmentReport['status']): PracticalAssessmentPayload => ({
    id: selectedReportId || undefined,
    student_id: selectedStudentId,
    trainer_id: user?.trainer_id ?? undefined,
    status: statusOverride ?? form.status,
    assessment_date: form.assessment_date.trim() || undefined,
    assessment_venue: form.assessment_venue.trim() || undefined,
    report_sections: sections.map((section, sectionIndex) => ({
      number: sectionIndex + 1,
      title: section.title.trim() || null,
      type: section.type,
      description: section.description.trim() || null,
      content: section.type === 'narrative' ? (section.content.trim() || null) : null,
      duration_hours: toNumber(section.duration_hours),
      assessment_date: section.assessment_date.trim() || null,
      assessment_venue: section.assessment_venue.trim() || null,
      note: section.note.trim() || null,
      items: section.type === 'narrative'
        ? []
        : section.items
          .filter(hasItemContent)
          .map((item, itemIndex) => ({
            number: itemIndex + 1,
            prompt: item.prompt.trim() || null,
            expected_response: item.expected_response.trim() || null,
            remark: item.remark.trim() || null,
            sub_items: item.details.split('\n').map((value) => value.trim()).filter(Boolean),
            score: toNumber(item.score),
            max_score: toNumber(item.max_score) ?? (section.type === 'oral' ? 1 : 2),
          })),
    })),
  });

  const persistReport = async (statusOverride?: PracticalAssessmentReport['status']) => {
    if (!selectedStudentId) {
      setError('Select a student first');
      return null;
    }

    try {
      setSaving(true);
      setError(null);
      const saved = await trainerPracticalAssessmentsAPI.savePracticalAssessment(buildPayload(statusOverride));
      setReports((current) => {
        const next = current.filter((item) => item.id !== saved.id);
        return [saved, ...next];
      });
      setAllReports((current) => {
        const next = current.filter((item) => item.id !== saved.id);
        return [saved, ...next];
      });
      setSelectedReportId(saved.id);
      loadFormFromReport(saved);
      setSuccess(statusOverride === 'complete' ? 'Assessment saved as complete.' : 'Assessment saved.');
      window.setTimeout(() => setSuccess(null), 2500);
      return saved;
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save assessment');
      return null;
    } finally {
      setSaving(false);
    }
  };

  const handleRelease = async () => {
    const saved = await persistReport('complete');
    if (!saved) return;

    try {
      setReleasing(true);
      setError(null);
      const released = await trainerPracticalAssessmentsAPI.releasePracticalAssessment(saved.id);
      setReports((current) => current.map((item) => (item.id === released.id ? released : item)));
      setAllReports((current) => current.map((item) => (item.id === released.id ? released : item)));
      loadFormFromReport(released);
      setSuccess('Assessment released to the student portal.');
      window.setTimeout(() => setSuccess(null), 2500);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to release assessment');
    } finally {
      setReleasing(false);
    }
  };

  const handleUnsend = async () => {
    if (!selectedReportId) return;
    if (!window.confirm('Unsend this report to return it to draft status?')) return;

    try {
      setMutating(true);
      setError(null);
      const unsent = await trainerPracticalAssessmentsAPI.unsendPracticalAssessment(selectedReportId);
      await refreshReports(selectedStudentId, unsent.id);
      await refreshAnalyticsReports();
      setSuccess('Assessment unsent and returned to draft.');
      window.setTimeout(() => setSuccess(null), 2500);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to unsend assessment');
    } finally {
      setMutating(false);
    }
  };

  const handleDelete = async () => {
    if (!selectedReportId) return;
    if (!window.confirm('Delete this report? This will hide it from the trainer and student views.')) return;

    try {
      setMutating(true);
      setError(null);
      await trainerPracticalAssessmentsAPI.deletePracticalAssessment(selectedReportId);
      await refreshReports(selectedStudentId);
      await refreshAnalyticsReports();
      setSuccess('Assessment deleted.');
      window.setTimeout(() => setSuccess(null), 2500);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete assessment');
    } finally {
      setMutating(false);
    }
  };

  const summary = useMemo(() => {
    const scoredItems = sections.flatMap((section) => (
      section.type === 'narrative'
        ? []
        : section.items.map((item) => ({
            hasContent: item.prompt.trim() !== '' || item.score.trim() !== '' || item.details.trim() !== '',
            score: toNumber(item.score),
            max: toNumber(item.max_score) ?? (section.type === 'oral' ? 1 : 2),
          })).filter((item) => item.hasContent)
    ));
    const totalScore = scoredItems.reduce((sum, item) => sum + (item.score ?? 0), 0);
    const totalMax = scoredItems.reduce((sum, item) => sum + item.max, 0);
    const allScored = scoredItems.length > 0 && scoredItems.every((item) => item.score != null);
    const percentage = allScored && totalMax > 0 ? (totalScore / totalMax) * 100 : null;
    return {
      totalScore: scoredItems.length ? totalScore : null,
      totalMax: scoredItems.length ? totalMax : null,
      outcome:
        percentage == null ? 'INCOMPLETE' : percentage >= 70 ? 'COMPETENT' : percentage >= 50 ? 'BORDERLINE' : 'NOT YET COMPETENT',
    };
  }, [sections]);

  const analytics = useMemo(() => {
    const latestByStudent = new Map<string, PracticalAssessmentReport>();
    for (const report of allReports) {
      const current = latestByStudent.get(report.student_id);
      const reportDate = new Date(report.updated_at ?? report.created_at ?? 0).getTime();
      const currentDate = new Date(current?.updated_at ?? current?.created_at ?? 0).getTime();
      if (!current || reportDate > currentDate) {
        latestByStudent.set(report.student_id, report);
      }
    }

    const latestReports = Array.from(latestByStudent.values());
    const completedLatest = latestReports.filter((report) => report.score_percentage != null);
    const averageScore = completedLatest.length
      ? completedLatest.reduce((sum, report) => sum + (report.score_percentage ?? 0), 0) / completedLatest.length
      : null;
    const competentCount = latestReports.filter((report) => report.competency_outcome === 'COMPETENT').length;
    const atRiskStudents = latestReports
      .filter((report) => report.score_percentage == null || (report.score_percentage ?? 0) < 50 || report.competency_outcome === 'NOT YET COMPETENT')
      .map((report) => {
        const matchedStudent = students.find((student) => student.id === report.student_id);
        return {
          id: report.student_id,
          name: report.student_name ?? matchedStudent?.name ?? 'Unknown student',
          registration: report.student_registration_number ?? matchedStudent?.student_id ?? 'N/A',
          outcome: report.competency_outcome ?? 'INCOMPLETE',
          score: report.score_percentage,
          status: report.status,
        };
      })
      .sort((a, b) => (a.score ?? -1) - (b.score ?? -1));

    const outcomeCounts = [
      { label: 'Competent', value: latestReports.filter((report) => report.competency_outcome === 'COMPETENT').length, color: 'bg-emerald-400' },
      { label: 'Borderline', value: latestReports.filter((report) => report.competency_outcome === 'BORDERLINE').length, color: 'bg-amber-400' },
      { label: 'Not Yet', value: latestReports.filter((report) => report.competency_outcome === 'NOT YET COMPETENT').length, color: 'bg-rose-400' },
      { label: 'Incomplete', value: latestReports.filter((report) => report.competency_outcome === 'INCOMPLETE' || report.score_percentage == null).length, color: 'bg-slate-400' },
    ];

    const sectionMap = new Map<string, { total: number; count: number }>();
    for (const report of allReports) {
      for (const section of report.report_sections ?? []) {
        if (section.type === 'narrative' || section.items.length === 0) continue;
        const max = section.items.reduce((sum, item) => sum + (item.max_score ?? (section.type === 'oral' ? 1 : 2)), 0);
        const scored = section.items.every((item) => item.score != null);
        if (!scored || max <= 0) continue;
        const score = section.items.reduce((sum, item) => sum + (item.score ?? 0), 0);
        const key = section.title ?? `${section.type}-${section.number}`;
        const current = sectionMap.get(key) ?? { total: 0, count: 0 };
        current.total += (score / max) * 100;
        current.count += 1;
        sectionMap.set(key, current);
      }
    }

    const sectionPerformance = Array.from(sectionMap.entries())
      .map(([label, value]) => ({
        label,
        average: value.count ? value.total / value.count : 0,
      }))
      .sort((a, b) => b.average - a.average)
      .slice(0, 6);

    return {
      reportCount: allReports.length,
      studentCoverage: latestReports.length,
      averageScore,
      competentRate: latestReports.length ? (competentCount / latestReports.length) * 100 : null,
      atRiskStudents,
      outcomeCounts,
      sectionPerformance,
    };
  }, [allReports, students]);

  const handleMediaSelected = async (event: ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.target.files ?? []);
    event.target.value = '';
    if (!files.length) return;

    let reportId = selectedReportId;
    if (!reportId) {
      const saved = await persistReport('draft');
      if (!saved) return;
      reportId = saved.id;
    }

    try {
      setUploadingMedia(true);
      setError(null);
      let latestReport: PracticalAssessmentReport | null = null;
      for (const file of files) {
        latestReport = await trainerPracticalAssessmentsAPI.uploadPracticalAssessmentMedia(reportId, file);
      }
      if (latestReport) {
        setReports((current) => {
          const existing = current.some((item) => item.id === latestReport.id);
          if (!existing) return [latestReport, ...current];
          return current.map((item) => (item.id === latestReport.id ? latestReport : item));
        });
        setAllReports((current) => {
          const next = current.filter((item) => item.id !== latestReport.id);
          return [latestReport, ...next];
        });
        loadFormFromReport(latestReport);
      }
      setSuccess(files.length === 1 ? 'Practical evidence uploaded.' : `${files.length} media files uploaded.`);
      window.setTimeout(() => setSuccess(null), 2500);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to upload practical evidence');
    } finally {
      setUploadingMedia(false);
    }
  };

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="h-12 w-12 animate-spin rounded-full border-b-2 border-teal-400" />
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <div className="rounded-3xl border border-slate-800 bg-slate-900 p-8 shadow-lg shadow-slate-950/30">
        <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <p className="text-xs uppercase tracking-[0.35em] text-teal-300">TVET CDACC</p>
            <h1 className="mt-2 text-3xl font-bold text-slate-100">
              {isAdmin ? 'All Practical Assessments' : 'Practical Assessment Builder'}
            </h1>
            <p className="mt-2 max-w-2xl text-sm text-slate-400">
              Build session-based practical assessment reports so the released student view matches the official format more closely.
            </p>
          </div>
          <div className="grid gap-3 sm:grid-cols-3">
            <Stat label="Students" value={String(students.length)} />
            <Stat label="Drafts" value={String(reports.filter((report) => report.status === 'draft').length)} />
            <Stat label="Scope" value={isAdmin ? 'Admin / All students' : 'Trainer / Assigned students'} />
          </div>
        </div>

        {error ? (
          <div className="mt-6 flex items-center gap-2 rounded-2xl border border-red-500/30 bg-red-500/10 p-4 text-red-300">
            <AlertCircle size={18} />
            {error}
          </div>
        ) : null}

        {success ? (
          <div className="mt-6 flex items-center gap-2 rounded-2xl border border-green-500/30 bg-green-500/10 p-4 text-green-300">
            <CheckCircle2 size={18} />
            {success}
          </div>
        ) : null}
      </div>

      <div className="grid gap-6 xl:grid-cols-[320px_1fr]">
        <aside className="rounded-3xl border border-slate-800 bg-slate-900 p-5 shadow-lg shadow-slate-950/20">
          <div className="flex items-center gap-2 border-b border-slate-800 pb-4">
            <User size={18} className="text-teal-300" />
            <h2 className="text-lg font-semibold text-slate-100">Assigned Students</h2>
          </div>

          {!isAdmin && subjectOptions.length > 0 ? (
            <div className="mt-4">
              <FormField label="Subject">
                <Select value={selectedSubjectId} onChange={(event) => setSelectedSubjectId(event.target.value)}>
                  <option value="">All assigned subjects</option>
                  {subjectOptions.map((subject) => (
                    <option key={subject.id} value={subject.id}>{subject.subject_name}</option>
                  ))}
                </Select>
              </FormField>
            </div>
          ) : null}

          <div className="mt-4 space-y-2">
            {students.length === 0 ? (
              <p className="rounded-2xl border border-dashed border-slate-700 p-4 text-sm text-slate-500">
                {selectedSubject ? `No students are currently linked to ${selectedSubject.subject_name}.` : 'No students are assigned to your subjects yet.'}
              </p>
            ) : students.map((student) => (
              <button
                key={student.id}
                onClick={() => {
                  setSelectedStudentId(student.id);
                  resetEditor();
                }}
                className={`w-full rounded-2xl border p-4 text-left transition ${
                  selectedStudentId === student.id
                    ? 'border-teal-500/40 bg-teal-500/10'
                    : 'border-slate-800 hover:border-slate-700 hover:bg-slate-800/70'
                }`}
              >
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="font-semibold text-slate-100">{student.name}</p>
                    <p className="text-xs text-slate-500">{student.student_id}</p>
                  </div>
                  <span className="rounded-full bg-slate-800 px-2 py-1 text-xs text-slate-300">
                    {student.overall_avg.toFixed(1)}%
                  </span>
                </div>
              </button>
            ))}
          </div>

          <div className="mt-5 rounded-2xl border border-slate-800 bg-slate-950/50 p-4">
            <div className="flex items-center justify-between">
              <p className="text-sm font-semibold text-slate-200">Existing Reports</p>
              <span className="text-xs text-slate-500">{reports.length}</span>
            </div>
            <div className="mt-3 space-y-2">
              {reports.length === 0 ? (
                <p className="text-sm text-slate-500">No practical assessment reports for this student.</p>
              ) : reports.map((report) => (
                <button
                  key={report.id}
                  onClick={() => setSelectedReportId(report.id)}
                  className={`w-full rounded-xl border px-3 py-2 text-left text-sm transition ${
                    selectedReportId === report.id
                      ? 'border-indigo-500/40 bg-indigo-500/10 text-slate-100'
                      : 'border-slate-800 text-slate-300 hover:border-slate-700 hover:bg-slate-800/70'
                  }`}
                >
                  <div className="flex items-center justify-between gap-3">
                    <span className="truncate">{report.unit_of_competency}</span>
                    <span className="text-xs text-slate-500">{report.status}</span>
                  </div>
                  <p className="mt-1 text-xs text-slate-500">
                    {report.total_score == null ? 'Incomplete' : `${report.total_score.toFixed(1)} / ${(report.total_max_score ?? 100).toFixed(1)}`}
                  </p>
                </button>
              ))}
            </div>
          </div>
        </aside>

        <main className="space-y-6">
          <section className="rounded-3xl border border-slate-800 bg-slate-900 p-6 shadow-lg shadow-slate-950/20">
            <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
              <div>
                <div className="flex items-center gap-2">
                  <BarChart3 size={18} className="text-teal-300" />
                  <h2 className="text-xl font-bold text-slate-100">Practical Analytics</h2>
                </div>
                <p className="mt-2 text-sm text-slate-500">Summary of saved practical assessments, section performance, and latest at-risk students.</p>
              </div>
              <div className="grid gap-3 sm:grid-cols-4">
                <Stat label="Reports" value={String(analytics.reportCount)} />
                <Stat label="Students" value={String(analytics.studentCoverage)} />
                <Stat label="Avg Score" value={analytics.averageScore == null ? 'N/A' : `${analytics.averageScore.toFixed(1)}%`} />
                <Stat label="At Risk" value={String(analytics.atRiskStudents.length)} />
              </div>
            </div>

            <div className="mt-6 grid gap-6 xl:grid-cols-[1fr_1fr]">
              <div className="rounded-2xl border border-slate-800 bg-slate-950/50 p-4">
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-semibold text-slate-200">Outcome Distribution</h3>
                  <span className="text-xs text-slate-500">
                    {analytics.competentRate == null ? 'No complete records' : `${analytics.competentRate.toFixed(1)}% competent`}
                  </span>
                </div>
                <div className="mt-4 space-y-3">
                  {analytics.outcomeCounts.map((item) => {
                    const max = Math.max(...analytics.outcomeCounts.map((entry) => entry.value), 1);
                    return (
                      <div key={item.label}>
                        <div className="flex items-center justify-between text-sm text-slate-300">
                          <span>{item.label}</span>
                          <span>{item.value}</span>
                        </div>
                        <div className="mt-1 h-3 rounded-full bg-slate-800">
                          <div className={`h-3 rounded-full ${item.color}`} style={{ width: `${(item.value / max) * 100}%` }} />
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              <div className="rounded-2xl border border-slate-800 bg-slate-950/50 p-4">
                <h3 className="text-sm font-semibold text-slate-200">Section Performance</h3>
                <div className="mt-4 space-y-3">
                  {analytics.sectionPerformance.length === 0 ? (
                    <p className="text-sm text-slate-500">Complete practical sessions will appear here after scores are entered.</p>
                  ) : analytics.sectionPerformance.map((item) => (
                    <div key={item.label}>
                      <div className="flex items-center justify-between gap-3 text-sm text-slate-300">
                        <span className="truncate">{item.label}</span>
                        <span>{item.average.toFixed(1)}%</span>
                      </div>
                      <div className="mt-1 h-3 rounded-full bg-slate-800">
                        <div className="h-3 rounded-full bg-cyan-400" style={{ width: `${Math.min(item.average, 100)}%` }} />
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            <div className="mt-6 rounded-2xl border border-slate-800 bg-slate-950/50 p-4">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-semibold text-slate-200">At-Risk Students</h3>
                <span className="text-xs text-slate-500">Latest practical report per student</span>
              </div>
              <div className="mt-4 space-y-3">
                {analytics.atRiskStudents.length === 0 ? (
                  <p className="text-sm text-slate-500">No at-risk students identified from current practical assessments.</p>
                ) : analytics.atRiskStudents.slice(0, 8).map((student) => (
                  <div key={student.id} className="flex flex-col gap-2 rounded-xl border border-slate-800 bg-slate-900/60 p-3 md:flex-row md:items-center md:justify-between">
                    <div>
                      <p className="font-semibold text-slate-100">{student.name}</p>
                      <p className="text-xs text-slate-500">{student.registration}</p>
                    </div>
                    <div className="flex flex-wrap gap-2 text-xs">
                      <span className="rounded-full bg-slate-800 px-3 py-1 text-slate-300">{student.score == null ? 'Incomplete' : `${student.score.toFixed(1)}%`}</span>
                      <span className="rounded-full bg-rose-500/10 px-3 py-1 text-rose-300">{student.outcome}</span>
                      <span className="rounded-full bg-slate-800 px-3 py-1 text-slate-400">{student.status}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </section>

          <section className="rounded-3xl border border-slate-800 bg-slate-900 p-6 shadow-lg shadow-slate-950/20">
            <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
              <div>
                <h2 className="text-xl font-bold text-slate-100">Report Header</h2>
                <p className="text-sm text-slate-500">Set the overall assessment date and venue, then build instructions, sessions, and oral assessment below.</p>
              </div>
              <div className="flex flex-wrap gap-3">
                <input
                  ref={mediaInputRef}
                  type="file"
                  accept="image/*,video/*,.pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt,.rtf"
                  multiple
                  onChange={handleMediaSelected}
                  className="hidden"
                />
                <Button variant="secondary" isLoading={uploadingMedia} onClick={() => mediaInputRef.current?.click()}>
                  <Upload size={16} />
                  Upload Files
                </Button>
                <Button variant="secondary" onClick={() => window.print()}>
                  <Printer size={16} />
                  Print
                </Button>
                <Button variant="secondary" onClick={resetEditor}>
                  <Trash2 size={16} />
                  Reset
                </Button>
                <Button isLoading={saving} onClick={() => persistReport('draft')}>
                  <Save size={16} />
                  Save Draft
                </Button>
                {selectedReport?.status === 'released' ? (
                  <Button variant="secondary" isLoading={mutating} onClick={handleUnsend}>
                    <Undo2 size={16} />
                    Unsend
                  </Button>
                ) : null}
                <Button isLoading={releasing} onClick={handleRelease}>
                  <Send size={16} />
                  Release
                </Button>
                <Button variant="secondary" isLoading={mutating} onClick={handleDelete}>
                  <Trash2 size={16} />
                  Delete
                </Button>
              </div>
            </div>

            <div className="mt-6 grid gap-6 xl:grid-cols-2">
              <div className="rounded-2xl border border-slate-800 bg-slate-950/50 p-4">
                <div className="flex items-center justify-between">
                  <p className="text-sm font-semibold text-slate-200">Selected Student</p>
                  <span className="text-xs text-slate-500">{selectedReportId ? 'Editing existing report' : 'New report'}</span>
                </div>
                <div className="mt-3 grid gap-3 sm:grid-cols-3">
                  <MiniStat label="Student" value={selectedStudent?.name ?? 'None'} />
                  <MiniStat label="Subject" value={selectedSubject?.subject_name ?? selectedReport?.unit_of_competency ?? 'All'} />
                  <MiniStat label="Total" value={summary.totalScore == null ? 'Incomplete' : `${summary.totalScore.toFixed(1)} / ${(summary.totalMax ?? 0).toFixed(1)}`} />
                  <MiniStat label="Outcome" value={summary.outcome} />
                </div>
              </div>

              <div className="space-y-4">
                <FormField label="Assessment Date">
                  <Input type="date" value={form.assessment_date} onChange={(e) => updateField('assessment_date', e.target.value)} />
                </FormField>
                <FormField label="Assessment Venue">
                  <Input value={form.assessment_venue} onChange={(e) => updateField('assessment_venue', e.target.value)} placeholder="Workshop, lab, or field location" />
                </FormField>
                <FormField label="Report Status">
                  <Select value={form.status} onChange={(e) => updateField('status', e.target.value as FormState['status'])}>
                    <option value="draft">Draft</option>
                    <option value="complete">Complete</option>
                    <option value="released">Released</option>
                  </Select>
                </FormField>
              </div>
            </div>

            <div className="mt-6 rounded-2xl border border-slate-800 bg-slate-950/50 p-4">
              <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <p className="text-sm font-semibold text-slate-200">Captured Practical Evidence</p>
                  <p className="text-xs text-slate-500">Type the assessment below or upload a prepared file when the trainer prefers a normal document workflow.</p>
                </div>
                <div className="flex gap-2 text-xs text-slate-400">
                  <span className="inline-flex items-center gap-1 rounded-full bg-slate-800 px-3 py-1"><Camera size={12} /> Photos</span>
                  <span className="inline-flex items-center gap-1 rounded-full bg-slate-800 px-3 py-1"><Video size={12} /> Videos</span>
                  <span className="inline-flex items-center gap-1 rounded-full bg-slate-800 px-3 py-1"><FileText size={12} /> PDF / Word</span>
                </div>
              </div>

              <div className="mt-4 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                {(selectedReport?.media_attachments ?? []).length === 0 ? (
                  <div className="rounded-2xl border border-dashed border-slate-700 p-4 text-sm text-slate-500">
                    Save the report, then upload practical evidence from a camera, gallery, recorded video, or a prepared assessment document.
                  </div>
                ) : (selectedReport?.media_attachments ?? []).map((attachment) => (
                  <a
                    key={attachment.id}
                    href={attachment.file_url}
                    target="_blank"
                    rel="noreferrer"
                    className="rounded-2xl border border-slate-800 bg-slate-900/60 p-4 transition hover:border-slate-700 hover:bg-slate-900"
                  >
                    <div className="flex items-center justify-between gap-3">
                      <p className="truncate text-sm font-semibold text-slate-100">{attachment.file_name}</p>
                      <span className="text-xs uppercase text-slate-500">{attachment.media_type}</span>
                    </div>
                    <p className="mt-2 text-xs text-slate-500">
                      {attachment.file_size ? `${(attachment.file_size / 1024 / 1024).toFixed(1)} MB` : 'Size unavailable'}
                    </p>
                    <p className="mt-1 text-xs text-slate-500">{new Date(attachment.uploaded_at).toLocaleString()}</p>
                  </a>
                ))}
              </div>
            </div>
          </section>

          <section className="rounded-3xl border border-slate-800 bg-slate-900 p-6 shadow-lg shadow-slate-950/20">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 className="text-xl font-bold text-slate-100">Report Builder</h2>
                <p className="text-sm text-slate-500">Create narrative instructions, practical brief sections, session checklists, and oral assessment questions.</p>
              </div>
              <div className="flex flex-wrap gap-2">
                <button type="button" onClick={loadCdaccTemplate} className="inline-flex items-center gap-2 rounded-xl border border-amber-500/40 bg-amber-500/10 px-4 py-2 text-sm font-semibold text-amber-200 transition hover:bg-amber-500/20">
                  <ClipboardList size={16} />
                  Load CDACC Template
                </button>
                <button type="button" onClick={() => addSection('narrative')} className="inline-flex items-center gap-2 rounded-xl bg-teal-500 px-4 py-2 text-sm font-semibold text-slate-950 transition hover:bg-teal-400">
                  <Plus size={16} />
                  Narrative
                </button>
                <button type="button" onClick={() => addSection('session')} className="inline-flex items-center gap-2 rounded-xl border border-slate-700 bg-slate-800 px-4 py-2 text-sm font-semibold text-slate-200 transition hover:bg-slate-700">
                  <ClipboardList size={16} />
                  Session
                </button>
                <button type="button" onClick={() => addSection('oral')} className="inline-flex items-center gap-2 rounded-xl border border-slate-700 bg-slate-800 px-4 py-2 text-sm font-semibold text-slate-200 transition hover:bg-slate-700">
                  <Mic size={16} />
                  Oral
                </button>
              </div>
            </div>

            <div className="mt-6 space-y-5">
              {sections.map((section, sectionIndex) => (
                <div key={`section-${sectionIndex}`} className="rounded-2xl border border-slate-800 bg-slate-950/40 p-5">
                  <div className="grid gap-4 xl:grid-cols-[1fr_220px]">
                    <FormField label={`Section ${sectionIndex + 1} Title`}>
                      <Input value={section.title} onChange={(e) => updateSection(sectionIndex, 'title', e.target.value)} placeholder="Section heading" />
                    </FormField>
                    <FormField label="Section Type">
                      <Select value={section.type} onChange={(e) => changeSectionType(sectionIndex, e.target.value as SectionType)}>
                        <option value="narrative">Narrative</option>
                        <option value="session">Session</option>
                        <option value="oral">Oral</option>
                      </Select>
                    </FormField>
                  </div>

                  <div className="mt-4">
                    <FormField label="Section Description">
                      <TextArea value={section.description} onChange={(e) => updateSection(sectionIndex, 'description', e.target.value)} rows={2} placeholder="Optional section intro or instruction" />
                    </FormField>
                  </div>

                  {section.type === 'narrative' ? (
                    <div className="mt-4">
                      <FormField label="Section Content">
                        <TextArea value={section.content} onChange={(e) => updateSection(sectionIndex, 'content', e.target.value)} rows={6} placeholder="Paste the assessor instructions, practical brief, or any narrative content here." />
                      </FormField>
                    </div>
                  ) : (
                    <>
                      <div className="mt-4 grid gap-4 xl:grid-cols-4">
                        <FormField label="Duration (Hours)">
                          <Input value={section.duration_hours} onChange={(e) => updateSection(sectionIndex, 'duration_hours', e.target.value)} type="number" min="0.5" step="0.5" />
                        </FormField>
                        <FormField label="Section Date">
                          <Input value={section.assessment_date} onChange={(e) => updateSection(sectionIndex, 'assessment_date', e.target.value)} type="date" />
                        </FormField>
                        <FormField label="Section Venue">
                          <Input value={section.assessment_venue} onChange={(e) => updateSection(sectionIndex, 'assessment_venue', e.target.value)} placeholder="Venue" />
                        </FormField>
                        <FormField label="Section Note">
                          <Input value={section.note} onChange={(e) => updateSection(sectionIndex, 'note', e.target.value)} placeholder="NB: Photos and videos..." />
                        </FormField>
                      </div>

                      <div className="mt-5 space-y-4">
                        {section.items.map((item, itemIndex) => (
                          <div key={`section-${sectionIndex}-item-${itemIndex}`} className="rounded-xl border border-slate-800 bg-slate-900/50 p-4">
                            <div className="grid gap-4 xl:grid-cols-[1fr_160px_160px]">
                              <FormField label={section.type === 'oral' ? `Question ${itemIndex + 1}` : `Checklist Item ${itemIndex + 1}`}>
                                <TextArea value={item.prompt} onChange={(e) => updateItem(sectionIndex, itemIndex, 'prompt', e.target.value)} rows={3} placeholder={section.type === 'oral' ? 'Write the oral question' : 'Write the checklist item title'} />
                              </FormField>
                              <FormField label="Max Score">
                                <Input type="number" min="0.5" step="0.5" value={item.max_score} onChange={(e) => updateItem(sectionIndex, itemIndex, 'max_score', e.target.value)} />
                              </FormField>
                              <FormField label="Awarded Score">
                                <Input type="number" min="0" step="0.5" value={item.score} onChange={(e) => updateItem(sectionIndex, itemIndex, 'score', e.target.value)} />
                              </FormField>
                            </div>

                            <div className="mt-4 grid gap-4 xl:grid-cols-2">
                              <FormField label="Rubrics / Assessor Guide">
                                <TextArea value={item.expected_response} onChange={(e) => updateItem(sectionIndex, itemIndex, 'expected_response', e.target.value)} rows={3} placeholder={section.type === 'oral' ? 'Expected answer, rubric, or key guide' : 'Rubric, expected standard, or assessor guide'} />
                              </FormField>
                              <FormField label={section.type === 'oral' ? 'Sub points / prompts' : 'Sub items'}>
                                <TextArea value={item.details} onChange={(e) => updateItem(sectionIndex, itemIndex, 'details', e.target.value)} rows={3} placeholder="One bullet or sub-item per line" />
                              </FormField>
                            </div>

                            <div className="mt-4">
                              <FormField label="Assessor Remark">
                                <div className="space-y-2">
                                  <TextArea value={item.remark} onChange={(e) => updateItem(sectionIndex, itemIndex, 'remark', e.target.value)} rows={3} />
                                  {section.type === 'session' ? (
                                    <button
                                      type="button"
                                      onClick={() => updateItem(sectionIndex, itemIndex, 'remark', autoRemark(toNumber(item.score)))}
                                      className="text-xs font-medium text-teal-300 hover:text-teal-200"
                                    >
                                      Auto-generate remark from score
                                    </button>
                                  ) : null}
                                </div>
                              </FormField>
                            </div>

                            <div className="mt-4 flex justify-end">
                              <button
                                type="button"
                                onClick={() => removeItem(sectionIndex, itemIndex)}
                                disabled={section.items.length === 1}
                                className="text-xs font-medium text-slate-500 hover:text-red-300 disabled:cursor-not-allowed disabled:opacity-40"
                              >
                                Remove item
                              </button>
                            </div>
                          </div>
                        ))}
                      </div>

                      <div className="mt-4 flex justify-between">
                        <button
                          type="button"
                          onClick={() => addItem(sectionIndex)}
                          className="inline-flex items-center gap-2 rounded-xl border border-slate-700 bg-slate-800 px-3 py-2 text-sm font-semibold text-slate-200 transition hover:bg-slate-700"
                        >
                          <Plus size={16} />
                          Add {section.type === 'oral' ? 'Question' : 'Checklist Item'}
                        </button>
                      </div>
                    </>
                  )}

                  <div className="mt-4 flex justify-end">
                    <button
                      type="button"
                      onClick={() => removeSection(sectionIndex)}
                      disabled={sections.length === 1}
                      className="text-xs font-medium text-slate-500 hover:text-red-300 disabled:cursor-not-allowed disabled:opacity-40"
                    >
                      Remove section
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </section>
        </main>
      </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-slate-800 bg-slate-950/60 px-4 py-3">
      <p className="text-xs uppercase tracking-widest text-slate-500">{label}</p>
      <p className="mt-1 text-sm font-semibold text-slate-100">{value}</p>
    </div>
  );
}

function MiniStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-slate-800 bg-slate-950/60 p-3">
      <p className="text-xs uppercase tracking-widest text-slate-500">{label}</p>
      <p className="mt-1 text-sm font-semibold text-slate-100">{value}</p>
    </div>
  );
}
