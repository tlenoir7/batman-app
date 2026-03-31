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

/** GET /api/cases/{case_id}/timeline — case activity (newest first; CASE OPENED last). */
export type TimelineEntryType =
  | 'forensic'
  | 'osint'
  | 'profile_link'
  | 'conversation_update'
  | 'case_opened';

export type TimelineEntry = {
  id: string;
  type: TimelineEntryType;
  timestamp: string;
  label: string;
  summary: string;
  full_content: string;
};

export async function fetchCaseTimeline(caseId: string): Promise<TimelineEntry[]> {
  const cid = encodeURIComponent(String(caseId || '').trim());
  if (!cid) return [];
  try {
    const res = await fetch(joinUrl(`/api/cases/${cid}/timeline`), {
      method: 'GET',
      headers: { Accept: 'application/json' },
    });
    if (!res.ok) return [];
    const data: unknown = await res.json().catch(() => null);
    if (!Array.isArray(data)) return [];
    const types: TimelineEntryType[] = [
      'forensic',
      'osint',
      'profile_link',
      'conversation_update',
      'case_opened',
    ];
    return data.filter((x): x is TimelineEntry => {
      if (x == null || typeof x !== 'object') return false;
      const o = x as Record<string, unknown>;
      if (typeof o.id !== 'string' || typeof o.type !== 'string') return false;
      if (!types.includes(o.type as TimelineEntryType)) return false;
      return (
        typeof o.timestamp === 'string' &&
        typeof o.label === 'string' &&
        typeof o.summary === 'string' &&
        typeof o.full_content === 'string'
      );
    });
  } catch {
    return [];
  }
}

/** GET /api/profiles/{profile_id}/linked-cases */
export async function fetchLinkedCases(profileId: string): Promise<CaseBoardRow[]> {
  const pid = encodeURIComponent(String(profileId || '').trim());
  if (!pid) return [];
  try {
    const res = await fetch(joinUrl(`/api/profiles/${pid}/linked-cases`), {
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

export type LinkedProfileRow = {
  profile_id: string;
  name: string;
  role: string;
};

/** GET /api/cases/{case_id}/linked-profiles */
export async function fetchLinkedProfiles(caseId: string): Promise<LinkedProfileRow[]> {
  const cid = encodeURIComponent(String(caseId || '').trim());
  if (!cid) return [];
  try {
    const res = await fetch(joinUrl(`/api/cases/${cid}/linked-profiles`), {
      method: 'GET',
      headers: { Accept: 'application/json' },
    });
    if (!res.ok) return [];
    const data: unknown = await res.json().catch(() => null);
    if (!Array.isArray(data)) return [];
    return data.filter(
      (row): row is LinkedProfileRow =>
        row != null &&
        typeof row === 'object' &&
        typeof (row as LinkedProfileRow).profile_id === 'string' &&
        typeof (row as LinkedProfileRow).name === 'string' &&
        typeof (row as LinkedProfileRow).role === 'string'
    );
  } catch {
    return [];
  }
}

/** POST /api/profiles/{profile_id}/link-case — body { case_id } */
export async function linkProfileToCase(
  profileId: string,
  caseId: string
): Promise<boolean> {
  const pid = encodeURIComponent(String(profileId || '').trim());
  const case_id = String(caseId || '').trim();
  if (!pid || !case_id) return false;
  try {
    const { ok } = await apiFetch<{ ok?: boolean }>(`/api/profiles/${pid}/link-case`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ case_id }),
    });
    return Boolean(ok);
  } catch {
    return false;
  }
}

/** DELETE /api/profiles/{profile_id}/link-case/{case_id} */
export async function unlinkProfileFromCase(
  profileId: string,
  caseId: string
): Promise<boolean> {
  const pid = encodeURIComponent(String(profileId || '').trim());
  const cid = encodeURIComponent(String(caseId || '').trim());
  if (!pid || !cid) return false;
  try {
    const { ok } = await apiFetch<{ ok?: boolean }>(
      `/api/profiles/${pid}/link-case/${cid}`,
      { method: 'DELETE' }
    );
    return Boolean(ok);
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

export type SuitStatus = {
  status: 'active' | 'dormant' | 'critical' | string;
  current_priority: string;
  trl_systems: Record<string, number>;
  bruce_briefing?: string;
  priorities?: string[];
  blockers?: string[];
  notes?: string;
};

export type GadgetStatus = 'concept' | 'in_development' | 'field_ready' | 'retired' | string;

export type GadgetRow = {
  gadget_id: string;
  name: string;
  status: GadgetStatus;
  trl: number;
  description: string;
  build_notes?: string;
  materials?: string;
  bruce_briefing?: string;
  last_updated?: string;
};

export async function fetchSuitStatus(): Promise<SuitStatus | null> {
  try {
    const { ok, data } = await apiFetch<unknown>('/api/arsenal/suit', { method: 'GET' });
    if (!ok || !data || typeof data !== 'object') return null;
    return data as SuitStatus;
  } catch {
    return null;
  }
}

export async function requestSuitAssessment(): Promise<SuitStatus | null> {
  try {
    const { ok, data } = await apiFetch<unknown>('/api/arsenal/suit/assess', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    });
    if (!ok || !data || typeof data !== 'object') return null;
    return data as SuitStatus;
  } catch {
    return null;
  }
}

export async function updateSuitNotes(notes: string): Promise<boolean> {
  try {
    const { ok } = await apiFetch<unknown>('/api/arsenal/suit/notes', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ notes: String(notes ?? '') }),
    });
    return ok;
  } catch {
    return false;
  }
}

