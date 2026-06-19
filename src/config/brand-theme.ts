/**
 * Flat slate + blue CTA brand tokens (ui-ux-pro-max Caliper design system).
 * Applied to CSS custom properties on :root for buttons, shell, and Caliper UI.
 */

/** Slate primary — nav mark, headings, focus rings */
export const BRAND_SLATE = '#0f172a'

/** Blue CTA — primary buttons and links */
export const BRAND_CTA = '#0369a1'

/** @deprecated Use BRAND_CTA — kept for imports that reference BRAND_BASE */
export const BRAND_BASE = BRAND_CTA

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

export function buildBrandStops(base: string = BRAND_CTA) {
  const bright = normalizeHex(base)
  return {
    bright,
    mid: mixWithBlack(bright, MID_BLACK_MIX),
    dark: mixWithBlack(bright, DARK_BLACK_MIX),
  } as const
}

export const BRAND_STOPS = buildBrandStops()

/** Flat shell background — no gradient */
export function buildBrandGradient(_base?: string): string {
  return BRAND_SLATE
}

export const brandShellGradient = buildBrandGradient()

/** @deprecated Use `brandShellGradient` */
export const brandPurpleGradient = brandShellGradient

export type BrandTheme = {
  primary: string
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

/** Build theme tokens from flat slate + blue CTA system */
export function getBrandTheme(background: string = brandShellGradient): BrandTheme {
  const colors = extractHexColors(background)
  const slate = colors[0] ?? BRAND_SLATE
  const cta = BRAND_CTA

  return {
    primary: cta,
    bright: slate,
    mid: cta,
    dark: mixWithBlack(slate, DARK_BLACK_MIX),
    primaryHover: '#075985',
    primaryContrast: '#ffffff',
    accent: cta,
    accentSoft: `color-mix(in srgb, ${cta} 12%, white)`,
    accentInk: cta,
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
