/**
 * Derives accent / theme tokens from the app shell background (gradient or solid).
 * Applied to CSS custom properties on :root for buttons, Caliper UI, and TopBar.
 *
 * Pick a single BRAND_BASE color — bright / mid / dark gradient stops are computed:
 *   bright = base
 *   mid    = base + 30% black
 *   dark   = base + 60% black
 */

/** Single brand color (e.g. `#15803d` green, `#510eaa` purple). */
export const BRAND_BASE = '#510eaa'

/** How much black is mixed into mid / dark stops (0–1). */
const MID_BLACK_MIX = 0.3
const DARK_BLACK_MIX = 0.6

function normalizeHex(hex: string): string {
  let h = hex.trim().replace(/^#/, '')
  if (h.length === 3) {
    h = h
      .split('')
      .map((c) => c + c)
      .join('')
  }
  if (h.length !== 6) {
    throw new Error(`Invalid hex color: ${hex}`)
  }
  return `#${h.toLowerCase()}`
}

/** Mix color with black; `blackMix` 0.3 → 70% original + 30% black. */
function mixWithBlack(hex: string, blackMix: number): string {
  const h = normalizeHex(hex).slice(1)
  const r = parseInt(h.slice(0, 2), 16)
  const g = parseInt(h.slice(2, 4), 16)
  const b = parseInt(h.slice(4, 6), 16)
  const keep = 1 - blackMix
  const channel = (c: number) =>
    Math.max(0, Math.min(255, Math.round(c * keep)))
  const toHex = (n: number) => n.toString(16).padStart(2, '0')
  return `#${toHex(channel(r))}${toHex(channel(g))}${toHex(channel(b))}`
}

export function buildBrandStops(base: string = BRAND_BASE) {
  const bright = normalizeHex(base)
  return {
    bright,
    mid: mixWithBlack(bright, MID_BLACK_MIX),
    dark: mixWithBlack(bright, DARK_BLACK_MIX),
  } as const
}

export const BRAND_STOPS = buildBrandStops()

export function buildBrandGradient(base: string = BRAND_BASE): string {
  const { bright, mid, dark } = buildBrandStops(base)
  return `linear-gradient(315deg, ${bright} 0%, ${mid} 50%, ${dark} 100%)`
}

export const brandShellGradient = buildBrandGradient()

/** @deprecated Use `brandShellGradient` */
export const brandPurpleGradient = brandShellGradient

export type BrandTheme = {
  /** Mid gradient stop — buttons, toggles, and in-content accents. */
  primary: string
  /** Bright gradient stop — nav bar logo tile, shell highlights. */
  bright: string
  mid: string
  dark: string
  primaryHover: string
  primaryContrast: string
  accent: string
  accentSoft: string
  accentInk: string
}

function extractHexColors(background: string): string[] {
  const matches = background.match(/#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})\b/g)
  return matches ? [...new Set(matches.map((h) => h.toLowerCase()))] : []
}

/** Build theme tokens from a CSS background value (gradient, hex, rgb, etc.). */
export function getBrandTheme(background: string = brandShellGradient): BrandTheme {
  const colors = extractHexColors(background)
  const stops =
    colors.length >= 3
      ? { bright: colors[0], mid: colors[1], dark: colors[colors.length - 1] }
      : buildBrandStops(colors[0] ?? BRAND_BASE)
  const { bright, mid, dark } = stops
  const primary = mid

  return {
    primary,
    bright,
    mid,
    dark,
    primaryHover: `color-mix(in srgb, ${primary} 88%, black)`,
    primaryContrast: '#ffffff',
    accent: primary,
    accentSoft: `color-mix(in srgb, ${primary} 16%, white)`,
    accentInk: primary,
  }
}

const CSS_VAR_KEYS = [
  '--brand-primary',
  '--brand-primary-hover',
  '--brand-primary-mid',
  '--brand-primary-dark',
  '--brand-primary-contrast',
  '--brand-primary-soft',
  '--brand-primary-ink',
  '--accent',
  '--accent-soft',
  '--accent-ink',
] as const

/** Push brand tokens to documentElement so CSS and Tailwind arbitrary vars stay in sync. */
export function applyBrandTheme(background: string = brandShellGradient): BrandTheme {
  const theme = getBrandTheme(background)
  const root = document.documentElement.style

  root.setProperty('--brand-primary', theme.primary)
  root.setProperty('--brand-primary-hover', theme.primaryHover)
  root.setProperty('--brand-primary-mid', theme.mid)
  root.setProperty('--brand-primary-dark', theme.dark)
  root.setProperty('--brand-primary-contrast', theme.primaryContrast)
  root.setProperty('--brand-primary-soft', theme.accentSoft)
  root.setProperty('--brand-primary-ink', theme.accentInk)
  root.setProperty('--accent', theme.accent)
  root.setProperty('--accent-soft', theme.accentSoft)
  root.setProperty('--accent-ink', theme.accentInk)

  return theme
}

export function getDefaultAccentTweaks(background?: string) {
  const theme = getBrandTheme(background)
  return {
    accent: theme.accent,
    accentSoft: theme.accentSoft,
    accentInk: theme.accentInk,
  }
}

export { CSS_VAR_KEYS }
