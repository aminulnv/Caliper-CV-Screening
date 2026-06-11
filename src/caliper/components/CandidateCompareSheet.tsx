// @ts-nocheck
import React from 'react'
import { Icon, IconBtn, Btn } from '@/caliper/ui'
import { CompareMatrix } from '@/caliper/components/CompareMatrix'

export function CandidateCompareSheet({
  open,
  loading,
  error,
  data,
  onClose,
  onOpenCandidate,
  tweaks,
}) {
  const [differencesOnly, setDifferencesOnly] = React.useState(false);
  const closeBtnRef = React.useRef(null);

  React.useEffect(() => {
    if (!open) return;
    setDifferencesOnly(false);
    const onKey = (e) => {
      if (e.key === 'Escape') onClose?.();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  React.useEffect(() => {
    if (open) closeBtnRef.current?.focus();
  }, [open]);

  if (!open) return null;

  return (
    <div className="compare-sheet" onClick={onClose} role="presentation">
      <div
        className="compare-sheet__panel"
        role="dialog"
        aria-modal="true"
        aria-labelledby="compare-sheet-title"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="compare-sheet__head">
          <div>
            <h2 id="compare-sheet-title" className="compare-sheet__title">Compare candidates</h2>
            <p className="compare-sheet__sub muted">
              Side-by-side checklist for {data?.candidates?.length ?? '…'} candidates — read-only.
            </p>
          </div>
          <div className="compare-sheet__actions">
            <label className="compare-sheet__filter">
              <input
                type="checkbox"
                checked={differencesOnly}
                onChange={(e) => setDifferencesOnly(e.target.checked)}
                disabled={loading || !data}
              />
              <span>Differences only</span>
            </label>
            <IconBtn ref={closeBtnRef} name="x" size={18} onClick={onClose} aria-label="Close comparison"/>
          </div>
        </header>

        <div className="compare-sheet__body">
          {loading && (
            <div className="compare-sheet__state muted">Loading comparison…</div>
          )}
          {!loading && error && (
            <div className="compare-sheet__state" style={{ color: 'var(--bad-ink)' }}>{error}</div>
          )}
          {!loading && !error && data && (
            <CompareMatrix
              data={data}
              differencesOnly={differencesOnly}
              onOpenCandidate={onOpenCandidate}
              tweaks={tweaks}
            />
          )}
        </div>

        <footer className="compare-sheet__foot">
          <span className="muted" style={{ fontSize: 12 }}>
            Click a candidate header to open full evaluation detail.
          </span>
          <Btn variant="ghost" size="sm" onClick={onClose}>Close</Btn>
        </footer>
      </div>
    </div>
  );
}
