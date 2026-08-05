/**
 * Competence rating bands — the single source of truth for the dashboard.
 * Mirrors PracticalAssessmentReport.COMPETENCE_BANDS on the backend.
 */

export type CompetenceBand = {
  min: number;
  max: number;
  rating: string;
  short_label: string;
};

export const COMPETENCE_PASS_MARK = 50;

export const COMPETENCE_BANDS: CompetenceBand[] = [
  { min: 80, max: 100, rating: 'ATTAINED MASTERY', short_label: 'Mastery' },
  { min: 65, max: 79, rating: 'PROFICIENT', short_label: 'Proficiency' },
  { min: 50, max: 64, rating: 'COMPETENT', short_label: 'Competent' },
  { min: 0, max: 49, rating: 'NOT YET COMPETENT', short_label: 'NYC' },
];

export const INCOMPLETE_OUTCOME = 'INCOMPLETE';

/** Every rating from the 50% pass mark upwards. */
export const COMPETENT_RATINGS = ['ATTAINED MASTERY', 'PROFICIENT', 'COMPETENT'];

/** Competence rating for a mark expressed as a percentage. */
export const ratingFor = (percentage: number | null | undefined): string => {
  if (percentage == null) return INCOMPLETE_OUTCOME;
  const band = COMPETENCE_BANDS.find((entry) => percentage >= entry.min);
  return (band ?? COMPETENCE_BANDS[COMPETENCE_BANDS.length - 1]).rating;
};

export const isCompetent = (outcome: string | null | undefined): boolean =>
  COMPETENT_RATINGS.includes((outcome ?? '').toUpperCase());

/** Title-case label for a rating, e.g. "Attained Mastery". */
export const ratingLabel = (outcome: string | null | undefined): string => {
  const value = (outcome ?? INCOMPLETE_OUTCOME).trim() || INCOMPLETE_OUTCOME;
  return value
    .toLowerCase()
    .split(' ')
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
};

/**
 * Badge colours per rating. 'BORDERLINE' is a retired rating kept here so
 * reports saved before the four-band scale still render with a colour.
 */
export const competenceTone: Record<string, string> = {
  'ATTAINED MASTERY': 'border-teal-400/30 bg-teal-400/10 text-teal-200',
  PROFICIENT: 'border-emerald-400/30 bg-emerald-400/10 text-emerald-200',
  COMPETENT: 'border-cyan-400/30 bg-cyan-400/10 text-cyan-200',
  BORDERLINE: 'border-amber-400/30 bg-amber-400/10 text-amber-200',
  'NOT YET COMPETENT': 'border-rose-400/30 bg-rose-400/10 text-rose-200',
  INCOMPLETE: 'border-slate-500/30 bg-slate-500/10 text-slate-300',
};

/** Print-friendly (light background) colours for the same ratings. */
export const competencePrintTone: Record<string, string> = {
  'ATTAINED MASTERY': 'border-teal-700 bg-teal-50 text-teal-800',
  PROFICIENT: 'border-green-700 bg-green-50 text-green-800',
  COMPETENT: 'border-blue-700 bg-blue-50 text-blue-800',
  BORDERLINE: 'border-amber-700 bg-amber-50 text-amber-800',
  'NOT YET COMPETENT': 'border-red-700 bg-red-50 text-red-800',
  INCOMPLETE: 'border-slate-400 bg-slate-100 text-slate-700',
};

/** Chart/legend fill per rating, in the order the bands are reported. */
export const competenceChartColor: Record<string, string> = {
  'ATTAINED MASTERY': 'bg-teal-400',
  PROFICIENT: 'bg-emerald-400',
  COMPETENT: 'bg-cyan-400',
  BORDERLINE: 'bg-amber-400',
  'NOT YET COMPETENT': 'bg-rose-400',
  INCOMPLETE: 'bg-slate-400',
};
