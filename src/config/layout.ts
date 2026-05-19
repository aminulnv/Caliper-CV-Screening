import { Briefcase, FileUser, List, Settings } from 'lucide-react'
import type { AppLayoutConfig } from '@/layout'
import { assets } from './assets'

/**
 * App shell config: brand, nav items, and page titles (Caliper + Auth Basement shell).
 */
export const layoutConfig: Omit<AppLayoutConfig, 'getPageTitle'> = {
  brand: {
    name: 'Caliper',
    subtitle: 'CV Screening',
    icon: FileUser,
    logoColor: assets.brandLogoColor,
    logoUrl: assets.logoUrl || undefined,
  },
  navItems: [
    { path: '/jobs', label: 'Jobs', icon: Briefcase, end: true },
    { path: '/runs', label: 'Runs', icon: List, end: true },
    { path: '/settings', label: 'Settings', icon: Settings, end: true },
  ],
}

export function getPageTitle(pathname: string): string {
  if (pathname.startsWith('/runs/')) {
    const id = pathname.slice('/runs/'.length)
    return id ? `Run ${id}` : 'Runs'
  }
  const titles: Record<string, string> = {
    '/runs': 'Runs',
    '/jobs': 'Jobs',
    '/settings': 'Settings',
    '/profile': 'Profile',
  }
  return titles[pathname] ?? 'Caliper'
}
