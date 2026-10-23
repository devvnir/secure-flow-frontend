export const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';

export type FlowStatus = 'draft' | 'active' | 'paused' | 'archived';

export interface DataFlow {
  id: string;
  name: string;
  description: string | null;
  source_type: string;
  destination_type: string;
  source_config: Record<string, unknown> | null;
  destination_config: Record<string, unknown> | null;
  status: FlowStatus;
  encryption_enabled: boolean;
  created_at: string;
  updated_at: string;
}

export interface CurrentUser {
  id: string;
  email: string;
  username: string;
}

export class ApiError extends Error {
  constructor(message: string, public status: number) {
    super(message);
  }
}

export class AuthRequiredError extends ApiError {
  constructor() {
    super('Please sign in again', 401);
  }
}

const ACCESS = 'access_token';
const REFRESH = 'refresh_token';

export function saveTokens(tokens: { access_token: string; refresh_token: string }) {
  localStorage.setItem(ACCESS, tokens.access_token);
  localStorage.setItem(REFRESH, tokens.refresh_token);
}

export function clearTokens() {
  localStorage.removeItem(ACCESS);
  localStorage.removeItem(REFRESH);
}

export function hasSession() {
  return typeof window !== 'undefined' && !!localStorage.getItem(ACCESS);
}

function errorMessage(body: unknown, status: number): string {
  const detail = (body as { detail?: unknown })?.detail;
  if (typeof detail === 'string') return detail;
  if (Array.isArray(detail)) {
    return detail
      .map((d: { loc?: unknown[]; msg?: string }) => `${(d.loc || []).slice(1).join('.') || 'request'}: ${d.msg}`)
      .join('; ');
  }
  return `Request failed (${status})`;
}

let refreshing: Promise<boolean> | null = null;

async function refreshTokens(): Promise<boolean> {
  const refreshToken = localStorage.getItem(REFRESH);
  if (!refreshToken) return false;
  if (refreshing) return refreshing;
  refreshing = (async () => {
    try {
      const res = await fetch(`${API_URL}/api/auth/refresh`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ refresh_token: refreshToken }),
      });
      if (!res.ok) return false;
      saveTokens(await res.json());
      return true;
    } catch {
      return false;
    } finally {
      refreshing = null;
    }
  })();
  return refreshing;
}

export async function api<T = unknown>(path: string, init: RequestInit = {}, retried = false): Promise<T> {
  const token = localStorage.getItem(ACCESS);
  if (!token) throw new AuthRequiredError();

  const res = await fetch(`${API_URL}${path}`, {
    ...init,
    headers: {
      ...(init.body ? { 'Content-Type': 'application/json' } : {}),
      Authorization: `Bearer ${token}`,
      ...(init.headers || {}),
    },
  });

  if (res.status === 401 && !retried) {
    if (await refreshTokens()) return api<T>(path, init, true);
    clearTokens();
    throw new AuthRequiredError();
  }

  const body = res.status === 204 ? null : await res.json().catch(() => null);
  if (!res.ok) throw new ApiError(errorMessage(body, res.status), res.status);
  return body as T;
}

export async function publicPost<T = unknown>(path: string, payload: unknown): Promise<T> {
  const res = await fetch(`${API_URL}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  const body = await res.json().catch(() => null);
  if (!res.ok) throw new ApiError(errorMessage(body, res.status), res.status);
  return body as T;
}

export async function logout() {
  const refreshToken = localStorage.getItem(REFRESH);
  if (refreshToken) {
    await api('/api/auth/logout', { method: 'POST', body: JSON.stringify({ refresh_token: refreshToken }) }).catch(() => undefined);
  }
  clearTokens();
}

// Backend timestamps are naive UTC; mark them as UTC so they render in local time.
export const parseUtc = (value: string) => new Date(/[zZ]|[+-]\d\d:\d\d$/.test(value) ? value : `${value}Z`);
