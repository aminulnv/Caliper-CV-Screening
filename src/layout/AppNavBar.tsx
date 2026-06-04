import { useState, useEffect, useLayoutEffect, useRef, useCallback, type ReactNode, type CSSProperties } from 'react'
import { NavLink, useNavigate, useLocation } from 'react-router-dom'
import { Bell, ChevronDown, Menu, User, Settings, LogOut, X } from 'lucide-react'
import type { NavItem, BrandConfig } from './types'
import { ConfirmModal } from '@/components/ConfirmModal'
import { assets } from '@/config/assets'
import { useNotifications } from '@/contexts/NotificationsContext'
import { useSettings } from '@/contexts/SettingsContext'

const NAV_ICON_SIZE = 15
const NAV_ICON_STROKE = 1.75
const HOVER_CLOSE_DELAY_MS = 150

function isPathUnder(parentPath: string, pathname: string): boolean {
  return pathname === parentPath || (parentPath !== '/' && pathname.startsWith(parentPath + '/'))
}

function formatNotificationTime(ts: number) {
  const diff = Date.now() - ts
  if (diff < 60_000) return 'Just now'
  if (diff < 3600_000) return `${Math.floor(diff / 60_000)}m ago`
  if (diff < 86400_000) return `${Math.floor(diff / 3600_000)}h ago`
  return new Date(ts).toLocaleDateString()
}

function navLinkStyle(isActive: boolean, slidingIndicator = false): CSSProperties {
  return {
    display: 'inline-flex',
    alignItems: 'center',
    gap: '0.4375rem',
    padding: '0.4375rem 0.75rem',
    borderRadius: '0.5rem',
    textDecoration: 'none',
    fontSize: '0.8125rem',
    fontWeight: isActive ? 600 : 500,
    color: isActive ? 'var(--shell-nav-link-active)' : 'var(--shell-nav-link)',
    background: 'transparent',
    transition: slidingIndicator ? 'color 0.2s ease' : 'color 0.15s ease',
    whiteSpace: 'nowrap',
    position: slidingIndicator ? 'relative' : undefined,
    zIndex: slidingIndicator ? 1 : undefined,
  }
}

function getActiveNavPath(items: NavItem[], pathname: string): string | null {
  const matched = items
    .filter((item) => {
      const end = item.end ?? item.path === '/'
      return end ? pathname === item.path : isPathUnder(item.path, pathname)
    })
    .sort((a, b) => b.path.length - a.path.length)
  return matched[0]?.path ?? null
}

function NotificationBellDropdown() {
  const [open, setOpen] = useState(false)
  const [iconHovered, setIconHovered] = useState(false)
  const closeTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const { notifications, unreadCount, markAsRead, markAllRead } = useNotifications()
  const { settings } = useSettings()

  const clearCloseTimeout = () => {
    if (closeTimeoutRef.current) {
      clearTimeout(closeTimeoutRef.current)
      closeTimeoutRef.current = null
    }
  }

  useEffect(() => () => clearCloseTimeout(), [])

  return (
    <div
      style={{ position: 'relative' }}
      onMouseEnter={() => {
        clearCloseTimeout()
        setOpen(true)
        setIconHovered(true)
      }}
      onMouseLeave={() => {
        setIconHovered(false)
        clearCloseTimeout()
        closeTimeoutRef.current = setTimeout(() => setOpen(false), HOVER_CLOSE_DELAY_MS)
      }}
    >
      <button
        type="button"
        className="shell-icon-btn"
        aria-label={unreadCount > 0 ? `${unreadCount} unread notifications` : 'Notifications'}
        aria-expanded={open}
      >
        <Bell
          size={14}
          strokeWidth={iconHovered || open ? 2.25 : 1.75}
        />
        {unreadCount > 0 && (
          <span
            style={{
              position: 'absolute',
              top: '0.4375rem',
              right: '0.4375rem',
              width: '0.375rem',
              height: '0.375rem',
              borderRadius: '50%',
              background: '#EF4444',
              border: '0.09375rem solid rgba(255,255,255,0.3)',
            }}
            aria-hidden
          />
        )}
      </button>
      {open && settings.notifications && (
        <div className="shell-dropdown shell-dropdown--notifications" role="dialog" aria-label="Notifications">
          <div className="shell-dropdown__head">
            <span className="shell-dropdown__title">Notifications</span>
            {unreadCount > 0 && (
              <button
                type="button"
                onClick={markAllRead}
                style={{
                  fontSize: '0.6875rem',
                  fontWeight: 600,
                  color: '#6B7280',
                  background: 'none',
                  border: 'none',
                  cursor: 'pointer',
                }}
              >
                Mark all read
              </button>
            )}
          </div>
          <div style={{ padding: '0.25rem 0' }}>
            {notifications.length === 0 ? (
              <div style={{ padding: '1.5rem 0.75rem', fontSize: '0.8125rem', color: '#6B7280', textAlign: 'center' }}>
                No notifications yet
              </div>
            ) : (
              notifications.map((n) => (
                <button
                  key={n.id}
                  type="button"
                  className={`shell-dropdown-item shell-dropdown-item--block${n.read ? '' : ' shell-dropdown-item--unread'}`}
                  onClick={() => markAsRead(n.id)}
                >
                  <span style={{ fontWeight: 600, color: '#111827' }}>{n.title}</span>
                  {n.message && (
                    <div style={{ marginTop: '0.25rem', color: '#6B7280' }}>{n.message}</div>
                  )}
                  <div style={{ marginTop: '0.25rem', fontSize: '0.6875rem', color: '#9CA3AF' }}>
                    {formatNotificationTime(n.createdAt)}
                  </div>
                </button>
              ))
            )}
          </div>
        </div>
      )}
      {open && !settings.notifications && (
        <div className="shell-dropdown shell-dropdown--notifications" role="dialog" aria-label="Notifications">
          <div style={{ padding: '1rem 0.875rem', fontSize: '0.8125rem', color: 'var(--muted)', textAlign: 'center' }}>
            In-app notifications are off. Turn them on in Settings.
          </div>
        </div>
      )}
    </div>
  )
}

