import { sql } from './db.js';
import { computeCostUsd, estimateScreeningCostUsd } from '../lib/model-pricing.js';

export type AiUsageFeature =
  | 'screening'
  | 'criteria_gen'
  | 'embedding'
  | 'cv_search'
  | 'discovery'
  | 'jd_alignment';

export type BudgetStatus = 'ok' | 'warn' | 'blocked' | 'unlimited';

export interface TokenUsage {
  model: string;
  inputTokens: number;
  outputTokens: number;
}

export interface MemberUsageSummary {
  user_id: string;
  email: string;
  name: string | null;
  role: string;
  budget_usd: number | null;
  spent_usd: number;
  pct_used: number | null;
  status: BudgetStatus;
}

export interface UsageEventRow {
  id: string;
  feature: AiUsageFeature;
  model: string;
  input_tokens: number;
  output_tokens: number;
  cost_usd: number;
  run_id: string | null;
  job_id: string | null;
  created_at: string;
}

export interface MonthlyUsageBucket {
  month: string;
  spent_usd: number;
  event_count: number;
  cv_count: number;
  by_feature: Record<string, number>;
  by_model: Record<string, number>;
}

export interface TeamMonthlyMember {
  user_id: string;
  email: string;
  name: string | null;
  role: string;
  by_month: Record<string, number>;
  total_usd: number;
}

export interface TeamMonthlyUsage {
  months: string[];
  team_by_month: Record<string, number>;
  members: TeamMonthlyMember[];
}

export class BudgetExceededError extends Error {
  readonly statusCode = 403;
  readonly code = 'budget_exceeded';
  readonly spentUsd: number;
  readonly budgetUsd: number;

  constructor(spentUsd: number, budgetUsd: number) {
    super('AI budget exceeded. Contact your workspace admin to increase your limit.');
    this.name = 'BudgetExceededError';
    this.spentUsd = spentUsd;
    this.budgetUsd = budgetUsd;
  }
}

function toNumber(value: unknown): number {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

function deriveStatus(spentUsd: number, budgetUsd: number | null): BudgetStatus {
  if (budgetUsd == null || budgetUsd <= 0) return 'unlimited';
  const pct = (spentUsd / budgetUsd) * 100;
  if (pct >= 100) return 'blocked';
  if (pct >= 80) return 'warn';
  return 'ok';
}

function monthKey(year: number, monthIndex: number): string {
  return `${year}-${String(monthIndex + 1).padStart(2, '0')}`;
}

/** Last N calendar months ending at the current month (UTC). */
function buildRecentMonthAxis(count: number): string[] {
  const now = new Date();
  const months: string[] = [];
  for (let i = count - 1; i >= 0; i -= 1) {
    const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - i, 1));
    months.push(monthKey(d.getUTCFullYear(), d.getUTCMonth()));
  }
  return months;
}

function mergeMonthAxis(recentMonths: string[], dataMonths: string[]): string[] {
  const set = new Set([...recentMonths, ...dataMonths]);
  return [...set].sort();
}

function emptyMonthlyBucket(month: string): MonthlyUsageBucket {
  return {
    month,
    spent_usd: 0,
    event_count: 0,
    cv_count: 0,
    by_feature: {},
    by_model: {},
  };
}

export async function logAiUsage(args: {
  workspaceId: string;
  userId: string;
  feature: AiUsageFeature;
  usage: TokenUsage;
  runId?: string | null;
  jobId?: string | null;
}): Promise<void> {
  const costUsd = computeCostUsd(args.usage.model, args.usage.inputTokens, args.usage.outputTokens);
  if (costUsd <= 0 && args.usage.inputTokens <= 0 && args.usage.outputTokens <= 0) return;

  await sql`
    INSERT INTO ai_usage_events
      (workspace_id, user_id, feature, model, input_tokens, output_tokens, cost_usd, run_id, job_id)
    VALUES (
      ${args.workspaceId},
      ${args.userId},
      ${args.feature},
      ${args.usage.model},
      ${args.usage.inputTokens},
      ${args.usage.outputTokens},
      ${costUsd},
      ${args.runId ?? null},
      ${args.jobId ?? null}
    )
  `;
}

