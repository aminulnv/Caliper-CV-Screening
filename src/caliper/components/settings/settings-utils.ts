// @ts-nocheck
export function formatJoined(iso) {
  try {
    return new Date(iso).toLocaleDateString('en-US', { month: 'short', year: 'numeric' });
  } catch {
    return '—';
  }
}

export function formatUsd(amount) {
  const n = Number(amount);
  if (!Number.isFinite(n)) return '—';
  if (n < 0.01) return `$${n.toFixed(4)}`;
  if (n < 1) return `$${n.toFixed(3)}`;
  return `$${n.toFixed(2)}`;
}

export function spentColor(status) {
  if (status === 'blocked') return 'var(--bad-ink)';
  if (status === 'warn') return 'var(--warn-ink, #b45309)';
  return undefined;
}

export function memberInitials(name, email) {
  if (name?.trim()) {
    return name.trim().split(/\s+/).map((n) => n[0]).join('').slice(0, 2).toUpperCase();
  }
  return (email?.[0] ?? '?').toUpperCase();
}

export function statusTone(status) {
  if (status === 'blocked') return 'bad';
  if (status === 'warn') return 'warn';
  if (status === 'unlimited') return 'ghost';
  return 'ok';
}

export function memberRemaining(member) {
  if (member.ai_remaining_usd != null) return member.ai_remaining_usd;
  if (member.ai_budget_usd == null) return null;
  return Math.max(0, member.ai_budget_usd - (member.ai_spent_usd ?? 0));
}

export function computeTeamKpis(members) {
  const active = members.filter((m) => m.role !== 'viewer');
  let totalSpent = 0;
  let totalAllocated = 0;
  let blockedCount = 0;
  for (const m of active) {
    totalSpent += m.ai_spent_usd ?? 0;
    if (m.ai_budget_usd != null) totalAllocated += m.ai_budget_usd;
    if (m.ai_status === 'blocked') blockedCount += 1;
  }
  return { totalSpent, totalAllocated, blockedCount };
}

export const SETTINGS_SECTIONS = [
  { id: 'ai-provider', label: 'AI provider', icon: 'sparkle' },
  { id: 'screening', label: 'Screening', icon: 'sliders' },
  { id: 'team', label: 'Team & credits', icon: 'users' },
  { id: 'integrations', label: 'Integrations', icon: 'database' },
  { id: 'retention', label: 'Data retention', icon: 'history' },
];