export async function fetchGadgets(): Promise<GadgetRow[]> {
  try {
    const res = await fetch(joinUrl('/api/arsenal/gadgets'), {
      method: 'GET',
      headers: { Accept: 'application/json' },
    });
    if (!res.ok) return [];
    const data: unknown = await res.json().catch(() => null);
    if (!Array.isArray(data)) return [];
    return data.filter(
      (g): g is GadgetRow => g != null && typeof g === 'object' && typeof (g as GadgetRow).gadget_id === 'string'
    );
  } catch {
    return [];
  }
}

export async function createGadget(payload: {
  name: string;
  status: GadgetStatus;
  trl: number;
  description: string;
}): Promise<GadgetRow | null> {
  const name = String(payload.name || '').trim();
  const status = String(payload.status || 'concept').trim();
  const trl = Math.max(1, Math.min(9, Number(payload.trl || 1)));
  const description = String(payload.description || '').trim();
  if (!name) return null;
  try {
    const { ok, data } = await apiFetch<unknown>('/api/arsenal/gadgets/create', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, status, trl, description }),
    });
    if (!ok || !data || typeof data !== 'object') return null;
    return data as GadgetRow;
  } catch {
    return null;
  }
}

export async function getGadget(gadgetId: string): Promise<GadgetRow | null> {
  const gid = encodeURIComponent(String(gadgetId || '').trim());
  if (!gid) return null;
  try {
    const { ok, data } = await apiFetch<unknown>(`/api/arsenal/gadgets/${gid}`, { method: 'GET' });
    if (!ok || !data || typeof data !== 'object') return null;
    return data as GadgetRow;
  } catch {
    return null;
  }
}

export async function requestGadgetAssessment(gadgetId: string): Promise<GadgetRow | null> {
  const gid = encodeURIComponent(String(gadgetId || '').trim());
  if (!gid) return null;
  try {
    const { ok, data } = await apiFetch<unknown>(`/api/arsenal/gadgets/${gid}/assess`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    });
    if (!ok || !data || typeof data !== 'object') return null;
    return data as GadgetRow;
  } catch {
    return null;
  }
}

export async function updateGadget(gadgetId: string, fields: Partial<GadgetRow>): Promise<GadgetRow | null> {
  const gid = encodeURIComponent(String(gadgetId || '').trim());
  if (!gid) return null;
  try {
    const { ok, data } = await apiFetch<unknown>(`/api/arsenal/gadgets/${gid}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(fields ?? {}),
    });
    if (!ok || !data || typeof data !== 'object') return null;
    return data as GadgetRow;
  } catch {
    return null;
  }
}

export async function deleteGadget(gadgetId: string): Promise<boolean> {
  const gid = encodeURIComponent(String(gadgetId || '').trim());
  if (!gid) return false;
  try {
    const res = await fetch(joinUrl(`/api/arsenal/gadgets/${gid}`), { method: 'DELETE' });
    return res.ok;
  } catch {
    return false;
  }
}

export type GadgetSuggestion = {
  name: string;
  status: GadgetStatus;
  trl: number;
  description: string;
};

export async function suggestGadgets(context: string): Promise<GadgetSuggestion[]> {
  try {
    const { ok, data } = await apiFetch<unknown>('/api/arsenal/gadgets/suggest', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ context: String(context ?? '') }),
    });
    if (!ok) return [];
    if (Array.isArray(data)) return data as GadgetSuggestion[];
    if (data && typeof data === 'object' && Array.isArray((data as any).gadgets)) {
      return (data as any).gadgets as GadgetSuggestion[];
    }
    return [];
  } catch {
    return [];
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