async function fetchMemberBudget(
  workspaceId: string,
  userId: string,
): Promise<number | null> {
  const [row] = await sql`
    SELECT ai_budget_usd
    FROM user_roles
    WHERE workspace_id = ${workspaceId} AND user_id = ${userId}
    LIMIT 1
  `;
  if (!row) return null;
  const budget = row.aiBudgetUsd ?? row.ai_budget_usd;
  if (budget == null) return null;
  const n = Number(budget);
  return Number.isFinite(n) ? n : null;
}

async function fetchMemberSpent(workspaceId: string, userId: string): Promise<number> {
  const [row] = await sql`
    SELECT COALESCE(SUM(cost_usd), 0) AS spent
    FROM ai_usage_events
    WHERE workspace_id = ${workspaceId} AND user_id = ${userId}
  `;
  return toNumber(row?.spent);
}

export async function getMemberUsage(
  workspaceId: string,
  userId: string,
): Promise<MemberUsageSummary & { email: string; name: string | null; role: string }> {
  const [member] = await sql`
    SELECT ur.user_id, ur.role, ur.ai_budget_usd,
           u.email, u.name
    FROM user_roles ur
    JOIN users u ON u.sub = ur.user_id
    WHERE ur.workspace_id = ${workspaceId} AND ur.user_id = ${userId}
    LIMIT 1
  `;
  if (!member) {
    throw new Error('Member not found');
  }

  const budgetUsd = member.aiBudgetUsd ?? member.ai_budget_usd;
  const budget = budgetUsd == null ? null : Number(budgetUsd);
  const spentUsd = await fetchMemberSpent(workspaceId, userId);
  const pctUsed = budget != null && budget > 0 ? Math.round((spentUsd / budget) * 1000) / 10 : null;

  return {
    user_id: (member.userId ?? member.user_id) as string,
    email: member.email as string,
    name: (member.name as string | null) ?? null,
    role: member.role as string,
    budget_usd: budget,
    spent_usd: spentUsd,
    pct_used: pctUsed,
    status: deriveStatus(spentUsd, budget),
  };
}

export async function getWorkspaceUsageSummary(
  workspaceId: string,
): Promise<MemberUsageSummary[]> {
  const rows = await sql`
    SELECT ur.user_id, ur.role, ur.ai_budget_usd,
           u.email, u.name,
           COALESCE(spent.total, 0) AS spent_usd
    FROM user_roles ur
    JOIN users u ON u.sub = ur.user_id
    LEFT JOIN LATERAL (
      SELECT SUM(cost_usd) AS total
      FROM ai_usage_events e
      WHERE e.workspace_id = ${workspaceId} AND e.user_id = ur.user_id
    ) spent ON true
    WHERE ur.workspace_id = ${workspaceId}
      AND ur.role IN ('admin', 'recruiter')
    ORDER BY u.name ASC NULLS LAST, u.email ASC
  `;

  return rows.map((row) => {
    const budgetRaw = row.aiBudgetUsd ?? row.ai_budget_usd;
    const budget = budgetRaw == null ? null : Number(budgetRaw);
    const spentUsd = toNumber(row.spentUsd ?? row.spent_usd);
    const pctUsed = budget != null && budget > 0 ? Math.round((spentUsd / budget) * 1000) / 10 : null;
    return {
      user_id: (row.userId ?? row.user_id) as string,
      email: row.email as string,
      name: (row.name as string | null) ?? null,
      role: row.role as string,
      budget_usd: budget,
      spent_usd: spentUsd,
      pct_used: pctUsed,
      status: deriveStatus(spentUsd, budget),
    };
  });
}

