import { useMemo } from 'react'
import { AppLayout } from './AppLayout'
import { useAuth } from '@/contexts/AuthContext'
import { layoutConfig, getPageTitle } from '@/config/layout'
import { semanticCvSearchEnabled } from '@/config/features'
import type { NavItem } from '@/layout/types'
import { GlobalSearch } from '@/components/GlobalSearch'
import { PageTitleProvider } from '@/caliper/PageTitleContext'

/**
 * App shell layout with top navigation bar, wired to auth (user name in header).
 * Use as the element of the protected layout route.
 */
export default function AuthenticatedLayout() {
  const { user, displayName, avatarUrl, signOut, isAdmin, canEdit } = useAuth()

  const navItems = useMemo(
    () => layoutConfig.navItems
      .filter((item) => {
        if (item.requiresAdmin) return isAdmin
        if (item.requiresEdit) return canEdit
        return true
      })
      .map((item): NavItem => {
        if (!item.children?.length) return item
        const children = item.children
          .filter((child) => !child.requiresEdit || canEdit)
          .map((child) => ({
            ...child,
            comingSoon: child.path === '/talent-search' && !semanticCvSearchEnabled
              ? true
              : child.comingSoon,
          }))
        return { ...item, children }
      }),
    [isAdmin, canEdit],
  )

  return (
    <PageTitleProvider>
      <AppLayout
        {...layoutConfig}
        navItems={navItems}
        getPageTitle={getPageTitle}
        userName={displayName}
        profileLabel={displayName}
        profileSubtext={user?.email}
        avatarUrl={avatarUrl}
        onSignOut={signOut}
        showSettingsLink={isAdmin}
        topBarCenterSlot={<GlobalSearch />}
      />
    </PageTitleProvider>
  )
}
