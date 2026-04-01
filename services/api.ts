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

/** POST /api/voice/transcribe — base64 audio (e.g. WAV) → Whisper text. */
export async function transcribeVoiceNote(
  audioB64: string,
  fileName?: string
): Promise<string | null> {
  const b64 = String(audioB64 || '').trim();
  if (!b64) return null;
  try {
    const { ok, data } = await apiFetch<{
      ok?: boolean;
      transcription?: string;
      error?: string;
    }>('/api/voice/transcribe', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        audio_b64: b64,
        file_name: fileName ?? 'recording.wav',
      }),
    });
    if (!ok || data == null) return null;
    const t = typeof data.transcription === 'string' ? data.transcription.trim() : '';
    return t || null;
  } catch {
    return null;
  }
}

/** POST /api/voice/file — file observation + Bruce note on case. */
export async function fileVoiceNote(
  transcription: string,
  caseId: string,
  audioDuration?: number
): Promise<{ ok: boolean; bruce_note?: string }> {
  const t = String(transcription || '').trim();
  const cid = String(caseId || '').trim();
  if (!t || !cid) return { ok: false };
  try {
    const { ok, data } = await apiFetch<{ ok?: boolean; bruce_note?: string }>('/api/voice/file', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        transcription: t,
        case_id: cid,
        audio_duration: audioDuration,
      }),
    });
    if (!ok || data == null || typeof data !== 'object') return { ok: false };
    const d = data as Record<string, unknown>;
    return {
      ok: Boolean(d.ok),
      bruce_note: typeof d.bruce_note === 'string' ? d.bruce_note : undefined,
    };
  } catch {
    return { ok: false };
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

/** Ordered section headers in bruce_briefing structured assessments. */
export const TECHNICAL_FILE_SECTION_ORDER = [
  'TECHNICAL OVERVIEW',
  'STRUCTURAL SCHEMATICS',
  'COMPONENT MAPPING',
  'MATERIAL COMPOSITION',
  'POWER SYSTEMS',
  'ASSEMBLY INSTRUCTIONS',
  'MANUFACTURING PATHWAY',
  'FAILURE POINTS',
  'OPTIMIZATION PATHS',
] as const;

export type TechnicalFileSectionId = (typeof TECHNICAL_FILE_SECTION_ORDER)[number];

const TECHNICAL_FILE_HEADER_SET = new Set<string>(TECHNICAL_FILE_SECTION_ORDER);

function normalizeTechnicalHeaderLine(line: string): string {
  return line.replace(/^#+\s*/, '').replace(/\*\*/g, '').trim().toUpperCase();
}

/**
 * Parse bruce_briefing into section → content. Headers may use markdown (##, #, **).
 * Content runs until the next known header.
 */
export function parseTechnicalFile(text: string): Record<string, string> {
  const raw = String(text ?? '').replace(/\r\n/g, '\n');
  if (!raw.trim()) return {};
  const lines = raw.split('\n');
  const buffers: Record<string, string[]> = {};
  let current: string | null = null;

  const append = (key: string, line: string) => {
    if (!buffers[key]) buffers[key] = [];
    buffers[key].push(line);
  };

  for (const line of lines) {
    const normalizedLine = normalizeTechnicalHeaderLine(line);
    if (TECHNICAL_FILE_HEADER_SET.has(normalizedLine)) {
      current = normalizedLine;
      continue;
    }
    if (current) {
      append(current, line);
    } else {
      append('TECHNICAL OVERVIEW', line);
    }
  }

  const out: Record<string, string> = {};
  for (const key of TECHNICAL_FILE_SECTION_ORDER) {
    const b = buffers[key];
    if (b && b.length) {
      const s = b.join('\n').trim();
      if (s) out[key] = s;
    }
  }
  return out;
}

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

/** GET /api/arsenal/suit/capabilities — bullet list for suit technical file. */
export async function fetchSuitCapabilities(): Promise<string[]> {
  try {
    const { ok, data } = await apiFetch<unknown>('/api/arsenal/suit/capabilities', { method: 'GET' });
    if (!ok || data == null) return [];
    if (Array.isArray(data)) {
      return data.filter((x): x is string => typeof x === 'string' && x.trim().length > 0);
    }
    if (typeof data === 'object') {
      const d = data as Record<string, unknown>;
      const arr = d.capabilities ?? d.items;
      if (Array.isArray(arr)) {
        return arr.filter((x): x is string => typeof x === 'string' && x.trim().length > 0);
      }
    }
    return [];
  } catch {
    return [];
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

/** Failsafe Project (Arsenal) — backend may return nested `project` or flat object. */
export type FailsafeSubsystemSummary = {
  name: string;
  display_name?: string;
  trl: number;
  status: string;
  next_milestone?: string;
};

export type FailsafeProject = {
  project_status: string;
  directive?: string;
  memory_wipe_implemented?: boolean;
  /** Bruce warning copy for the two-step memory wipe flow */
  memory_wipe_warning?: string;
  /** Six TRL values (1–9), one per subsystem */
  subsystem_trls?: number[];
  subsystems?: FailsafeSubsystemSummary[];
  bruce_assessment?: string;
  uap_connection_notes?: string;
};

export type FailsafeSubsystemDetail = {
  name: string;
  trl: number;
  status: string;
  description?: string;
  engineering_notes?: string;
  next_milestone?: string;
  uap_affected?: boolean;
  bruce_assessment?: string;
};

function unwrapFailsafeProject(data: unknown): FailsafeProject | null {
  if (data == null || typeof data !== 'object') return null;
  const d = data as Record<string, unknown>;
  const inner = d.project ?? d.failsafe ?? d;
  if (inner == null || typeof inner !== 'object') return null;
  return inner as FailsafeProject;
}

export async function fetchFailsafeProject(): Promise<FailsafeProject | null> {
  try {
    const { ok, data } = await apiFetch<unknown>('/api/failsafe', { method: 'GET' });
    if (!ok) return null;
    return unwrapFailsafeProject(data);
  } catch {
    return null;
  }
}

export async function requestFailsafeAssessment(): Promise<FailsafeProject | null> {
  try {
    const { ok, data } = await apiFetch<unknown>('/api/failsafe/assess', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    });
    if (!ok) return null;
    return unwrapFailsafeProject(data);
  } catch {
    return null;
  }
}

export async function updateFailsafeProject(
  fields: Partial<FailsafeProject>
): Promise<FailsafeProject | null> {
  try {
    const { ok, data } = await apiFetch<unknown>('/api/failsafe', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(fields ?? {}),
    });
    if (!ok) return null;
    return unwrapFailsafeProject(data);
  } catch {
    return null;
  }
}

export async function setFailsafeDirective(directive: string): Promise<FailsafeProject | null> {
  try {
    const { ok, data } = await apiFetch<unknown>('/api/failsafe/directive', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ directive: String(directive ?? '') }),
    });
    if (!ok) return null;
    return unwrapFailsafeProject(data);
  } catch {
    return null;
  }
}

