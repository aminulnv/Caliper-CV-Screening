import { Search } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { useLocation } from 'react-router-dom'

export interface ContentHeaderProps {
  title: string | ((pathname: string) => string)
  titleIcon?: LucideIcon
  centerSlot?: React.ReactNode
  searchPlaceholder?: string
}

/** Page title row below the global nav. */
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
      <div className="shell-search">
        <Search size={13} className="shell-search__icon" aria-hidden />
        <input className="shell-search__input" placeholder={searchPlaceholder} />
      </div>
    ))

  return (
    <header className="app-shell-content-header">
      <div className="app-shell-content-header__title-wrap">
        {TitleIcon && (
          <TitleIcon size={18} strokeWidth={1.75} className="app-shell-content-header__icon" />
        )}
        <h1 className="app-shell-content-header__title">{titleText}</h1>
      </div>
      {centerContent}
    </header>
  )
}

/** @deprecated Use ContentHeader */
export const TopBar = ContentHeader
export type TopBarProps = ContentHeaderProps
