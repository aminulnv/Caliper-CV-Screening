import React from 'react'

type PageTitleState = {
  title: string | null
  subtitle: string | null
  setPageTitle: (title: string | null, subtitle?: string | null) => void
}

const PageTitleContext = React.createContext<PageTitleState>({
  title: null,
  subtitle: null,
  setPageTitle: () => {},
})

export function PageTitleProvider({ children }: { children: React.ReactNode }) {
  const [title, setTitle] = React.useState<string | null>(null)
  const [subtitle, setSubtitle] = React.useState<string | null>(null)

  const setPageTitle = React.useCallback((nextTitle: string | null, nextSubtitle?: string | null) => {
    setTitle(nextTitle)
    setSubtitle(nextSubtitle ?? null)
  }, [])

  const value = React.useMemo(
    () => ({ title, subtitle, setPageTitle }),
    [title, subtitle, setPageTitle],
  )

  return (
    <PageTitleContext.Provider value={value}>
      {children}
    </PageTitleContext.Provider>
  )
}

export function usePageTitle() {
  return React.useContext(PageTitleContext)
}

export function useSetPageTitle(title: string | null, subtitle?: string | null) {
  const { setPageTitle } = usePageTitle()
  React.useEffect(() => {
    setPageTitle(title, subtitle ?? null)
    return () => setPageTitle(null, null)
  }, [title, subtitle, setPageTitle])
}