export async function implementMemoryWipe(): Promise<FailsafeProject | null> {
  try {
    const { ok, data } = await apiFetch<unknown>('/api/failsafe/memory-wipe', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    });
    if (!ok) return null;
    return unwrapFailsafeProject(data);
  } catch {
    return null;
  }
}

export async function fetchFailsafeSubsystem(subsystemName: string): Promise<FailsafeSubsystemDetail | null> {
  const enc = encodeURIComponent(String(subsystemName || '').trim());
  if (!enc) return null;
  try {
    const { ok, data } = await apiFetch<unknown>(`/api/failsafe/subsystems/${enc}`, {
      method: 'GET',
    });
    if (!ok || data == null || typeof data !== 'object') return null;
    const d = data as Record<string, unknown>;
    const sub = d.subsystem ?? d;
    if (!sub || typeof sub !== 'object') return null;
    return sub as FailsafeSubsystemDetail;
  } catch {
    return null;
  }
}

export async function requestSubsystemAssessment(
  subsystemName: string
): Promise<FailsafeSubsystemDetail | null> {
  const enc = encodeURIComponent(String(subsystemName || '').trim());
  if (!enc) return null;
  try {
    const { ok, data } = await apiFetch<unknown>(
      `/api/failsafe/subsystems/${enc}/assess`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      }
    );
    if (!ok || data == null || typeof data !== 'object') return null;
    const d = data as Record<string, unknown>;
    const sub = d.subsystem ?? d;
    if (!sub || typeof sub !== 'object') return null;
    return sub as FailsafeSubsystemDetail;
  } catch {
    return null;
  }
}

