import { runtimeFetch } from '@/lib/runtime-fetch';
import {
  OpenWikiApiError,
  type OpenWikiConsentAction,
  type OpenWikiFormatBundle,
  type OpenWikiJob,
  type OpenWikiJobStage,
  type OpenWikiModelRef,
  type OpenWikiStatus,
} from './types';

const BASE = '/api/openwiki';

const isJsonResponse = (response: Response): boolean =>
  /^application\/(?:[\w.+-]+\+)?json\b/i.test(response.headers.get('content-type') ?? '');

const throwFromResponse = async (response: Response, fallback: string): Promise<never> => {
  const payload = (await response.json().catch(() => null)) as {
    error?: unknown;
    code?: unknown;
    ownership?: unknown;
    foreignPaths?: unknown;
  } | null;
  throw new OpenWikiApiError(typeof payload?.error === 'string' ? payload.error : fallback, {
    code: typeof payload?.code === 'string' ? payload.code : undefined,
    ownership: typeof payload?.ownership === 'string' ? payload.ownership as OpenWikiStatus['ownership'] : undefined,
    foreignPaths: Array.isArray(payload?.foreignPaths)
      ? payload.foreignPaths.filter((p): p is string => typeof p === 'string')
      : undefined,
  });
};

const readJson = async <T>(response: Response): Promise<T> => {
  if (!isJsonResponse(response)) {
    throw new OpenWikiApiError('This OpenChamber server has no OpenWiki API', { code: 'server-unsupported' });
  }
  return (await response.json()) as T;
};

export async function fetchOpenWikiStatus(
  directory: string,
  options: { model?: string; signal?: AbortSignal } = {},
): Promise<OpenWikiStatus> {
  const response = await runtimeFetch(`${BASE}/status`, {
    query: {
      directory,
      ...(options.model ? { model: options.model } : {}),
    },
    signal: options.signal,
  });
  if (!response.ok) return throwFromResponse(response, 'Failed to load OpenWiki status');
  return readJson<OpenWikiStatus>(response);
}

export async function fetchOpenWikiFormat(directory: string, signal?: AbortSignal): Promise<OpenWikiFormatBundle> {
  const response = await runtimeFetch(`${BASE}/format`, {
    query: { directory },
    signal,
  });
  if (!response.ok) return throwFromResponse(response, 'Failed to load wiki format');
  return readJson<OpenWikiFormatBundle>(response);
}

export async function saveOpenWikiFormat(
  directory: string,
  body: {
    presetId?: string;
    instructions?: string;
    format?: string;
    applyPreset?: boolean;
  },
): Promise<OpenWikiFormatBundle> {
  const response = await runtimeFetch(`${BASE}/format`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ directory, ...body }),
  });
  if (!response.ok) return throwFromResponse(response, 'Failed to save wiki format');
  return readJson<OpenWikiFormatBundle>(response);
}

export async function applyOpenWikiConsent(
  directory: string,
  consentAction: OpenWikiConsentAction,
): Promise<{
  ok: true;
  projectDirectory: string;
  wikiRoot: string;
  ownership: OpenWikiStatus['ownership'];
  consentRequired: boolean;
  foreignPaths: string[];
  wikiExists: boolean;
}> {
  const response = await runtimeFetch(`${BASE}/consent`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ directory, consentAction }),
  });
  if (!response.ok) return throwFromResponse(response, 'Failed to apply wiki consent');
  return readJson(response);
}

export async function startOpenWikiGenerate(
  directory: string,
  options: {
    model?: OpenWikiModelRef | string;
    consent?: boolean;
    consentAction?: OpenWikiConsentAction;
  } = {},
): Promise<OpenWikiJob> {
  const { model, consent, consentAction } = options;
  const response = await runtimeFetch(`${BASE}/generate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ directory, model, consent, consentAction }),
  });
  if (!response.ok) return throwFromResponse(response, 'Failed to start wiki generation');
  const payload = await readJson<{ job: OpenWikiJob }>(response);
  return payload.job;
}

export async function startOpenWikiUpdate(
  directory: string,
  options: {
    model?: OpenWikiModelRef | string;
    consent?: boolean;
    consentAction?: OpenWikiConsentAction;
  } = {},
): Promise<OpenWikiJob> {
  const { model, consent, consentAction } = options;
  const response = await runtimeFetch(`${BASE}/update`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ directory, model, consent, consentAction }),
  });
  if (!response.ok) return throwFromResponse(response, 'Failed to start wiki update');
  const payload = await readJson<{ job: OpenWikiJob }>(response);
  return payload.job;
}

export async function fetchOpenWikiProgress(
  directory: string,
  signal?: AbortSignal,
): Promise<{ stage: OpenWikiJobStage | null; detail: string | null; job: OpenWikiJob | null }> {
  const response = await runtimeFetch(`${BASE}/progress`, {
    query: { directory },
    signal,
  });
  if (!response.ok) return throwFromResponse(response, 'Failed to load wiki progress');
  return readJson(response);
}

export async function cancelOpenWikiJob(directory: string): Promise<OpenWikiJob | null> {
  const response = await runtimeFetch(`${BASE}/cancel`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ directory }),
  });
  if (!response.ok) return throwFromResponse(response, 'Failed to cancel wiki job');
  const payload = await readJson<{ job: OpenWikiJob | null }>(response);
  return payload.job;
}
