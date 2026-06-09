// @ts-nocheck
/** Caliper UI primitives (Tailwind + caliper.css design tokens). */
import React from 'react'

/* ----- Icons (single source) ----------------------------------------- */
const Icon = ({ name, size = 14, stroke = 1.6, ...rest }) => {
  const p = { width: size, height: size, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor',
              strokeWidth: stroke, strokeLinecap: 'round', strokeLinejoin: 'round', ...rest };
  switch (name) {
    case 'home':       return <svg {...p}><path d="M3 11l9-7 9 7"/><path d="M5 10v10h14V10"/></svg>;
    case 'play':       return <svg {...p}><path d="M5 4l14 8-14 8z"/></svg>;
    case 'list':       return <svg {...p}><path d="M8 6h13M8 12h13M8 18h13"/><circle cx="4" cy="6" r="1"/><circle cx="4" cy="12" r="1"/><circle cx="4" cy="18" r="1"/></svg>;
    case 'columns':    return <svg {...p}><rect x="3" y="4" width="5" height="16" rx="1"/><rect x="10" y="4" width="5" height="16" rx="1"/><rect x="17" y="4" width="4" height="16" rx="1"/></svg>;
    case 'layers':     return <svg {...p}><path d="M12 3l9 5-9 5-9-5z"/><path d="M3 13l9 5 9-5"/></svg>;
    case 'briefcase':  return <svg {...p}><path d="M16 20V4a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16"/><path d="M20 7H4a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2Z"/></svg>;
    case 'sliders':    return <svg {...p}><path d="M4 6h11M19 6h1M4 12h5M13 12h7M4 18h13M19 18h1"/><circle cx="17" cy="6" r="2"/><circle cx="11" cy="12" r="2"/><circle cx="19" cy="18" r="0"/></svg>;
    case 'search':     return <svg {...p}><circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/></svg>;
    case 'plus':       return <svg {...p}><path d="M12 5v14M5 12h14"/></svg>;
    case 'check':      return <svg {...p}><path d="M5 12l4 4L19 7"/></svg>;
    case 'x':          return <svg {...p}><path d="M6 6l12 12M18 6 6 18"/></svg>;
    case 'chevron-right': return <svg {...p}><path d="M9 6l6 6-6 6"/></svg>;
    case 'chevron-left':  return <svg {...p}><path d="M15 6l-6 6 6 6"/></svg>;
    case 'chevron-down':  return <svg {...p}><path d="M6 9l6 6 6-6"/></svg>;
    case 'download':   return <svg {...p}><path d="M12 4v12m0 0l-4-4m4 4l4-4M4 20h16"/></svg>;
    case 'upload':     return <svg {...p}><path d="M12 20V8m0 0l-4 4m4-4l4 4M4 4h16"/></svg>;
    case 'file':       return <svg {...p}><path d="M14 3H6v18h12V7z"/><path d="M14 3v4h4"/></svg>;
    case 'alert':      return <svg {...p}><path d="M12 3 2 21h20Z"/><path d="M12 10v5M12 18h.01"/></svg>;
    case 'info':       return <svg {...p}><circle cx="12" cy="12" r="9"/><path d="M12 8h.01M11 12h1v5h1"/></svg>;
    case 'shield':     return <svg {...p}><path d="M12 3 4 6v6c0 5 3.5 8 8 9 4.5-1 8-4 8-9V6Z"/></svg>;
    case 'history':    return <svg {...p}><path d="M3 12a9 9 0 1 0 3-6.7L3 8"/><path d="M3 3v5h5"/><path d="M12 7v5l3 2"/></svg>;
    case 'edit':       return <svg {...p}><path d="M4 20h4l10-10-4-4L4 16z"/></svg>;
    case 'copy':       return <svg {...p}><rect x="8" y="8" width="12" height="12" rx="2"/><path d="M4 16V6a2 2 0 0 1 2-2h10"/></svg>;
    case 'archive':    return <svg {...p}><rect x="3" y="4" width="18" height="4"/><path d="M5 8v12h14V8"/><path d="M10 13h4"/></svg>;
    case 'eye':        return <svg {...p}><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12Z"/><circle cx="12" cy="12" r="3"/></svg>;
    case 'filter':     return <svg {...p}><path d="M4 5h16l-6 8v5l-4 2v-7z"/></svg>;
    case 'sort':       return <svg {...p}><path d="M7 4v16m0 0l-3-3m3 3l3-3M17 20V4m0 0-3 3m3-3 3 3"/></svg>;
    case 'database':   return <svg {...p}><ellipse cx="12" cy="5" rx="8" ry="3"/><path d="M4 5v6c0 1.7 3.6 3 8 3s8-1.3 8-3V5"/><path d="M4 11v6c0 1.7 3.6 3 8 3s8-1.3 8-3v-6"/></svg>;
    case 'webhook':    return <svg {...p}><circle cx="6" cy="18" r="3"/><circle cx="18" cy="18" r="3"/><circle cx="12" cy="6" r="3"/><path d="M9 6.5L6 14m6-5 6 8m-12 0h12"/></svg>;
    case 'users':      return <svg {...p}><circle cx="9" cy="8" r="4"/><circle cx="17" cy="9" r="3"/><path d="M2 21c0-3.9 3.1-7 7-7s7 3.1 7 7"/><path d="M14 14c2.8 0 8 1.4 8 7"/></svg>;
    case 'bell':       return <svg {...p}><path d="M6 16V11a6 6 0 0 1 12 0v5l2 3H4z"/><path d="M10 21a2 2 0 0 0 4 0"/></svg>;
    case 'trash':      return <svg {...p}><path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13"/></svg>;
    case 'sparkle':    return <svg {...p}><path d="M12 3v6m0 6v6M3 12h6m6 0h6"/><path d="m5.5 5.5 3 3m7 7 3 3m0-13-3 3m-7 7-3 3"/></svg>;
    case 'external':   return <svg {...p}><path d="M14 3h7v7"/><path d="M10 14 21 3"/><path d="M21 14v7h-7"/><path d="M3 10v11h11"/></svg>;
    case 'doc':        return <svg {...p}><path d="M6 3h9l4 4v14H6z"/><path d="M14 3v5h5"/><path d="M9 13h6M9 17h4"/></svg>;
    case 'flag':       return <svg {...p}><path d="M5 21V4h12l-2 4 2 4H5"/></svg>;
    default: return null;
  }
};

