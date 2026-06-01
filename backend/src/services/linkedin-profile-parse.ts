/** Parse LinkedIn page titles and Exa highlight text into structured profile fields. */

const JOB_TITLE_HINT =
  /\b(manager|director|head|lead|specialist|analyst|officer|consultant|engineer|partner|coordinator|associate|executive|supervisor|advisor|president|vp|chief|deputy|assistant|intern|recruiter|hr|human resources|compensation|reward|performance|talent|people|total rewards)\b/i;

export function stripLinkedInPageTitleSuffix(title: string): string {
  return title.replace(/\s*[|\-–—]\s*LinkedIn.*$/i, '').trim();
}

export function nameFromPageTitle(title: string): string | undefined {
  const withoutLinkedIn = stripLinkedInPageTitleSuffix(title);
  const namePart = withoutLinkedIn.split(/\s[-–—]\s/)[0]?.trim();
  if (namePart && namePart.length >= 2 && namePart.length <= 80 && !/@/.test(namePart)) return namePart;
  return undefined;
}

export function headlineFromPageTitle(title: string): string | undefined {
  const withoutLinkedIn = stripLinkedInPageTitleSuffix(title);
  const parts = withoutLinkedIn.split(/\s[-–—]\s/);
  if (parts.length < 2) return undefined;
  const headline = parts.slice(1).join(' — ').trim();
  return headline || undefined;
}

