const TOKEN_KEY = 'caliper_id_token';
const GOOGLE_ISSUERS = new Set(['https://accounts.google.com', 'accounts.google.com']);

export type AuthTokenUser = {
  sub: string;
  email: string;
  name: string;
};

function decodeJwtPayload(token: string): Record<string, unknown> {
  const part = token.split('.')[1];
  if (!part) throw new Error('Invalid token');
  const json = atob(part.replace(/-/g, '+').replace(/_/g, '/'));
  return JSON.parse(json) as Record<string, unknown>;
}

function isGoogleIdToken(token: string): boolean {
  try {
    const payload = decodeJwtPayload(token);
    const iss = payload.iss;
    return typeof iss === 'string' && GOOGLE_ISSUERS.has(iss);
  } catch {
    return false;
  }
}

function isTokenExpired(token: string): boolean {
  try {
    const payload = decodeJwtPayload(token);
    const exp = payload.exp;
    if (typeof exp !== 'number') return true;
    return Date.now() >= exp * 1000;
  } catch {
    return true;
  }
}

export function parseUserFromToken(token: string): AuthTokenUser | null {
  try {
    const payload = decodeJwtPayload(token);
    const sub = payload.sub;
    const email = payload.email;
    if (typeof sub !== 'string' || typeof email !== 'string') return null;
    const name =
      (typeof payload.name === 'string' && payload.name) ||
      (typeof payload.given_name === 'string' && payload.given_name) ||
      email;
    return { sub, email, name };
  } catch {
    return null;
  }
}

export function getStoredIdToken(): string | null {
  const token = sessionStorage.getItem(TOKEN_KEY);
  if (!token || !isGoogleIdToken(token) || isTokenExpired(token)) {
    if (token) sessionStorage.removeItem(TOKEN_KEY);
    return null;
  }
  return token;
}

export async function getIdToken(): Promise<string | null> {
  return getStoredIdToken();
}

export function setIdToken(token: string): void {
  sessionStorage.setItem(TOKEN_KEY, token);
}

export function clearIdToken(): void {
  sessionStorage.removeItem(TOKEN_KEY);
}

export async function signOutUser(): Promise<void> {
  clearIdToken();
}