/* ----- Button -------------------------------------------------------- */
const BTN_BASE =
  'inline-flex items-center justify-center gap-2 rounded-lg border font-medium transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-[color-mix(in_srgb,var(--brand-primary)_40%,transparent)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--bg)] disabled:pointer-events-none disabled:opacity-40';

const Btn = ({ variant = 'default', size, children, icon, iconRight, ...rest }) => {
  let variantCls =
    'border-[var(--line)] bg-[var(--surface)] text-[var(--ink)] shadow-[var(--shadow-1)] hover:bg-[var(--bg-sunk)]';
  if (variant === 'primary') {
    variantCls =
      'border-[var(--brand-primary)] bg-[var(--brand-primary)] text-[var(--brand-primary-contrast)] shadow-[var(--shadow-1)] hover:bg-[var(--brand-primary-hover)]';
  } else if (variant === 'ghost') {
    variantCls =
      'border-transparent bg-transparent text-[var(--muted)] hover:bg-[var(--bg-sunk)] hover:text-[var(--ink)]';
  } else if (variant === 'danger-ghost') {
    variantCls =
      'border-transparent bg-transparent text-[var(--bad-ink)] hover:bg-[var(--bad-soft)]';
  }
  let sizeCls = 'h-8 px-3.5 text-[12.5px]';
  if (size === 'sm') sizeCls = 'h-[26px] rounded-md px-2.5 text-[11.5px] gap-1.5';
  if (size === 'lg') sizeCls = 'h-[38px] px-[18px] text-[13px]';
  const iconSize = size === 'sm' ? 12 : 14;
  return (
    <button type="button" className={`${BTN_BASE} ${variantCls} ${sizeCls}`} {...rest}>
      {icon && <Icon name={icon} size={iconSize}/>}
      {children}
      {iconRight && <Icon name={iconRight} size={iconSize}/>}
    </button>
  );
};

