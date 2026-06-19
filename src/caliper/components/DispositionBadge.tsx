import { Badge } from '@/caliper/ui';
import type { CandidateDisposition } from '@/services/api';
import {
  dispositionBadgeTone,
  dispositionDisplayLabel,
} from '@/lib/candidate-disposition-display';

export function DispositionBadge({
  disposition,
  targetStageName,
  syncStatus,
  compact = false,
  recruiteePipeline = false,
}: {
  disposition: CandidateDisposition | null | undefined;
  targetStageName?: string | null;
  syncStatus?: string | null;
  compact?: boolean;
  recruiteePipeline?: boolean;
}) {
  if (!disposition) return null;

  const label = dispositionDisplayLabel(
    { disposition, target_stage_name: targetStageName, targetStageName },
    { recruiteePipeline },
  ) ?? disposition;

  const displayLabel = compact && label.length > 22 ? `${label.slice(0, 20)}…` : label;

  return (
    <span className="disposition-badge-wrap" title={syncStatus ? `Recruitee sync: ${syncStatus}` : label}>
      <Badge tone={dispositionBadgeTone(disposition)} dot>
        {displayLabel}
      </Badge>
      {syncStatus === 'failed' && (
        <span className="disposition-badge-wrap__sync-failed" aria-label="Recruitee sync failed">
          !
        </span>
      )}
    </span>
  );
}
