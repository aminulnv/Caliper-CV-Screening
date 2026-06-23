const STORAGE_KEY = 'caliper-table-density'

export type TableDensity = 'comfy' | 'compact'

export function readTableDensity(): TableDensity {
  try {
    const v = localStorage.getItem(STORAGE_KEY)
    if (v === 'compact' || v === 'comfy') return v
  } catch {
    // ignore
  }
  return 'comfy'
}

export function writeTableDensity(value: TableDensity) {
  try {
    localStorage.setItem(STORAGE_KEY, value)
  } catch {
    // ignore
  }
  document.documentElement.dataset.density = value
}

export function applyTableDensity(value?: TableDensity) {
  document.documentElement.dataset.density = value ?? readTableDensity()
}
