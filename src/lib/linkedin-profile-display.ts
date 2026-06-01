/** Display-time parsing and sanitization for LinkedIn profile rows (mirrors backend parse logic). */

const JOB_TITLE_HINT =
  /\b(manager|director|head|lead|specialist|analyst|officer|consultant|engineer|partner|coordinator|associate|executive|supervisor|advisor|president|vp|chief|deputy|assistant|intern|recruiter|hr|human resources|compensation|reward|performance|talent|people|total rewards)\b/i;

export function cleanHighlightText(text: string): string {
  return text
    .replace(/\[\.\.\.\]/g, ' ')
    .replace(/#{1,6}\s*/g, ' ')
    .replace(/\*\*/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

export function sanitizeRoleTitle(value: string | null | undefined): string | null {
  if (!value?.trim()) return null;
  let role = value.replace(/\s+/g, ' ').trim();
  role = role.replace(/^[^A-Z]*(?=[A-Z])/, '');
  if (role.length < 4 || role.length > 90) return null;
  if (/@|email address|linkedin\.com|https?:\/\//i.test(role)) return null;
  if (/^[^A-Z]/.test(role)) return null;
  if (/^(and|or|the|at|in|of|sation|tion|ment|t management)\b/i.test(role)) return null;
  const words = role.split(/\s+/);
  if (words.length < 2 && !JOB_TITLE_HINT.test(role)) return null;
  return role;
}

export function sanitizeCompany(value: string | null | undefined): string | null {
  if (!value?.trim()) return null;
  const company = value.replace(/\s+/g, ' ').trim();
  if (company.length < 2 || company.length > 70) return null;
  if (/@|linkedin|experience|education|full-time|part-time|present/i.test(company)) return null;
  return company;
}

export function normalizeLocation(location: string | null | undefined): string | null {
  if (!location?.trim()) return null;
  const parts = location.split(',').map((p) => p.trim()).filter(Boolean);
  const deduped: string[] = [];
  const seen = new Set<string>();
  for (const part of parts) {
    const key = part.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    deduped.push(part);
  }
  return deduped.join(', ') || null;
}

export function extractRoleCompanyFromText(text: string | null | undefined): { role?: string; company?: string } {
  if (!text) return {};
  const cleaned = cleanHighlightText(text);
  const candidates: { role: string; company: string; score: number }[] = [];

  const add = (role: string | undefined, company: string | undefined, score: number) => {
    const r = role ? sanitizeRoleTitle(role) : null;
    const c = company ? sanitizeCompany(company) : null;
    if (r && c) candidates.push({ role: r, company: c, score });
    else if (r && score >= 80) candidates.push({ role: r, company: c ?? '', score: score - 20 });
  };

  const currentPattern = /([A-Z][^(\n]{3,90}?)\s+at\s+([A-Z][^(\n,|·(]{2,65}?)\s*\(Current\)/gi;
  let match: RegExpExecArray | null;
  while ((match = currentPattern.exec(cleaned)) !== null) {
    add(match[1], match[2], 100);
  }

  const generalPattern =
    /([A-Z][^(\n|·]{3,90}?)\s+at\s+([A-Z][^(\n,|·(]{2,65}?)(?:\s*·|\s*\||\s*-\s|\s*\(|Full-time|Part-time|\s|$)/gi;
  while ((match = generalPattern.exec(cleaned)) !== null) {
    add(match[1], match[2], 50);
  }

  const lead = cleaned.match(/^([^.\n]{3,90}?)\s+at\s+([^.\n]{2,65})\./);
  if (lead) add(lead[1], lead[2], 60);

  if (!candidates.length) return {};

  candidates.sort((a, b) => {
    const aBoth = a.company ? 1 : 0;
    const bBoth = b.company ? 1 : 0;
    if (bBoth !== aBoth) return bBoth - aBoth;
    return b.score - a.score;
  });

  const best = candidates[0];
  return { role: best.role, company: best.company || undefined };
}

export function displayTitle(
  headline: string | null,
  title: string | null,
  summary: string | null,
  jobName: string,
): string | null {
  for (const raw of [headline, title]) {
    const sanitized = sanitizeRoleTitle(raw);
    if (sanitized && sanitized !== jobName) return sanitized;
    if (raw?.includes(' at ')) {
      const parsed = extractRoleCompanyFromText(raw);
      if (parsed.role) return parsed.role;
    }
  }
  return extractRoleCompanyFromText(summary).role ?? null;
}

export function displayCompany(company: string | null, summary: string | null, headline: string | null): string | null {
  const sanitized = sanitizeCompany(company);
  if (sanitized) return sanitized;
  const fromSummary = extractRoleCompanyFromText(summary);
  if (fromSummary.company) return fromSummary.company;
  if (headline?.includes(' at ')) {
    return extractRoleCompanyFromText(headline).company ?? null;
  }
  return null;
}

export function displayLocation(location: string | null, summary: string | null): string | null {
  const normalized = normalizeLocation(location);
  if (normalized) return normalized;
  const labeled = summary?.match(/\bLocation:\s*([^#\n[\]|]{2,80})/i);
  if (labeled) return normalizeLocation(labeled[1].trim());
  const basedIn = summary?.match(/\bBased in\s+([^#.\n]{2,80})/i);
  if (basedIn) return normalizeLocation(basedIn[1].trim());
  return null;
}

export function displayBackground(summary: string | null): string {
  if (!summary?.trim() || /^Found via LinkedIn search/i.test(summary.trim())) return '—';

  const cleaned = cleanHighlightText(summary);
  const parsed = extractRoleCompanyFromText(cleaned);
  const parts: string[] = [];

  if (parsed.role && parsed.company) {
    parts.push(`${parsed.role} at ${parsed.company}.`);
  } else if (parsed.role) {
    parts.push(`${parsed.role}.`);
  }

  const loc = cleaned.match(/\b(?:Location:|Based in)\s*([^#.\n[\]|]{2,80})/i);
  if (loc) {
    const normalized = normalizeLocation(loc[1].trim());
    if (normalized) parts.push(`Based in ${normalized}.`);
  }

  const sentence = cleaned
    .split(/(?<=[.!?])\s+/)
    .find(
      (s) =>
        s.length >= 25 &&
        s.length <= 220 &&
        !/^Location:/i.test(s) &&
        !/\(Current\)/i.test(s) &&
        !/@/.test(s) &&
        !/^Based in/i.test(s),
    );
  if (sentence && !parts.some((p) => sentence.includes(p.slice(0, 18)))) {
    parts.push(sentence.endsWith('.') ? sentence : `${sentence}.`);
  }

  const text = parts.join(' ').trim();
  if (text.length >= 20) return text.slice(0, 320);
  return '—';
}
