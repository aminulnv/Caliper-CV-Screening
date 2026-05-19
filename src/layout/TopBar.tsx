import { Search } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { useLocation } from 'react-router-dom'

export interface ContentHeaderProps {
  title: string | ((pathname: string) => string)
  titleIcon?: LucideIcon
  centerSlot?: React.ReactNode
  searchPlaceholder?: string
}

/** Page title row inside the content card (nav lives in AppNavBar). */
export function ContentHeader({
  title,
  titleIcon: TitleIcon,
  centerSlot,
  searchPlaceholder,
}: ContentHeaderProps) {
  const location = useLocation()
  const pathname = location.pathname
  const titleText = typeof title === 'function' ? title(pathname) : title

  const centerContent =
    centerSlot ??
    (searchPlaceholder != null && (
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '0.5rem',
          background: '#F4F7FB',
          border: '0.0625rem solid #E8ECF0',
          borderRadius: '0.5rem',
          padding: '0 0.75rem',
          height: '2.125rem',
          width: '11.25rem',
          flexShrink: 0,
        }}
      >
        <Search size={13} color="#9CA3AF" style={{ flexShrink: 0 }} />
        <input
          placeholder={searchPlaceholder}
          style={{
            border: 'none',
            background: 'transparent',
            outline: 'none',
            fontSize: '0.75rem',
            color: '#6B7280',
            width: '100%',
          }}
        />
      </div>
    ))

  return (
    <header
      style={{
        background: '#FFFFFF',
        borderBottom: '0.0625rem solid #E8ECF0',
        minHeight: '3rem',
        display: 'flex',
        alignItems: 'center',
        padding: '0.625rem 1.25rem',
        gap: '0.75rem',
        flexShrink: 0,
      }}
    >
      <div style={{ flex: 1, minWidth: 0, overflow: 'hidden', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
        {TitleIcon && <TitleIcon size={18} strokeWidth={1.75} style={{ flexShrink: 0, color: '#374151' }} />}
        <h1
          style={{
            margin: 0,
            color: '#111827',
            fontSize: '1rem',
            fontWeight: 700,
            whiteSpace: 'nowrap',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
          }}
        >
          {titleText}
        </h1>
      </div>
      {centerContent}
    </header>
  )
}

/** @deprecated Use ContentHeader — kept for existing imports. */
export const TopBar = ContentHeader
export type TopBarProps = ContentHeaderProps
