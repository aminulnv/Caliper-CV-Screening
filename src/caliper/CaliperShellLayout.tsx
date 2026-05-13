import { createContext, useContext, useEffect } from 'react'
import { Outlet } from 'react-router-dom'
import {
  useTweaks,
  TweaksPanel,
  TweakSection,
  TweakColor,
  TweakRadio,
} from '@/caliper/tweaks-panel'

export type CaliperTweaksState = {
  accent: string
  accentSoft: string
  accentInk: string
  density: string
  scoreStyle: string
  detailLayout: string
}

const TWEAK_DEFAULTS: CaliperTweaksState = {
  accent: 'oklch(0.52 0.09 150)',
  accentSoft: 'oklch(0.95 0.04 150)',
  accentInk: 'oklch(0.32 0.07 150)',
  density: 'regular',
  scoreStyle: 'stacked',
  detailLayout: 'split',
}

const TweaksContext = createContext<CaliperTweaksState>(TWEAK_DEFAULTS)

export function useCaliperTweaks(): CaliperTweaksState {
  return useContext(TweaksContext)
}

export default function CaliperShellLayout() {
  const [t, setTweak] = useTweaks(TWEAK_DEFAULTS)

  useEffect(() => {
    document.documentElement.style.setProperty('--accent', t.accent)
    document.documentElement.style.setProperty('--accent-soft', t.accentSoft)
    document.documentElement.style.setProperty('--accent-ink', t.accentInk)
    document.documentElement.dataset.density = t.density
  }, [t.accent, t.accentSoft, t.accentInk, t.density])

  return (
    <>
      <TweaksContext.Provider value={t}>
        <Outlet />
      </TweaksContext.Provider>
      <TweaksPanel title="Tweaks">
        <TweakSection label="Theme">{null}</TweakSection>
        <TweakColor
          label="Accent"
          value={t.accent}
          options={[
            'oklch(0.52 0.09 150)',
            'oklch(0.50 0.10 250)',
            'oklch(0.52 0.10 30)',
            'oklch(0.42 0.06 280)',
            'oklch(0.34 0.02 60)',
          ]}
          onChange={(v: string | string[]) => {
            const m = /oklch\(([\d.]+)\s+([\d.]+)\s+([\d.]+)\)/.exec(String(v))
            const hue = m ? m[3] : '150'
            setTweak({
              accent: v as string,
              accentSoft: `oklch(0.95 0.04 ${hue})`,
              accentInk: `oklch(0.32 0.07 ${hue})`,
            })
          }}
        />
        <TweakRadio
          label="Density"
          value={t.density}
          options={['compact', 'regular', 'comfy']}
          onChange={(v: string) => setTweak('density', v)}
        />
        <TweakSection label="Score visual">{null}</TweakSection>
        <TweakRadio
          label="Style"
          value={t.scoreStyle}
          options={['stacked', 'radial', 'badge']}
          onChange={(v: string) => setTweak('scoreStyle', v)}
        />
        <TweakSection label="Detail panel">{null}</TweakSection>
        <TweakRadio
          label="Layout"
          value={t.detailLayout}
          options={['split', 'stacked']}
          onChange={(v: string) => setTweak('detailLayout', v)}
        />
      </TweaksPanel>
    </>
  )
}
