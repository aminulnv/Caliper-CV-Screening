// @ts-nocheck
import { getBiasWarning } from '@/lib/criteria-validation'
import { newCriterionId } from '@/caliper/components/jobs/CriteriaList'

export function cloneCriteriaItems(items) {
  if (!Array.isArray(items)) return [];
  return items.map((x) => ({ ...x }));
}

export function buildCriteriaPayload(mh, nh, rf) {
  return [
    ...mh.map((c) => ({ id: c.id, kind: 'must', name: c.name, weight: c.weight, biased: Boolean(c.biased) })),
    ...nh.map((c) => ({ id: c.id, kind: 'nice', name: c.name, weight: c.weight, biased: Boolean(c.biased) })),
    ...rf.map((c) => ({ id: c.id, kind: 'flag', name: c.name, weight: c.weight, biased: Boolean(c.biased) })),
  ];
}

export function isRecruiteePlaceholderDescription(description) {
  const t = String(description || '').trim();
  if (!t) return true;
  if (!t.startsWith('Synced from Recruitee') && !t.startsWith('Imported from Recruitee')) {
    return false;
  }
  // Stub text from import/sync — not a real JD
  return t.length < 500 || !/\n{2,}/.test(t) && t.length < 900;
}

export function isUsableJobDescription(description) {
  const t = String(description || '').trim();
  if (t.length < 80) return false;
  return !isRecruiteePlaceholderDescription(t);
}

export function mapGeneratedCriteriaItems(items) {
  return (items || []).map((c) => ({
    id: newCriterionId(),
    name: c.name,
    weight: c.weight,
    biased: getBiasWarning(c.name),
  }));
}
