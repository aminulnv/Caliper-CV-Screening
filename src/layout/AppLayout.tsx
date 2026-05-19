import { useEffect } from 'react'
import { Outlet, useLocation } from 'react-router-dom'
import { AppNavBar } from './AppNavBar'
import { ContentHeader } from './TopBar'
import { useBreakpoint } from './useBreakpoint'
import type { AppLayoutConfig, NavItem } from './types'
import { assets, getBackgroundStyle } from '@/config/assets'
import { applyBrandTheme } from '@/config/brand-theme'

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
  fontFamily = "'Roboto', sans-serif",
  outerBg = assets.layoutBackgroundValue,
  contentCardBg = '#F4F7FB',
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

  const shellBackground = assets.layoutBackgroundValue || outerBg
  useEffect(() => {
    applyBrandTheme(shellBackground)
  }, [shellBackground])

  const isFullScreen = fullScreenPaths.some(
    (p) => location.pathname === p || location.pathname.startsWith(p + '/')
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
      <div
        style={{
          fontFamily,
          height: '100vh',
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
        }}
      >
        {banner}
        <div
          style={{
            flex: 1,
            minHeight: 0,
            display: 'flex',
            flexDirection: 'column',
          }}
        >
          <Outlet />
        </div>
      </div>
    )
  }

  const outerStyle = {
    fontFamily,
    height: '100vh',
    display: 'flex',
    flexDirection: 'column',
    overflow: 'hidden',
    ...getBackgroundStyle(assets.layoutBackgroundValue || outerBg),
  } as const

  return (
    <div style={outerStyle}>
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
      <div
        style={{
          flex: 1,
          minHeight: 0,
          display: 'flex',
          flexDirection: 'column',
          padding: isMobile ? 0 : '0 0.5rem 0.5rem',
        }}
      >
        <div
          style={{
            flex: 1,
            minHeight: 0,
            background: contentCardBg,
            borderRadius: isMobile ? 0 : '0.75rem',
            overflow: 'hidden',
            display: 'flex',
            flexDirection: 'column',
          }}
        >
          <ContentHeader
            title={title}
            titleIcon={titleIcon}
            centerSlot={topBarCenterSlot}
            searchPlaceholder={searchPlaceholder}
          />
          <main
            style={{
              flex: 1,
              minHeight: 0,
              overflowY: 'auto',
              padding: isMobile ? '0 1rem 1rem' : '0 1.5rem 1.5rem',
            }}
          >
            <Outlet />
          </main>
        </div>
      </div>
    </div>
  )
}
