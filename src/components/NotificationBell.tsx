import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Bell } from 'lucide-react'
import { useNotifications } from '@/contexts/NotificationsContext'

function formatWhen(ts: number): string {
  const diff = Date.now() - ts
  const mins = Math.floor(diff / 60_000)
  if (mins < 1) return 'Just now'
  if (mins < 60) return `${mins}m ago`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return `${hrs}h ago`
  const days = Math.floor(hrs / 24)
  return `${days}d ago`
}

export function NotificationBell() {
  const navigate = useNavigate()
  const { notifications, unreadCount, loading, markAsRead, markAllRead } = useNotifications()
  const [open, setOpen] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const handleClick = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [open])

  const handleOpenItem = (id: string, linkPath?: string | null) => {
    markAsRead(id)
    setOpen(false)
    if (linkPath) navigate(linkPath)
  }

  return (
    <div ref={containerRef} className="shell-notifications" style={{ position: 'relative' }}>
      <button
        type="button"
        className="shell-icon-btn"
        aria-label={`Notifications${unreadCount ? `, ${unreadCount} unread` : ''}`}
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
      >
        <Bell size={14} strokeWidth={1.75} />
        {unreadCount > 0 && (
          <span className="shell-notifications__badge" aria-hidden>
            {unreadCount > 9 ? '9+' : unreadCount}
          </span>
        )}
      </button>

      {open && (
        <div className="shell-notifications__panel" role="menu">
          <div className="shell-notifications__head">
            <span className="shell-notifications__title">Notifications</span>
            {unreadCount > 0 && (
              <button type="button" className="shell-notifications__mark-all" onClick={markAllRead}>
                Mark all read
              </button>
            )}
          </div>
          <div className="shell-notifications__list">
            {loading && notifications.length === 0 ? (
              <div className="shell-notifications__empty">Loading…</div>
            ) : notifications.length === 0 ? (
              <div className="shell-notifications__empty">No notifications yet.</div>
            ) : (
              notifications.map((n) => (
                <button
                  key={n.id}
                  type="button"
                  role="menuitem"
                  className={`shell-notifications__item${n.read ? '' : ' is-unread'}`}
                  onClick={() => handleOpenItem(n.id, n.linkPath)}
                >
                  <div className="shell-notifications__item-title">{n.title}</div>
                  {n.message && (
                    <div className="shell-notifications__item-msg">{n.message}</div>
                  )}
                  <div className="shell-notifications__item-when">{formatWhen(n.createdAt)}</div>
                </button>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  )
}