export async function updateSubsystem(
  subsystemName: string,
  fields: Partial<FailsafeSubsystemDetail>
): Promise<FailsafeSubsystemDetail | null> {
  const enc = encodeURIComponent(String(subsystemName || '').trim());
  if (!enc) return null;
  try {
    const { ok, data } = await apiFetch<unknown>(`/api/failsafe/subsystems/${enc}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(fields ?? {}),
    });
    if (!ok || data == null || typeof data !== 'object') return null;
    const d = data as Record<string, unknown>;
    const sub = d.subsystem ?? d;
    if (!sub || typeof sub !== 'object') return null;
    return sub as FailsafeSubsystemDetail;
  } catch {
    return null;
  }
}

export type ContingencyClassification =
  | 'STANDARD'
  | 'ADVANCED'
  | 'THEORETICAL'
  | 'FAILSAFE'
  | string;

export type ContingencyStatus =
  | 'THEORETICAL'
  | 'STAGED'
  | 'READY'
  | 'ACTIVATED'
  | 'RETIRED'
  | string;

export type ContingencyRow = {
  cont_id: string;
  title: string;
  classification: ContingencyClassification;
  status: ContingencyStatus;
  trigger_condition?: string;
  objective?: string;
  execution_steps?: string;
  failsafe_within?: string;
  bruce_assessment?: string;
};

export type CreateContingencyPayload = {
  title: string;
  classification: ContingencyClassification;
  trigger_condition: string;
  objective: string;
  execution_steps: string;
  failsafe_within: string;
};

export type ContingencyProposal = {
  title: string;
  classification: ContingencyClassification;
  trigger_condition?: string;
  objective?: string;
  execution_steps?: string | string[];
  failsafe_within?: string;
};

export async function fetchContingencies(): Promise<ContingencyRow[]> {
  try {
    const res = await fetch(joinUrl('/api/contingencies'), {
      method: 'GET',
      headers: { Accept: 'application/json' },
    });
    if (!res.ok) return [];
    const data: unknown = await res.json().catch(() => null);
    if (!Array.isArray(data)) return [];
    return data.filter(
      (row): row is ContingencyRow =>
        row != null &&
        typeof row === 'object' &&
        typeof (row as ContingencyRow).cont_id === 'string' &&
        typeof (row as ContingencyRow).title === 'string'
    );
  } catch {
    return [];
  }
}

export async function createContingency(
  fields: CreateContingencyPayload
): Promise<ContingencyRow | null> {
  const title = String(fields.title || '').trim();
  if (!title) return null;
  try {
    const { ok, data } = await apiFetch<unknown>('/api/contingencies/create', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        title,
        classification: fields.classification,
        trigger_condition: String(fields.trigger_condition ?? ''),
        objective: String(fields.objective ?? ''),
        execution_steps: String(fields.execution_steps ?? ''),
        failsafe_within: String(fields.failsafe_within ?? ''),
      }),
    });
    if (!ok || data == null || typeof data !== 'object') return null;
    const d = data as Record<string, unknown>;
    const nested = d.contingency ?? d.contingency_row;
    const rowObj: Record<string, unknown> | null =
      nested != null && typeof nested === 'object'
        ? (nested as Record<string, unknown>)
        : typeof d.cont_id === 'string' ||
            typeof d.cont_id === 'number' ||
            typeof d.id === 'string' ||
            typeof d.id === 'number'
          ? d
          : null;
    if (!rowObj) return null;
    const rawId = rowObj.cont_id ?? rowObj.id ?? d.cont_id ?? d.id;
    if (rawId == null) return null;
    const cont_id = String(rawId).trim();
    if (!cont_id) return null;

    const row: ContingencyRow = {
      cont_id,
      title:
        typeof rowObj.title === 'string' && rowObj.title.trim()
          ? rowObj.title.trim()
          : title,
      classification:
        (typeof rowObj.classification === 'string'
          ? rowObj.classification
          : fields.classification) ?? 'STANDARD',
      status: (typeof rowObj.status === 'string' ? rowObj.status : 'STAGED') as ContingencyStatus,
      trigger_condition:
        typeof rowObj.trigger_condition === 'string'
          ? rowObj.trigger_condition
          : String(fields.trigger_condition ?? ''),
      objective:
        typeof rowObj.objective === 'string' ? rowObj.objective : String(fields.objective ?? ''),
      execution_steps:
        typeof rowObj.execution_steps === 'string'
          ? rowObj.execution_steps
          : String(fields.execution_steps ?? ''),
      failsafe_within:
        typeof rowObj.failsafe_within === 'string'
          ? rowObj.failsafe_within
          : String(fields.failsafe_within ?? ''),
    };
    if (typeof rowObj.bruce_assessment === 'string') {
      row.bruce_assessment = rowObj.bruce_assessment;
    }
    return row;
  } catch {
    return null;
  }
}

export async function getContingency(contId: string): Promise<ContingencyRow | null> {
  const id = encodeURIComponent(String(contId || '').trim());
  if (!id) return null;
  try {
    const { ok, data } = await apiFetch<unknown>(`/api/contingencies/${id}`, { method: 'GET' });
    if (!ok || data == null || typeof data !== 'object') return null;
    const d = data as Record<string, unknown>;
    const c = d.contingency ?? d;
    if (!c || typeof c !== 'object') return null;
    const row = c as ContingencyRow;
    if (typeof row.cont_id !== 'string') return null;
    return row;
  } catch {
    return null;
  }
}

export async function requestContingencyAssessment(contId: string): Promise<ContingencyRow | null> {
  const id = encodeURIComponent(String(contId || '').trim());
  if (!id) return null;
  try {
    const { ok, data } = await apiFetch<unknown>(`/api/contingencies/${id}/assess`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    });
    if (!ok || data == null || typeof data !== 'object') return null;
    const d = data as Record<string, unknown>;
    const c = d.contingency ?? d;
    if (!c || typeof c !== 'object') return null;
    const row = c as ContingencyRow;
    if (typeof row.cont_id !== 'string') return null;
    return row;
  } catch {
    return null;
  }
}

export async function updateContingency(
  contId: string,
  fields: Partial<ContingencyRow>
): Promise<ContingencyRow | null> {
  const id = encodeURIComponent(String(contId || '').trim());
  if (!id) return null;
  try {
    const { ok, data } = await apiFetch<unknown>(`/api/contingencies/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(fields ?? {}),
    });
    if (!ok || data == null || typeof data !== 'object') return null;
    const d = data as Record<string, unknown>;
    const c = d.contingency ?? d;
    if (!c || typeof c !== 'object') return null;
    const row = c as ContingencyRow;
    if (typeof row.cont_id !== 'string') return null;
    return row;
  } catch {
    return null;
  }
}

