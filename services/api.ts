import { API_BASE } from './config';

function joinUrl(path: string): string {
  const p = path.startsWith('/') ? path : `/${path}`;
  return `${API_BASE}${p}`;
}

/** JSON fetch against the Batman backend. */
export async function apiFetch<T = unknown>(
  path: string,
  init?: RequestInit
): Promise<{ ok: boolean; status: number; data: T | null }> {
  if (!API_BASE) {
    console.warn('[batman-api] EXPO_PUBLIC_API_URL is not set');
    return { ok: false, status: 0, data: null };
  }

  const res = await fetch(joinUrl(path), init);
  let data: T | null = null;
  try {
    const text = await res.text();
    if (text) data = JSON.parse(text) as T;
  } catch {
    data = null;
  }
  return { ok: res.ok, status: res.status, data };
}

function extractReplyFromPayload(data: unknown): string | null {
  if (data == null) return null;
  if (typeof data === 'string' && data.trim()) return data.trim();
  if (typeof data !== 'object') return null;
  const o = data as Record<string, unknown>;
  for (const key of ['reply', 'message', 'text', 'response', 'content']) {
    const v = o[key];
    if (typeof v === 'string' && v.trim()) return v.trim();
  }
  return null;
}

/**
 * POST /api/message — briefing channel. On failure or empty body, returns null (caller stays silent).
 */
export type CaseBoardRow = {
  case_id: string;
  status: 'active' | 'dormant' | 'critical' | string;
  title: string;
  last_update: string;
  summary: string;
};

/** GET /api/cases — active case board entries (JSON array). On failure, []. */
export async function fetchActiveCases(): Promise<CaseBoardRow[]> {
  if (!API_BASE) return [];

  try {
    const res = await fetch(`${API_BASE.replace(/\/$/, '')}/api/cases`, {
      method: 'GET',
      headers: { Accept: 'application/json' },
    });
    if (!res.ok) return [];
    const data: unknown = await res.json().catch(() => null);
    if (!Array.isArray(data)) return [];
    return data.filter(
      (row): row is CaseBoardRow =>
        row != null &&
        typeof row === 'object' &&
        typeof (row as CaseBoardRow).case_id === 'string'
    );
  } catch {
    return [];
  }
}

export async function postBriefingMessage(payload: {
  message: string;
  first_contact?: boolean;
}): Promise<string | null> {
  if (!API_BASE) return null;

  try {
    const { ok, data } = await apiFetch<unknown>('/api/message', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    if (!ok || data == null) return null;
    return extractReplyFromPayload(data);
  } catch {
    return null;
  }
}
