/** postgres.js camelCase rows → API snake_case for the frontend. */
export function formatRunCandidateRow(row: Record<string, unknown>) {
  return {
    id: row.id,
    name: row.name ?? null,
    title: row.title ?? null,
    location: row.location ?? null,
    score: row.score ?? null,
    confidence: row.confidence ?? null,
    status: row.status ?? null,
    summary: row.summary ?? null,
    parse_warning: (row.parseWarning ?? row.parse_warning ?? null) as string | null,
    must_met: (row.mustMet ?? row.must_met ?? 0) as number,
    nice_met: (row.niceMet ?? row.nice_met ?? 0) as number,
    flag_triggered: (row.flagTriggered ?? row.flag_triggered ?? 0) as number,
    score_base: (row.scoreBase ?? row.score_base ?? null) as number | null,
    penalty_flag: (row.penaltyFlag ?? row.penalty_flag ?? null) as number | null,
    must_total: (row.mustTotal ?? row.must_total ?? null) as number | null,
    nice_total: (row.niceTotal ?? row.nice_total ?? null) as number | null,
    flag_total: (row.flagTotal ?? row.flag_total ?? null) as number | null,
    criteria_met_pct: (row.criteriaMetPct ?? row.criteria_met_pct ?? null) as number | null,
    must_met_pct: (row.mustMetPct ?? row.must_met_pct ?? null) as number | null,
    nice_met_pct: (row.niceMetPct ?? row.nice_met_pct ?? null) as number | null,
    cv_storage_path: (row.cvStoragePath ?? row.cv_storage_path ?? null) as string | null,
    recruitee_applicant_id: (row.recruiteeApplicantId ?? row.recruitee_applicant_id ?? null) as
      | string
      | null,
    applicant_email: (row.applicantEmail ?? row.applicant_email ?? null) as string | null,
    run_id: (row.runId ?? row.run_id ?? null) as string | null,
  };
}
