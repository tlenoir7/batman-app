const raw = process.env.EXPO_PUBLIC_API_URL?.trim() ?? '';

/** Batman Railway API origin (no trailing slash). */
export const API_BASE = raw.replace(/\/$/, '');
