/** Infer target seniority band from job title + description for discovery and scoring. */

export interface SeniorityBand {
  /** Human-readable band for Exa queries and AI scoring, e.g. "mid-level individual contributor". */
  level: string;
  /** LinkedIn title tokens that indicate overqualification for this band. */
  exclude: string[];
}

const EXECUTIVE_TERMS = ['Chief', 'CEO', 'CTO', 'CPO', 'EVP', 'SVP', 'VP', 'Vice President'];
const DIRECTOR_TERMS = ['Director', 'Head of', 'Group Product', 'General Manager'];
const PRINCIPAL_TERMS = ['Principal', 'Staff', 'Distinguished', 'Fellow'];
const LEAD_TERMS = ['Lead', 'Team Lead'];
const SENIOR_TERMS = ['Senior', 'Sr.'];
const JUNIOR_TERMS = ['Junior', 'Associate', 'Entry', 'Intern', 'Graduate'];

function titleMatches(title: string, terms: string[]): boolean {
  const t = title.toLowerCase();
  return terms.some((term) => t.includes(term.toLowerCase()));
}

/** Heuristic seniority band when AI extraction is missing or vague. */
export function inferSeniorityBand(jobTitle: string, jobDescription = ''): SeniorityBand {
  const title = jobTitle.trim();
  const desc = jobDescription.toLowerCase();

  if (titleMatches(title, EXECUTIVE_TERMS)) {
    return { level: 'executive leadership (C-suite or VP)', exclude: [] };
  }
  if (titleMatches(title, DIRECTOR_TERMS)) {
    return { level: 'director or head-of level', exclude: ['VP', 'Chief', 'CPO'] };
  }
  if (titleMatches(title, PRINCIPAL_TERMS)) {
    return { level: 'principal or staff individual contributor', exclude: ['Director', 'VP', 'Head of'] };
  }
  if (titleMatches(title, LEAD_TERMS)) {
    return {
      level: 'team lead or people-management level',
      exclude: ['Director', 'VP', 'Principal', 'Head of', 'Group'],
    };
  }
  if (titleMatches(title, SENIOR_TERMS)) {
    return {
      level: 'senior individual contributor',
      exclude: ['Director', 'VP', 'Principal', 'Head of', 'Group Product', 'Chief'],
    };
  }
  if (titleMatches(title, JUNIOR_TERMS)) {
    return {
      level: 'junior or entry-level',
      exclude: ['Senior', 'Principal', 'Director', 'VP', 'Lead', 'Head of', 'Group'],
    };
  }

  const yearsRequired = desc.match(/(\d+)\s*(?:\+?\s*(?:to|-)\s*(\d+))?\s*years?(?:\s+of)?\s+experience/i);
  const minYears = yearsRequired ? Number.parseInt(yearsRequired[1], 10) : null;

  if (minYears != null && minYears <= 2) {
    return {
      level: 'early-career (0–3 years experience)',
      exclude: ['Senior', 'Principal', 'Director', 'VP', 'Lead', 'Head of', 'Group'],
    };
  }
  if (minYears != null && minYears >= 10) {
    return {
      level: 'experienced senior professional (10+ years)',
      exclude: ['Intern', 'Junior', 'Associate', 'Graduate'],
    };
  }

  // Plain "Product Manager", "Analyst", etc. — mid-level IC unless JD says otherwise
  if (/\b(manager|analyst|specialist|coordinator|consultant|engineer|designer)\b/i.test(title)) {
    return {
      level: 'mid-level individual contributor',
      exclude: ['Principal', 'Director', 'VP', 'Group Product', 'Head of', 'Senior Director', 'Chief'],
    };
  }

  return {
    level: 'matching the stated job level in the posting',
    exclude: ['Principal', 'Director', 'VP', 'Head of'],
  };
}

function normalizeTerms(terms: unknown): string[] {
  if (!Array.isArray(terms)) return [];
  return [...new Set(terms.map((t) => (typeof t === 'string' ? t.trim() : '')).filter(Boolean))].slice(0, 8);
}

export function mergeSeniorityBand(
  aiLevel: string | undefined,
  aiExclude: unknown,
  jobTitle: string,
  jobDescription: string,
): SeniorityBand {
  const fallback = inferSeniorityBand(jobTitle, jobDescription);
  const level =
    typeof aiLevel === 'string' && aiLevel.trim().length > 3 ? aiLevel.trim() : fallback.level;
  const exclude = normalizeTerms(aiExclude);
  return {
    level,
    exclude: exclude.length > 0 ? exclude : fallback.exclude,
  };
}

/** Cap AI stars when candidate title clearly exceeds the target band. */
export function capStarsForSeniorityMismatch(
  stars: number,
  jobTitle: string,
  candidateTitle: string | null | undefined,
  band: SeniorityBand,
): number {
  if (!candidateTitle?.trim()) return stars;

  const ct = candidateTitle.toLowerCase();
  for (const term of band.exclude) {
    if (ct.includes(term.toLowerCase())) {
      return Math.min(stars, 3);
    }
  }

  const jobBand = inferSeniorityBand(jobTitle);
  if (jobBand.level.includes('mid-level') || jobBand.level.includes('early-career')) {
    if (/\b(principal|director|group product|vp|head of|chief|senior director)\b/i.test(ct)) {
      return Math.min(stars, 3);
    }
  }

  return stars;
}
