export interface CvQualityAssessment {
  overall: number;
  presentation: number;
  depth: number;
  experience: number;
  notes: string[];
}

function clampScore(value: number): number {
  return Math.max(0, Math.min(100, Math.round(value)));
}

/** Text-only signals that complement the model's holistic CV read. */
export function analyzeCvQualityHeuristic(cvText: string): CvQualityAssessment {
  const text = cvText.trim();
  const words = text.split(/\s+/).filter(Boolean);
  const wordCount = words.length;
  const lines = text.split('\n').map((line) => line.trim()).filter(Boolean);

  let presentation = 44;
  const sectionHeaders = (
    text.match(
      /\b(experience|employment|work history|education|skills|summary|about me|projects|certifications|achievements)\b/gi,
    ) ?? []
  ).length;
  presentation += Math.min(18, sectionHeaders * 3);
  if (wordCount > 500) presentation += 6;
  if (wordCount > 900) presentation += 8;
  if (wordCount < 320) presentation -= 24;
  if (wordCount < 200) presentation -= 16;

  const bulletHeavy = lines.filter((line) => /^[-•●▪*]/.test(line) || line.length < 42).length;
  if (bulletHeavy > lines.length * 0.55 && wordCount < 550) presentation -= 14;

  const quantified = (
    text.match(
      /\b\d+%|\$\d|\d+\+|\d+\s*(years|yrs|months|people|clients|projects)|increased|decreased|reduced|improved|saved|generated|grew|delivered|managed\s+\d/gi,
    ) ?? []
  ).length;
  let depth = 28 + Math.min(38, quantified * 8);
  const avgLineLen = lines.reduce((sum, line) => sum + line.length, 0) / Math.max(lines.length, 1);
  if (avgLineLen < 30) depth -= 20;
  if (avgLineLen < 22) depth -= 10;

  const skillsListHeavy =
    /\bskills?\b/i.test(text)
    && (text.match(/[,;|•]\s*\w+/g) ?? []).length >= 6;
  if (skillsListHeavy && quantified < 2) depth -= 18;

  const dateRanges = (
    text.match(/\b(19|20)\d{2}\s*[-–—]\s*((19|20)\d{2}|present|current)\b/gi) ?? []
  ).length;
  const roleEntries = (
    text.match(/\b(intern|manager|engineer|developer|analyst|consultant|lead|director|specialist|coordinator|associate|editor|writer)\b/gi)
    ?? []
  ).length;
  let experience = 34 + Math.min(24, dateRanges * 9) + Math.min(10, roleEntries * 2);
  const internHeavy = /\bintern\b/i.test(text) && dateRanges <= 1 && roleEntries <= 2;
  if (internHeavy) experience -= 26;
  if (dateRanges === 0) experience -= 18;
  if (dateRanges === 1 && roleEntries <= 2) experience -= 12;

  const eduHeavy = (
    text.match(/\b(b\.?a\.?|b\.?sc|m\.?a\.?|degree|university|college|honours|honors|expected\s+20)\b/gi)
    ?? []
  ).length;
  if (eduHeavy >= 2 && dateRanges <= 1) experience -= 14;

  const buzzwords = (
    text.match(
      /\b(team player|hard.?working|fast learner|go.?getter|detail.?oriented|self.?motivated|passionate|dynamic|excellent communication)\b/gi,
    ) ?? []
  ).length;
  depth -= buzzwords * 5;
  presentation -= Math.min(16, buzzwords * 4);

  const notes: string[] = [];
  if (wordCount < 340) notes.push('CV content is thin — limited detail for a recruiter to assess');
  if (quantified < 2) notes.push('Few measurable outcomes or quantified achievements');
  if (dateRanges <= 1) notes.push('Work history appears shallow or single-role');
  if (internHeavy) notes.push('Experience reads as early-career / internship-level');
  if (skillsListHeavy && quantified < 2) notes.push('Skills-heavy layout with little demonstrated experience');
  if (avgLineLen < 30 && wordCount < 520) notes.push('Heavy on keyword lists, light on substantive narrative');
  if (eduHeavy >= 2 && dateRanges <= 1) notes.push('Profile leans on education more than professional track record');

  return {
    overall: clampScore(presentation * 0.22 + depth * 0.42 + experience * 0.36),
    presentation: clampScore(presentation),
    depth: clampScore(depth),
    experience: clampScore(experience),
    notes,
  };
}

export function mergeCvQuality(
  ai: Partial<CvQualityAssessment> | null | undefined,
  heuristic: CvQualityAssessment,
): CvQualityAssessment {
  if (ai?.overall == null || Number.isNaN(Number(ai.overall))) {
    return heuristic;
  }

  const aiOverall = clampScore(Number(ai.overall));
  const blended = clampScore(aiOverall * 0.4 + heuristic.overall * 0.6);
  const pessimistic = heuristic.notes.length >= 2
    ? Math.min(blended, heuristic.overall + 10)
    : blended;

  return {
    overall: pessimistic,
    presentation: clampScore((ai.presentation ?? aiOverall) * 0.4 + heuristic.presentation * 0.6),
    depth: clampScore((ai.depth ?? aiOverall) * 0.4 + heuristic.depth * 0.6),
    experience: clampScore((ai.experience ?? aiOverall) * 0.4 + heuristic.experience * 0.6),
    notes: [...(Array.isArray(ai.notes) ? ai.notes : []), ...heuristic.notes].slice(0, 6),
  };
}

/** @deprecated Multiplicative factor — kept for tests; scoring uses hybrid blend now. */
export function cvQualityFactor(cvQualityScore: number | null | undefined): number {
  if (cvQualityScore == null) return 1;
  const normalized = Math.max(0, Math.min(100, cvQualityScore));
  const floor = 0.28;
  return floor + (normalized / 100) * (1 - floor);
}