export function sanitizeRoleTitle(value: string | undefined): string | undefined {
  if (!value?.trim()) return undefined;
  let role = value.replace(/\s+/g, ' ').trim();

  // Strip leading highlight fragments (e.g. "... rewards structure Assistant Manager")
  role = role.replace(/^[^A-Z]*(?=[A-Z])/, '');

  if (role.length < 4 || role.length > 90) return undefined;
  if (/@|email address|linkedin\.com|https?:\/\//i.test(role)) return undefined;
  if (/^[^A-Z]/.test(role)) return undefined;
  if (/^(and|or|the|at|in|of|sation|tion|ment|t management)\b/i.test(role)) return undefined;

  const words = role.split(/\s+/);
  if (words.length < 2 && !JOB_TITLE_HINT.test(role)) return undefined;

  return role;
}

export function sanitizeCompany(value: string | undefined): string | undefined {
  if (!value?.trim()) return undefined;
  const company = value.replace(/\s+/g, ' ').trim();
  if (company.length < 2 || company.length > 70) return undefined;
  if (/@|linkedin|experience|education|full-time|part-time|present/i.test(company)) return undefined;
  return company;
}

export function parseTitleAtCompany(text: string): { role?: string; company?: string } {
  const match = text.match(
    /([A-Z][^(\n|·]{3,85}?)\s+at\s+([A-Z][^(\n,|·(]{2,60}?)(?:\s*\(Current\)|\s*\(Past\)|\s*·|\s*\||\s*$)/i,
  );
  if (!match) return {};
  return {
    role: sanitizeRoleTitle(match[1]),
    company: sanitizeCompany(match[2]),
  };
}

/** Collect role/company candidates from Exa/LinkedIn highlight blobs; prefer (Current) roles. */
export function extractRoleCompanyFromText(text: string): { role?: string; company?: string } {
  const cleaned = cleanHighlightText(text);
  if (!cleaned) return {};

  type Candidate = { role: string; company: string; score: number };
  const candidates: Candidate[] = [];

  const add = (role: string | undefined, company: string | undefined, score: number) => {
    const r = sanitizeRoleTitle(role);
    const c = sanitizeCompany(company);
    if (r && c) candidates.push({ role: r, company: c, score });
    else if (r && score >= 80) candidates.push({ role: r, company: c ?? '', score: score - 20 });
  };

  const currentPattern =
    /([A-Z][^(\n]{3,90}?)\s+at\s+([A-Z][^(\n,|·(]{2,65}?)\s*\(Current\)/gi;
  let match: RegExpExecArray | null;
  while ((match = currentPattern.exec(cleaned)) !== null) {
    add(match[1], match[2], 100);
  }

  const experienceCurrent =
    /Experience[^]*?([A-Z][^(\n]{3,90}?)\s+at\s+([A-Z][^(\n,|·(]{2,65}?)\s*\(Current\)/gi;
  while ((match = experienceCurrent.exec(cleaned)) !== null) {
    add(match[1], match[2], 110);
  }

  const generalPattern =
    /([A-Z][^(\n|·]{3,90}?)\s+at\s+([A-Z][^(\n,|·(]{2,65}?)(?:\s*·|\s*\||\s*-\s|\s*\(|Full-time|Part-time|\s|$)/gi;
  while ((match = generalPattern.exec(cleaned)) !== null) {
    add(match[1], match[2], 50);
  }

  if (!candidates.length) return {};

  candidates.sort((a, b) => {
    const aBoth = a.company ? 1 : 0;
    const bBoth = b.company ? 1 : 0;
    if (bBoth !== aBoth) return bBoth - aBoth;
    return b.score - a.score;
  });

  const best = candidates[0];
  return {
    role: best.role,
    company: best.company || undefined,
  };
}

export function normalizeLocation(location: string | undefined): string | undefined {
  if (!location?.trim()) return undefined;
  const parts = location
    .split(',')
    .map((p) => p.trim())
    .filter(Boolean);
  const deduped: string[] = [];
  const seen = new Set<string>();
  for (const part of parts) {
    const key = part.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    deduped.push(part);
  }
  return deduped.join(', ') || undefined;
}

export function parseLocationFromText(text: string): string | undefined {
  const labeled = text.match(/\bLocation:\s*([^#\n[\]|]{2,80})/i);
  if (labeled) return normalizeLocation(labeled[1]);

  const basedIn = text.match(/\b(?:based in|located in)\s+([^#.\n[\]|]{2,80})/i);
  if (basedIn) return normalizeLocation(basedIn[1]);

  const metro = text.match(
    /\b([A-Z][a-z]+(?:\s+[A-Z][a-z]+)?,\s*(?:[A-Z][a-z]+\s*)?(?:Area|Metropolitan Area)?,?\s*[A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)\b/,
  );
  if (metro) return normalizeLocation(metro[1]);

  return undefined;
}

export function cleanHighlightText(text: string): string {
  return text
    .replace(/\[\.\.\.\]/g, ' ')
    .replace(/#{1,6}\s*/g, ' ')
    .replace(/\*\*/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

export function firstReadableSentence(text: string, maxLen = 220): string | undefined {
  const cleaned = cleanHighlightText(text);
  if (!cleaned) return undefined;

  const skipPatterns =
    /^(Experience|Education|About|Activity|Skills|Licenses|Interests|Recommendations|Honors|Based in|Location)/i;

  const sentences = cleaned.split(/(?<=[.!?])\s+/);
  for (const sentence of sentences) {
    const s = sentence.trim();
    if (s.length < 25 || s.length > maxLen) continue;
    if (skipPatterns.test(s)) continue;
    if (/@/.test(s)) continue;
    if (/\sat\s.+\(Current\)/i.test(s)) continue;
    return s.endsWith('.') ? s : `${s}.`;
  }

  return undefined;
}

export function buildProfileSnippet(
  rawHighlight: string | undefined,
  fields: { role?: string; company?: string; location?: string },
): string {
  const parts: string[] = [];
  const role = sanitizeRoleTitle(fields.role);
  const company = sanitizeCompany(fields.company);
  const location = normalizeLocation(fields.location);

  if (role && company) {
    parts.push(`${role} at ${company}.`);
  } else if (role) {
    parts.push(`${role}.`);
  }

  if (location) {
    parts.push(`Based in ${location}.`);
  }

  const sentence = rawHighlight ? firstReadableSentence(rawHighlight) : undefined;
  if (sentence && !parts.some((p) => sentence.includes(p.slice(0, 20)))) {
    parts.push(sentence);
  }

  const summary = parts.join(' ').trim();
  return summary || 'Found via LinkedIn search.';
}

export function mergeRoleCompany(
  ...sources: Array<{ role?: string; company?: string; score: number }>
): { role?: string; company?: string } {
  const ranked = sources
    .map((s) => ({
      role: sanitizeRoleTitle(s.role),
      company: sanitizeCompany(s.company),
      score: s.score,
    }))
    .filter((s) => s.role || s.company)
    .sort((a, b) => {
      const aBoth = a.role && a.company ? 1 : 0;
      const bBoth = b.role && b.company ? 1 : 0;
      if (bBoth !== aBoth) return bBoth - aBoth;
      return b.score - a.score;
    });

  const best = ranked[0];
  if (!best) return {};

  let { role, company } = best;
  if (role && !company && role.includes(' at ')) {
    const split = parseTitleAtCompany(role);
    if (split.role) role = split.role;
    if (split.company) company = split.company;
  }

  return { role, company };
}
