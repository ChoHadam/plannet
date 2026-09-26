import { AUTH_PATHS, CSRF_INVALID_ERROR } from '@/lib/authContract';
import { PlannerCommit, PlannerRecord, PlannerSyncError, validateRecords } from '@/lib/plannerSync';

export const PLANNER_API_PATH = '/api/v1/planner';
export const EXPECTED_USER_HEADER = 'X-Plannet-User-Id';
const REQUEST_TIMEOUT_MS = 15_000;
const CSRF_ATTEMPTS = 2;

async function responseBody(response: Response): Promise<Record<string, unknown>> {
  if (response.status === 401 || response.type === 'opaqueredirect') throw new PlannerSyncError('unauthorized');
  let body: Record<string, unknown>;
  try { body = await response.json() as Record<string, unknown>; }
  catch { throw new PlannerSyncError('invalid_response'); }
  if (!response.ok) throw new PlannerSyncError(typeof body.error === 'string' ? body.error : 'network');
  return body;
}

export function plannerSyncApi(userId: string) {
  const options: RequestInit = { credentials: 'same-origin', cache: 'no-store', redirect: 'manual' };
  return {
    async read(): Promise<PlannerRecord[]> {
      const response = await fetch(PLANNER_API_PATH, {
        ...options, headers: { [EXPECTED_USER_HEADER]: userId, accept: 'application/json' }, signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      });
      const body = await responseBody(response);
      if (body.userId !== userId) throw new PlannerSyncError('account_changed');
      return validateRecords(body.records);
    },
    async commit(request: PlannerCommit): Promise<PlannerRecord[]> {
      for (let attempt = 0; attempt < CSRF_ATTEMPTS; attempt++) {
        const csrfResponse = await fetch(AUTH_PATHS.csrf, { ...options, signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS) });
        const csrf = await responseBody(csrfResponse);
        if (typeof csrf.headerName !== 'string' || !/^[A-Za-z0-9-]+$/.test(csrf.headerName) || typeof csrf.token !== 'string' || !csrf.token) {
          throw new PlannerSyncError('invalid_response');
        }
        const response = await fetch(`${PLANNER_API_PATH}/commit`, {
          ...options, method: 'POST',
          headers: { [csrf.headerName]: csrf.token, [EXPECTED_USER_HEADER]: userId, 'content-type': 'application/json', accept: 'application/json' },
          body: JSON.stringify(request), signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
        });
        try { return validateRecords((await responseBody(response)).records); }
        catch (error) {
          if (!(error instanceof PlannerSyncError) || error.code !== CSRF_INVALID_ERROR || attempt === CSRF_ATTEMPTS - 1) throw error;
        }
      }
      throw new PlannerSyncError('network');
    },
  };
}
