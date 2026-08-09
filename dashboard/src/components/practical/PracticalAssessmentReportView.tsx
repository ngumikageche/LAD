import { forwardRef, useEffect, useState } from 'react';
import type { ForwardedRef } from 'react';
import { trainerPracticalAssessmentsAPI } from '../../api/trainer';
import type { PracticalAssessmentReport } from '../../api/trainer';
import { resolveApiUrl } from '../../api/client';
import {
  COMPETENCE_BANDS,
  COMPETENCE_PASS_MARK,
  competencePrintTone,
  ratingLabel,
} from '../../utils/competence';

/**
 * The single "Sub items / Rubrics / Assessor Guide" list for an item.
 *
 * Since the merge, saving writes the same text to `sub_items` and to
 * `expected_response`, so printing both would duplicate every line. Older
 * reports genuinely hold two different things, so those are concatenated.
 */
const mergedGuide = (item: { sub_items?: string[] | null; expected_response?: string | null }): string[] => {
  const lines = (item.sub_items ?? []).map((line) => String(line).trim()).filter(Boolean);
  const seen = new Set(lines);
  for (const line of (item.expected_response ?? '').split('\n').map((value) => value.trim()).filter(Boolean)) {
    if (!seen.has(line)) {
      lines.push(line);
      seen.add(line);
    }
  }
  return lines;
};

const outcomeClass = (outcome: string | null) => (
  competencePrintTone[(outcome ?? '').toUpperCase()] ?? competencePrintTone.INCOMPLETE
);

const formatDate = (value: string | null | undefined) => {
  if (!value) return 'Not set';
  return new Date(value).toLocaleDateString();
};

const formatDateTime = (value: string | null | undefined) => {
  if (!value) return 'Not set';
  return new Date(value).toLocaleString();
};

const formatFileSize = (value: number | null | undefined) => {
  if (!value) return 'Size unavailable';
  if (value < 1024 * 1024) return `${(value / 1024).toFixed(1)} KB`;
  return `${(value / (1024 * 1024)).toFixed(1)} MB`;
};

type Props = {
  report: PracticalAssessmentReport;
  studentName?: string | null;
  studentRegistration?: string | null;
  trainerName?: string | null;
  institutionLocation?: string | null;
};

