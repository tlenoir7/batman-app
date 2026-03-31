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
  status: 'active' | 'dormant' | 'critical' | 'closed' | 'terminated' | 'archived' | string;
  title: string;
  last_update: string;
  summary: string;
  content?: string;
  metadata?: Record<string, unknown>;
};

/** GET /api/cases — active case board entries (JSON array). On failure, []. */
export async function fetchActiveCases(): Promise<CaseBoardRow[]> {
  try {
    const res = await fetch(joinUrl('/api/cases'), {
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

export async function createCase(payload: {
  title: string;
  summary: string;
}): Promise<CaseBoardRow | null> {
  const title = String(payload.title || '').trim();
  const summary = String(payload.summary || '').trim();
  if (!title) return null;

  try {
    const { ok, data } = await apiFetch<unknown>('/api/cases/create', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title, summary }),
    });
    if (!ok || data == null || typeof data !== 'object') return null;
    const d = data as Record<string, unknown>;
    const c = d.case;
    if (!c || typeof c !== 'object') return null;
    const row = c as CaseBoardRow;
    if (typeof row.case_id !== 'string') return null;
    return row;
  } catch {
    return null;
  }
}

export async function closeCase(caseId: string): Promise<boolean> {
  const cid = encodeURIComponent(String(caseId || '').trim());
  if (!cid) return false;
  try {
    const res = await fetch(joinUrl(`/api/cases/${cid}`), { method: 'DELETE' });
    return res.ok;
  } catch {
    return false;
  }
}

export async function postBriefingMessage(payload: {
  message: string;
  first_contact?: boolean;
}): Promise<string | null> {
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