export async function getMemberMonthlyUsage(
  workspaceId: string,
  userId: string,
  months = 12,
): Promise<MonthlyUsageBucket[]> {
  const [totalsRows, featureRows, modelRows] = await Promise.all([
    sql`
      SELECT to_char(date_trunc('month', created_at AT TIME ZONE 'UTC'), 'YYYY-MM') AS month,
             COALESCE(SUM(cost_usd), 0) AS spent,
             COUNT(*) AS events,
             COUNT(*) FILTER (WHERE feature = 'screening') AS cvs
      FROM ai_usage_events
      WHERE workspace_id = ${workspaceId} AND user_id = ${userId}
      GROUP BY 1
      ORDER BY 1
    `,
    sql`
      SELECT to_char(date_trunc('month', created_at AT TIME ZONE 'UTC'), 'YYYY-MM') AS month,
             feature,
             COALESCE(SUM(cost_usd), 0) AS spent
      FROM ai_usage_events
      WHERE workspace_id = ${workspaceId} AND user_id = ${userId}
      GROUP BY 1, 2
      ORDER BY 1
    `,
    sql`
      SELECT to_char(date_trunc('month', created_at AT TIME ZONE 'UTC'), 'YYYY-MM') AS month,
             model,
             COALESCE(SUM(cost_usd), 0) AS spent
      FROM ai_usage_events
      WHERE workspace_id = ${workspaceId} AND user_id = ${userId}
      GROUP BY 1, 2
      ORDER BY 1
    `,
  ]);

  const dataMonths = totalsRows.map((row) => String(row.month));
  const axis = mergeMonthAxis(buildRecentMonthAxis(months), dataMonths);
  const byMonth = new Map<string, MonthlyUsageBucket>(
    axis.map((month) => [month, emptyMonthlyBucket(month)]),
  );

  for (const row of totalsRows) {
    const month = String(row.month);
    const bucket = byMonth.get(month) ?? emptyMonthlyBucket(month);
    bucket.spent_usd = toNumber(row.spent ?? row.spent_usd);
    bucket.event_count = Number(row.events ?? 0);
    bucket.cv_count = Number(row.cvs ?? 0);
    byMonth.set(month, bucket);
  }

  for (const row of featureRows) {
    const month = String(row.month);
    const bucket = byMonth.get(month) ?? emptyMonthlyBucket(month);
    bucket.by_feature[String(row.feature)] = toNumber(row.spent ?? row.spent_usd);
    byMonth.set(month, bucket);
  }

  for (const row of modelRows) {
    const month = String(row.month);
    const bucket = byMonth.get(month) ?? emptyMonthlyBucket(month);
    bucket.by_model[String(row.model)] = toNumber(row.spent ?? row.spent_usd);
    byMonth.set(month, bucket);
  }

  return axis.map((month) => byMonth.get(month) ?? emptyMonthlyBucket(month));
}

export async function getWorkspaceMonthlyUsage(
  workspaceId: string,
  months = 12,
): Promise<TeamMonthlyUsage> {
  const memberRows = await sql`
    SELECT ur.user_id, ur.role, u.email, u.name
    FROM user_roles ur
    JOIN users u ON u.sub = ur.user_id
    WHERE ur.workspace_id = ${workspaceId}
      AND ur.role IN ('admin', 'recruiter')
    ORDER BY u.name ASC NULLS LAST, u.email ASC
  `;

  const spendRows = await sql`
    SELECT ur.user_id,
           to_char(date_trunc('month', e.created_at AT TIME ZONE 'UTC'), 'YYYY-MM') AS month,
           COALESCE(SUM(e.cost_usd), 0) AS spent
    FROM user_roles ur
    LEFT JOIN ai_usage_events e
      ON e.workspace_id = ${workspaceId}
     AND e.user_id = ur.user_id
    WHERE ur.workspace_id = ${workspaceId}
      AND ur.role IN ('admin', 'recruiter')
    GROUP BY ur.user_id, 2
    ORDER BY 2
  `;

  const dataMonths = spendRows
    .map((row) => (row.month == null ? null : String(row.month)))
    .filter((m): m is string => m != null);
  const axis = mergeMonthAxis(buildRecentMonthAxis(months), dataMonths);
  const teamByMonth: Record<string, number> = Object.fromEntries(axis.map((m) => [m, 0]));

  const members: TeamMonthlyMember[] = memberRows.map((row) => {
    const userId = (row.userId ?? row.user_id) as string;
    const byMonth: Record<string, number> = Object.fromEntries(axis.map((m) => [m, 0]));
    return {
      user_id: userId,
      email: row.email as string,
      name: (row.name as string | null) ?? null,
      role: row.role as string,
      by_month: byMonth,
      total_usd: 0,
    };
  });

  const memberIndex = new Map(members.map((m, i) => [m.user_id, i]));

  for (const row of spendRows) {
    const month = row.month == null ? null : String(row.month);
    if (!month) continue;
    const userId = (row.userId ?? row.user_id) as string;
    const spent = toNumber(row.spent ?? row.spent_usd);
    const idx = memberIndex.get(userId);
    if (idx == null) continue;
    members[idx].by_month[month] = (members[idx].by_month[month] ?? 0) + spent;
    members[idx].total_usd += spent;
    teamByMonth[month] = (teamByMonth[month] ?? 0) + spent;
  }

  return { months: axis, team_by_month: teamByMonth, members };
}

