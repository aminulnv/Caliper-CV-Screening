export type UserRole = 'admin' | 'recruiter' | 'viewer';
export type RunStatus = 'queued' | 'in_progress' | 'completed' | 'failed';
export type CriterionKind = 'must' | 'nice' | 'flag';
export type Confidence = 'high' | 'medium' | 'low';
export type CandidateStatus = 'strong' | 'promising' | 'review' | 'flagged';

export interface Criterion {
  id: string;
  job_id: string;
  kind: CriterionKind;
  name: string;
  weight: number;
  biased: boolean;
}

export interface JobProfile {
  id: string;
  workspace_id: string;
  name: string;
  dept: string | null;
  status: string;
  source: string;
  source_ref: string | null;
  description: string | null;
  posted_on: string | null;
  created_by: string | null;
  updated_at: string;
}

export interface ScreeningRun {
  id: string;
  workspace_id: string;
  job_id: string;
  model_used: string | null;
  status: RunStatus;
  owner_id: string;
  cv_count: number;
  score_range: number[] | null;
  error_message: string | null;
  run_note: string | null;
  started_at: string | null;
  completed_at: string | null;
  created_at: string;
}

export interface RunCandidate {
  id: string;
  run_id: string;
  name: string | null;
  title: string | null;
  location: string | null;
  score: number | null;
  confidence: Confidence | null;
  status: CandidateStatus | null;
  summary: string | null;
  parse_warning: string | null;
  must_met: number;
  nice_met: number;
  flag_triggered: number;
  cv_storage_path: string | null;
  recruitee_applicant_id: string | null;
  created_at: string;
}

export interface CandidateEvaluation {
  id: string;
  candidate_id: string;
  criterion_id: string;
  met: boolean | null;
  ai_met: boolean | null;
  confidence: Confidence | null;
  quote: string | null;
  inferred: boolean;
  notes: string | null;
  overridden_by: string | null;
  override_note: string | null;
  agreed_by: string | null;
  agreed_at: string | null;
  created_at: string;
}

export interface WorkspaceSettings {
  workspace_id: string;
  default_model: string;
  allowed_models: string[];
  recruitee_base_url: string | null;
  confidence_threshold: number;
}

export interface ScoringRequest {
  cvText: string;
  criteria: Criterion[];
  modelId: string;
  candidateName?: string;
  confidenceThreshold?: number;
}

export interface CriterionResult {
  criterion_id: string;
  met: boolean | null;
  confidence: Confidence;
  quote: string | null;
  inferred: boolean;
  notes: string | null;
}

export interface ScoringResult {
  score: number;
  confidence: Confidence;
  status: CandidateStatus;
  summary: string;
  must_met: number;
  nice_met: number;
  flag_triggered: number;
  must_total: number;
  nice_total: number;
  flag_total: number;
  must_met_pct: number;
  nice_met_pct: number;
  criteria_met_pct: number;
  base_score: number;
  flag_penalty: number;
  quality_adjustment: number;
  cv_quality_score: number | null;
  parse_warning: string | null;
  criteria_results: CriterionResult[];
}

export interface RecruiteeJob {
  id: string;
  title: string;
  department: string | null;
  applicants_count: number;
  posted_on?: string | null;
  description?: string | null;
  status?: string;
}

export interface RecruiteePipelineStage {
  id: string;
  name: string;
  /** Recruitee stage group: applicants | active | hires */
  category: string | null;
  position: number;
}

export interface RecruiteeApplicantsPayload {
  pipeline: { stages: RecruiteePipelineStage[] };
  qualified_count: number;
  disqualified_count: number;
  applicants: RecruiteeApplicant[];
}

export interface RecruiteeApplicant {
  id: string;
  placement_id: string | null;
  name: string;
  email: string | null;
  location: string | null;
  cv_url: string | null;
  stage_id: string | null;
  stage_name: string | null;
  /** Pipeline stage name — kept for screening sheet and list grouping */
  status: string | null;
  disqualified: boolean;
  disqualify_reason: string | null;
  photo_url: string | null;
  created_at: string | null;
  /** Recruitee job-specific average evaluation score (0–100) from placement.positive_ratings */
  evaluation_score: number | null;
}

export interface AuthenticatedRequest {
  userId: string;
  workspaceId: string;
  role: UserRole;
}
