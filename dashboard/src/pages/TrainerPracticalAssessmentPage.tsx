import { useEffect, useMemo, useRef, useState } from 'react';
import type { ChangeEvent, ReactNode } from 'react';
import {
  AlertCircle,
  Award,
  BarChart3,
  CalendarDays,
  Camera,
  CheckCircle2,
  ChevronRight,
  ClipboardList,
  Clock3,
  Copy,
  Eye,
  FileCheck2,
  FileText,
  Mic,
  Pencil,
  Plus,
  Printer,
  Save,
  Search,
  Send,
  Sparkles,
  Square,
  Trash2,
  Undo2,
  Upload,
  User,
  Users,
  Video,
  X,
} from 'lucide-react';
import { useAuth } from '../auth/AuthContext';
import { Button } from '../components/ui/Button';
import { FormField, Input, Select, TextArea } from '../components/ui/Form';
import type { PracticalAssessmentPayload, PracticalAssessmentReport } from '../api/trainer';
import { trainerPracticalAssessmentsAPI, trainerStudentsAPI, trainerSubjectsAPI } from '../api/trainer';
import { apiRequest, resolveApiUrl } from '../api/client';
import PracticalScoreSheet from '../components/trainer/PracticalScoreSheet';
import {
  COMPETENCE_BANDS,
  COMPETENCE_PASS_MARK,
  competenceChartColor,
  isCompetent,
  ratingFor,
} from '../utils/competence';

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

type TrainerOption = {
  id: string;
  name: string;
  department_name?: string;
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

const splitLines = (value: string) => value.split('\n').map((line) => line.trim()).filter(Boolean);

/**
 * The single "Sub items / Rubrics / Assessor Guide" list.
 *
 * Reports authored before the two fields were merged still carry a separate
 * rubric. Append it as one more line — unless it is already among the sub
 * items, which happens for every report saved after the merge, since saving
 * writes the same text to both fields.
 */
const mergeSubItemsAndRubric = (subItems: string[] | undefined, rubric: string | null | undefined): string => {
  const lines = (subItems ?? []).map((line) => String(line).trim()).filter(Boolean);
  const rubricLines = splitLines(rubric ?? '');
  const seen = new Set(lines);
  for (const line of rubricLines) {
    if (!seen.has(line)) {
      lines.push(line);
      seen.add(line);
    }
  }
  return lines.join('\n');
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
            // Sub items and the rubric are edited as one list now. Reports
            // saved before the merge kept them apart, so fold the rubric back
            // in on load rather than leaving it stranded in a hidden field.
            details: mergeSubItemsAndRubric(item?.sub_items, item?.expected_response),
            score: item?.score == null ? '' : String(item.score),
            max_score: item?.max_score == null ? (section.type === 'oral' ? '1' : '2') : String(item.max_score),
          })),
    }));
  }
  return [sectionPreset('narrative')];
};

