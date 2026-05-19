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

const NAV_SLIDE_TRANSITION = 'left 0.28s cubic-bezier(0.4, 0, 0.2, 1), width 0.28s cubic-bezier(0.4, 0, 0.2, 1)'

function navLinkStyle(isActive: boolean, slidingIndicator = false, activeBg?: string): CSSProperties {
  const pillBg = activeBg ?? assets.brandLogoColor
  return {
    display: 'inline-flex',
    alignItems: 'center',
    gap: '0.4375rem',
    padding: '0.4375rem 0.75rem',
    borderRadius: '0.5rem',
    textDecoration: 'none',
    fontSize: '0.8125rem',
    fontWeight: isActive ? 600 : 500,
    color: isActive ? '#FFFFFF' : 'rgba(255,255,255,0.65)',
    background: slidingIndicator ? 'transparent' : isActive ? pillBg : 'transparent',
    transition: slidingIndicator ? 'color 0.2s ease' : 'background 0.12s, color 0.12s',
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

  const panelStyle: CSSProperties = {
    position: 'absolute',
    top: '100%',
    right: 0,
    marginTop: '0.25rem',
    width: '20rem',
    maxHeight: '22rem',
    overflowY: 'auto',
    background: '#fff',
    border: '0.0625rem solid #E8ECF0',
    borderRadius: '0.5rem',
    boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
    zIndex: 1000,
  }

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
        style={{
          position: 'relative',
          width: '2rem',
          height: '2rem',
          borderRadius: '0.4375rem',
          border: '0.0625rem solid rgba(255,255,255,0.2)',
          background: 'rgba(255,255,255,0.1)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          cursor: 'pointer',
          flexShrink: 0,
        }}
        aria-label={unreadCount > 0 ? `${unreadCount} unread notifications` : 'Notifications'}
        aria-expanded={open}
      >
        <Bell
          size={14}
          color={iconHovered || open ? '#fff' : 'rgba(255,255,255,0.75)'}
          strokeWidth={iconHovered || open ? 2.5 : 1.75}
          fill={iconHovered || open ? 'rgba(255,255,255,0.9)' : 'none'}
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
        <div style={panelStyle} role="dialog" aria-label="Notifications">
          <div
            style={{
              padding: '0.5rem 0.75rem',
              borderBottom: '0.0625rem solid #E8ECF0',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
            }}
          >
            <span style={{ fontSize: '0.8125rem', fontWeight: 600, color: '#111827' }}>Notifications</span>
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
                  className="topbar-dropdown-item"
                  onClick={() => markAsRead(n.id)}
                  style={{
                    display: 'block',
                    width: '100%',
                    padding: '0.625rem 0.75rem',
                    border: 'none',
                    background: n.read ? 'transparent' : '#F9FAFB',
                    cursor: 'pointer',
                    textAlign: 'left',
                    fontSize: '0.8125rem',
                    borderBottom: '0.0625rem solid #F3F4F6',
                  }}
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
        <div style={panelStyle} role="dialog" aria-label="Notifications">
          <div style={{ padding: '1rem 0.75rem', fontSize: '0.8125rem', color: '#6B7280', textAlign: 'center' }}>
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
  onDark,
}: {
  userName?: string
  profileSubtext?: string
  onSignOut?: () => void
  isMobile?: boolean
  onDark?: boolean
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

  const triggerStyle: CSSProperties = onDark
    ? {
        display: 'flex',
        alignItems: 'center',
        gap: '0.4375rem',
        cursor: 'pointer',
        padding: '0.1875rem 0.5rem 0.1875rem 0.1875rem',
        borderRadius: '0.5rem',
        border: '0.0625rem solid rgba(255,255,255,0.2)',
        background: 'rgba(255,255,255,0.1)',
        height: '2rem',
      }
    : {
        display: 'flex',
        alignItems: 'center',
        gap: '0.4375rem',
        cursor: 'pointer',
        padding: '0.1875rem 0.5rem 0.1875rem 0.1875rem',
        borderRadius: '0.5rem',
        border: '0.0625rem solid #E8ECF0',
        background: '#fff',
        height: '2rem',
      }

  const panelStyle: CSSProperties = {
    position: 'absolute',
    top: '100%',
    right: 0,
    marginTop: '0.25rem',
    minWidth: '12rem',
    background: '#fff',
    border: '0.0625rem solid #E8ECF0',
    borderRadius: '0.5rem',
    boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
    zIndex: 1000,
    overflow: 'hidden',
  }

  const itemStyle: CSSProperties = {
    display: 'flex',
    alignItems: 'center',
    gap: '0.5rem',
    width: '100%',
    padding: '0.5rem 0.75rem',
    border: 'none',
    background: 'none',
    fontSize: '0.8125rem',
    color: '#374151',
    cursor: 'pointer',
    textAlign: 'left',
  }

  const avatarBg = onDark ? 'rgba(255,255,255,0.2)' : 'var(--brand-primary)'
  const avatarColor = onDark ? '#fff' : 'var(--brand-primary-contrast)'
  const nameColor = onDark ? '#fff' : '#1F2937'

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
        onClick={isMobile ? () => setOpen((o) => !o) : undefined}
        style={triggerStyle}
        aria-label="Profile menu"
        aria-expanded={open}
      >
        <div
          style={{
            width: '1.625rem',
            height: '1.625rem',
            borderRadius: '0.375rem',
            background: avatarBg,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: '0.625rem',
            fontWeight: 700,
            color: avatarColor,
            flexShrink: 0,
          }}
        >
          {userName ? userName.slice(0, 2).toUpperCase() : '?'}
        </div>
        {!isMobile && userName != null && (
          <span style={{ fontSize: '0.75rem', fontWeight: 500, color: nameColor, whiteSpace: 'nowrap' }}>
            {userName}
          </span>
        )}
        {!isMobile && (
          <ChevronDown
            size={12}
            color={onDark ? 'rgba(255,255,255,0.6)' : '#9CA3AF'}
            strokeWidth={2}
            style={{ flexShrink: 0, transform: open ? 'rotate(180deg)' : 'none' }}
          />
        )}
      </button>
      {open && (
        <div style={panelStyle} role="menu" aria-label="Profile menu">
          <div style={{ padding: '0.625rem 0.75rem', borderBottom: '0.0625rem solid #E8ECF0' }}>
            <div style={{ fontSize: '0.8125rem', fontWeight: 600, color: '#111827' }}>{userName ?? 'User'}</div>
            {profileSubtext && (
              <div style={{ fontSize: '0.75rem', color: '#6B7280', marginTop: '0.125rem' }}>{profileSubtext}</div>
            )}
          </div>
          <button type="button" className="topbar-dropdown-item" style={itemStyle} onClick={() => { setOpen(false); navigate('/profile') }} role="menuitem">
            <User size={14} color="#6B7280" strokeWidth={2} />
            Profile
          </button>
          <button type="button" className="topbar-dropdown-item" style={itemStyle} onClick={() => { setOpen(false); navigate('/settings') }} role="menuitem">
            <Settings size={14} color="#6B7280" strokeWidth={2} />
            Settings
          </button>
          <div style={{ height: '0.0625rem', background: '#E8ECF0', margin: '0.25rem 0' }} />
          <button
            type="button"
            className="topbar-dropdown-item topbar-dropdown-item--signout"
            style={{ ...itemStyle, color: '#DC2626' }}
            onClick={() => { setOpen(false); setShowSignOutConfirm(true) }}
            role="menuitem"
          >
            <LogOut size={14} color="#DC2626" strokeWidth={2} />
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
        <div
          style={{
            position: 'absolute',
            top: '100%',
            left: 0,
            marginTop: '0.25rem',
            minWidth: '10rem',
            background: '#fff',
            borderRadius: '0.5rem',
            boxShadow: '0 4px 16px rgba(0,0,0,0.18)',
            padding: '0.375rem',
            zIndex: 100,
          }}
        >
          {item.children.map((child) => (
            <NavLink
              key={child.path}
              to={child.path}
              end
              onClick={() => { setOpen(false); onNavigate?.() }}
              style={({ isActive }) => ({
                display: 'block',
                padding: '0.5rem 0.75rem',
                borderRadius: '0.375rem',
                textDecoration: 'none',
                fontSize: '0.8125rem',
                fontWeight: isActive ? 600 : 400,
                color: isActive ? 'var(--brand-primary)' : '#374151',
                background: isActive ? 'var(--brand-primary-soft)' : 'transparent',
              })}
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
  activePillColor,
}: {
  items: NavItem[]
  activePillColor: string
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
    <nav
      ref={navRef}
      style={{
        position: 'relative',
        display: 'flex',
        alignItems: 'center',
        gap: '0.125rem',
        flexWrap: 'nowrap',
      }}
    >
      <div
        aria-hidden
        style={{
          position: 'absolute',
          top: 0,
          bottom: 0,
          left: indicator.left,
          width: indicator.width,
          borderRadius: '0.5rem',
          background: activePillColor,
          transition: NAV_SLIDE_TRANSITION,
          opacity: indicator.ready ? 1 : 0,
          pointerEvents: 'none',
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
  activePillColor,
  isMobile,
  mobileOpen,
  onMobileClose,
}: {
  navItems: NavItem[]
  bottomNavItem?: NavItem
  activePillColor: string
  isMobile?: boolean
  mobileOpen?: boolean
  onMobileClose?: () => void
}) {
  const location = useLocation()
  const pathname = location.pathname
  const items = bottomNavItem ? [...navItems, bottomNavItem] : navItems

  const renderLink = (item: NavItem, slidingIndicator = false) => {
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
        style={({ isActive }) => navLinkStyle(isActive, slidingIndicator, activePillColor)}
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
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0,0,0,0.5)',
            zIndex: 49,
            opacity: mobileOpen ? 1 : 0,
            pointerEvents: mobileOpen ? 'auto' : 'none',
            transition: 'opacity 0.22s',
          }}
        />
        <div
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            background: 'var(--brand-primary-dark, #1e1b4b)',
            zIndex: 50,
            padding: '0.75rem 1rem 1rem',
            display: 'flex',
            flexDirection: 'column',
            gap: '0.25rem',
            transform: mobileOpen ? 'translateY(0)' : 'translateY(-100%)',
            transition: 'transform 0.25s cubic-bezier(0.4, 0, 0.2, 1)',
            boxShadow: mobileOpen ? '0 0.5rem 1.5rem rgba(0,0,0,0.3)' : 'none',
            maxHeight: '80vh',
            overflowY: 'auto',
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: '0.25rem' }}>
            <button
              type="button"
              onClick={onMobileClose}
              style={{
                width: '1.75rem',
                height: '1.75rem',
                borderRadius: '0.4375rem',
                border: '0.0625rem solid rgba(255,255,255,0.14)',
                background: 'rgba(255,255,255,0.07)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                cursor: 'pointer',
                color: 'rgba(255,255,255,0.7)',
              }}
              aria-label="Close menu"
            >
              <X size={14} strokeWidth={2.5} />
            </button>
          </div>
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
                    ...navLinkStyle(isActive, false, activePillColor),
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

  return <DesktopSlidingNav items={items} activePillColor={activePillColor} />
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
      onClick={() => {
        navigate('/')
        setMobileOpen(false)
      }}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: '0.625rem',
        border: 'none',
        background: 'transparent',
        cursor: 'pointer',
        padding: 0,
        flexShrink: 0,
      }}
    >
      <div
        style={{
          background: logoUrl ? 'transparent' : logoColor,
          borderRadius: '0.625rem',
          width: '2rem',
          height: '2rem',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          flexShrink: 0,
        }}
      >
        {logoUrl ? (
          <img src={logoUrl} alt="" style={{ width: '100%', height: '100%', objectFit: 'contain' }} />
        ) : (
          <BrandIcon size={17} color="#fff" strokeWidth={2.5} />
        )}
      </div>
      {!isMobile && (
        <div style={{ textAlign: 'left' }}>
          <div style={{ color: '#FFFFFF', fontSize: '0.9375rem', fontWeight: 700, lineHeight: 1.2, whiteSpace: 'nowrap' }}>
            {name}
          </div>
          {subtitle && (
            <div
              style={{
                color: 'rgba(255,255,255,0.38)',
                fontSize: '0.5625rem',
                letterSpacing: '0.1em',
                textTransform: 'uppercase',
                marginTop: '0.0625rem',
                whiteSpace: 'nowrap',
              }}
            >
              {subtitle}
            </div>
          )}
        </div>
      )}
    </button>
  )

  return (
    <header
      style={{
        position: 'relative',
        flexShrink: 0,
        height: isMobile ? '3.25rem' : '3.5rem',
        display: 'flex',
        alignItems: 'center',
        padding: isMobile ? '0 0.75rem' : '0 1rem',
        gap: isMobile ? '0.5rem' : '1rem',
        zIndex: 40,
      }}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '0.5rem',
          flex: isMobile ? 1 : '1 1 0',
          minWidth: 0,
        }}
      >
      {isMobile && (
        <button
          type="button"
          onClick={() => setMobileOpen(true)}
          style={{
            width: '2.125rem',
            height: '2.125rem',
            borderRadius: '0.5rem',
            border: '0.0625rem solid rgba(255,255,255,0.2)',
            background: 'rgba(255,255,255,0.1)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            cursor: 'pointer',
            flexShrink: 0,
          }}
          aria-label="Open menu"
        >
          <Menu size={16} color="#fff" strokeWidth={2} />
        </button>
      )}
      {brandBlock}
      </div>
      {!isMobile && (
        <div
          style={{
            position: 'absolute',
            left: '50%',
            top: '50%',
            transform: 'translate(-50%, -50%)',
            display: 'flex',
            justifyContent: 'center',
            pointerEvents: 'none',
          }}
        >
          <div style={{ pointerEvents: 'auto' }}>
            <HorizontalNav
              navItems={navItems}
              bottomNavItem={bottomNavItem}
              activePillColor={logoColor}
            />
          </div>
        </div>
      )}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '0.5rem',
          flex: isMobile ? undefined : '1 1 0',
          justifyContent: 'flex-end',
          minWidth: 0,
        }}
      >
      {bottomContent}
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexShrink: 0 }}>
        {languageLabel != null && onLanguageClick && (
          <button
            type="button"
            onClick={onLanguageClick}
            style={{
              height: '2rem',
              padding: '0 0.625rem',
              borderRadius: '0.4375rem',
              border: '0.0625rem solid rgba(255,255,255,0.2)',
              background: 'rgba(255,255,255,0.1)',
              fontSize: '0.6875rem',
              fontWeight: 600,
              color: '#fff',
              cursor: 'pointer',
            }}
          >
            🌐 {languageLabel}
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
              onDark
            />
          </>
        )}
      </div>
      </div>
      {isMobile && (
        <HorizontalNav
          navItems={navItems}
          bottomNavItem={bottomNavItem}
          activePillColor={logoColor}
          isMobile
          mobileOpen={mobileOpen}
          onMobileClose={() => setMobileOpen(false)}
        />
      )}
    </header>
  )
}
