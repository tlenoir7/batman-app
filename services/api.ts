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

export async function deleteCasePermanent(caseId: string): Promise<boolean> {
  const cid = encodeURIComponent(String(caseId || '').trim());
  if (!cid) return false;
  try {
    const res = await fetch(joinUrl(`/api/cases/${cid}/permanent`), { method: 'DELETE' });
    return res.ok;
  } catch {
    return false;
  }
}

export type ProfileRow = {
  profile_id: string;
  name: string;
  role: string;
  summary: string;
  last_updated: string;
  status?: string;
  bruce_analysis?: string;
  notes?: string;
  metadata?: Record<string, unknown>;
};

export async function fetchProfiles(): Promise<ProfileRow[]> {
  try {
    const res = await fetch(joinUrl('/api/profiles'), {
      method: 'GET',
      headers: { Accept: 'application/json' },
    });
    if (!res.ok) return [];
    const data: unknown = await res.json().catch(() => null);
    if (!Array.isArray(data)) return [];
    return data.filter(
      (row): row is ProfileRow =>
        row != null &&
        typeof row === 'object' &&
        typeof (row as ProfileRow).profile_id === 'string'
    );
  } catch {
    return [];
  }
}

export async function createProfile(payload: {
  name: string;
  role: string;
  notes: string;
}): Promise<ProfileRow | null> {
  const name = String(payload.name || '').trim();
  const role = String(payload.role || 'UNKNOWN').trim();
  const notes = String(payload.notes || '').trim();
  if (!name) return null;
  try {
    const { ok, data } = await apiFetch<unknown>('/api/profiles/create', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, role, notes }),
    });
    if (!ok || data == null || typeof data !== 'object') return null;
    const d = data as Record<string, unknown>;
    const p = d.profile;
    if (!p || typeof p !== 'object') return null;
    const row = p as ProfileRow;
    if (typeof row.profile_id !== 'string') return null;
    return row;
  } catch {
    return null;
  }
}

export async function getProfile(profileId: string): Promise<ProfileRow | null> {
  const pid = encodeURIComponent(String(profileId || '').trim());
  if (!pid) return null;
  try {
    const { ok, data } = await apiFetch<unknown>(`/api/profiles/${pid}`, {
      method: 'GET',
      headers: { Accept: 'application/json' },
    });
    if (!ok || !data || typeof data !== 'object') return null;
    const d = data as Record<string, unknown>;
    const p = d.profile;
    if (!p || typeof p !== 'object') return null;
    const row = p as ProfileRow;
    if (typeof row.profile_id !== 'string') return null;
    return row;
  } catch {
    return null;
  }
}

export async function requestProfileAnalysis(profileId: string): Promise<ProfileRow | null> {
  const pid = encodeURIComponent(String(profileId || '').trim());
  if (!pid) return null;
  try {
    const { ok, data } = await apiFetch<unknown>(`/api/profiles/${pid}/analyze`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    });
    if (!ok || !data || typeof data !== 'object') return null;
    const d = data as Record<string, unknown>;
    const p = d.profile;
    if (!p || typeof p !== 'object') return null;
    const row = p as ProfileRow;
    if (typeof row.profile_id !== 'string') return null;
    return row;
  } catch {
    return null;
  }
}

export async function terminateProfile(profileId: string): Promise<boolean> {
  const pid = encodeURIComponent(String(profileId || '').trim());
  if (!pid) return false;
  try {
    const { ok } = await apiFetch<unknown>(`/api/profiles/${pid}/terminate`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    });
    return ok;
  } catch {
    return false;
  }
}

export async function deleteProfilePermanent(profileId: string): Promise<boolean> {
  const pid = encodeURIComponent(String(profileId || '').trim());
  if (!pid) return false;
  try {
    const res = await fetch(joinUrl(`/api/profiles/${pid}/permanent`), { method: 'DELETE' });
    return res.ok;
  } catch {
    return false;
  }
}

export type VisionForensicResult = {
  ok: boolean;
  bruce_briefing?: string;
  result?: unknown;
  error?: string;
};

export async function analyzeForensicImage(payload: {
  image_base64: string;
  context?: string;
  file_name?: string;
}): Promise<VisionForensicResult | null> {
  const image_base64 = String(payload.image_base64 || '').trim();
  if (!image_base64) return null;
  try {
    const { ok, data } = await apiFetch<unknown>('/api/vision/analyze', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        image_base64,
        context: payload.context ?? '',
        file_name: payload.file_name ?? 'photo.jpg',
      }),
    });
    if (!data || typeof data !== 'object') return null;
    const d = data as Record<string, unknown>;
    return {
      ok: ok && Boolean(d.ok ?? true),
      bruce_briefing:
        typeof d.bruce_briefing === 'string' ? d.bruce_briefing : undefined,
      result: d.result,
      error: typeof d.error === 'string' ? d.error : undefined,
    };
  } catch {
    return null;
  }
}

export async function attachToCase(payload: {
  case_id: string;
  attachment_type: string;
  content?: unknown;
  metadata?: Record<string, unknown>;
}): Promise<boolean> {
  const cid = encodeURIComponent(String(payload.case_id || '').trim());
  if (!cid) return false;
  try {
    const { ok } = await apiFetch<unknown>(`/api/cases/${cid}/attachments`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        attachment_type: payload.attachment_type,
        content: payload.content ?? null,
        metadata: payload.metadata ?? {},
      }),
    });
    return ok;
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
