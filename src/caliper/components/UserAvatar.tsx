// @ts-nocheck
import React from 'react'

function memberInitials(name, email) {
  return (name ?? email ?? '?')
    .split(/[\s@.]+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join('') || '?';
}

export function UserAvatar({ name, email, avatarUrl, size = 22, className }) {
  const [failed, setFailed] = React.useState(false);

  React.useEffect(() => {
    setFailed(false);
  }, [avatarUrl]);

  const showImage = Boolean(avatarUrl) && !failed;
  const baseStyle = {
    width: size,
    height: size,
    borderRadius: '50%',
    flexShrink: 0,
  };

  if (showImage) {
    return (
      <img
        src={avatarUrl}
        alt=""
        referrerPolicy="no-referrer"
        className={className}
        onError={() => setFailed(true)}
        style={{ ...baseStyle, objectFit: 'cover', display: 'block' }}
      />
    );
  }

  return (
    <span
      aria-hidden
      className={className}
      style={{
        ...baseStyle,
        display: 'inline-grid',
        placeItems: 'center',
        background: 'var(--bg-sunk)',
        color: 'var(--ink-soft)',
        fontSize: Math.max(9, size * 0.42),
        fontWeight: 600,
        letterSpacing: '0.02em',
      }}
    >
      {memberInitials(name, email)}
    </span>
  );
}

export function RunAccessLabel({ run, currentUserName, currentUserEmail, currentUserAvatar, as: Tag = 'span' }) {
  const sharedUsers = run.shared_users ?? run.sharedUsers ?? [];
  const isOwner = run.is_owner ?? run.isOwner;
  const ownerName = run.owner_name ?? run.ownerName;
  const ownerEmail = run.owner_email ?? run.ownerEmail;
  const ownerAvatar = run.owner_avatar_url ?? run.ownerAvatarUrl;

  if (!isOwner) {
    const label = ownerName || ownerEmail || 'a teammate';
    return (
      <Tag className="run-access">
        <UserAvatar name={ownerName} email={ownerEmail} avatarUrl={ownerAvatar} size={22} />
        <span className="run-access__label">
          Shared by <span className="run-access__name">{label}</span>
        </span>
      </Tag>
    );
  }

  return (
    <Tag className="run-access">
      <UserAvatar
        name={currentUserName}
        email={currentUserEmail}
        avatarUrl={currentUserAvatar ?? ownerAvatar}
        size={22}
      />
      <span className="run-access__label run-access__name">You</span>
      {sharedUsers.length > 0 && (
        <>
          <span className="run-access__stack" aria-label={`Shared with ${sharedUsers.length} people`}>
            {sharedUsers.slice(0, 4).map((u, i) => (
              <UserAvatar
                key={u.user_id ?? u.userId ?? i}
                name={u.name}
                email={u.email}
                avatarUrl={u.avatar_url ?? u.avatarUrl}
                size={20}
                className="run-access__stack-item"
              />
            ))}
          </span>
          <span className="run-access__label muted">
            Shared with {sharedUsers.length}
          </span>
        </>
      )}
    </Tag>
  );
}
