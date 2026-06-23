import type { LucideIcon } from 'lucide-react'

export interface NavItemChild {
  path: string
  label: string
  /** Non-navigable placeholder label suffix (e.g. Soon badge). */
  comingSoon?: boolean
  /** Visible only to editor and admin roles. */
  requiresEdit?: boolean
}

export interface NavItem {
  path: string
  label: string
  icon: LucideIcon
  end?: boolean
  /** Non-navigable placeholder (e.g. pgvector not ready yet). */
  comingSoon?: boolean
  /** Visible only to admin role. */
  requiresAdmin?: boolean
  /** Visible only to editor (recruiter) and admin roles. */
  requiresEdit?: boolean
  /** Nested sub-items (no icons). Rendered indented under parent with expand/collapse. */
  children?: NavItemChild[]
}

export interface BrandConfig {
  name: string
  subtitle?: string
  icon: LucideIcon
  logoColor?: string
  /** When set, shown as logo image instead of icon. Use @/config/assets for a single source of truth. */
  logoUrl?: string
}

export interface AppLayoutConfig {
  navItems: NavItem[]
  brand: BrandConfig
  getPageTitle?: (pathname: string) => string
  fullScreenPaths?: string[]
  fontFamily?: string
  outerBg?: string
  contentCardBg?: string
}
