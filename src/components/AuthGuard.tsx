import React from 'react';
import { fetchAuthSession } from 'aws-amplify/auth';
import Login from '@/pages/Login';

type Status = 'checking' | 'authenticated' | 'unauthenticated';

export function AuthGuard({ children }: { children: React.ReactNode }) {
  const [status, setStatus] = React.useState<Status>('checking');

  React.useEffect(() => {
    fetchAuthSession()
      .then((session) => {
        if (session.tokens?.idToken) {
          setStatus('authenticated');
        } else {
          setStatus('unauthenticated');
        }
      })
      .catch(() => setStatus('unauthenticated'));
  }, []);

  if (status === 'checking') {
    return (
      <div style={{ display: 'grid', placeItems: 'center', height: '100vh', fontSize: 14, color: '#6b7280' }}>
        Loading…
      </div>
    );
  }

  if (status === 'unauthenticated') {
    return <Login />;
  }

  return <>{children}</>;
}