function ProfileDropdown({
  userName,
  profileSubtext,
  onSignOut,
  isMobile,
}: {
  userName?: string
  profileSubtext?: string
  onSignOut?: () => void
  isMobile?: boolean
}) {
  const [open, setOpen] = useState(false)
  const [showSignOutConfirm, setShowSignOutConfirm] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)
  const closeTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const navigate = useNavigate()

  const clearCloseTimeout = () => {
    if (closeTimeoutRef.current) {
      clearTimeout(closeTimeoutRef.current)
      closeTimeoutRef.current = null
    }
  }

  useEffect(() => () => clearCloseTimeout(), [])

  useEffect(() => {
    if (!open || isMobile) return
    const handleClick = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [open, isMobile])

  return (
    <div
      ref={containerRef}
      style={{ position: 'relative' }}
      onMouseEnter={() => {
        if (isMobile) return
        clearCloseTimeout()
        setOpen(true)
      }}
      onMouseLeave={() => {
        if (isMobile) return
        clearCloseTimeout()
        closeTimeoutRef.current = setTimeout(() => setOpen(false), HOVER_CLOSE_DELAY_MS)
      }}
    >
      <button
        type="button"
        className="shell-profile-trigger"
        onClick={isMobile ? () => setOpen((o) => !o) : undefined}
        aria-label="Profile menu"
        aria-expanded={open}
      >
        <div className="shell-profile-trigger__avatar">
          {userName ? userName.slice(0, 2).toUpperCase() : '?'}
        </div>
        {!isMobile && userName != null && (
          <span className="shell-profile-trigger__name">{userName}</span>
        )}
        {!isMobile && (
          <ChevronDown
            size={12}
            strokeWidth={2}
            style={{ flexShrink: 0, color: 'var(--subtle)', transform: open ? 'rotate(180deg)' : 'none' }}
          />
        )}
      </button>
      {open && (
        <div className="shell-dropdown shell-dropdown--profile" role="menu" aria-label="Profile menu">
          <div className="shell-dropdown__head">
            <div className="shell-dropdown__title">{userName ?? 'User'}</div>
            {profileSubtext && (
              <div style={{ fontSize: '0.75rem', color: 'var(--muted)', marginTop: '0.125rem' }}>{profileSubtext}</div>
            )}
          </div>
          <button type="button" className="shell-dropdown-item" onClick={() => { setOpen(false); navigate('/profile') }} role="menuitem">
            <User size={14} color="var(--muted)" strokeWidth={2} />
            Profile
          </button>
          <button type="button" className="shell-dropdown-item" onClick={() => { setOpen(false); navigate('/settings') }} role="menuitem">
            <Settings size={14} color="var(--muted)" strokeWidth={2} />
            Settings
          </button>
          <div style={{ height: 1, background: 'var(--line-soft)', margin: '0.25rem 0' }} />
          <button
            type="button"
            className="shell-dropdown-item shell-dropdown-item--danger"
            onClick={() => { setOpen(false); setShowSignOutConfirm(true) }}
            role="menuitem"
          >
            <LogOut size={14} strokeWidth={2} />
            Sign out
          </button>
        </div>
      )}
      <ConfirmModal
        open={showSignOutConfirm}
        onClose={() => setShowSignOutConfirm(false)}
        onConfirm={() => { setShowSignOutConfirm(false); onSignOut?.() }}
        title="Sign out?"
        message="Are you sure you want to sign out?"
        confirmLabel="Sign out"
        cancelLabel="Cancel"
        variant="danger"
      />
    </div>
  )
}

