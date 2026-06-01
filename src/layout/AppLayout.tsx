import { useEffect } from 'react'
import { Outlet, useLocation } from 'react-router-dom'
import { AppNavBar } from './AppNavBar'
import { ContentHeader } from './TopBar'
import { useBreakpoint } from './useBreakpoint'
import type { AppLayoutConfig, NavItem } from './types'
import { applyBrandTheme } from '@/config/brand-theme'
import { assets } from '@/config/assets'

interface AppLayoutProps extends AppLayoutConfig {
  banner?: React.ReactNode
  bottomNavItem?: NavItem
  sidebarBottomContent?: React.ReactNode
  profileLabel?: string
  profileSubtext?: string
  onProfileClick?: () => void
  onSignOut?: () => void
  getPageTitle?: (pathname: string) => string
  searchPlaceholder?: string
  topBarCenterSlot?: React.ReactNode
  topBarRightSlot?: React.ReactNode
  userName?: string
  languageLabel?: string
  onLanguageClick?: () => void
}

export function AppLayout({
  navItems,
  brand,
  getPageTitle = () => '',
  fullScreenPaths = [],
  banner,
  bottomNavItem,
  sidebarBottomContent,
  profileSubtext,
  onSignOut,
  searchPlaceholder,
  topBarCenterSlot,
  topBarRightSlot,
  userName,
  languageLabel,
  onLanguageClick,
}: AppLayoutProps) {
  const location = useLocation()
  const { isMobile } = useBreakpoint()

  useEffect(() => {
    applyBrandTheme(assets.layoutBackgroundValue)
  }, [])

  const isFullScreen = fullScreenPaths.some(
    (p) => location.pathname === p || location.pathname.startsWith(p + '/'),
  )

  const pathname = location.pathname
  const title = getPageTitle(pathname) || pathname || 'App'
  const currentNavItem = navItems
    .filter((item) => {
      const end = item.end ?? item.path === '/'
      return end ? pathname === item.path : pathname === item.path || pathname.startsWith(item.path + '/')
    })
    .sort((a, b) => b.path.length - a.path.length)[0]
  const titleIcon = currentNavItem?.icon

  if (isFullScreen) {
    return (
      <div className="app-shell app-shell--fullscreen">
        {banner}
        <div style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column' }}>
          <Outlet />
        </div>
      </div>
    )
  }

  return (
    <div className="app-shell">
      {banner}
      <AppNavBar
        navItems={navItems}
        brand={brand}
        bottomNavItem={bottomNavItem}
        bottomContent={sidebarBottomContent}
        userName={userName}
        profileSubtext={profileSubtext}
        onSignOut={onSignOut}
        rightSlot={topBarRightSlot}
        languageLabel={languageLabel}
        onLanguageClick={onLanguageClick}
        isMobile={isMobile}
      />
      <div className="app-shell-body">
        <ContentHeader
          title={title}
          titleIcon={titleIcon}
          centerSlot={topBarCenterSlot}
          searchPlaceholder={searchPlaceholder}
        />
        <main className={`app-shell-main${isMobile ? ' app-shell-main--mobile' : ''}`}>
          <Outlet />
        </main>
      </div>
    </div>
  )
}
