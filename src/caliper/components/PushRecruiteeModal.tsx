export function PushRecruiteeModal({
  open,
  platformActor,
  userName,
  dispositionLabel,
  candidateCount = 1,
  loading = false,
  onCancel,
  onConfirm,
}: {
  open: boolean;
  platformActor: string;
  userName: string;
  dispositionLabel: string;
  candidateCount?: number;
  loading?: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  if (!open) return null;

  const who = userName?.trim() || 'You';

  return (
    <div className="detail" onClick={onCancel}>
      <div
        className="card"
        role="dialog"
        aria-labelledby="push-recruitee-title"
        onClick={(e) => e.stopPropagation()}
        style={{
          width: 'min(480px, 94vw)',
          margin: 'auto',
          padding: '20px 22px',
          alignSelf: 'center',
        }}
      >
        <div id="push-recruitee-title" style={{ fontSize: 16, fontWeight: 600, marginBottom: 8 }}>
          Push to Recruitee?
        </div>
        <p style={{ fontSize: 13, lineHeight: 1.55, color: 'var(--ink-soft)', margin: '0 0 16px' }}>
          This will update Recruitee immediately for{' '}
          <strong>{candidateCount}</strong> candidate{candidateCount === 1 ? '' : 's'} ({dispositionLabel}).
          Because Caliper uses a shared integration token, Recruitee will record this action as{' '}
          <strong>{platformActor}</strong>, not as you. Your decision is still tracked in Caliper as{' '}
          <strong>{who}</strong>.
        </p>
        <div className="row" style={{ justifyContent: 'flex-end', gap: 8 }}>
          <button
            type="button"
            className="inline-flex items-center justify-center h-[26px] rounded-md px-2.5 text-[11.5px] font-medium border border-transparent bg-transparent text-[var(--muted)] hover:bg-[var(--bg-sunk)] hover:text-[var(--ink)] disabled:opacity-40"
            onClick={onCancel}
            disabled={loading}
          >
            Cancel
          </button>
          <button
            type="button"
            className="inline-flex items-center justify-center h-[26px] rounded-md px-2.5 text-[11.5px] font-medium border border-[var(--brand-primary)] bg-[var(--brand-primary)] text-[var(--brand-primary-contrast)] hover:bg-[var(--brand-primary-hover)] disabled:opacity-40"
            onClick={onConfirm}
            disabled={loading}
          >
            {loading ? 'Pushing…' : 'Push to Recruitee anyway'}
          </button>
        </div>
      </div>
    </div>
  );
}