export async function getRecentUsageEvents(
  workspaceId: string,
  userId: string,
  limit = 50,
  month?: string | null,
): Promise<UsageEventRow[]> {
  const monthFilter = month?.trim() || null;
  const rows = monthFilter
    ? await sql`
        SELECT id, feature, model, input_tokens, output_tokens, cost_usd, run_id, job_id, created_at
        FROM ai_usage_events
        WHERE workspace_id = ${workspaceId}
          AND user_id = ${userId}
          AND to_char(date_trunc('month', created_at AT TIME ZONE 'UTC'), 'YYYY-MM') = ${monthFilter}
        ORDER BY created_at DESC
        LIMIT ${limit}
      `
    : await sql`
        SELECT id, feature, model, input_tokens, output_tokens, cost_usd, run_id, job_id, created_at
        FROM ai_usage_events
        WHERE workspace_id = ${workspaceId} AND user_id = ${userId}
        ORDER BY created_at DESC
        LIMIT ${limit}
      `;

  return rows.map((row) => ({
    id: row.id as string,
    feature: row.feature as AiUsageFeature,
    model: row.model as string,
    input_tokens: Number(row.inputTokens ?? row.input_tokens ?? 0),
    output_tokens: Number(row.outputTokens ?? row.output_tokens ?? 0),
    cost_usd: toNumber(row.costUsd ?? row.cost_usd),
    run_id: (row.runId ?? row.run_id ?? null) as string | null,
    job_id: (row.jobId ?? row.job_id ?? null) as string | null,
    created_at: (row.createdAt ?? row.created_at) as string,
  }));
}

export async function assertCanSpend(
  userId: string,
  workspaceId: string,
  estimatedCostUsd = 0,
): Promise<void> {
  const budget = await fetchMemberBudget(workspaceId, userId);
  if (budget == null || budget <= 0) return;

  const spent = await fetchMemberSpent(workspaceId, userId);
  if (spent + estimatedCostUsd >= budget) {
    throw new BudgetExceededError(spent, budget);
  }
}

export async function updateMemberBudget(
  workspaceId: string,
  memberRoleId: string,
  budgetUsd: number | null,
): Promise<void> {
  const [member] = await sql`
    SELECT id, role FROM user_roles
    WHERE id = ${memberRoleId} AND workspace_id = ${workspaceId}
    LIMIT 1
  `;
  if (!member) throw new Error('Member not found');
  if (member.role === 'viewer') {
    throw new Error('Budget caps do not apply to viewers.');
  }

  await sql`
    UPDATE user_roles
    SET ai_budget_usd = ${budgetUsd}
    WHERE id = ${memberRoleId} AND workspace_id = ${workspaceId}
  `;
}

export function estimateUsage(args: {
  modelId: string;
  cvCount: number;
  criteriaCount: number;
  spentUsd: number;
  budgetUsd: number | null;
}): {
  estimated_cost_usd: number;
  spent_usd: number;
  budget_usd: number | null;
  pct_used: number | null;
  status: BudgetStatus;
} {
  const estimatedCostUsd = estimateScreeningCostUsd(
    args.modelId,
    args.cvCount,
    args.criteriaCount,
  );
  const projectedSpent = args.spentUsd + estimatedCostUsd;
  const pctUsed =
    args.budgetUsd != null && args.budgetUsd > 0
      ? Math.round((args.spentUsd / args.budgetUsd) * 1000) / 10
      : null;
  const statusAfterRun =
    args.budgetUsd != null && args.budgetUsd > 0
      ? deriveStatus(projectedSpent, args.budgetUsd)
      : 'unlimited';

  return {
    estimated_cost_usd: estimatedCostUsd,
    spent_usd: args.spentUsd,
    budget_usd: args.budgetUsd,
    pct_used: pctUsed,
    status: statusAfterRun,
  };
}
