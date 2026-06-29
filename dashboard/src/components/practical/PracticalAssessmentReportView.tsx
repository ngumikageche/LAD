import { forwardRef } from 'react';
import type { ForwardedRef } from 'react';
import type { PracticalAssessmentReport } from '../../api/trainer';

const outcomeClass = (outcome: string | null) => {
  switch ((outcome ?? '').toUpperCase()) {
    case 'COMPETENT':
      return 'border-green-700 bg-green-50 text-green-800';
    case 'BORDERLINE':
      return 'border-amber-700 bg-amber-50 text-amber-800';
    case 'NOT YET COMPETENT':
      return 'border-red-700 bg-red-50 text-red-800';
    default:
      return 'border-slate-400 bg-slate-100 text-slate-700';
  }
};

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

  return (
    <div
      ref={ref}
      className="mx-auto w-full max-w-5xl bg-white p-8 text-slate-900 shadow-xl print:max-w-none print:p-0 print:shadow-none"
    >
      <div className="border border-slate-300 p-6 print:border-0">
        <div className="text-center">
          <p className="text-sm font-semibold uppercase tracking-[0.2em]">{report.qualification}</p>
          <p className="mt-1 text-sm font-medium uppercase">{report.unit_code}</p>
          <h1 className="mt-3 text-2xl font-bold uppercase">{report.unit_of_competency}</h1>
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
                          {item.sub_items?.length ? (
                            <ul className="mt-1 list-disc pl-5">
                              {item.sub_items.map((subItem, subIndex) => (
                                <li key={`${subItem}-${subIndex}`}>{subItem}</li>
                              ))}
                            </ul>
                          ) : null}
                          {item.expected_response ? (
                            <p className="mt-2 text-xs text-slate-600"><strong>Expected:</strong> {item.expected_response}</p>
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
                      <th className="border border-slate-300 px-3 py-2 text-left font-semibold">Expected Key Points</th>
                      <th className="border border-slate-300 px-3 py-2 text-left font-semibold">Max Marks</th>
                      <th className="border border-slate-300 px-3 py-2 text-left font-semibold">Awarded</th>
                    </tr>
                  </thead>
                  <tbody>
                    {section.items.map((item) => (
                      <tr key={`${item.prompt ?? 'oral'}-${item.number}`}>
                        <td className="border border-slate-300 px-3 py-2 align-top">{item.number}</td>
                        <td className="border border-slate-300 px-3 py-2 align-top">{item.prompt ?? `Question ${item.number}`}</td>
                        <td className="border border-slate-300 px-3 py-2 align-top">{item.expected_response ?? 'Not recorded'}</td>
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
              <p className="text-sm font-semibold uppercase">Assessment Outcome</p>
              <div className={`mt-2 inline-flex rounded border px-4 py-2 text-sm font-semibold ${outcomeClass(report.competency_outcome)}`}>
                {report.competency_outcome ?? 'INCOMPLETE'}
              </div>
              <p className="mt-2 text-sm">The candidate is competent if the candidate obtains at least 50%.</p>
            </div>
            <div className="text-sm">
              <p><strong>Percentage:</strong> {report.score_percentage == null ? 'Incomplete' : `${report.score_percentage.toFixed(1)}%`}</p>
              <p className="mt-2"><strong>Released By:</strong> {report.released_by_name ?? 'Not released'}</p>
              <p className="mt-2"><strong>Generated:</strong> {formatDateTime(report.created_at)}</p>
            </div>
          </div>
        </div>

        {mediaAttachments.length > 0 ? (
          <div className="mt-8 border-t border-slate-300 pt-5">
            <h2 className="text-base font-bold uppercase">Captured Practical Evidence</h2>
            <div className="mt-4 grid gap-4 md:grid-cols-2">
              {mediaAttachments.map((attachment) => (
                <div key={attachment.id} className="rounded border border-slate-300 p-3">
                  <div className="flex items-center justify-between gap-3">
                    <p className="truncate text-sm font-semibold">{attachment.file_name}</p>
                    <span className="text-xs uppercase text-slate-500">{attachment.media_type}</span>
                  </div>
                  <p className="mt-1 text-xs text-slate-500">
                    {formatFileSize(attachment.file_size)} • {formatDateTime(attachment.uploaded_at)}
                  </p>
                  <a href={attachment.file_url} target="_blank" rel="noreferrer" className="mt-3 inline-flex text-sm font-medium text-blue-700 underline">
                    Open evidence
                  </a>
                </div>
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

export default PracticalAssessmentReportView;
