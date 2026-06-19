import type { BudgetStatus } from '@/services/api'

export function creditsStatusLabel(status: BudgetStatus | string | undefined): string {
  switch (status) {
    case 'blocked':
      return 'No credits left'
    case 'warn':
      return 'Low credits'
    case 'unlimited':
      return 'Pay as you go'
    case 'ok':
      return 'Credits available'
    default:
      return '—'
  }
}