export interface AppNavBarProps {
  navItems: NavItem[]
  brand: BrandConfig
  bottomNavItem?: NavItem
  bottomContent?: ReactNode
  userName?: string
  profileSubtext?: string
  onSignOut?: () => void
  rightSlot?: ReactNode
  languageLabel?: string
  onLanguageClick?: () => void
  isMobile?: boolean
}

function NavDropdown({
  item,
  pathname,
  onNavigate,
}: {
  item: NavItem
  pathname: string
  onNavigate?: () => void
}) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  const parentActive = isPathUnder(item.path, pathname)

  useEffect(() => {
    if (!open) return
    const handleClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [open])

  return (
    <div ref={ref} style={{ position: 'relative' }}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        style={{
          ...navLinkStyle(parentActive),
          border: 'none',
          cursor: 'pointer',
          fontFamily: 'inherit',
        }}
      >
        <item.icon size={NAV_ICON_SIZE} strokeWidth={NAV_ICON_STROKE} />
        {item.label}
        <ChevronDown size={14} style={{ opacity: 0.7 }} />
      </button>
      {open && item.children && (
        <div className="shell-dropdown shell-nav-submenu">
          {item.children.map((child) => (
            <NavLink
              key={child.path}
              to={child.path}
              end
              onClick={() => { setOpen(false); onNavigate?.() }}
              className={({ isActive }) =>
                `shell-dropdown-item${isActive ? ' shell-dropdown-item--active' : ''}`
              }
            >
              {child.label}
            </NavLink>
          ))}
        </div>
      )}
    </div>
  )
}

function DesktopSlidingNav({
  items,
}: {
  items: NavItem[]
}) {
  const location = useLocation()
  const pathname = location.pathname
  const activePath = getActiveNavPath(items, pathname)
  const navRef = useRef<HTMLElement>(null)
  const linkRefs = useRef<Map<string, HTMLElement>>(new Map())
  const [indicator, setIndicator] = useState({ left: 0, width: 0, ready: false })

  const updateIndicator = useCallback(() => {
    if (!activePath || !navRef.current) return
    const link = linkRefs.current.get(activePath)
    if (!link) return
    const navRect = navRef.current.getBoundingClientRect()
    const linkRect = link.getBoundingClientRect()
    setIndicator({
      left: linkRect.left - navRect.left,
      width: linkRect.width,
      ready: true,
    })
  }, [activePath])

  useLayoutEffect(() => {
    updateIndicator()
  }, [updateIndicator, pathname, items])

  useEffect(() => {
    const nav = navRef.current
    if (!nav) return
    const ro = new ResizeObserver(() => updateIndicator())
    ro.observe(nav)
    window.addEventListener('resize', updateIndicator)
    return () => {
      ro.disconnect()
      window.removeEventListener('resize', updateIndicator)
    }
  }, [updateIndicator])

  const setLinkRef = (path: string) => (node: HTMLElement | null) => {
    if (node) linkRefs.current.set(path, node)
    else linkRefs.current.delete(path)
  }

  return (
    <nav ref={navRef} className="shell-nav">
      <div
        aria-hidden
        className="shell-nav__indicator"
        style={{
          left: indicator.left,
          width: indicator.width,
          opacity: indicator.ready ? 1 : 0,
        }}
      />
      {items.map((item) => {
        if (item.children?.length) {
          return <NavDropdown key={item.path} item={item} pathname={pathname} />
        }
        const { icon: Icon, label, path, end } = item
        return (
          <NavLink
            key={path}
            ref={setLinkRef(path)}
            to={path}
            end={end ?? path === '/'}
            style={({ isActive }) => navLinkStyle(isActive, true)}
          >
            <Icon size={NAV_ICON_SIZE} strokeWidth={NAV_ICON_STROKE} />
            {label}
          </NavLink>
        )
      })}
    </nav>
  )
}

