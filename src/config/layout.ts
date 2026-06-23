import { Briefcase, DraftingCompass, List, Settings, BarChart3, History } from 'lucide-react'
import type { AppLayoutConfig } from '@/layout'
import { assets } from './assets'

/**
 * App shell config: brand, nav items, and page titles (Caliper + Auth Basement shell).
 */
export const layoutConfig: Omit<AppLayoutConfig, 'getPageTitle'> = {
  brand: {
    name: 'Caliper',
    subtitle: 'CV Screening',
    icon: DraftingCompass,
    logoColor: assets.brandLogoColor,
    logoUrl: assets.logoUrl || undefined,
  },
  navItems: [
    {
      path: '/jobs',
      label: 'Jobs',
      icon: Briefcase,
      children: [
        { path: '/talent-search', label: 'Talent search', requiresEdit: true },
      ],
    },
    { path: '/runs', label: 'Processed CVs', icon: List, end: true },
    { path: '/activity', label: 'Activity Log', icon: History, end: true },
    { path: '/usage', label: 'Usage', icon: BarChart3, end: true, requiresEdit: true as const },
    { path: '/settings', label: 'Settings', icon: Settings, end: true, requiresAdmin: true as const },
  ],
}

export function getPageTitle(pathname: string): string {
  if (pathname.startsWith('/runs/')) {
    const id = pathname.slice('/runs/'.length)
    return id ? `Run ${id}` : 'Processed CVs'
  }
  if (pathname.startsWith('/jobs/') && pathname.length > '/jobs/'.length) {
    return 'Job'
  }
  const titles: Record<string, string> = {
    '/runs': 'Processed CVs',
    '/jobs': 'Jobs',
    '/activity': 'Activity Log',
    '/usage': 'Usage',
    '/settings': 'Settings',
    '/profile': 'Profile',
    '/talent-search': 'Talent search',
  }
  return titles[pathname] ?? 'Caliper'
}
