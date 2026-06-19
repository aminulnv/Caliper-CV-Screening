import type { RecruiteePipelineStage } from '@/services/api';

export type PipelineStageCategory = 'applicants' | 'active' | 'hires' | 'other';

const CATEGORY_ORDER: PipelineStageCategory[] = ['applicants', 'active', 'hires', 'other'];

const CATEGORY_LABELS: Record<PipelineStageCategory, string> = {
  applicants: 'Applicants',
  active: 'Active',
  hires: 'Hires',
  other: 'Other',
};

export function stageCategoryKey(category: string | null | undefined): PipelineStageCategory {
  if (!category) return 'other';
  const key = category.toLowerCase();
  if (key === 'applicants' || key === 'active' || key === 'hires') return key;
  return 'other';
}

export function stageCategoryLabel(category: string | null | undefined): string {
  return CATEGORY_LABELS[stageCategoryKey(category)];
}

export function groupPipelineStages(
  stages: RecruiteePipelineStage[],
): Array<{ category: PipelineStageCategory; label: string; stages: RecruiteePipelineStage[] }> {
  const buckets = new Map<PipelineStageCategory, RecruiteePipelineStage[]>();
  for (const stage of stages) {
    const key = stageCategoryKey(stage.category);
    const list = buckets.get(key) ?? [];
    list.push(stage);
    buckets.set(key, list);
  }
  return CATEGORY_ORDER
    .filter((cat) => (buckets.get(cat)?.length ?? 0) > 0)
    .map((cat) => ({
      category: cat,
      label: CATEGORY_LABELS[cat],
      stages: (buckets.get(cat) ?? []).sort((a, b) => (a.position ?? 0) - (b.position ?? 0)),
    }));
}

export function candidateTargetStageId(candidate: {
  target_stage_id?: string | null;
  targetStageId?: string | null;
}): string | null {
  return (candidate.target_stage_id ?? candidate.targetStageId ?? null) as string | null;
}

export function candidateTargetStageName(candidate: {
  target_stage_name?: string | null;
  targetStageName?: string | null;
}): string | null {
  return (candidate.target_stage_name ?? candidate.targetStageName ?? null) as string | null;
}