const IconBtn = ({ name, size = 14, ...rest }) => (
  <button
    type="button"
    className="inline-grid h-7 w-7 place-items-center rounded-lg border border-transparent text-[var(--muted)] transition-colors hover:bg-[var(--bg-sunk)] hover:text-[var(--ink)]"
    {...rest}
  >
    <Icon name={name} size={size}/>
  </button>
);

/* ----- Badge / Chip -------------------------------------------------- */
const BADGE_TONE_CLASSES = {
  default: 'border-transparent bg-[var(--bg-sunk)] text-[var(--ink-soft)]',
  ok: 'border-transparent bg-[var(--ok-soft)] text-[var(--ok-ink)]',
  warn: 'border-transparent bg-[var(--warn-soft)] text-[var(--warn-ink)]',
  bad: 'border-transparent bg-[var(--bad-soft)] text-[var(--bad-ink)]',
  info: 'border-transparent bg-[var(--info-soft)] text-[var(--info)]',
  ghost: 'border border-[var(--line)] bg-transparent text-[var(--muted)]',
  solid: 'border-transparent bg-[var(--brand-primary)] text-[var(--brand-primary-contrast)]',
};

const Badge = ({ tone = 'default', children, dot }) => {
  const toneCls = BADGE_TONE_CLASSES[tone] || BADGE_TONE_CLASSES.default;
  return (
    <span
      className={`inline-flex h-[21px] max-w-full items-center gap-1.5 whitespace-nowrap rounded-full border px-2 text-[11px] font-medium leading-none ${toneCls}`}
    >
      {dot && <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-current opacity-80"/>}
      {children}
    </span>
  );
};

const STATUS_BADGE = {
  strong:    { tone: 'ok',    label: 'Strong match',    dot: true },
  promising: { tone: 'info',  label: 'Promising',       dot: true },
  review:    { tone: 'warn',  label: 'Review manually', dot: true },
  flagged:   { tone: 'bad',   label: 'Flagged',         dot: true },
};
const StatusBadge = ({ s }) => {
  const cfg = STATUS_BADGE[s] || { tone: 'default', label: s, dot: false };
  return <Badge tone={cfg.tone} dot={cfg.dot}>{cfg.label}</Badge>;
};

const RUN_STATUS = {
  completed:   { tone: 'ok',    label: 'Completed' },
  in_progress: { tone: 'info',  label: 'In progress' },
  failed:      { tone: 'bad',   label: 'Failed' },
  draft:       { tone: 'ghost', label: 'Draft' },
};
const RunStatusBadge = ({ s }) => {
  const cfg = RUN_STATUS[s] || { tone: 'default', label: s };
  return <Badge tone={cfg.tone} dot={s !== 'draft'}>{cfg.label}</Badge>;
};

const Chip = ({ kind, name, weight, onRemove }) => (
  <span className={`chip${kind ? ` chip--${kind}` : ''}`}>
    <span className="chip__name">{name}</span>
    {weight != null && <span className="chip__w">×{weight}</span>}
    {onRemove && <button type="button" className="chip__x" onClick={onRemove} aria-label={`Remove ${name}`}><Icon name="x" size={10} stroke={2}/></button>}
  </span>
);

/* ----- Confidence pill ---------------------------------------------- */
const Confidence = ({ level }) => (
  <span className={`conf conf--${level}`}>
    <span className="conf__bars"><i/><i/><i/></span>
    {level === 'high' ? 'high' : level === 'medium' ? 'med' : 'low'}
  </span>
);

/* ----- Score bar variants ------------------------------------------- */
const SCORE_BAR_MAX = 100;
const ScoreBar = ({ score, must, nice, flag, variant = 'stacked' }) => {
  const okPct   = Math.min(70, (must || 0) * 14);
  const warnPct = Math.min(20, (nice || 0) * 5);
  const badPct  = Math.min(20, (flag || 0) * 8);
  if (variant === 'radial') {
    return (
      <div className="row" style={{ gap: 10 }}>
        <div className="scoredisc" style={{ ['--val']: score }}>
          <span className="scoredisc__num">{score}</span>
        </div>
        <span className="mono tnum muted" style={{ fontSize: 11 }}>
          {must}·{nice}·{flag}
        </span>
      </div>
    );
  }
  if (variant === 'badge') {
    const tone = score >= 80 ? 'ok' : score >= 65 ? 'info' : score >= 50 ? 'warn' : 'bad';
    return (
      <span className="row" style={{ gap: 8 }}>
        <Badge tone={tone}>{score}</Badge>
        <span className="mono tnum muted" style={{ fontSize: 11 }}>{must}·{nice}·{flag}</span>
      </span>
    );
  }
  return (
    <div className="scorebar">
      <span className="scorebar__num">{score}</span>
      <span className="scorebar__track">
        <span className="scorebar__seg scorebar__seg--ok"   style={{ width: `${okPct}%` }}/>
        <span className="scorebar__seg scorebar__seg--warn" style={{ width: `${warnPct}%` }}/>
        <span className="scorebar__seg scorebar__seg--bad"  style={{ width: `${badPct}%` }}/>
      </span>
    </div>
  );
};

/* ----- Segmented control -------------------------------------------- */
const Segmented = ({ value, onChange, options }) => (
  <div
    className="inline-flex max-w-full shrink-0 flex-nowrap items-stretch gap-0.5 rounded-lg border border-[var(--line)] bg-[var(--bg-sunk)] p-0.5 shadow-inner"
    role="group"
  >
    {options.map(o => (
      <button
        key={o.value}
        type="button"
        className={`rounded-md px-3 py-1 text-xs font-medium whitespace-nowrap transition-colors ${
          value === o.value
            ? 'bg-[var(--brand-primary)] text-[var(--brand-primary-contrast)] shadow-[var(--shadow-1)]'
            : 'border border-transparent text-[var(--muted)] hover:text-[var(--ink-soft)]'
        }`}
        aria-pressed={value === o.value}
        onClick={() => onChange(o.value)}
      >
        {o.label}
      </button>
    ))}
  </div>
);

/* ----- Toggle -------------------------------------------------------- */
const Toggle = ({ on, onChange }) => (
  <button
    type="button"
    role="switch"
    aria-checked={!!on}
    onClick={() => onChange(!on)}
    className={`relative h-[18px] w-8 shrink-0 rounded-full border-0 p-0 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-[color-mix(in_srgb,var(--brand-primary)_40%,transparent)] focus-visible:ring-offset-2 ${
      on ? 'bg-[var(--brand-primary)]' : 'bg-[var(--faint)]'
    }`}
  >
    <span
      className={`absolute left-0.5 top-0.5 block h-3.5 w-3.5 rounded-full bg-[var(--surface)] shadow-md ring-1 ring-[color-mix(in_srgb,var(--ink)_8%,transparent)] transition-transform ${
        on ? 'translate-x-[14px]' : 'translate-x-0'
      }`}
    />
  </button>
);

/* ----- Field --------------------------------------------------------- */
const Field = ({ label, hint, children }) => (
  <div className="flex flex-col gap-1.5">
    {label && <div className="text-xs font-medium text-[var(--ink-soft)]">{label}</div>}
    {children}
    {hint && <p className="text-[11.5px] leading-snug text-[var(--muted)]">{hint}</p>}
  </div>
);

/* ----- Topbar crumbs ------------------------------------------------- */
const Crumbs = ({ items }) => (
  <nav className="flex min-w-0 flex-wrap items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.04em] text-[var(--subtle)]">
    {items.map((it, i) => (
      <React.Fragment key={i}>
        {i > 0 && <span className="text-[var(--faint)]" aria-hidden>/</span>}
        <span className={i === items.length - 1 ? 'text-[var(--ink)]' : ''}>{it}</span>
      </React.Fragment>
    ))}
  </nav>
);

export {
  Icon,
  Btn,
  IconBtn,
  Badge,
  StatusBadge,
  RunStatusBadge,
  Chip,
  Confidence,
  ScoreBar,
  Segmented,
  Toggle,
  Field,
  Crumbs,
}
