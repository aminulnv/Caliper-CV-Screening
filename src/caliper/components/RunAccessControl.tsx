// @ts-nocheck
import React from 'react'
import { createPortal } from 'react-dom'
import { Icon } from '@/caliper/ui'
import { UserAvatar, RunAccessLabel } from '@/caliper/components/UserAvatar'

function asArray(value) {
  return Array.isArray(value) ? value : [];
}

function RunSharePopover({
  anchorRef,
  run,
  currentUserName,
  currentUserEmail,
  currentUserAvatar,
  members,
  loading,
  onToggleShare,
  onClose,
}) {
  const [query, setQuery] = React.useState('');
  const [position, setPosition] = React.useState({ top: 0, left: 0 });
  const popoverRef = React.useRef(null);
  const inputRef = React.useRef(null);

  const sharedUserIds = asArray(run.shared_user_ids ?? run.sharedUserIds);
  const sharedUsers = asArray(run.shared_users ?? run.sharedUsers);
  const shared = new Set(sharedUserIds.map((id) => String(id)));
  const ignoreOutsideRef = React.useRef(false);

  const updatePosition = React.useCallback(() => {
    const anchor = anchorRef.current;
    if (!anchor) return;
    const rect = anchor.getBoundingClientRect();
    const width = 280;
    const left = Math.min(rect.left, window.innerWidth - width - 12);
    setPosition({
      top: rect.bottom + 6,
      left: Math.max(12, left),
    });
  }, [anchorRef]);

  React.useLayoutEffect(() => {
    updatePosition();
    ignoreOutsideRef.current = true;
    inputRef.current?.focus({ preventScroll: true });
    const frame = window.requestAnimationFrame(() => {
      ignoreOutsideRef.current = false;
    });
    return () => window.cancelAnimationFrame(frame);
  }, [updatePosition]);

  React.useEffect(() => {
    const onResize = () => updatePosition();
    window.addEventListener('resize', onResize);
    window.addEventListener('scroll', onResize, true);
    return () => {
      window.removeEventListener('resize', onResize);
      window.removeEventListener('scroll', onResize, true);
    };
  }, [updatePosition]);

  React.useEffect(() => {
    const onPointerDown = (event) => {
      if (ignoreOutsideRef.current) return;
      const target = event.target;
      if (popoverRef.current?.contains(target)) return;
      if (anchorRef.current?.contains(target)) return;
      onClose();
    };
    const onKeyDown = (event) => {
      if (event.key === 'Escape') onClose();
    };
    document.addEventListener('mousedown', onPointerDown, true);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('mousedown', onPointerDown, true);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [anchorRef, onClose]);

  const q = query.trim().toLowerCase();
  const addPeople = (members ?? [])
    .filter((m) => !m.is_current_user)
    .filter((m) => !q
      || (m.name ?? '').toLowerCase().includes(q)
      || m.email.toLowerCase().includes(q));

  const removeSharedUser = (sharedUser) => {
    const userId = sharedUser.user_id ?? sharedUser.userId;
    const member = (members ?? []).find((m) => m.user_id === userId)
      ?? {
        user_id: userId,
        name: sharedUser.name,
        email: sharedUser.email,
        avatar_url: sharedUser.avatar_url ?? sharedUser.avatarUrl,
      };
    onToggleShare(member);
  };

  const popover = (
    <div
      ref={popoverRef}
      className="run-share-popover run-share-popover--portal"
      role="dialog"
      aria-label="People with access"
      style={{ top: position.top, left: position.left }}
      onClick={(e) => e.stopPropagation()}
      onMouseDown={(e) => e.stopPropagation()}
    >
      <div className="run-share-popover__header">People with access</div>

      <div className="run-share-popover__section">
        <div className="run-share-popover__owner-row">
          <UserAvatar
            name={currentUserName}
            email={currentUserEmail}
            avatarUrl={currentUserAvatar}
            size={24}
          />
          <span className="run-share-popover__person">
            <span className="run-share-popover__person-name">{currentUserName || currentUserEmail || 'You'}</span>
            {currentUserEmail && currentUserName && (
              <span className="run-share-popover__person-email">{currentUserEmail}</span>
            )}
          </span>
          <span className="run-share-popover__badge">Owner</span>
        </div>
      </div>

      <div className="run-share-popover__section">
        <div className="run-share-popover__section-label">Shared with</div>
        {sharedUsers.length === 0 && (
          <div className="run-share-popover__empty">Not shared with anyone yet</div>
        )}
        {sharedUsers.map((u) => {
          const userId = u.user_id ?? u.userId;
          return (
            <div key={userId} className="run-share-popover__shared-row">
              <UserAvatar
                name={u.name}
                email={u.email}
                avatarUrl={u.avatar_url ?? u.avatarUrl}
                size={24}
              />
              <span className="run-share-popover__person">
                <span className="run-share-popover__person-name">{u.name ?? u.email}</span>
                {u.name && u.email && (
                  <span className="run-share-popover__person-email">{u.email}</span>
                )}
              </span>
              <button
                type="button"
                className="run-share-popover__remove-btn"
                aria-label={`Remove ${u.name ?? u.email}`}
                onClick={() => removeSharedUser(u)}
              >
                <Icon name="x" size={12} />
              </button>
            </div>
          );
        })}
      </div>

      <div className="run-share-popover__divider" />

      <div className="run-share-popover__section">
        <div className="run-share-popover__section-label">Add people</div>
        <input
          ref={inputRef}
          className="run-share-popover__search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search by name or email"
        />
        <div className="run-share-popover__list">
          {loading && <div className="run-share-popover__empty">Loading people…</div>}
          {!loading && addPeople.length === 0 && (
            <div className="run-share-popover__empty">
              {q ? 'No one matches that name.' : 'No one else to share with yet.'}
            </div>
          )}
          {!loading && addPeople.map((m) => {
            const isShared = shared.has(String(m.user_id));
            return (
              <button
                key={m.user_id}
                type="button"
                role="menuitemcheckbox"
                aria-checked={isShared}
                className="run-share-popover__add-row"
                onClick={() => onToggleShare(m)}
              >
                <UserAvatar name={m.name} email={m.email} avatarUrl={m.avatar_url} size={22} />
                <span className="run-share-popover__person">
                  <span className="run-share-popover__person-name">{m.name ?? m.email}</span>
                  {m.name && (
                    <span className="run-share-popover__person-email">{m.email}</span>
                  )}
                </span>
                {isShared && <Icon name="check" size={13} className="run-share-popover__check" />}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );

  return createPortal(popover, document.body);
}

export function RunAccessControl({
  run,
  currentUserName,
  currentUserEmail,
  currentUserAvatar,
  members,
  membersLoading,
  open,
  onOpen,
  onClose,
  onToggleShare,
  variant = 'inline',
}) {
  const isOwner = Boolean(run.is_owner ?? run.isOwner);
  const anchorRef = React.useRef(null);

  if (!isOwner) {
    return (
      <RunAccessLabel
        run={run}
        currentUserName={currentUserName}
        currentUserEmail={currentUserEmail}
        currentUserAvatar={currentUserAvatar}
      />
    );
  }

  const rootClass = [
    'run-access-control',
    variant === 'detail' ? 'run-access-control--detail' : '',
    open ? 'run-access-control--open' : '',
  ].filter(Boolean).join(' ');

  return (
    <div className={rootClass}>
      <button
        ref={anchorRef}
        type="button"
        className="run-access run-access--interactive"
        aria-expanded={open}
        aria-haspopup="dialog"
        title="Manage who has access"
        onMouseDown={(e) => e.stopPropagation()}
        onClick={(e) => {
          e.stopPropagation();
          if (open) onClose();
          else onOpen();
        }}
      >
        <RunAccessLabel
          run={run}
          currentUserName={currentUserName}
          currentUserEmail={currentUserEmail}
          currentUserAvatar={currentUserAvatar}
          as="span"
        />
      </button>
      {open && (
        <RunSharePopover
          anchorRef={anchorRef}
          run={run}
          currentUserName={currentUserName}
          currentUserEmail={currentUserEmail}
          currentUserAvatar={currentUserAvatar}
          members={members}
          loading={membersLoading}
          onToggleShare={onToggleShare}
          onClose={onClose}
        />
      )}
    </div>
  );
}
