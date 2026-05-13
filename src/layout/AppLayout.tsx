import { useState, useEffect, useRef } from 'react'
import { Outlet, useLocation } from 'react-router-dom'
import { Sidebar } from './Sidebar'
import { TopBar } from './TopBar'
import { useBreakpoint } from './useBreakpoint'
import type { AppLayoutConfig, NavItem } from './types'
import { assets, getBackgroundStyle } from '@/config/assets'

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
  outerBg = '#1A3C6E',
  contentCardBg = '#F4F7FB',
  banner,
  bottomNavItem,
  sidebarBottomContent,
  profileLabel,
  profileSubtext,
  onProfileClick,
  onSignOut,
  searchPlaceholder,
  topBarCenterSlot,
  topBarRightSlot,
  userName,
  languageLabel,
  onLanguageClick,
}: AppLayoutProps) {
  const location = useLocation()
  const { isMobile, isTablet } = useBreakpoint()

  const [isCollapsed, setIsCollapsed] = useState(true)
  const [isMobileOpen, setIsMobileOpen] = useState(false)
  const prevTablet = useRef(isTablet)

  useEffect(() => {
    if (isTablet && !prevTablet.current) {
      setIsCollapsed(true)
    }
    prevTablet.current = isTablet
  }, [isTablet])

  useEffect(() => {
    if (!isMobile) setIsMobileOpen(false)
  }, [isMobile])

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
      <div
        style={{
          display: 'flex',
          flex: 1,
          minHeight: 0,
          paddingRight: isMobile ? 0 : '0.5rem',
          paddingBottom: isMobile ? 0 : '0.5rem',
        }}
      >
        <Sidebar
          navItems={navItems}
          brand={brand}
          bottomNavItem={bottomNavItem}
          bottomContent={sidebarBottomContent}
          profileLabel={profileLabel}
          profileSubtext={profileSubtext}
          onProfileClick={onProfileClick}
          onSignOut={onSignOut}
          isCollapsed={isMobile ? false : isCollapsed}
          onToggle={() => setIsCollapsed((c) => !c)}
          isMobile={isMobile}
          isMobileOpen={isMobileOpen}
          onMobileClose={() => setIsMobileOpen(false)}
        />
        <div
          style={{
            flex: 1,
            minWidth: 0,
            paddingTop: isMobile ? 0 : '0.5rem',
            paddingLeft: 0,
            display: 'flex',
            flexDirection: 'column',
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
            <TopBar
              title={title}
              titleIcon={titleIcon}
              userName={userName}
              profileSubtext={profileSubtext}
              onSignOut={onSignOut}
              centerSlot={topBarCenterSlot}
              searchPlaceholder={searchPlaceholder}
              rightSlot={topBarRightSlot}
              languageLabel={languageLabel}
              onLanguageClick={onLanguageClick}
              onMobileMenuOpen={() => setIsMobileOpen(true)}
              isMobile={isMobile}
            />
            <main
              style={{
                flex: 1,
                minHeight: 0,
                overflowY: 'auto',
                padding: isMobile ? '1rem' : '1.5rem',
              }}
            >
              <Outlet />
            </main>
          </div>
        </div>
      </div>
    </div>
  )
}