function HorizontalNav({
  navItems,
  bottomNavItem,
  isMobile,
  mobileOpen,
  onMobileClose,
}: {
  navItems: NavItem[]
  bottomNavItem?: NavItem
  isMobile?: boolean
  mobileOpen?: boolean
  onMobileClose?: () => void
}) {
  const location = useLocation()
  const pathname = location.pathname
  const items = bottomNavItem ? [...navItems, bottomNavItem] : navItems

  const renderLink = (item: NavItem, _slidingIndicator = false) => {
    if (item.children?.length) {
      return <NavDropdown key={item.path} item={item} pathname={pathname} onNavigate={onMobileClose} />
    }
    const { icon: Icon, label, path, end } = item
    return (
      <NavLink
        key={path}
        to={path}
        end={end ?? path === '/'}
        onClick={onMobileClose}
        style={({ isActive }) => navLinkStyle(isActive, false)}
      >
        <Icon size={NAV_ICON_SIZE} strokeWidth={NAV_ICON_STROKE} />
        {label}
      </NavLink>
    )
  }

  if (isMobile) {
    return (
      <>
        <div
          onClick={onMobileClose}
          className="app-shell-mobile-overlay"
          style={{
            opacity: mobileOpen ? 1 : 0,
            pointerEvents: mobileOpen ? 'auto' : 'none',
          }}
        />
        <div
          className="app-shell-mobile-drawer"
          style={{ transform: mobileOpen ? 'translateY(0)' : 'translateY(-100%)' }}
        >
          <button
            type="button"
            className="app-shell-mobile-drawer__close"
            onClick={onMobileClose}
            aria-label="Close menu"
          >
            <X size={14} strokeWidth={2.5} />
          </button>
          {items.map((item) => (
            <div key={item.path} style={{ display: 'flex', flexDirection: 'column', gap: '0.0625rem' }}>
              {renderLink(item, false)}
              {item.children?.map((child) => (
                <NavLink
                  key={child.path}
                  to={child.path}
                  end
                  onClick={onMobileClose}
                  style={({ isActive }) => ({
                    ...navLinkStyle(isActive, false),
                    marginLeft: '1.25rem',
                    fontSize: '0.75rem',
                  })}
                >
                  {child.label}
                </NavLink>
              ))}
            </div>
          ))}
        </div>
      </>
    )
  }

  return <DesktopSlidingNav items={items} />
}

export function AppNavBar({
  navItems,
  brand,
  bottomNavItem,
  bottomContent,
  userName,
  profileSubtext,
  onSignOut,
  rightSlot,
  languageLabel,
  onLanguageClick,
  isMobile = false,
}: AppNavBarProps) {
  const navigate = useNavigate()
  const [mobileOpen, setMobileOpen] = useState(false)

  useEffect(() => {
    if (!isMobile) setMobileOpen(false)
  }, [isMobile])

  const { name, subtitle, icon: BrandIcon, logoColor = assets.brandLogoColor, logoUrl } = brand

  const brandBlock = (
    <button
      type="button"
      className="app-shell-brand"
      onClick={() => {
        navigate('/')
        setMobileOpen(false)
      }}
    >
      <div
        className="app-shell-brand__mark"
        style={{ background: logoUrl ? 'transparent' : logoColor }}
      >
        {logoUrl ? (
          <img src={logoUrl} alt="" style={{ width: '100%', height: '100%', objectFit: 'contain' }} />
        ) : (
          <BrandIcon size={17} color="#fff" strokeWidth={2.5} />
        )}
      </div>
      {!isMobile && (
        <div className="app-shell-brand__text">
          <div className="app-shell-brand__name">{name}</div>
          {subtitle && <div className="app-shell-brand__subtitle">{subtitle}</div>}
        </div>
      )}
    </button>
  )

  return (
    <header className={`app-shell-nav${isMobile ? ' app-shell-nav--mobile' : ''}`}>
      <div className="app-shell-nav__left">
      {isMobile && (
        <button
          type="button"
          className="app-shell-mobile-menu-btn"
          onClick={() => setMobileOpen(true)}
          aria-label="Open menu"
        >
          <Menu size={16} strokeWidth={2} />
        </button>
      )}
      {brandBlock}
      </div>
      {!isMobile && (
        <div className="app-shell-nav__center">
          <div className="app-shell-nav__center-inner">
            <HorizontalNav
              navItems={navItems}
              bottomNavItem={bottomNavItem}
            />
          </div>
        </div>
      )}
      <div className="app-shell-nav__right">
      {bottomContent}
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexShrink: 0 }}>
        {languageLabel != null && onLanguageClick && (
          <button type="button" className="shell-icon-btn" onClick={onLanguageClick} style={{ width: 'auto', padding: '0 0.625rem', fontSize: '0.6875rem', fontWeight: 600 }}>
            {languageLabel}
          </button>
        )}
        {rightSlot ?? (
          <>
            <NotificationBellDropdown />
            <ProfileDropdown
              userName={userName}
              profileSubtext={profileSubtext}
              onSignOut={onSignOut}
              isMobile={isMobile}
            />
          </>
        )}
      </div>
      </div>
      {isMobile && (
        <HorizontalNav
          navItems={navItems}
          bottomNavItem={bottomNavItem}
          isMobile
          mobileOpen={mobileOpen}
          onMobileClose={() => setMobileOpen(false)}
        />
      )}
    </header>
  )
}