const PracticalAssessmentReportView = forwardRef(function PracticalAssessmentReportView(
  {
    report,
    studentName,
    studentRegistration,
    trainerName,
    institutionLocation,
  }: Props,
  ref: ForwardedRef<HTMLDivElement>,
) {
  const sections = (report.report_sections?.length ? report.report_sections : []).filter((section) => (
    section.type === 'narrative'
      ? Boolean(section.content || section.description)
      : section.items.length > 0
  ));
  const narrativeSections = sections.filter((section) => section.type === 'narrative');
  const sessionSections = sections.filter((section) => section.type === 'session' || section.type === 'checklist');
  const oralSections = sections.filter((section) => section.type === 'oral');
  const totalMax = report.total_max_score ?? 0;
  const mediaAttachments = report.media_attachments ?? [];
  const location = institutionLocation ?? report.institution_location ?? null;
  const ratingBands = report.competence_rating_scale?.length ? report.competence_rating_scale : COMPETENCE_BANDS;
  const passMark = report.competence_pass_mark ?? COMPETENCE_PASS_MARK;

  return (
    <div
      ref={ref}
      className="mx-auto w-full max-w-5xl bg-white p-8 text-slate-900 shadow-xl print:max-w-none print:p-0 print:shadow-none"
    >
      <div className="border border-slate-300 p-6 print:border-0">
        <div className="text-center">
          {report.institution_name ? (
            <h1 className="text-xl font-bold uppercase tracking-wide">{report.institution_name}</h1>
          ) : null}
          {location ? (
            <p className="mt-1 text-xs uppercase tracking-[0.2em] text-slate-600">{location}</p>
          ) : null}
          {report.department_name ? (
            <p className="mt-1 text-sm font-medium uppercase">{report.department_name}</p>
          ) : null}
          <p className="mt-4 text-sm font-semibold uppercase tracking-[0.2em]">{report.qualification}</p>
          <p className="mt-1 text-sm font-medium uppercase">{report.unit_code}</p>
          <h2 className="mt-3 text-2xl font-bold uppercase">{report.unit_of_competency}</h2>
          <p className="mt-2 text-sm">{report.period}</p>
          <p className="mt-4 text-sm font-semibold uppercase">{report.awarding_body}</p>
        </div>

        {narrativeSections.length > 0 ? (
          <div className="mt-6 space-y-4 border-t border-slate-300 pt-4">
            {narrativeSections.map((section, index) => (
              <div key={`${section.title ?? 'narrative'}-${index}`}>
                <h2 className="text-base font-bold uppercase">{section.title ?? `Section ${index + 1}`}</h2>
                {section.description ? (
                  <p className="mt-1 whitespace-pre-wrap text-sm">{section.description}</p>
                ) : null}
                {section.content ? (
                  <p className="mt-2 whitespace-pre-wrap text-sm leading-6">{section.content}</p>
                ) : null}
              </div>
            ))}
          </div>
        ) : null}

        <div className="mt-6 border-t border-slate-300 pt-4">
          <h2 className="text-base font-bold uppercase">Candidate &amp; Assessor Details</h2>
          <div className="mt-3 grid gap-3 md:grid-cols-2">
            <Detail label="Candidate Name" value={studentName ?? report.student_name ?? 'Unknown student'} />
            <Detail label="CDACC Reg. No." value={studentRegistration ?? report.student_registration_number ?? 'Not set'} />
            <Detail label="Assessor Name" value={trainerName ?? report.trainer_name ?? 'Unknown trainer'} />
            <Detail label="Assessment Venue" value={report.assessment_venue ?? institutionLocation ?? report.department_name} />
          </div>
        </div>

        {sessionSections.map((section, sectionIndex) => {
          const sectionTotal = section.items.reduce((sum, item) => sum + (item.score ?? 0), 0);
          const sectionMax = section.items.reduce((sum, item) => sum + (item.max_score ?? 25), 0);
          return (
            <div key={`${section.title ?? 'session'}-${sectionIndex}`} className="mt-8 border-t border-slate-300 pt-5">
              <div className="flex flex-col gap-2 md:flex-row md:items-end md:justify-between">
                <div>
                  <h2 className="text-base font-bold uppercase">
                    Session {sectionIndex + 1}
                    {section.duration_hours ? ` (${section.duration_hours} Hours)` : ''}
                    {section.title ? `: ${section.title}` : ''}
                  </h2>
                  {section.description ? <p className="mt-1 text-sm">{section.description}</p> : null}
                </div>
                <div className="grid gap-1 text-sm">
                  <span><strong>Assessment Date:</strong> {formatDate(section.assessment_date ?? report.assessment_date)}</span>
                  <span><strong>Assessment Venue:</strong> {section.assessment_venue ?? report.assessment_venue ?? 'Not set'}</span>
                </div>
              </div>

              <div className="mt-4 overflow-hidden border border-slate-300">
                <table className="w-full border-collapse text-sm">
                  <thead className="bg-slate-100">
                    <tr>
                      <th className="border border-slate-300 px-3 py-2 text-left font-semibold">No.</th>
                      <th className="border border-slate-300 px-3 py-2 text-left font-semibold">Items of Evaluation</th>
                      <th className="border border-slate-300 px-3 py-2 text-left font-semibold">Max Marks</th>
                      <th className="border border-slate-300 px-3 py-2 text-left font-semibold">Awarded</th>
                    </tr>
                  </thead>
                  <tbody>
                    {section.items.map((item) => (
                      <tr key={`${item.prompt ?? 'item'}-${item.number}`}>
                        <td className="border border-slate-300 px-3 py-2 align-top">{item.number}</td>
                        <td className="border border-slate-300 px-3 py-2 align-top">
                          <div className="font-medium">{item.prompt ?? ''}</div>
                          {mergedGuide(item).length ? (
                            <ul className="mt-1 list-disc pl-5">
                              {mergedGuide(item).map((line, lineIndex) => (
                                <li key={`${line}-${lineIndex}`}>{line}</li>
                              ))}
                            </ul>
                          ) : null}
                          {item.remark ? (
                            <p className="mt-2 text-xs text-slate-600"><strong>Remark:</strong> {item.remark}</p>
                          ) : null}
                        </td>
                        <td className="border border-slate-300 px-3 py-2 align-top">{(item.max_score ?? 25).toFixed(1)}</td>
                        <td className="border border-slate-300 px-3 py-2 align-top">{item.score == null ? '' : item.score.toFixed(1)}</td>
                      </tr>
                    ))}
                    <tr className="bg-slate-50 font-semibold">
                      <td colSpan={2} className="border border-slate-300 px-3 py-2">TOTAL</td>
                      <td className="border border-slate-300 px-3 py-2">{sectionMax.toFixed(1)}</td>
                      <td className="border border-slate-300 px-3 py-2">{sectionTotal.toFixed(1)}</td>
                    </tr>
                  </tbody>
                </table>
              </div>

              {section.note ? (
                <p className="mt-3 text-sm"><strong>NB:</strong> {section.note}</p>
              ) : null}
            </div>
          );
        })}

        {oralSections.map((section, index) => {
          const oralTotal = section.items.reduce((sum, item) => sum + (item.score ?? 0), 0);
          const oralMax = section.items.reduce((sum, item) => sum + (item.max_score ?? 1), 0);
          return (
            <div key={`${section.title ?? 'oral'}-${index}`} className="mt-8 border-t border-slate-300 pt-5">
              <h2 className="text-base font-bold uppercase">{section.title ?? 'Oral Assessment'} ({oralMax.toFixed(0)} Marks)</h2>
              {section.description ? <p className="mt-1 text-sm">{section.description}</p> : null}
              <div className="mt-4 overflow-hidden border border-slate-300">
                <table className="w-full border-collapse text-sm">
                  <thead className="bg-slate-100">
                    <tr>
                      <th className="border border-slate-300 px-3 py-2 text-left font-semibold">Q#</th>
                      <th className="border border-slate-300 px-3 py-2 text-left font-semibold">Question</th>
                      <th className="border border-slate-300 px-3 py-2 text-left font-semibold">Sub items / Rubrics / Assessor Guide</th>
                      <th className="border border-slate-300 px-3 py-2 text-left font-semibold">Max Marks</th>
                      <th className="border border-slate-300 px-3 py-2 text-left font-semibold">Awarded</th>
                    </tr>
                  </thead>
                  <tbody>
                    {section.items.map((item) => (
                      <tr key={`${item.prompt ?? 'oral'}-${item.number}`}>
                        <td className="border border-slate-300 px-3 py-2 align-top">{item.number}</td>
                        <td className="border border-slate-300 px-3 py-2 align-top">{item.prompt ?? `Question ${item.number}`}</td>
                        <td className="border border-slate-300 px-3 py-2 align-top">
                          {mergedGuide(item).length
                            ? <ul className="list-disc pl-5">{mergedGuide(item).map((line, lineIndex) => <li key={`${line}-${lineIndex}`}>{line}</li>)}</ul>
                            : 'Not recorded'}
                        </td>
                        <td className="border border-slate-300 px-3 py-2 align-top">{(item.max_score ?? 1).toFixed(1)}</td>
                        <td className="border border-slate-300 px-3 py-2 align-top">{item.score == null ? '' : item.score.toFixed(1)}</td>
                      </tr>
                    ))}
                    <tr className="bg-slate-50 font-semibold">
                      <td colSpan={3} className="border border-slate-300 px-3 py-2">TOTAL</td>
                      <td className="border border-slate-300 px-3 py-2">{oralMax.toFixed(1)}</td>
                      <td className="border border-slate-300 px-3 py-2">{oralTotal.toFixed(1)}</td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>
          );
        })}

        <div className="mt-8 border-t border-slate-300 pt-5">
          <h2 className="text-base font-bold uppercase">Summary of Assessment</h2>
          <div className="mt-4 overflow-hidden border border-slate-300">
            <table className="w-full border-collapse text-sm">
              <thead className="bg-slate-100">
                <tr>
                  <th className="border border-slate-300 px-3 py-2 text-left font-semibold">Section</th>
                  <th className="border border-slate-300 px-3 py-2 text-left font-semibold">Total Marks</th>
                  <th className="border border-slate-300 px-3 py-2 text-left font-semibold">Marks Awarded</th>
                </tr>
              </thead>
              <tbody>
                {sessionSections.map((section, index) => (
                  <tr key={`${section.title ?? 'summary-session'}-${index}`}>
                    <td className="border border-slate-300 px-3 py-2">{section.title ?? `Assessment ${index + 1}`}</td>
                    <td className="border border-slate-300 px-3 py-2">
                      {section.items.reduce((sum, item) => sum + (item.max_score ?? 25), 0).toFixed(1)}
                    </td>
                    <td className="border border-slate-300 px-3 py-2">
                      {section.items.reduce((sum, item) => sum + (item.score ?? 0), 0).toFixed(1)}
                    </td>
                  </tr>
                ))}
                {oralSections.map((section, index) => (
                  <tr key={`${section.title ?? 'summary-oral'}-${index}`}>
                    <td className="border border-slate-300 px-3 py-2">{section.title ?? 'Oral Assessment'}</td>
                    <td className="border border-slate-300 px-3 py-2">
                      {section.items.reduce((sum, item) => sum + (item.max_score ?? 1), 0).toFixed(1)}
                    </td>
                    <td className="border border-slate-300 px-3 py-2">
                      {section.items.reduce((sum, item) => sum + (item.score ?? 0), 0).toFixed(1)}
                    </td>
                  </tr>
                ))}
                <tr className="bg-slate-50 font-semibold">
                  <td className="border border-slate-300 px-3 py-2">TOTAL</td>
                  <td className="border border-slate-300 px-3 py-2">{totalMax.toFixed(1)}</td>
                  <td className="border border-slate-300 px-3 py-2">{report.total_score == null ? '--' : report.total_score.toFixed(1)}</td>
                </tr>
              </tbody>
            </table>
          </div>

          <div className="mt-5 grid gap-4 md:grid-cols-2">
            <div>
              <p className="text-sm font-semibold uppercase">Competence Rating</p>
              <div className={`mt-2 inline-flex rounded border px-4 py-2 text-sm font-semibold ${outcomeClass(report.competency_outcome)}`}>
                {report.competency_outcome ?? 'INCOMPLETE'}
              </div>
              <p className="mt-2 text-sm">
                The candidate is competent if the candidate obtains at least {passMark}%.
              </p>
            </div>
            <div className="text-sm">
              <p><strong>Percentage:</strong> {report.score_percentage == null ? 'Incomplete' : `${report.score_percentage.toFixed(1)}%`}</p>
              <p className="mt-2"><strong>Released By:</strong> {report.released_by_name ?? 'Not released'}</p>
              <p className="mt-2"><strong>Generated:</strong> {formatDateTime(report.created_at)}</p>
            </div>
          </div>

          <div className="mt-6">
            <p className="text-sm font-semibold uppercase">Competence Rating Scale</p>
            <div className="mt-3 overflow-hidden border border-slate-300 md:max-w-md">
              <table className="w-full border-collapse text-sm">
                <thead className="bg-slate-100">
                  <tr>
                    <th className="border border-slate-300 px-3 py-2 text-left font-semibold">Marks (%)</th>
                    <th className="border border-slate-300 px-3 py-2 text-left font-semibold">Competence Rating</th>
                  </tr>
                </thead>
                <tbody>
                  {ratingBands.map((band) => {
                    const isAwarded = (report.competency_outcome ?? '').toUpperCase() === band.rating;
                    return (
                      <tr key={band.rating} className={isAwarded ? 'bg-slate-50 font-semibold' : undefined}>
                        <td className="border border-slate-300 px-3 py-2">{band.min}–{band.max}</td>
                        <td className="border border-slate-300 px-3 py-2">
                          {ratingLabel(band.rating)}
                          {band.short_label && band.short_label.toLowerCase() !== band.rating.toLowerCase()
                            ? ` (${band.short_label})`
                            : ''}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </div>

        {mediaAttachments.length > 0 ? (
          <div className="mt-8 border-t border-slate-300 pt-5">
            <h2 className="text-base font-bold uppercase">Captured Practical Evidence</h2>
            <div className="mt-4 grid gap-4 md:grid-cols-2">
              {mediaAttachments.map((attachment) => (
                <PublishedEvidencePreview
                  key={attachment.id}
                  reportId={report.id}
                  attachment={attachment}
                />
              ))}
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
});

function Detail({ label, value }: { label: string; value: string }) {
  return (
    <p className="text-sm">
      <strong>{label}:</strong> {value}
    </p>
  );
}

type EvidenceAttachment = NonNullable<PracticalAssessmentReport['media_attachments']>[number];

function PublishedEvidencePreview({
  reportId,
  attachment,
}: {
  reportId: string;
  attachment: EvidenceAttachment;
}) {
  const [previewUrl, setPreviewUrl] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelled = false;
    trainerPracticalAssessmentsAPI
      .getPracticalAssessmentMediaPreviewUrl(reportId, attachment.id)
      .then((url) => {
        if (!cancelled) setPreviewUrl(resolveApiUrl(url));
      })
      .catch((err) => {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Preview unavailable');
      });
    return () => {
      cancelled = true;
    };
  }, [attachment.id, reportId]);

  const isPdf = attachment.file_name.toLowerCase().endsWith('.pdf');
  const isText = /\.(txt|rtf)$/i.test(attachment.file_name);

  return (
    <div className="overflow-hidden rounded border border-slate-300">
      <div className="flex min-h-40 items-center justify-center bg-slate-100">
        {!previewUrl && !error ? (
          <span className="text-sm text-slate-500">Loading preview…</span>
        ) : error ? (
          <span className="px-4 text-center text-sm text-red-600">{error}</span>
        ) : attachment.media_type === 'image' ? (
          <img src={previewUrl} alt={attachment.file_name} className="h-48 w-full object-contain" />
        ) : attachment.media_type === 'video' ? (
          <video src={previewUrl} controls preload="metadata" className="h-48 w-full bg-black object-contain">
            <track kind="captions" />
          </video>
        ) : attachment.media_type === 'audio' ? (
          <audio src={previewUrl} controls preload="metadata" className="w-[90%]" />
        ) : isPdf || isText ? (
          <iframe src={previewUrl} title={attachment.file_name} className="h-48 w-full bg-white" />
        ) : (
          <a href={previewUrl} target="_blank" rel="noreferrer" className="px-5 text-center text-sm font-semibold text-blue-700 underline">
            Preview this document in your browser
          </a>
        )}
      </div>
      <div className="p-3">
        <div className="flex items-center justify-between gap-3">
          <p className="truncate text-sm font-semibold">{attachment.file_name}</p>
          <span className="text-xs uppercase text-slate-500">{attachment.media_type}</span>
        </div>
        <p className="mt-1 text-xs text-slate-500">
          {formatFileSize(attachment.file_size)} • {formatDateTime(attachment.uploaded_at)}
        </p>
        {previewUrl ? (
          <a href={previewUrl} target="_blank" rel="noreferrer" className="mt-3 inline-flex text-sm font-medium text-blue-700 underline">
            Open full preview
          </a>
        ) : null}
      </div>
    </div>
  );
}

export default PracticalAssessmentReportView;