export async function activateContingency(contId: string): Promise<boolean> {
  const id = encodeURIComponent(String(contId || '').trim());
  if (!id) return false;
  try {
    const { ok } = await apiFetch<unknown>(`/api/contingencies/${id}/activate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    });
    return ok;
  } catch {
    return false;
  }
}

export async function retireContingency(contId: string): Promise<boolean> {
  const id = encodeURIComponent(String(contId || '').trim());
  if (!id) return false;
  try {
    const { ok } = await apiFetch<unknown>(`/api/contingencies/${id}/retire`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    });
    return ok;
  } catch {
    return false;
  }
}

export async function deleteContingency(contId: string): Promise<boolean> {
  const id = encodeURIComponent(String(contId || '').trim());
  if (!id) return false;
  try {
    const res = await fetch(joinUrl(`/api/contingencies/${id}`), { method: 'DELETE' });
    return res.ok;
  } catch {
    return false;
  }
}

export async function proposeContingencies(situation: string): Promise<ContingencyProposal[]> {
  try {
    const { ok, data } = await apiFetch<unknown>('/api/contingencies/propose', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ situation: String(situation ?? '') }),
    });
    if (!ok) return [];
    if (Array.isArray(data)) return data as ContingencyProposal[];
    if (data && typeof data === 'object' && Array.isArray((data as { contingencies?: unknown }).contingencies)) {
      return (data as { contingencies: ContingencyProposal[] }).contingencies;
    }
    if (data && typeof data === 'object' && Array.isArray((data as { proposals?: unknown }).proposals)) {
      return (data as { proposals: ContingencyProposal[] }).proposals;
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
