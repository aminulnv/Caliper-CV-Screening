import type { CSSProperties } from 'react'
import { brandShellGradient, getBrandTheme } from './brand-theme'

const brandTheme = getBrandTheme(brandShellGradient)

/**
 * Central place for image/logo URLs and theme colors. Update these once to change them app-wide.
 *
 * Assets:
 * - logoUrl: Logo image URL (nav bar, header). Leave empty for icon-only branding.
 * - loginBackgroundValue: Login/sign-up background. Use a color (#hex, rgb), gradient
 *   (e.g. linear-gradient(...)), or image URL (http/https). CSS is applied automatically.
 * - layoutBackgroundValue: App layout background. Same options as loginBackgroundValue.
 *   Shell gradient and accent colors are derived from BRAND_BASE in brand-theme.ts.
 *
 * Theme (accent) colors:
 * - themePrimary: Main accent. Used for notification icon (hover/filled), avatar background,
 *   and any primary actions/links. Derived from layoutBackgroundValue.
 * - themePrimaryContrast: Text/icon color on top of themePrimary (e.g. avatar initials).
 * - brandLogoColor: Nav bar brand icon tile (bright gradient stop; body UI uses mid via themePrimary).
 *
 * Helper:
 * - getBackgroundStyle(value): Returns style props for a given value (image URL vs color/gradient).
 */
export const assets = {
  logoUrl: '' as string,
  loginBackgroundValue:
    'https://i.pinimg.com/736x/21/16/59/21165977ebcdc14db9ac23044c721820.jpg',
  layoutBackgroundValue: brandShellGradient,
  themePrimary: brandTheme.primary,
  themePrimaryContrast: brandTheme.primaryContrast,
  brandLogoColor: brandTheme.bright,
} as const

export type AssetsConfig = typeof assets

const isImageUrl = (v: string) => /^(https?:|\/)/.test(v.trim());

export function getBackgroundStyle(value: string): CSSProperties {
  if (!value) return {}
  if (isImageUrl(value)) {
    return {
      backgroundImage: `url('${value}')`,
      backgroundSize: 'cover',
      backgroundPosition: 'center',
      backgroundRepeat: 'no-repeat',
    }
  }
  return { background: value }
}
