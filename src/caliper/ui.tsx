// @ts-nocheck
/** Caliper UI primitives (Tailwind + caliper.css design tokens). */
import React from 'react'
import {
  AlertTriangle,
  Archive,
  ArrowUpDown,
  Ban,
  Bell,
  Briefcase,
  Check,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Columns3,
  Copy,
  Database,
  Download,
  ExternalLink,
  Eye,
  File,
  FileText,
  Filter,
  Flag,
  History,
  Home,
  Info,
  Layers,
  List,
  Lock,
  MapPin,
  Pencil,
  Play,
  Plus,
  Search,
  Share2,
  Shield,
  SlidersHorizontal,
  Sparkles,
  ThumbsDown,
  ThumbsUp,
  Trash2,
  Upload,
  Users,
  Webhook,
  X,
} from 'lucide-react'

/* ----- Icons (Lucide adapter — same name API as legacy custom icons) --- */
const ICON_MAP = {
  home: Home,
  play: Play,
  list: List,
  columns: Columns3,
  layers: Layers,
  briefcase: Briefcase,
  sliders: SlidersHorizontal,
  search: Search,
  plus: Plus,
  check: Check,
  x: X,
  'chevron-right': ChevronRight,
  'chevron-left': ChevronLeft,
  'chevron-down': ChevronDown,
  download: Download,
  upload: Upload,
  file: File,
  alert: AlertTriangle,
  info: Info,
  shield: Shield,
  lock: Lock,
  history: History,
  edit: Pencil,
  copy: Copy,
  archive: Archive,
  eye: Eye,
  filter: Filter,
  sort: ArrowUpDown,
  database: Database,
  webhook: Webhook,
  users: Users,
  bell: Bell,
  trash: Trash2,
  sparkle: Sparkles,
  external: ExternalLink,
  doc: FileText,
  flag: Flag,
  share: Share2,
  'map-pin': MapPin,
  ban: Ban,
  'thumb-up': ThumbsUp,
  'thumb-down': ThumbsDown,
}

const Icon = ({ name, size = 14, stroke = 1.6, className = '', ...rest }) => {
  const LucideIcon = ICON_MAP[name]
  if (!LucideIcon) return null
  return (
    <LucideIcon
      size={size}
      strokeWidth={stroke}
      className={className}
      aria-hidden={rest['aria-hidden'] ?? rest['ariaHidden'] ?? undefined}
      {...rest}
    />
  )
}

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

/* ----- Page states --------------------------------------------------- */
const PageLoading = ({ title = 'Loading', message, className = '' }) => (
  <div className={`page-state ${className}`} role="status" aria-live="polite">
    <div className="page-state__spinner" aria-hidden />
    <div className="page-state__title">{title}</div>
    {message && <div className="page-state__message">{message}</div>}
  </div>
);

const PageError = ({ title = 'Something went wrong', message, onRetry, retryLabel = 'Try again' }) => (
  <div className="page-state" role="alert">
    <div className="page-state__title">{title}</div>
    {message && <div className="page-state__message">{message}</div>}
    {onRetry && (
      <div className="page-state__actions">
        <Btn variant="default" onClick={onRetry}>{retryLabel}</Btn>
      </div>
    )}
  </div>
);

const VIEW_ONLY_RUN_MESSAGE = 'View-only access. Editors and admins can run screenings.';

const RunScreeningLocked = ({ variant = 'primary', size, children = 'Run screening', compact = false }) => {
  const hintId = React.useId();
  return (
    <div className={`run-screening-locked${compact ? ' run-screening-locked--compact' : ''}`}>
      <Btn
        variant={variant}
        size={size}
        icon="lock"
        disabled
        aria-disabled="true"
        aria-describedby={hintId}
        aria-label={`${children} (view-only)`}
      >
        {children}
      </Btn>
      <p id={hintId} className="run-screening-locked__hint" role="note">
        {VIEW_ONLY_RUN_MESSAGE}
      </p>
    </div>
  );
};

const RunScreeningBtn = ({ canEdit, onClick, variant = 'primary', size, children = 'Run screening', compact = false, ...rest }) => (
  canEdit ? (
    <Btn variant={variant} size={size} icon="play" onClick={onClick} {...rest}>{children}</Btn>
  ) : (
    <RunScreeningLocked variant={variant} size={size} compact={compact}>{children}</RunScreeningLocked>
  )
);

const PageEmpty = ({
  icon = 'history',
  title = 'Nothing here yet',
  description,
  actionLabel,
  onAction,
  actionDisabled = false,
}) => {
  const hintId = React.useId();
  return (
  <div className="empty" style={{ padding: '24px 18px' }}>
    <Icon name={icon} size={22} />
    <div style={{ marginTop: 8, fontSize: 14, color: 'var(--ink)' }}>{title}</div>
    {description && (
      <div className="muted" style={{ fontSize: 12.5, marginTop: 4, maxWidth: '54ch', lineHeight: 1.55 }}>
        {description}
      </div>
    )}
    {actionLabel && (onAction || actionDisabled) && (
      <div style={{ marginTop: 14 }}>
        {actionDisabled ? (
          <div className="run-screening-locked run-screening-locked--empty">
            <Btn
              variant="primary"
              size="sm"
              icon="lock"
              disabled
              aria-disabled="true"
              aria-describedby={hintId}
              aria-label={`${actionLabel} (view-only)`}
            >
              {actionLabel}
            </Btn>
            <p id={hintId} className="run-screening-locked__hint" role="note">
              {VIEW_ONLY_RUN_MESSAGE}
            </p>
          </div>
        ) : (
          <Btn variant="primary" size="sm" onClick={onAction}>{actionLabel}</Btn>
        )}
      </div>
    )}
  </div>
  );
};

const RoleBlockedPage = ({ icon = 'lock', title, description, className = '' }) => (
  <div className={`page ${className}`.trim()}>
    <div className="usage-empty usage-empty--compact">
      <div className="usage-empty__icon" aria-hidden><Icon name={icon} size={22} /></div>
      <p className="usage-empty__title">{title}</p>
      {description && <p className="usage-empty__sub muted">{description}</p>}
    </div>
  </div>
);

export {
  Icon,
  Btn,
  RunScreeningBtn,
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
  PageLoading,
  PageError,
  PageEmpty,
  RoleBlockedPage,
}

export {
  PageHeader,
  KpiStrip,
  PageToolbar,
  PageToolbarSearch,
  DataTable,
  TableSkeleton,
  ListCardSkeleton,
  FilterChips,
  CriterionWeightBar,
  ScoreTrustCard,
} from '@/caliper/ui-layout'