export default function TrainerPracticalAssessmentPage() {
  const { user, token } = useAuth();
  const isAdmin = user?.user_type === 'admin';
  const [allStudents, setAllStudents] = useState<StudentOption[]>([]);
  const [subjectOptions, setSubjectOptions] = useState<SubjectFilterOption[]>([]);
  const [selectedSubjectId, setSelectedSubjectId] = useState('');
  const [trainerOptions, setTrainerOptions] = useState<TrainerOption[]>([]);
  const [selectedTrainerId, setSelectedTrainerId] = useState('');
  const [eligibleTrainerIds, setEligibleTrainerIds] = useState<string[]>([]);
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
  const [evidenceSectionId, setEvidenceSectionId] = useState('');
  const [evidenceStudentVisible, setEvidenceStudentVisible] = useState(false);
  const [recordingAudio, setRecordingAudio] = useState(false);
  const [recordingSeconds, setRecordingSeconds] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [existingSearch, setExistingSearch] = useState('');
  const [studentSearch, setStudentSearch] = useState('');
  const [studentPickerOpen, setStudentPickerOpen] = useState(false);
  const [statusFilter, setStatusFilter] = useState<'all' | PracticalAssessmentReport['status']>('all');
  const [previewReport, setPreviewReport] = useState<PracticalAssessmentReport | null>(null);
  const [reuseReport, setReuseReport] = useState<PracticalAssessmentReport | null>(null);
  const [reuseCandidates, setReuseCandidates] = useState<StudentOption[]>([]);
  const [reuseStudentIds, setReuseStudentIds] = useState<string[]>([]);
  const [reuseSearch, setReuseSearch] = useState('');
  const [reuseCandidatesLoading, setReuseCandidatesLoading] = useState(false);
  const [reusingReport, setReusingReport] = useState(false);
  const mediaInputRef = useRef<HTMLInputElement | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const recordingStreamRef = useRef<MediaStream | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const builderRef = useRef<HTMLDivElement | null>(null);
  const studentPickerRef = useRef<HTMLElement | null>(null);

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

  const filteredStudentChoices = useMemo(() => {
    const query = studentSearch.trim().toLowerCase();
    if (!query) return students;
    return students.filter((student) => (
      student.name.toLowerCase().includes(query)
      || student.student_id.toLowerCase().includes(query)
      || student.email.toLowerCase().includes(query)
    ));
  }, [studentSearch, students]);

  const reuseEligibleStudents = useMemo(() => {
    if (!reuseReport) return [];
    const query = reuseSearch.trim().toLowerCase();
    return reuseCandidates.filter((student) => {
      const matchesSearch = !query
        || student.name.toLowerCase().includes(query)
        || student.student_id.toLowerCase().includes(query)
        || student.email.toLowerCase().includes(query);
      return matchesSearch;
    });
  }, [reuseCandidates, reuseReport, reuseSearch]);

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
    if (!isAdmin || !token) return;
    Promise.all([
      apiRequest<Array<{ id: string; department_id: string; user?: { name?: string } }>>('/trainers', { token }),
      apiRequest<Array<{ id: string; name: string }>>('/departments', { token }),
    ]).then(([trainers, departments]) => {
      const departmentNames = new Map(departments.map((item) => [String(item.id), item.name]));
      setTrainerOptions(trainers.map((item) => ({
        id: String(item.id),
        name: item.user?.name ?? 'Unnamed trainer',
        department_name: departmentNames.get(String(item.department_id)),
      })));
    }).catch(() => setTrainerOptions([]));
  }, [isAdmin, token]);

  useEffect(() => {
    if (!isAdmin || !token || !selectedStudentId) {
      setEligibleTrainerIds([]);
      return;
    }
    apiRequest<{ subjects?: Array<{ trainers?: Array<{ id: string }> }> }>(
      `/students/${selectedStudentId}/subjects`,
      { token },
    ).then((result) => {
      const trainerIds = new Set<string>();
      for (const subject of result.subjects ?? []) {
        for (const trainer of subject.trainers ?? []) trainerIds.add(String(trainer.id));
      }
      setEligibleTrainerIds(Array.from(trainerIds));
      setSelectedTrainerId((current) => (
        current && (trainerIds.has(current) || Boolean(selectedReportId)) ? current : ''
      ));
    }).catch(() => setEligibleTrainerIds([]));
  }, [isAdmin, selectedReportId, selectedStudentId, token]);

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
    if (selectedStudentId && !students.some((student) => student.id === selectedStudentId)) {
      setSelectedStudentId('');
    }
  }, [students, selectedStudentId]);

  const resetEditor = () => {
    setSelectedReportId('');
    if (isAdmin) setSelectedTrainerId('');
    setForm({ ...DEFAULT_FORM });
    setSections([sectionPreset('narrative')]);
  };

  const loadFormFromReport = (report: PracticalAssessmentReport) => {
    setSelectedTrainerId(report.trainer_id ?? '');
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
      const nextSelected = preferredReportId
        ? items.find((item) => item.id === preferredReportId) ?? null
        : null;
      if (nextSelected) {
        setSelectedReportId(nextSelected.id);
        loadFormFromReport(nextSelected);
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
    if (!recordingAudio) return undefined;
    const timer = window.setInterval(() => setRecordingSeconds((current) => current + 1), 1000);
    return () => window.clearInterval(timer);
  }, [recordingAudio]);

  useEffect(() => () => {
    if (mediaRecorderRef.current?.state === 'recording') mediaRecorderRef.current.stop();
    recordingStreamRef.current?.getTracks().forEach((track) => track.stop());
  }, []);

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
    trainer_id: isAdmin ? (selectedTrainerId || undefined) : (user?.trainer_id ?? undefined),
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
            // The merged list is written to both fields: `sub_items` drives the
            // bulleted view, `expected_response` the rubric column, and older
            // report renderers read one or the other.
            expected_response: item.details.trim() || null,
            remark: item.remark.trim() || null,
            sub_items: splitLines(item.details),
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
    if (isAdmin && !selectedReportId && !selectedTrainerId) {
      setError('Select the trainer responsible for this assessment');
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
      resetEditor();
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
      outcome: ratingFor(percentage),
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
    const competentCount = latestReports.filter((report) => isCompetent(report.competency_outcome)).length;
    const atRiskStudents = latestReports
      .filter((report) => (
        report.score_percentage == null
        || (report.score_percentage ?? 0) < COMPETENCE_PASS_MARK
        || report.competency_outcome === 'NOT YET COMPETENT'
      ))
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
      ...COMPETENCE_BANDS.map((band) => ({
        label: band.short_label,
        value: latestReports.filter((report) => report.competency_outcome === band.rating).length,
        color: competenceChartColor[band.rating] ?? 'bg-slate-400',
      })),
      { label: 'Incomplete', value: latestReports.filter((report) => report.competency_outcome === 'INCOMPLETE' || report.score_percentage == null).length, color: competenceChartColor.INCOMPLETE },
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

  const visibleExistingReports = useMemo(() => {
    const query = existingSearch.trim().toLowerCase();
    return allReports.filter((report) => (
      (statusFilter === 'all' || report.status === statusFilter)
      && (
        !query
        || (report.student_name ?? '').toLowerCase().includes(query)
        || (report.student_registration_number ?? '').toLowerCase().includes(query)
        || (report.unit_of_competency ?? '').toLowerCase().includes(query)
        || (report.trainer_name ?? '').toLowerCase().includes(query)
        || report.status.toLowerCase().includes(query)
      )
    ));
  }, [allReports, existingSearch, statusFilter]);

  const openExistingReport = (report: PracticalAssessmentReport) => {
    setPreviewReport(report);
  };

  const openReuseReport = async (report: PracticalAssessmentReport) => {
    setReuseReport(report);
    setReuseCandidates([]);
    setReuseStudentIds([]);
    setReuseSearch('');
    setPreviewReport(null);
    try {
      setReuseCandidatesLoading(true);
      const candidates = await trainerPracticalAssessmentsAPI.getEligibleStudentsForPracticalAssessment(report.id);
      setReuseCandidates(Array.isArray(candidates) ? candidates as StudentOption[] : []);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load eligible learners');
    } finally {
      setReuseCandidatesLoading(false);
    }
  };

  const toggleReuseStudent = (studentId: string) => {
    setReuseStudentIds((current) => (
      current.includes(studentId)
        ? current.filter((id) => id !== studentId)
        : current.length < 100 ? [...current, studentId] : current
    ));
  };

  const handleReuseReport = async () => {
    if (!reuseReport || reuseStudentIds.length === 0) {
      setError('Select at least one learner for this report build.');
      return;
    }
    try {
      setReusingReport(true);
      setError(null);
      const result = await trainerPracticalAssessmentsAPI.assignPracticalAssessment(
        reuseReport.id,
        reuseStudentIds,
      );
      setAllReports((current) => [...result.created, ...current]);
      if (selectedStudentId) await refreshReports(selectedStudentId);
      setReuseReport(null);
      setReuseCandidates([]);
      setReuseStudentIds([]);
      const skipped = result.skipped_count ?? result.skipped_student_ids.length;
      setSuccess(
        `Report build assigned to ${result.created_count} learner${result.created_count === 1 ? '' : 's'} as new drafts.`
        + (skipped
          ? ` ${skipped} learner${skipped === 1 ? ' was' : 's were'} skipped — already assessed on this template.`
          : ''),
      );
      window.setTimeout(() => setSuccess(null), skipped ? 6000 : 3500);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to reuse report build');
    } finally {
      setReusingReport(false);
    }
  };

  const editExistingReport = (report: PracticalAssessmentReport) => {
    if (!students.some((student) => student.id === report.student_id)) {
      setSelectedSubjectId('');
    }
    setSelectedStudentId(report.student_id);
    setSelectedReportId(report.id);
    loadFormFromReport(report);
    setPreviewReport(null);
    window.setTimeout(() => builderRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 80);
  };

  const startNewAssessment = () => {
    resetEditor();
    setPreviewReport(null);
    if (!selectedStudentId) {
      setStudentPickerOpen(true);
      setSuccess('Choose a learner to start a new practical assessment.');
      window.setTimeout(() => setSuccess(null), 3000);
      window.setTimeout(() => studentPickerRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 80);
      return;
    }
    window.setTimeout(() => builderRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 80);
  };

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
        latestReport = await trainerPracticalAssessmentsAPI.uploadPracticalAssessmentMedia(
          reportId,
          file,
          'practical_evidence',
          {
            sectionId: evidenceSectionId || undefined,
            studentVisible: evidenceStudentVisible,
          },
        );
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

  const saveOralAudio = async (recording: Blob) => {
    if (recording.size === 0) {
      setError('The audio recording was empty. Please try again.');
      return;
    }

    let reportId = selectedReportId;
    if (!reportId) {
      const saved = await persistReport('draft');
      if (!saved) return;
      reportId = saved.id;
    }

    const mimeType = recording.type || 'audio/webm';
    const extension = mimeType.includes('ogg')
      ? 'ogg'
      : mimeType.includes('mp4')
        ? 'm4a'
        : 'webm';
    const file = new File(
      [recording],
      `oral-evidence-${new Date().toISOString().replace(/[:.]/g, '-')}.${extension}`,
      { type: mimeType },
    );

    try {
      setUploadingMedia(true);
      setError(null);
      const latestReport = await trainerPracticalAssessmentsAPI.uploadPracticalAssessmentMedia(
        reportId,
        file,
        'oral_audio',
      );
      setReports((current) => {
        const next = current.filter((item) => item.id !== latestReport.id);
        return [latestReport, ...next];
      });
      setAllReports((current) => {
        const next = current.filter((item) => item.id !== latestReport.id);
        return [latestReport, ...next];
      });
      setSelectedReportId(latestReport.id);
      setSuccess('Oral assessment audio saved securely.');
      window.setTimeout(() => setSuccess(null), 2500);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save oral assessment audio');
    } finally {
      setUploadingMedia(false);
    }
  };

  const startAudioRecording = async () => {
    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === 'undefined') {
      setError('Audio recording is not supported by this browser.');
      return;
    }

    try {
      setError(null);
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const preferredTypes = ['audio/webm;codecs=opus', 'audio/ogg;codecs=opus', 'audio/mp4'];
      const mimeType = preferredTypes.find((type) => MediaRecorder.isTypeSupported(type));
      const recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
      recordingStreamRef.current = stream;
      mediaRecorderRef.current = recorder;
      audioChunksRef.current = [];
      setRecordingSeconds(0);

      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) audioChunksRef.current.push(event.data);
      };
      recorder.onstop = () => {
        const recording = new Blob(audioChunksRef.current, { type: recorder.mimeType || 'audio/webm' });
        audioChunksRef.current = [];
        stream.getTracks().forEach((track) => track.stop());
        recordingStreamRef.current = null;
        mediaRecorderRef.current = null;
        void saveOralAudio(recording);
      };
      recorder.start(1000);
      setRecordingAudio(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Microphone access was not granted');
      recordingStreamRef.current?.getTracks().forEach((track) => track.stop());
      recordingStreamRef.current = null;
    }
  };

  const stopAudioRecording = () => {
    const recorder = mediaRecorderRef.current;
    if (!recorder || recorder.state !== 'recording') return;
    recorder.stop();
    setRecordingAudio(false);
  };

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="h-12 w-12 animate-spin rounded-full border-b-2 border-teal-400" />
      </div>
    );
  }

  return (
    <div className="space-y-7 pb-12">
      <div className="relative overflow-hidden rounded-[2rem] border border-teal-500/20 bg-[#0b1720] p-6 shadow-2xl shadow-slate-950/40 sm:p-8">
        <div className="pointer-events-none absolute -right-24 -top-28 h-80 w-80 rounded-full bg-teal-400/10 blur-3xl" />
        <div className="pointer-events-none absolute -bottom-28 left-1/3 h-64 w-64 rounded-full bg-cyan-500/10 blur-3xl" />
        <div className="relative flex flex-col gap-7 xl:flex-row xl:items-end xl:justify-between">
          <div className="max-w-3xl">
            <div className="inline-flex items-center gap-2 rounded-full border border-teal-400/20 bg-teal-400/10 px-3 py-1.5 text-xs font-semibold uppercase tracking-[0.24em] text-teal-200">
              <Sparkles size={13} />
              {user?.institution_name ? `${user.institution_name} · TVET CDACC workspace` : 'TVET CDACC workspace'}
            </div>
            <h1 className="mt-5 text-3xl font-black tracking-tight text-white sm:text-4xl">
              {isAdmin ? 'All Practical Assessments' : 'Practical Assessment Platform'}
            </h1>
            <p className="mt-3 max-w-2xl text-sm leading-6 text-slate-400 sm:text-base">
              Review every candidate assessment at a glance, preview official records safely, and move into editing only when you choose to.
            </p>
          </div>
          <button
            type="button"
            onClick={startNewAssessment}
            className="inline-flex items-center justify-center gap-2 rounded-2xl bg-teal-400 px-5 py-3 text-sm font-bold text-slate-950 shadow-lg shadow-teal-500/20 transition hover:-translate-y-0.5 hover:bg-teal-300"
          >
            <Plus size={18} />
            New assessment
          </button>
        </div>

        <div className="relative mt-8 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <OverviewStat icon={<FileText size={19} />} label="All records" value={String(allReports.length)} tone="teal" />
          <OverviewStat icon={<Clock3 size={19} />} label="In draft" value={String(allReports.filter((report) => report.status === 'draft').length)} tone="amber" />
          <OverviewStat icon={<FileCheck2 size={19} />} label="Released" value={String(allReports.filter((report) => report.status === 'released').length)} tone="blue" />
          <OverviewStat icon={<Award size={19} />} label="Competent" value={String(allReports.filter((report) => isCompetent(report.competency_outcome)).length)} tone="green" />
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

      <section className="rounded-[2rem] border border-slate-800 bg-slate-900/80 p-5 shadow-xl shadow-slate-950/20 sm:p-6">
        <div className="flex flex-col gap-5 xl:flex-row xl:items-end xl:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-teal-300">Assessment register</p>
            <h2 className="mt-1 text-xl font-bold text-white">Browse saved assessments</h2>
            <p className="mt-1 text-sm text-slate-500">Selecting a record opens a read-only preview. Your builder stays untouched.</p>
          </div>
          <div className="flex flex-col gap-3 md:flex-row">
            <div className="relative md:w-80">
              <Search className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" size={17} />
              <Input
                value={existingSearch}
                onChange={(event) => setExistingSearch(event.target.value)}
                placeholder="Search candidate, unit or trainer"
                className="pl-10"
              />
            </div>
            <div className="flex rounded-xl border border-slate-700 bg-slate-950/70 p-1">
              {(['all', 'draft', 'complete', 'released'] as const).map((status) => (
                <button
                  key={status}
                  type="button"
                  onClick={() => setStatusFilter(status)}
                  className={`rounded-lg px-3 py-2 text-xs font-semibold capitalize transition ${
                    statusFilter === status ? 'bg-slate-700 text-white shadow' : 'text-slate-500 hover:text-slate-200'
                  }`}
                >
                  {status}
                </button>
              ))}
            </div>
          </div>
        </div>
        <div className="mt-5 grid gap-3 lg:grid-cols-2">
          {visibleExistingReports.length === 0 ? (
            <div className="col-span-full flex min-h-48 flex-col items-center justify-center rounded-2xl border border-dashed border-slate-700 bg-slate-950/30 px-6 text-center">
              <Search size={24} className="text-slate-600" />
              <p className="mt-3 font-semibold text-slate-300">No matching assessments</p>
              <p className="mt-1 text-sm text-slate-500">Try another search or status filter.</p>
            </div>
          ) : visibleExistingReports.slice(0, 50).map((report) => (
            <button
              key={report.id}
              type="button"
              onClick={() => openExistingReport(report)}
              className="group rounded-2xl border border-slate-800 bg-slate-950/45 p-4 text-left transition hover:-translate-y-0.5 hover:border-teal-500/30 hover:bg-slate-950/80 hover:shadow-lg"
            >
              <div className="flex items-start gap-4">
                <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-teal-500/20 bg-teal-500/10 font-bold text-teal-200">
                  {(report.student_name ?? '?').slice(0, 1).toUpperCase()}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="truncate font-bold text-slate-100">{report.student_name ?? 'Unknown candidate'}</p>
                      <p className="mt-0.5 text-xs text-slate-500">{report.student_registration_number ?? 'Registration unavailable'}</p>
                    </div>
                    <StatusPill status={report.status} />
                  </div>
                  <p className="mt-3 line-clamp-1 text-sm font-medium text-slate-300">{report.unit_of_competency || 'Unit of competency not set'}</p>
                  <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2 text-xs text-slate-500">
                    <span className="inline-flex items-center gap-1.5"><User size={13} /> {report.trainer_name || 'No assessor'}</span>
                    <span className="inline-flex items-center gap-1.5"><CalendarDays size={13} /> {formatAssessmentDate(report.assessment_date)}</span>
                    <span className="inline-flex items-center gap-1.5 font-semibold text-slate-300">
                      <Award size={13} className="text-amber-300" />
                      {report.score_percentage == null ? 'Not scored' : `${report.score_percentage.toFixed(1)}%`}
                    </span>
                  </div>
                </div>
                <ChevronRight size={19} className="mt-3 shrink-0 text-slate-600 transition group-hover:translate-x-1 group-hover:text-teal-300" />
              </div>
            </button>
          ))}
        </div>
        {visibleExistingReports.length > 50 ? (
          <p className="mt-4 text-center text-xs text-slate-500">Showing the first 50 of {visibleExistingReports.length} assessments.</p>
        ) : null}
      </section>

      <div className="grid gap-6 xl:grid-cols-[320px_1fr]">
        <aside ref={studentPickerRef} className="scroll-mt-6 rounded-3xl border border-slate-800 bg-slate-900 p-5 shadow-lg shadow-slate-950/20">
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

          <div className="mt-4">
            {students.length === 0 ? (
              <p className="rounded-2xl border border-dashed border-slate-700 p-4 text-sm text-slate-500">
                {selectedSubject ? `No students are currently linked to ${selectedSubject.subject_name}.` : 'No students are assigned to your subjects yet.'}
              </p>
            ) : (
              <>
                <button
                  type="button"
                  onClick={() => setStudentPickerOpen((current) => !current)}
                  className="w-full rounded-2xl border border-teal-500/25 bg-teal-500/[0.07] p-4 text-left transition hover:border-teal-400/40 hover:bg-teal-500/10"
                >
                  <div className="flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-xs font-semibold uppercase tracking-wider text-teal-300">
                        {selectedStudent ? 'Current learner' : 'Choose learner'}
                      </p>
                      <p className="mt-1 truncate font-semibold text-slate-100">
                        {selectedStudent?.name ?? 'Search assigned learners'}
                      </p>
                      <p className="text-xs text-slate-500">{selectedStudent?.student_id ?? `${students.length} available`}</p>
                    </div>
                    <ChevronRight
                      size={18}
                      className={`shrink-0 text-teal-300 transition ${studentPickerOpen ? 'rotate-90' : ''}`}
                    />
                  </div>
                </button>

                {studentPickerOpen ? (
                  <div className="mt-3 overflow-hidden rounded-2xl border border-slate-700 bg-slate-950/70">
                    <div className="border-b border-slate-800 p-3">
                      <div className="relative">
                        <Search size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
                        <input
                          value={studentSearch}
                          onChange={(event) => setStudentSearch(event.target.value)}
                          placeholder="Name, email or registration"
                          className="w-full rounded-xl border border-slate-700 bg-slate-900 py-2.5 pl-9 pr-3 text-sm text-slate-200 outline-none focus:border-teal-500"
                        />
                      </div>
                    </div>
                    <div className="max-h-72 overflow-y-auto p-2">
                      {filteredStudentChoices.length === 0 ? (
                        <p className="p-4 text-center text-sm text-slate-500">No learner matches that search.</p>
                      ) : filteredStudentChoices.slice(0, 30).map((student) => (
                        <button
                          key={student.id}
                          type="button"
                          onClick={() => {
                            setSelectedStudentId(student.id);
                            setStudentPickerOpen(false);
                            setStudentSearch('');
                            resetEditor();
                            window.setTimeout(() => builderRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 80);
                          }}
                          className={`flex w-full items-center justify-between rounded-xl px-3 py-3 text-left transition ${
                            selectedStudentId === student.id ? 'bg-teal-500/10' : 'hover:bg-slate-800'
                          }`}
                        >
                          <div className="min-w-0">
                            <p className="truncate text-sm font-semibold text-slate-200">{student.name}</p>
                            <p className="truncate text-xs text-slate-500">{student.student_id} · {student.email}</p>
                          </div>
                          <span className="ml-3 text-xs font-semibold text-slate-400">{student.overall_avg.toFixed(1)}%</span>
                        </button>
                      ))}
                    </div>
                    {filteredStudentChoices.length > 30 ? (
                      <p className="border-t border-slate-800 px-3 py-2 text-center text-xs text-slate-500">
                        Refine your search to find the remaining learners.
                      </p>
                    ) : null}
                  </div>
                ) : null}
              </>
            )}
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
                  onClick={() => openExistingReport(report)}
                  className={`w-full rounded-xl border px-3 py-2 text-left text-sm transition ${
                    previewReport?.id === report.id
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
          <section ref={builderRef} className="scroll-mt-6 rounded-3xl border border-slate-800 bg-slate-900 p-6 shadow-lg shadow-slate-950/20">
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

            <div className="mt-6">
              <PracticalScoreSheet reports={allReports} generatedBy={user?.name ?? 'Trainer'} />
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
            <div className="mb-5 rounded-2xl border border-amber-400/25 bg-amber-500/10 p-4 text-sm text-amber-100">
              Internal formative assessment only. Do not upload KNEC, CDACC, or other externally owned summative examination scripts.
            </div>
            <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
              <div>
                <h2 className="text-xl font-bold text-slate-100">Report Header</h2>
                <p className="text-sm text-slate-500">Set the overall assessment date and venue, then build instructions, sessions, and oral assessment below.</p>
              </div>
              <div className="flex flex-wrap gap-3">
                <input
                  ref={mediaInputRef}
                  type="file"
                  accept="image/*,video/*,audio/*,.pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt,.rtf"
                  multiple
                  onChange={handleMediaSelected}
                  className="hidden"
                />
                <Button variant="secondary" onClick={() => window.print()}>
                  <Printer size={16} />
                  Print
                </Button>
                <Button variant="secondary" onClick={resetEditor}>
                  <Trash2 size={16} />
                  Reset
                </Button>
                {selectedReport ? (
                  <Button variant="secondary" onClick={() => openReuseReport(selectedReport)}>
                    <Copy size={16} />
                    Reuse for Learners
                  </Button>
                ) : null}
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

            <div className="mt-6 overflow-hidden rounded-2xl border border-teal-500/20 bg-slate-950/60">
              <div className="flex flex-col gap-4 border-b border-slate-800 bg-teal-500/[0.06] p-5 lg:flex-row lg:items-center lg:justify-between">
                <div>
                  <div className="flex items-center gap-2">
                    <Camera size={18} className="text-teal-300" />
                    <h3 className="font-bold text-slate-100">Captured Practical Evidence</h3>
                  </div>
                  <p className="mt-1 text-sm text-slate-500">
                    Type the assessment below or upload a prepared file when the trainer prefers a normal document workflow.
                  </p>
                  <div className="mt-3 flex flex-wrap gap-2 text-xs text-slate-400">
                    <span className="inline-flex items-center gap-1 rounded-full bg-slate-800 px-3 py-1"><Camera size={12} /> Photos</span>
                    <span className="inline-flex items-center gap-1 rounded-full bg-slate-800 px-3 py-1"><Video size={12} /> Videos</span>
                    <span className="inline-flex items-center gap-1 rounded-full bg-slate-800 px-3 py-1"><Mic size={12} /> Oral audio</span>
                    <span className="inline-flex items-center gap-1 rounded-full bg-slate-800 px-3 py-1"><FileText size={12} /> PDF / Word</span>
                  </div>
                </div>
                <div className="flex shrink-0 flex-wrap items-center gap-2">
                  <select
                    value={evidenceSectionId}
                    onChange={(event) => setEvidenceSectionId(event.target.value)}
                    className="rounded-xl border border-slate-700 bg-slate-900 px-3 py-2.5 text-sm text-slate-200"
                    aria-label="Evidence session"
                  >
                    <option value="">Whole assessment</option>
                    {sections.map((section, index) => (
                      <option key={`${section.type}-${index}`} value={`section-${index + 1}`}>
                        {section.title || `${section.type} ${index + 1}`}
                      </option>
                    ))}
                  </select>
                  <label className="inline-flex items-center gap-2 rounded-xl border border-slate-700 bg-slate-900 px-3 py-2.5 text-xs text-slate-300">
                    <input
                      type="checkbox"
                      checked={evidenceStudentVisible}
                      onChange={(event) => setEvidenceStudentVisible(event.target.checked)}
                    />
                    Student can view
                  </label>
                  {recordingAudio ? (
                    <>
                      <span className="inline-flex items-center gap-2 rounded-xl border border-rose-400/20 bg-rose-400/10 px-3 py-2 text-sm font-bold text-rose-200">
                        <span className="h-2 w-2 animate-pulse rounded-full bg-rose-400" />
                        {formatRecordingTime(recordingSeconds)}
                      </span>
                      <button
                        type="button"
                        onClick={stopAudioRecording}
                        className="inline-flex items-center gap-2 rounded-xl bg-rose-500 px-4 py-2.5 text-sm font-bold text-white transition hover:bg-rose-400"
                      >
                        <Square size={15} fill="currentColor" />
                        Stop &amp; save
                      </button>
                    </>
                  ) : (
                    <button
                      type="button"
                      onClick={startAudioRecording}
                      disabled={uploadingMedia}
                      className="inline-flex items-center gap-2 rounded-xl border border-rose-400/25 bg-rose-400/10 px-4 py-2.5 text-sm font-bold text-rose-200 transition hover:bg-rose-400/20 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      <Mic size={16} />
                      Record oral audio
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => mediaInputRef.current?.click()}
                    disabled={uploadingMedia || recordingAudio}
                    className="inline-flex items-center gap-2 rounded-xl bg-teal-400 px-4 py-2.5 text-sm font-bold text-slate-950 transition hover:bg-teal-300 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    <Upload size={16} />
                    {uploadingMedia ? 'Saving evidence…' : 'Add evidence'}
                  </button>
                </div>
              </div>
              <div className="p-5">
                {(selectedReport?.media_attachments ?? []).length === 0 ? (
                  <div className="rounded-2xl border border-dashed border-slate-700 p-5 text-sm text-slate-500">
                    Save the report, then upload practical evidence from a camera, gallery, recorded video, oral audio, or a prepared assessment document.
                  </div>
                ) : (
                  <EvidenceGallery report={selectedReport!} />
                )}
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
                {isAdmin ? (
                  <FormField label="Responsible Trainer">
                    <Select
                      value={selectedTrainerId}
                      onChange={(event) => setSelectedTrainerId(event.target.value)}
                      disabled={Boolean(selectedReportId)}
                    >
                      <option value="">Select trainer</option>
                      {trainerOptions.filter((trainer) => (
                        eligibleTrainerIds.includes(trainer.id) || trainer.id === selectedTrainerId
                      )).map((trainer) => (
                        <option key={trainer.id} value={trainer.id}>
                          {trainer.name}{trainer.department_name ? ` — ${trainer.department_name}` : ''}
                        </option>
                      ))}
                    </Select>
                    {!selectedReportId && selectedStudentId && eligibleTrainerIds.length === 0 ? (
                      <p className="mt-2 text-xs text-amber-300">
                        No trainer is linked to this student’s subjects. Assign the student to module subjects and assign a trainer to one of those subjects first.
                      </p>
                    ) : null}
                  </FormField>
                ) : null}
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
                    <option value="released" disabled>Released (managed by Release / Unsend)</option>
                  </Select>
                </FormField>
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

                            {/* One field, not two: sub items and the rubric were
                                being written into separate boxes that print
                                next to each other anyway. */}
                            <div className="mt-4">
                              <FormField label="Sub items / Rubrics / Assessor Guide">
                                <TextArea
                                  value={item.details}
                                  onChange={(e) => updateItem(sectionIndex, itemIndex, 'details', e.target.value)}
                                  rows={5}
                                  placeholder={section.type === 'oral'
                                    ? 'One sub point, expected answer, or assessor guide note per line'
                                    : 'One sub item, rubric point, or assessor guide note per line'}
                                />
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

      {previewReport ? (
        <AssessmentPreview
          report={previewReport}
          onClose={() => setPreviewReport(null)}
          onEdit={() => editExistingReport(previewReport)}
          onReuse={() => openReuseReport(previewReport)}
        />
      ) : null}

      {reuseReport ? (
        <ReuseReportDialog
          report={reuseReport}
          students={reuseEligibleStudents}
          selectedStudentIds={reuseStudentIds}
          search={reuseSearch}
          saving={reusingReport}
          loading={reuseCandidatesLoading}
          onSearchChange={setReuseSearch}
          onToggleStudent={toggleReuseStudent}
          onSelectVisible={() => setReuseStudentIds((current) => Array.from(new Set([
            ...current,
            ...reuseEligibleStudents.slice(0, 100).map((student) => student.id),
          ])).slice(0, 100))}
          onClear={() => setReuseStudentIds([])}
          onConfirm={handleReuseReport}
          onClose={() => {
            if (reusingReport) return;
            setReuseReport(null);
            setReuseCandidates([]);
            setReuseStudentIds([]);
          }}
        />
      ) : null}
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

const formatAssessmentDate = (value: string | null | undefined) => {
  if (!value) return 'Date not set';
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime())
    ? value
    : parsed.toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
};

const formatRecordingTime = (seconds: number) => {
  const minutes = Math.floor(seconds / 60).toString().padStart(2, '0');
  const remaining = (seconds % 60).toString().padStart(2, '0');
  return `${minutes}:${remaining}`;
};

type EvidenceAttachment = NonNullable<PracticalAssessmentReport['media_attachments']>[number];

function EvidenceGallery({ report }: { report: PracticalAssessmentReport }) {
  return (
    <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
      {(report.media_attachments ?? []).map((attachment) => (
        <EvidencePreview key={attachment.id} reportId={report.id} attachment={attachment} />
      ))}
    </div>
  );
}

function EvidencePreview({
  reportId,
  attachment,
}: {
  reportId: string;
  attachment: EvidenceAttachment;
}) {
  const [previewUrl, setPreviewUrl] = useState('');
  const [previewError, setPreviewError] = useState('');

  useEffect(() => {
    let cancelled = false;
    trainerPracticalAssessmentsAPI
      .getPracticalAssessmentMediaPreviewUrl(reportId, attachment.id)
      .then((url) => {
        if (!cancelled) setPreviewUrl(resolveApiUrl(url));
      })
      .catch((err) => {
        if (!cancelled) setPreviewError(err instanceof Error ? err.message : 'Preview unavailable');
      });
    return () => {
      cancelled = true;
    };
  }, [attachment.id, reportId]);

  const isPdf = attachment.file_name.toLowerCase().endsWith('.pdf');
  const isText = /\.(txt|rtf)$/i.test(attachment.file_name);

  return (
    <article className="overflow-hidden rounded-2xl border border-slate-800 bg-slate-900/80">
      <div className="flex min-h-44 items-center justify-center bg-slate-950/70">
        {!previewUrl && !previewError ? (
          <div className="h-7 w-7 animate-spin rounded-full border-2 border-slate-700 border-t-teal-300" />
        ) : previewError ? (
          <div className="px-5 text-center text-sm text-rose-300">{previewError}</div>
        ) : attachment.media_type === 'image' ? (
          <img src={previewUrl} alt={attachment.file_name} className="h-48 w-full object-cover" />
        ) : attachment.media_type === 'video' ? (
          <video src={previewUrl} controls preload="metadata" className="h-48 w-full bg-black object-contain">
            <track kind="captions" />
          </video>
        ) : attachment.media_type === 'audio' ? (
          <div className="w-full px-5 text-center">
            <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-rose-400/10 text-rose-300">
              <Mic size={24} />
            </div>
            <audio src={previewUrl} controls preload="metadata" className="w-full" />
          </div>
        ) : isPdf || isText ? (
          <iframe src={previewUrl} title={attachment.file_name} className="h-48 w-full bg-white" />
        ) : (
          <a href={previewUrl} target="_blank" rel="noreferrer" className="flex flex-col items-center px-5 text-center text-slate-300 hover:text-teal-200">
            <FileText size={34} className="text-teal-300" />
            <span className="mt-3 text-sm font-semibold">Open document preview</span>
            <span className="mt-1 text-xs text-slate-500">Opens using your browser’s document viewer</span>
          </a>
        )}
      </div>
      <div className="p-4">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="truncate text-sm font-bold text-slate-100">{attachment.file_name}</p>
            <p className="mt-1 text-xs text-slate-500">
              {attachment.file_size ? `${(attachment.file_size / 1024 / 1024).toFixed(2)} MB` : 'Size unavailable'}
              {' · '}
              {new Date(attachment.uploaded_at).toLocaleString()}
            </p>
          </div>
          <span className="rounded-full bg-slate-800 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider text-slate-400">
            {attachment.media_type}
          </span>
        </div>
        {previewUrl ? (
          <a href={previewUrl} target="_blank" rel="noreferrer" className="mt-3 inline-flex items-center gap-1 text-xs font-bold text-teal-300 hover:text-teal-200">
            Open full preview
            <ChevronRight size={13} />
          </a>
        ) : null}
      </div>
    </article>
  );
}

function OverviewStat({
  icon,
  label,
  value,
  tone,
}: {
  icon: ReactNode;
  label: string;
  value: string;
  tone: 'teal' | 'amber' | 'blue' | 'green';
}) {
  const tones = {
    teal: 'border-teal-400/20 bg-teal-400/10 text-teal-200',
    amber: 'border-amber-400/20 bg-amber-400/10 text-amber-200',
    blue: 'border-blue-400/20 bg-blue-400/10 text-blue-200',
    green: 'border-emerald-400/20 bg-emerald-400/10 text-emerald-200',
  };
  return (
    <div className="flex items-center gap-4 rounded-2xl border border-white/5 bg-white/[0.035] p-4 backdrop-blur-sm">
      <div className={`flex h-10 w-10 items-center justify-center rounded-xl border ${tones[tone]}`}>{icon}</div>
      <div>
        <p className="text-2xl font-black tracking-tight text-white">{value}</p>
        <p className="text-xs font-medium text-slate-500">{label}</p>
      </div>
    </div>
  );
}

function StatusPill({ status }: { status: PracticalAssessmentReport['status'] }) {
  const styles = {
    draft: 'border-amber-400/20 bg-amber-400/10 text-amber-200',
    complete: 'border-blue-400/20 bg-blue-400/10 text-blue-200',
    released: 'border-emerald-400/20 bg-emerald-400/10 text-emerald-200',
  };
  return (
    <span className={`shrink-0 rounded-full border px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider ${styles[status]}`}>
      {status}
    </span>
  );
}

function ReuseReportDialog({
  report,
  students,
  selectedStudentIds,
  search,
  saving,
  loading,
  onSearchChange,
  onToggleStudent,
  onSelectVisible,
  onClear,
  onConfirm,
  onClose,
}: {
  report: PracticalAssessmentReport;
  students: StudentOption[];
  selectedStudentIds: string[];
  search: string;
  saving: boolean;
  loading: boolean;
  onSearchChange: (value: string) => void;
  onToggleStudent: (studentId: string) => void;
  onSelectVisible: () => void;
  onClear: () => void;
  onConfirm: () => void;
  onClose: () => void;
}) {
  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center bg-slate-950/85 p-3 backdrop-blur-md sm:p-6"
      role="dialog"
      aria-modal="true"
      aria-label="Reuse practical assessment report"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget && !saving) onClose();
      }}
    >
      <div className="flex max-h-[90vh] w-full max-w-3xl flex-col overflow-hidden rounded-[2rem] border border-slate-700 bg-slate-900 shadow-2xl shadow-black/60">
        <div className="border-b border-slate-800 bg-[#0b1720] px-5 py-5 sm:px-6">
          <div className="flex items-start justify-between gap-4">
            <div>
              <div className="inline-flex items-center gap-2 text-xs font-bold uppercase tracking-[0.18em] text-teal-300">
                <Copy size={14} /> Reuse report build
              </div>
              <h2 className="mt-2 text-xl font-black text-white">Assign to other learners</h2>
              <p className="mt-1 text-sm text-slate-400">
                {report.unit_of_competency || 'Practical Assessment'} · built from {report.student_name ?? 'the selected learner'}
              </p>
            </div>
            <button type="button" onClick={onClose} disabled={saving} className="rounded-xl p-2 text-slate-500 hover:bg-slate-800 hover:text-white disabled:opacity-50">
              <X size={21} />
            </button>
          </div>
          <div className="mt-4 rounded-xl border border-amber-400/20 bg-amber-400/10 px-4 py-3 text-xs leading-5 text-amber-100">
            The report structure, prompts, rubrics, dates, and venue are copied. Learner scores, remarks, evidence, results, and release status start empty in a new draft.
            Learners who already hold this report are hidden, so nobody is assessed on the same template twice.
          </div>
        </div>

        <div className="border-b border-slate-800 p-4 sm:px-6">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
            <div className="relative flex-1">
              <Search size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
              <input
                value={search}
                onChange={(event) => onSearchChange(event.target.value)}
                placeholder="Search eligible learners"
                className="w-full rounded-xl border border-slate-700 bg-slate-950 py-3 pl-10 pr-3 text-sm text-slate-200 outline-none focus:border-teal-500"
              />
            </div>
            <div className="flex gap-2">
              <button type="button" onClick={onSelectVisible} className="rounded-xl border border-slate-700 px-3 py-2 text-xs font-semibold text-slate-300 hover:bg-slate-800">
                Select visible
              </button>
              <button type="button" onClick={onClear} className="rounded-xl border border-slate-700 px-3 py-2 text-xs font-semibold text-slate-400 hover:bg-slate-800">
                Clear
              </button>
            </div>
          </div>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto p-3 sm:p-4">
          {loading ? (
            <div className="flex min-h-48 items-center justify-center">
              <div className="h-9 w-9 animate-spin rounded-full border-b-2 border-teal-400" />
            </div>
          ) : students.length === 0 ? (
            <div className="flex min-h-48 flex-col items-center justify-center rounded-2xl border border-dashed border-slate-700 p-6 text-center">
              <Users size={28} className="text-slate-600" />
              <p className="mt-3 font-semibold text-slate-300">No eligible learner found</p>
              <p className="mt-1 text-sm text-slate-500">
                Learners must be assigned to the same unit and assessor, and must not already hold this report.
              </p>
            </div>
          ) : (
            <div className="grid gap-2 sm:grid-cols-2">
              {students.slice(0, 100).map((student) => {
                const selected = selectedStudentIds.includes(student.id);
                return (
                  <button
                    key={student.id}
                    type="button"
                    onClick={() => onToggleStudent(student.id)}
                    className={`flex items-center gap-3 rounded-2xl border p-3 text-left transition ${
                      selected
                        ? 'border-teal-400/40 bg-teal-400/10'
                        : 'border-slate-800 bg-slate-950/40 hover:border-slate-700 hover:bg-slate-800/70'
                    }`}
                  >
                    <span className={`flex h-5 w-5 shrink-0 items-center justify-center rounded border ${
                      selected ? 'border-teal-400 bg-teal-400 text-slate-950' : 'border-slate-600'
                    }`}>
                      {selected ? <CheckCircle2 size={14} /> : null}
                    </span>
                    <span className="min-w-0">
                      <span className="block truncate text-sm font-semibold text-slate-200">{student.name}</span>
                      <span className="block truncate text-xs text-slate-500">{student.student_id} · {student.email}</span>
                    </span>
                  </button>
                );
              })}
            </div>
          )}
        </div>

        <div className="flex flex-col gap-3 border-t border-slate-800 bg-slate-950/40 px-5 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-6">
          <p className="text-sm text-slate-400">
            <span className="font-bold text-teal-300">{selectedStudentIds.length}</span> learner{selectedStudentIds.length === 1 ? '' : 's'} selected
          </p>
          <div className="flex gap-2">
            <button type="button" onClick={onClose} disabled={saving} className="rounded-xl border border-slate-700 px-4 py-2.5 text-sm font-semibold text-slate-300 disabled:opacity-50">
              Cancel
            </button>
            <button
              type="button"
              onClick={onConfirm}
              disabled={saving || selectedStudentIds.length === 0}
              className="inline-flex items-center justify-center gap-2 rounded-xl bg-teal-400 px-5 py-2.5 text-sm font-black text-slate-950 transition hover:bg-teal-300 disabled:cursor-not-allowed disabled:opacity-50"
            >
              <Copy size={16} />
              {saving ? 'Creating drafts…' : 'Create learner drafts'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function AssessmentPreview({
  report,
  onClose,
  onEdit,
  onReuse,
}: {
  report: PracticalAssessmentReport;
  onClose: () => void;
  onEdit: () => void;
  onReuse: () => void;
}) {
  const sections = report.report_sections ?? [];
  const scoredSections = sections.filter((section) => section.type !== 'narrative');

  return (
    <div
      className="fixed inset-0 z-50 overflow-y-auto bg-slate-950/85 p-3 backdrop-blur-md sm:p-6"
      role="dialog"
      aria-modal="true"
      aria-label="Practical assessment preview"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div className="mx-auto max-w-5xl overflow-hidden rounded-[2rem] border border-slate-700 bg-slate-900 shadow-2xl shadow-black/60">
        <div className="sticky top-0 z-10 flex flex-col gap-4 border-b border-slate-800 bg-slate-900/95 px-5 py-4 backdrop-blur sm:flex-row sm:items-center sm:justify-between">
          <div className="flex min-w-0 items-center gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-teal-400/10 text-teal-300">
              <Eye size={20} />
            </div>
            <div className="min-w-0">
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-teal-300">Read-only preview</p>
              <h2 className="truncate text-lg font-bold text-white">{report.student_name ?? 'Practical assessment'}</h2>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onReuse}
              className="inline-flex items-center gap-2 rounded-xl border border-teal-500/30 bg-teal-500/10 px-3.5 py-2 text-sm font-semibold text-teal-200 transition hover:bg-teal-500/20"
            >
              <Copy size={16} />
              Reuse
            </button>
            <button
              type="button"
              onClick={() => window.print()}
              className="inline-flex items-center gap-2 rounded-xl border border-slate-700 px-3.5 py-2 text-sm font-semibold text-slate-300 transition hover:bg-slate-800"
            >
              <Printer size={16} />
              Print
            </button>
            <button
              type="button"
              onClick={onEdit}
              className="inline-flex items-center gap-2 rounded-xl bg-teal-400 px-4 py-2 text-sm font-bold text-slate-950 transition hover:bg-teal-300"
            >
              <Pencil size={16} />
              Edit assessment
            </button>
            <button type="button" onClick={onClose} aria-label="Close preview" className="rounded-xl p-2 text-slate-500 transition hover:bg-slate-800 hover:text-white">
              <X size={21} />
            </button>
          </div>
        </div>

        <div data-print-root className="bg-slate-950/35 p-4 sm:p-7">
          <div className="overflow-hidden rounded-3xl border border-slate-800 bg-slate-900">
            <div className="border-b border-slate-800 bg-[#0b1720] p-6 sm:p-8">
              <div className="flex flex-col gap-6 sm:flex-row sm:items-start sm:justify-between">
                <div>
                  {report.institution_name ? (
                    <p className="text-sm font-bold uppercase tracking-[0.15em] text-slate-200">
                      {report.institution_name}
                      {report.institution_location ? <span className="font-medium text-slate-500"> · {report.institution_location}</span> : null}
                    </p>
                  ) : null}
                  <h3 className="mt-3 max-w-2xl text-2xl font-black uppercase leading-tight text-white">
                    {report.unit_of_competency || 'Practical Assessment'}
                  </h3>
                  <p className="mt-2 text-sm text-slate-400">{report.qualification || 'Qualification not specified'}</p>
                  <p className="mt-1 text-xs font-semibold text-slate-500">{report.unit_code || 'Unit code not set'}</p>
                </div>
                <StatusPill status={report.status} />
              </div>
            </div>

            <div className="grid gap-px border-b border-slate-800 bg-slate-800 sm:grid-cols-2 lg:grid-cols-4">
              <PreviewFact label="Candidate" value={report.student_name ?? 'Unknown candidate'} sub={report.student_registration_number ?? undefined} />
              <PreviewFact label="Assessor" value={report.trainer_name ?? 'Not assigned'} sub={report.department_name ?? undefined} />
              <PreviewFact label="Assessment date" value={formatAssessmentDate(report.assessment_date)} sub={report.assessment_venue ?? undefined} />
              <PreviewFact
                label="Overall result"
                value={report.score_percentage == null ? 'Not scored' : `${report.score_percentage.toFixed(1)}%`}
                sub={report.competency_outcome ?? 'Incomplete'}
              />
            </div>

            <div className="space-y-5 p-5 sm:p-7">
              {(report.media_attachments ?? []).length > 0 ? (
                <section>
                  <div className="mb-3 flex items-center gap-2">
                    <Camera size={16} className="text-teal-300" />
                    <h4 className="font-bold text-slate-100">Published practical evidence</h4>
                  </div>
                  <EvidenceGallery report={report} />
                </section>
              ) : null}

              {sections.length === 0 ? (
                <div className="rounded-2xl border border-dashed border-slate-700 p-8 text-center text-sm text-slate-500">
                  This assessment does not have report sections yet.
                </div>
              ) : sections.map((section, sectionIndex) => (
                <section key={`${section.number}-${sectionIndex}`} className="overflow-hidden rounded-2xl border border-slate-800">
                  <div className="flex flex-col gap-2 bg-slate-800/50 px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
                    <div>
                      <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-teal-300">{section.type}</p>
                      <h4 className="mt-1 font-bold text-slate-100">{section.title || `Section ${sectionIndex + 1}`}</h4>
                    </div>
                    {section.duration_hours ? <span className="text-xs text-slate-500">{section.duration_hours} hours</span> : null}
                  </div>
                  <div className="p-5">
                    {section.description ? <p className="mb-3 text-sm leading-6 text-slate-400">{section.description}</p> : null}
                    {section.content ? <p className="whitespace-pre-wrap text-sm leading-6 text-slate-300">{section.content}</p> : null}
                    {section.items?.length ? (
                      <div className="overflow-x-auto">
                        <table className="min-w-full text-sm">
                          <thead className="text-left text-[10px] uppercase tracking-wider text-slate-500">
                            <tr>
                              <th className="pb-3 pr-4">Item / question</th>
                              <th className="pb-3 pr-4">Sub items / Rubrics / Assessor guide</th>
                              <th className="pb-3 text-right">Score</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-800">
                            {section.items.map((item) => (
                              <tr key={`${section.number}-${item.number}`}>
                                <td className="py-3 pr-4 align-top font-medium text-slate-200">
                                  {item.prompt || `Item ${item.number}`}
                                </td>
                                <td className="py-3 pr-4 align-top text-xs text-slate-500">
                                  {mergeSubItemsAndRubric(item.sub_items ?? undefined, item.expected_response)
                                    ? (
                                      <ul className="list-disc space-y-1 pl-4">
                                        {splitLines(mergeSubItemsAndRubric(item.sub_items ?? undefined, item.expected_response))
                                          .map((line, index) => <li key={`${line}-${index}`}>{line}</li>)}
                                      </ul>
                                    )
                                    : (item.remark || '—')}
                                </td>
                                <td className="whitespace-nowrap py-3 text-right align-top font-bold text-slate-200">
                                  {item.score == null ? '—' : item.score} / {item.max_score ?? (section.type === 'oral' ? 1 : 2)}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    ) : null}
                  </div>
                </section>
              ))}

              {scoredSections.length > 0 ? (
                <div className="flex flex-col gap-3 rounded-2xl border border-teal-500/20 bg-teal-500/5 p-5 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-wider text-teal-300">Assessment outcome</p>
                    <p className="mt-1 text-lg font-black text-white">{report.competency_outcome ?? 'INCOMPLETE'}</p>
                  </div>
                  <p className="text-2xl font-black text-teal-200">
                    {report.total_score == null ? '—' : report.total_score.toFixed(1)}
                    <span className="text-sm font-medium text-slate-500"> / {(report.total_max_score ?? 0).toFixed(1)}</span>
                  </p>
                </div>
              ) : null}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function PreviewFact({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="bg-slate-900 p-5">
      <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-slate-500">{label}</p>
      <p className="mt-2 truncate text-sm font-bold text-slate-100">{value}</p>
      {sub ? <p className="mt-1 truncate text-xs text-slate-500">{sub}</p> : null}
    </div>
  );
}
