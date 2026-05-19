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
  confidence: Confidence | null;
  quote: string | null;
  inferred: boolean;
  notes: string | null;
  overridden_by: string | null;
  override_note: string | null;
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
  must_penalty: number;
  flag_penalty: number;
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

export interface RecruiteeApplicant {
  id: string;
  name: string;
  location: string | null;
  cv_url: string | null;
  status: string | null;
}

export interface AuthenticatedRequest {
  userId: string;
  workspaceId: string;
  role: UserRole;
}
