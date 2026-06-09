import { useState, useCallback, type CSSProperties } from 'react'
import { GoogleLogin, type CredentialResponse } from '@react-oauth/google'
import { useAuth } from '@/contexts/AuthContext'
import { assets } from '@/config/assets'

/**
 * Login — center logo-pop stage.
 * Direction: the Caliper mark springs out of the middle with a balloon-pop (overshoot → settle),
 * throwing a shockwave + spark burst, then keeps re-popping on a loop so the scene always has life.
 * Energetic motion personality. All motion is GPU-friendly (transform / opacity only) and fully
 * disabled under prefers-reduced-motion.
 */

// Spark burst: dots fired outward from the badge center on each pop cycle.
const SPARK_COLORS = ['#7dd3fc', '#38bdf8', '#a5b4fc', '#c4b5fd', '#67e8f9', '#ffffff']
const SPARKS = Array.from({ length: 18 }, (_, i) => {
  const angle = (i / 18) * Math.PI * 2 + (i % 2 ? 0.18 : 0)
  const dist = 132 + (i % 3) * 42
  return {
    tx: Math.round(Math.cos(angle) * dist),
    ty: Math.round(Math.sin(angle) * dist),
    size: 6 + (i % 3) * 4,
    color: SPARK_COLORS[i % SPARK_COLORS.length],
    delay: (i % 5) * 0.035,
  }
})

const GRAIN =
  "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='180' height='180'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.8' numOctaves='2' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)' opacity='0.55'/%3E%3C/svg%3E\")"

