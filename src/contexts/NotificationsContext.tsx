import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react'
import { useAuth } from '@/contexts/AuthContext'
import { useSettings } from '@/contexts/SettingsContext'
import { api, type AppNotification } from '@/services/api'

export interface NotificationItem {
  id: string
  title: string
  message?: string
  linkPath?: string | null
  read: boolean
  createdAt: number
}

interface NotificationsContextValue {
  notifications: NotificationItem[]
  unreadCount: number
  loading: boolean
  refresh: () => Promise<void>
  markAsRead: (id: string) => void
  markAllRead: () => void
}

const NotificationsContext = createContext<NotificationsContextValue | null>(null)

function mapRow(row: AppNotification): NotificationItem {
  return {
    id: row.id,
    title: row.title,
    message: row.message ?? undefined,
    linkPath: row.link_path,
    read: row.read,
    createdAt: new Date(row.created_at).getTime(),
  }
}

export function NotificationsProvider({ children }: { children: ReactNode }) {
  const { accessStatus } = useAuth()
  const { settings } = useSettings()
  const [notifications, setNotifications] = useState<NotificationItem[]>([])
  const [loading, setLoading] = useState(false)

  const refresh = useCallback(async () => {
    if (accessStatus !== 'active' || !settings.notifications) {
      setNotifications([])
      return
    }
    setLoading(true)
    try {
      const rows = await api.notifications.list()
      setNotifications(rows.map(mapRow))
    } catch {
      // keep last known list on transient errors
    } finally {
      setLoading(false)
    }
  }, [accessStatus, settings.notifications])

  useEffect(() => {
    void refresh()
  }, [refresh])

  useEffect(() => {
    if (accessStatus !== 'active' || !settings.notifications) return
    const interval = setInterval(() => {
      void refresh()
    }, 30_000)
    return () => clearInterval(interval)
  }, [accessStatus, settings.notifications, refresh])

  const unreadCount = useMemo(
    () => notifications.filter((n) => !n.read).length,
    [notifications],
  )

  const markAsRead = useCallback((id: string) => {
    setNotifications((prev) => prev.map((n) => (n.id === id ? { ...n, read: true } : n)))
    api.notifications.markRead(id).catch(() => {
      void refresh()
    })
  }, [refresh])

  const markAllRead = useCallback(() => {
    setNotifications((prev) => prev.map((n) => ({ ...n, read: true })))
    api.notifications.markAllRead().catch(() => {
      void refresh()
    })
  }, [refresh])

  const value = useMemo<NotificationsContextValue>(
    () => ({
      notifications,
      unreadCount,
      loading,
      refresh,
      markAsRead,
      markAllRead,
    }),
    [notifications, unreadCount, loading, refresh, markAsRead, markAllRead],
  )

  return (
    <NotificationsContext.Provider value={value}>
      {children}
    </NotificationsContext.Provider>
  )
}

export function useNotifications() {
  const ctx = useContext(NotificationsContext)
  if (!ctx)
    throw new Error('useNotifications must be used within NotificationsProvider')
  return ctx
}
