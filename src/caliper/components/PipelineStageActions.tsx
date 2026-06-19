// @ts-nocheck
import React from 'react';
import type { RecruiteePipelineStage } from '@/services/api';
import { Btn } from '@/caliper/ui';
import { groupPipelineStages, stageCategoryKey } from '@/lib/recruitee-pipeline';

export function PipelineStageActions({
  stages,
  disabled = false,
  compact = false,
  candidateIds,
  onStage,
  onDisqualify,
  onHold,
  showHold = true,
  showDisqualify = true,
  moveLabel = 'Move to…',
}: {
  stages: RecruiteePipelineStage[];
  disabled?: boolean;
  compact?: boolean;
  candidateIds?: string[];
  onStage: (stage: RecruiteePipelineStage) => void;
  onDisqualify?: () => void;
  onHold?: () => void;
  showHold?: boolean;
  showDisqualify?: boolean;
  moveLabel?: string;
}) {
  const groups = React.useMemo(() => groupPipelineStages(stages), [stages]);
  const selectRef = React.useRef<HTMLSelectElement>(null);

  const handleSelect = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const stageId = e.target.value;
    if (!stageId) return;
    const stage = stages.find((s) => s.id === stageId);
    if (stage) onStage(stage);
    e.target.value = '';
  };

  if (compact) {
    return (
      <div className="pipeline-stage-actions pipeline-stage-actions--compact">
        <select
          ref={selectRef}
          className="sel pipeline-stage-actions__select"
          defaultValue=""
          disabled={disabled}
          onChange={handleSelect}
          aria-label="Move to pipeline stage"
        >
          <option value="">{moveLabel}</option>
          {groups.map((group) => (
            <optgroup key={group.category} label={group.label}>
              {group.stages.map((stage) => (
                <option key={stage.id} value={stage.id}>{stage.name}</option>
              ))}
            </optgroup>
          ))}
        </select>
        {showDisqualify && onDisqualify && (
          <button type="button" className="pipeline-stage-actions__link pipeline-stage-actions__link--bad"
                  disabled={disabled} onClick={onDisqualify}>
            Disqualify
          </button>
        )}
      </div>
    );
  }

  return (
    <div className="pipeline-stage-actions">
      {groups.map((group) => (
        <div key={group.category} className="pipeline-stage-actions__group">
          <span className="pipeline-stage-actions__group-label">{group.label}</span>
          <div className="pipeline-stage-actions__stages">
            {group.stages.map((stage) => (
              <button
                key={stage.id}
                type="button"
                className="pipeline-stage-actions__stage"
                data-category={stageCategoryKey(stage.category)}
                disabled={disabled}
                title={stage.name}
                onClick={() => onStage(stage)}
              >
                {stage.name}
              </button>
            ))}
          </div>
        </div>
      ))}
      <div className="pipeline-stage-actions__secondary">
        {showHold && onHold && (
          <Btn size="sm" variant="ghost" disabled={disabled} onClick={onHold}>
            Hold (Caliper only)
          </Btn>
        )}
        {showDisqualify && onDisqualify && (
          <Btn size="sm" variant="danger-ghost" disabled={disabled} onClick={onDisqualify}>
            Disqualify
          </Btn>
        )}
      </div>
    </div>
  );
}
