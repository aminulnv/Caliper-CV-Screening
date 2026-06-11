import { useMemo } from 'react'
import { AppLayout } from './AppLayout'
import { useAuth } from '@/contexts/AuthContext'
import { layoutConfig, getPageTitle } from '@/config/layout'
import { GlobalSearch } from '@/components/GlobalSearch'

/**
 * App shell layout with top navigation bar, wired to auth (user name in header).
 * Use as the element of the protected layout route.
 */
export default function AuthenticatedLayout() {
  const { user, displayName, avatarUrl, signOut, isAdmin } = useAuth()

  const navItems = useMemo(
    () => (isAdmin ? layoutConfig.navItems : layoutConfig.navItems.filter((item) => item.path !== '/settings')),
    [isAdmin],
  )

  return (
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
  )
}