const AUTH_CSS = `
.caliper-auth {
  position: fixed; inset: 0; display: flex; gap: 0;
  padding: 16px; box-sizing: border-box; overflow: hidden;
  background: #f3f2ef; font-family: 'Inter', system-ui, sans-serif;
}
.caliper-auth *, .caliper-auth *::before, .caliper-auth *::after { box-sizing: border-box; }

/* ── Hero ────────────────────────────────────────────────── */
.caliper-auth__hero {
  position: relative; flex: 1 1 auto; min-width: 0;
  background: radial-gradient(120% 120% at 50% 42%, #0b1f4d 0%, #061233 42%, #030714 78%);
  color: #fff; overflow: hidden;
  border-radius: 20px 0 0 20px;
  box-shadow: var(--shadow-2, 0 4px 20px rgba(0,0,0,0.06));
  display: flex; flex-direction: column; align-items: center; justify-content: center;
  padding: clamp(28px, 4vw, 56px);
}
.caliper-auth__bg { position: absolute; inset: 0; isolation: isolate; }
.caliper-auth__orb { position: absolute; border-radius: 50%; mix-blend-mode: screen; will-change: transform; }
.caliper-auth__orb--1 {
  width: 60vw; height: 60vw; top: -22%; left: -14%; filter: blur(80px);
  background: radial-gradient(circle, rgba(56,189,248,0.5), transparent 62%);
  animation: caliperOrb1 24s ease-in-out infinite;
}
.caliper-auth__orb--2 {
  width: 56vw; height: 56vw; bottom: -26%; right: -12%; filter: blur(90px);
  background: radial-gradient(circle, rgba(99,102,241,0.5), transparent 62%);
  animation: caliperOrb2 30s ease-in-out infinite;
}
.caliper-auth__rays {
  position: absolute; top: 50%; left: 50%; width: 150vmax; height: 150vmax;
  background: repeating-conic-gradient(from 0deg at 50% 50%,
    rgba(160,220,255,0.10) 0deg 3deg, transparent 3deg 17deg);
  -webkit-mask-image: radial-gradient(circle at 50% 50%, transparent 12%, #000 26%, transparent 64%);
  mask-image: radial-gradient(circle at 50% 50%, transparent 12%, #000 26%, transparent 64%);
  animation: caliperRaySpin 64s linear infinite;
}
.caliper-auth__grain { position: absolute; inset: 0; background-image: ${GRAIN}; opacity: 0.06; mix-blend-mode: overlay; pointer-events: none; }
.caliper-auth__vignette { position: absolute; inset: 0; pointer-events: none; background: radial-gradient(120% 110% at 50% 46%, transparent 42%, rgba(2,5,16,0.7) 100%); }

/* ── Center stage ────────────────────────────────────────── */
.caliper-auth__stage { position: relative; z-index: 1; display: flex; flex-direction: column; align-items: center; text-align: center; }
.caliper-auth__core { position: relative; display: grid; place-items: center; }

.caliper-auth__halo {
  position: absolute; top: 50%; left: 50%;
  width: clamp(240px, 30vw, 360px); aspect-ratio: 1; border-radius: 50%;
  background: radial-gradient(circle, rgba(56,189,248,0.42), rgba(79,124,255,0.16) 46%, transparent 70%);
  filter: blur(6px); pointer-events: none;
  transform: translate(-50%, -50%);
  animation: caliperHalo 4.5s ease-in-out 1s infinite;
}
.caliper-auth__ringspin {
  position: absolute; top: 50%; left: 50%;
  width: clamp(200px, 24vw, 300px); aspect-ratio: 1; border-radius: 50%;
  background: conic-gradient(from 0deg, transparent, rgba(125,211,252,0.6), transparent 34%);
  -webkit-mask: radial-gradient(circle, transparent 62%, #000 63%, #000 70%, transparent 71%);
  mask: radial-gradient(circle, transparent 62%, #000 63%, #000 70%, transparent 71%);
  pointer-events: none; opacity: 0.9;
  transform: translate(-50%, -50%);
  animation: caliperRingSpin 9s linear infinite;
}
.caliper-auth__wave {
  position: absolute; top: 50%; left: 50%;
  width: clamp(150px, 18vw, 230px); aspect-ratio: 1; border-radius: 50%;
  border: 2px solid rgba(150,210,255,0.6); opacity: 0; pointer-events: none;
  transform: translate(-50%, -50%) scale(0.45);
  animation: caliperWave 4.5s ease-out 1s infinite;
}
.caliper-auth__wave--2 { animation-delay: 1.18s; border-color: rgba(125,180,255,0.5); }
.caliper-auth__wave--3 { animation-delay: 1.36s; border-color: rgba(196,232,255,0.45); }
.caliper-auth__sparks { position: absolute; top: 50%; left: 50%; width: 0; height: 0; pointer-events: none; }
.caliper-auth__spark {
  position: absolute; top: 0; left: 0; border-radius: 50%;
  margin: calc(var(--sz) / -2); opacity: 0; color: #7dd3fc;
  box-shadow: 0 0 10px currentColor; will-change: transform, opacity;
  animation: caliperSpark 4.5s cubic-bezier(0.2,0.7,0.2,1) infinite;
}

.caliper-auth__logo-pop { position: relative; animation: caliperPopIn 1s cubic-bezier(0.34,1.56,0.64,1) both; will-change: transform; }
.caliper-auth__logo-bob { animation: caliperBob 3.8s ease-in-out 1s infinite; will-change: transform; }
.caliper-auth__badge {
  width: clamp(116px, 14vw, 168px); aspect-ratio: 1; border-radius: 30px;
  display: grid; place-items: center; padding: 22%;
  background: linear-gradient(160deg, rgba(255,255,255,0.22), rgba(255,255,255,0.05));
  border: 1px solid rgba(255,255,255,0.28); backdrop-filter: blur(10px);
  box-shadow: 0 30px 70px -20px rgba(56,140,255,0.7), 0 10px 30px rgba(3,10,35,0.5), inset 0 1px 0 rgba(255,255,255,0.45);
  animation: caliperRepop 4.5s ease-in-out 1s infinite; will-change: transform;
}
.caliper-auth__badge img { width: 100%; height: 100%; object-fit: contain; filter: drop-shadow(0 6px 16px rgba(3,10,40,0.35)); }

.caliper-auth__brand { margin-top: clamp(30px, 4.5vw, 48px); }
.caliper-auth__title {
  margin: 0; font-size: clamp(3rem, 6.5vw, 5rem); font-weight: 700;
  line-height: 0.95; letter-spacing: -0.04em; color: #fff; text-shadow: 0 2px 50px rgba(40,120,255,0.45);
  animation: caliperWordPop 0.7s cubic-bezier(0.34,1.56,0.64,1) 0.5s both;
}
.caliper-auth__subtitle {
  margin: 14px auto 0; max-width: 30rem; font-size: clamp(1rem, 1.4vw, 1.12rem); line-height: 1.5; color: rgba(226,240,255,0.82);
  opacity: 0; transform: translateY(12px);
  animation: caliperRise 0.7s cubic-bezier(0.16,1,0.3,1) 0.78s both;
}
.caliper-auth__readout {
  position: absolute; left: 0; right: 0; bottom: clamp(22px, 3vw, 34px);
  display: flex; align-items: center; justify-content: center; flex-wrap: wrap; gap: 10px;
  font-family: ui-monospace, 'SF Mono', 'JetBrains Mono', Menlo, monospace;
  font-size: 11px; letter-spacing: 0.16em; text-transform: uppercase; color: rgba(206,228,255,0.6);
  opacity: 0; animation: caliperFade 0.9s ease-out 1.15s forwards;
}
.caliper-auth__readout-sep { color: rgba(186,230,255,0.3); }
.caliper-auth__dot { width: 7px; height: 7px; border-radius: 50%; background: #34d399; animation: caliperPulse 2s ease-out infinite; }

/* ── Telemetry chrome ────────────────────────────────────── */
.caliper-auth__chrome {
  position: absolute; inset: 0; pointer-events: none; z-index: 1;
  font-family: ui-monospace, 'SF Mono', 'JetBrains Mono', Menlo, monospace;
  color: rgba(214,232,255,0.6); font-size: 10.5px; letter-spacing: 0.18em; text-transform: uppercase;
}
.caliper-auth__tick { position: absolute; font-size: 13px; color: rgba(186,230,255,0.4); line-height: 1; opacity: 0; animation: caliperFade 0.9s ease-out 0.5s forwards; }
.caliper-auth__tick--tl { top: 18px; left: 18px; } .caliper-auth__tick--tr { top: 18px; right: 18px; }
.caliper-auth__tick--bl { bottom: 18px; left: 18px; } .caliper-auth__tick--br { bottom: 18px; right: 18px; }
.caliper-auth__tag { position: absolute; top: 22px; left: 40px; display: flex; align-items: center; gap: 8px; opacity: 0; animation: caliperFade 0.9s ease-out 0.65s forwards; }
.caliper-auth__tag::before { content: ''; width: 18px; height: 1px; background: rgba(186,230,255,0.5); }
.caliper-auth__coord { position: absolute; top: 22px; right: 40px; opacity: 0; animation: caliperFade 0.9s ease-out 0.8s forwards; }

/* ── Auth card (minimalist) ──────────────────────────────── */
.caliper-auth__panel {
  position: relative; flex: 0 0 clamp(360px, 33%, 468px); min-width: 0;
  background: var(--surface, #fff); border: 1px solid var(--line, #ddd8d1); border-left: none;
  border-radius: 0 20px 20px 0; box-shadow: var(--shadow-2, 0 4px 20px rgba(0,0,0,0.06));
  display: flex; flex-direction: column; justify-content: center;
  padding: clamp(28px, 3.5vw, 48px); overflow: auto; scrollbar-width: none;
}
.caliper-auth__panel::-webkit-scrollbar { display: none; }
.caliper-auth__panel-inner { width: 100%; max-width: 20rem; margin: 0 auto; }
.caliper-auth__eyebrow {
  margin: 0 0 18px; text-align: center;
  font-family: ui-monospace, 'SF Mono', 'JetBrains Mono', Menlo, monospace;
  font-size: 10.5px; letter-spacing: 0.22em; text-transform: uppercase; color: var(--subtle, #a39e97);
}
.caliper-auth__welcome { margin: 0 0 6px; text-align: center; font-size: 1.85rem; font-weight: 700; letter-spacing: -0.03em; color: var(--ink, #181614); }
.caliper-auth__sub { margin: 0 0 28px; text-align: center; font-size: 0.9rem; color: var(--muted, #736d66); }
.caliper-auth__error {
  margin-bottom: 16px; padding: 9px 12px; border-radius: var(--radius, 8px);
  background: var(--bad-soft, #fef2f2); color: var(--bad-ink, #b91c1c);
  border: 1px solid color-mix(in srgb, var(--bad, #dc2626) 22%, transparent);
  font-size: 0.8125rem; line-height: 1.4; animation: caliperShake 0.4s cubic-bezier(0.36,0.07,0.19,0.97) both;
}
.caliper-auth__gbtn-wrap { position: relative; width: 100%; min-height: 46px; border-radius: var(--radius, 8px); }
.caliper-auth__gbtn-wrap:focus-within { box-shadow: 0 0 0 3px color-mix(in srgb, #3b82f6 38%, transparent); }
.caliper-auth__gbtn {
  display: flex; align-items: center; justify-content: center; gap: 10px;
  width: 100%; padding: 12px 16px;
  background: var(--surface, #fff); color: var(--ink, #181614);
  border: 1px solid var(--line, #ddd8d1); border-radius: var(--radius, 8px);
  font-size: 0.9375rem; font-weight: 600; font-family: inherit;
  box-shadow: var(--shadow-1, 0 1px 2px rgba(0,0,0,0.04));
  position: relative; overflow: hidden;
  transition: transform 0.18s cubic-bezier(0.4,0,0.2,1), box-shadow 0.18s cubic-bezier(0.4,0,0.2,1), border-color 0.18s;
}
.caliper-auth__gbtn::after {
  content: ''; position: absolute; top: 0; left: -120%; width: 60%; height: 100%;
  background: linear-gradient(100deg, transparent, rgba(59,130,246,0.10), transparent);
  transition: left 0.6s cubic-bezier(0.4,0,0.2,1);
}
.caliper-auth__gbtn-wrap:hover .caliper-auth__gbtn { transform: translateY(-1px); border-color: color-mix(in srgb, var(--line, #ddd8d1) 50%, #3b82f6); box-shadow: 0 6px 20px rgba(37,99,235,0.14); }
.caliper-auth__gbtn-wrap:hover .caliper-auth__gbtn::after { left: 160%; }
.caliper-auth__gbtn-wrap:active .caliper-auth__gbtn { transform: translateY(0) scale(0.985); }
.caliper-auth__goverlay { position: absolute; inset: 0; opacity: 0.01; overflow: hidden; cursor: pointer; }
.caliper-auth__hint { margin: 20px 0 0; text-align: center; line-height: 1.45; font-size: 0.75rem; color: var(--subtle, #a39e97); }
.caliper-auth__rise { opacity: 0; transform: translateY(16px); animation: caliperRise 0.8s cubic-bezier(0.16,1,0.3,1) both; }

/* ── Keyframes ───────────────────────────────────────────── */
@keyframes caliperPopIn {
  0%   { opacity: 0; transform: scale(0.15); }
  55%  { opacity: 1; transform: scale(1.22); }
  70%  { transform: scale(0.9); }
  84%  { transform: scale(1.08); }
  93%  { transform: scale(0.97); }
  100% { transform: scale(1); }
}
@keyframes caliperRepop {
  0%   { transform: scale(1); }
  5%   { transform: scale(1.15); }
  11%  { transform: scale(0.94); }
  17%  { transform: scale(1.06); }
  23%  { transform: scale(0.99); }
  28%, 100% { transform: scale(1); }
}
@keyframes caliperBob { 0%, 100% { transform: translateY(0); } 50% { transform: translateY(-11px); } }
@keyframes caliperWordPop {
  0%   { opacity: 0; transform: scale(0.6) translateY(14px); }
  60%  { opacity: 1; transform: scale(1.08) translateY(0); }
  80%  { transform: scale(0.97); }
  100% { transform: scale(1); }
}
@keyframes caliperWave {
  0%   { transform: translate(-50%, -50%) scale(0.45); opacity: 0; }
  12%  { opacity: 0.85; }
  60%  { opacity: 0; }
  100% { transform: translate(-50%, -50%) scale(2.6); opacity: 0; }
}
@keyframes caliperSpark {
  0%, 18% { transform: translate(0, 0) scale(0); opacity: 0; }
  26% { opacity: 1; transform: translate(calc(var(--tx) * 0.35), calc(var(--ty) * 0.35)) scale(1); }
  58% { opacity: 0.9; }
  74%, 100% { transform: translate(var(--tx), var(--ty)) scale(0.2); opacity: 0; }
}
@keyframes caliperHalo {
  0%, 100% { opacity: 0.5; transform: translate(-50%, -50%) scale(0.94); }
  10% { opacity: 1; transform: translate(-50%, -50%) scale(1.14); }
  42% { opacity: 0.68; transform: translate(-50%, -50%) scale(1); }
}
@keyframes caliperRingSpin { from { transform: translate(-50%, -50%) rotate(0); } to { transform: translate(-50%, -50%) rotate(360deg); } }
@keyframes caliperRaySpin { from { transform: translate(-50%, -50%) rotate(0); } to { transform: translate(-50%, -50%) rotate(360deg); } }
@keyframes caliperRise { to { opacity: 1; transform: translateY(0); } }
@keyframes caliperFade { to { opacity: 1; } }
@keyframes caliperOrb1 { 0%, 100% { transform: translate(0,0) scale(1); } 50% { transform: translate(10%, 8%) scale(1.14); } }
@keyframes caliperOrb2 { 0%, 100% { transform: translate(0,0) scale(1.05); } 50% { transform: translate(-8%, -6%) scale(0.92); } }
@keyframes caliperPulse { 0% { box-shadow: 0 0 0 0 rgba(52,211,153,0.5); } 70% { box-shadow: 0 0 0 7px rgba(52,211,153,0); } 100% { box-shadow: 0 0 0 0 rgba(52,211,153,0); } }
@keyframes caliperShake { 10%,90%{transform:translateX(-2px);} 20%,80%{transform:translateX(3px);} 30%,50%,70%{transform:translateX(-5px);} 40%,60%{transform:translateX(5px);} }

/* ── Responsive ──────────────────────────────────────────── */
@media (max-width: 900px) {
  .caliper-auth { flex-direction: column; padding: 10px; }
  .caliper-auth__hero { flex: 0 0 auto; min-height: 46vh; border-radius: 18px 18px 0 0; padding: 26px; }
  .caliper-auth__panel { flex: 1 1 auto; border-radius: 0 0 18px 18px; border: 1px solid var(--line, #ddd8d1); border-top: none; }
  .caliper-auth__tag, .caliper-auth__coord { display: none; }
}
@media (max-width: 520px) { .caliper-auth__tick { display: none; } .caliper-auth__readout { font-size: 10px; gap: 7px; } }

/* ── Accessibility: honour reduced motion ────────────────── */
@media (prefers-reduced-motion: reduce) {
  .caliper-auth *, .caliper-auth *::before, .caliper-auth *::after { animation: none !important; transition: none !important; }
  .caliper-auth__rise, .caliper-auth__subtitle, .caliper-auth__title, .caliper-auth__readout,
  .caliper-auth__tick, .caliper-auth__tag, .caliper-auth__coord, .caliper-auth__logo-pop { opacity: 1 !important; transform: none !important; }
  .caliper-auth__wave, .caliper-auth__spark, .caliper-auth__halo, .caliper-auth__ringspin { display: none !important; }
}
`

function GoogleIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 48 48" aria-hidden>
      <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.98 13.72 18.05 9.5 24 9.5z" />
      <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.56 2.95-2.24 5.45-4.78 7.14l7.73 6c4.51-4.16 7.12-10.27 7.12-17.61z" />
      <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C2.38 16.49 0 20.02 0 24c0 3.98.92 7.74 2.56 11.22l7.97-6.63z" />
      <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.9-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.17 2.3-5.95 0-10.99-4.02-12.8-9.42l-7.98 6.19C6.51 42.62 14.62 48 24 48z" />
    </svg>
  )
}

export default function Login() {
  const { signIn } = useAuth()
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  const handleGoogleSuccess = useCallback(
    (response: CredentialResponse) => {
      setError(null)
      if (!response.credential) {
        setSubmitting(false)
        setError('Google did not return a sign-in token. Please try again.')
        return
      }
      signIn(response.credential)
    },
    [signIn],
  )

  const handleGoogleError = useCallback(() => {
    setSubmitting(false)
    setError('Could not sign in with Google. Please try again.')
  }, [])

  return (
    <div className="caliper-auth">
      <style>{AUTH_CSS}</style>

      <section className="caliper-auth__hero">
        <div className="caliper-auth__bg" aria-hidden>
          <div className="caliper-auth__rays" />
          <div className="caliper-auth__orb caliper-auth__orb--1" />
          <div className="caliper-auth__orb caliper-auth__orb--2" />
          <div className="caliper-auth__grain" />
          <div className="caliper-auth__vignette" />
        </div>

        <div className="caliper-auth__chrome" aria-hidden>
          <span className="caliper-auth__tick caliper-auth__tick--tl">+</span>
          <span className="caliper-auth__tick caliper-auth__tick--tr">+</span>
          <span className="caliper-auth__tick caliper-auth__tick--bl">+</span>
          <span className="caliper-auth__tick caliper-auth__tick--br">+</span>
          <span className="caliper-auth__tag">Caliper // Secure Access</span>
          <span className="caliper-auth__coord">NV — 01</span>
        </div>

        <div className="caliper-auth__stage">
          <div className="caliper-auth__core">
            <div className="caliper-auth__halo" aria-hidden />
            <div className="caliper-auth__ringspin" aria-hidden />
            <div className="caliper-auth__wave" aria-hidden />
            <div className="caliper-auth__wave caliper-auth__wave--2" aria-hidden />
            <div className="caliper-auth__wave caliper-auth__wave--3" aria-hidden />
            <div className="caliper-auth__sparks" aria-hidden>
              {SPARKS.map((s, i) => (
                <span
                  key={i}
                  className="caliper-auth__spark"
                  style={
                    {
                      '--tx': `${s.tx}px`,
                      '--ty': `${s.ty}px`,
                      '--sz': `${s.size}px`,
                      width: `${s.size}px`,
                      height: `${s.size}px`,
                      background: s.color,
                      color: s.color,
                      animationDelay: `${1 + s.delay}s`,
                    } as CSSProperties
                  }
                />
              ))}
            </div>

            <div className="caliper-auth__logo-pop">
              <div className="caliper-auth__logo-bob">
                <div className="caliper-auth__badge">
                  <img src={assets.logoUrl} alt="" aria-hidden />
                </div>
              </div>
            </div>
          </div>

          <div className="caliper-auth__brand">
            <h1 className="caliper-auth__title">Caliper</h1>
            <p className="caliper-auth__subtitle">AI-powered CV screening for your hiring team.</p>
          </div>
        </div>

        <div className="caliper-auth__readout" aria-hidden>
          <span className="caliper-auth__dot" />
          <span>Status: Online</span>
          <span className="caliper-auth__readout-sep">/</span>
          <span>Neural Screening Engine</span>
          <span className="caliper-auth__readout-sep">/</span>
          <span>v2.6.0</span>
        </div>
      </section>

      <aside className="caliper-auth__panel">
        <div className="caliper-auth__panel-inner">
          <p className="caliper-auth__eyebrow caliper-auth__rise" style={{ animationDelay: '0.42s' }}>
            Secure sign-in
          </p>
          <h2 className="caliper-auth__welcome caliper-auth__rise" style={{ animationDelay: '0.48s' }}>
            Welcome
          </h2>
          <p className="caliper-auth__sub caliper-auth__rise" style={{ animationDelay: '0.54s' }}>
            Sign in to access your workspace
          </p>

          {error && (
            <div className="caliper-auth__error" role="alert">
              {error}
            </div>
          )}

          <div className="caliper-auth__rise" style={{ animationDelay: '0.6s' }}>
            <div className="caliper-auth__gbtn-wrap">
              <button
                type="button"
                tabIndex={-1}
                aria-hidden
                className="caliper-auth__gbtn"
                style={{ opacity: submitting ? 0.7 : 1, pointerEvents: 'none' }}
              >
                <GoogleIcon />
                {submitting ? 'Signing in…' : 'Sign in with Google'}
              </button>
              <div className="caliper-auth__goverlay" onPointerDown={() => setSubmitting(true)}>
                <GoogleLogin
                  onSuccess={handleGoogleSuccess}
                  onError={handleGoogleError}
                  useOneTap={false}
                  theme="outline"
                  size="large"
                  text="signin_with"
                  width="320"
                />
              </div>
            </div>
          </div>

          <p className="caliper-auth__hint caliper-auth__rise" style={{ animationDelay: '0.66s' }}>
            Use your @nextventures.io or other approved company email.
          </p>
        </div>
      </aside>
    </div>
  )
}
