import { Layers, List, Settings, User } from 'lucide-react'
import type { AppLayoutConfig } from '@/layout'
import { assets } from './assets'

/**
 * App shell config: brand, nav items, and page titles (Caliper + Auth Basement shell).
 */
export const layoutConfig: Omit<AppLayoutConfig, 'getPageTitle'> = {
  brand: {
    name: 'Caliper',
    subtitle: 'CV Screening',
    icon: Layers,
    logoColor: '#2CA85A',
    logoUrl: assets.logoUrl || undefined,
  },
  navItems: [
    { path: '/runs', label: 'Runs', icon: List, end: true },
    { path: '/jobs', label: 'Jobs', icon: Layers, end: true },
    { path: '/profile', label: 'Profile', icon: User, end: true },
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
    '/profile': 'Profile',
    '/settings': 'Settings',
  }
  return titles[pathname] ?? 'Caliper'
}
