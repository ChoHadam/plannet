import 'server-only';
import { NextResponse } from 'next/server';

/** Web API 오류 코드. 클라이언트는 code로 분기하고 message는 표시용으로만 쓴다. */
export const API_ERRORS = {
  csrf_rejected: { status: 403, message: '허용되지 않은 요청이에요.' },
  auth_disabled: { status: 503, message: '이 환경에서는 로그인이 꺼져 있어 AI 어시스턴트를 사용할 수 없어요.' },
  unauthenticated: { status: 401, message: '로그인이 필요해요.' },
  auth_unavailable: { status: 503, message: '로그인 상태를 확인할 수 없어요. 잠시 후 다시 시도해주세요.' },
  invalid_request: { status: 400, message: '요청 형식이 올바르지 않아요.' },
  payload_too_large: { status: 413, message: '요청이 너무 커요.' },
  rate_limited: { status: 429, message: 'AI 요청 한도를 넘었어요. 잠시 후 다시 시도해주세요.' },
  ai_not_configured: { status: 503, message: 'AI 서비스가 설정되지 않았어요.' },
  ai_failed: { status: 502, message: 'AI 응답을 받지 못했어요. 다시 시도해주세요.' },
  backup_disabled: { status: 403, message: '이 환경에서는 서버 백업을 사용할 수 없어요.' },
} as const;

export type ApiErrorCode = keyof typeof API_ERRORS;

export function apiError(
  code: ApiErrorCode,
  options: { headers?: HeadersInit; extra?: Record<string, unknown> } = {},
): NextResponse {
  const { status, message } = API_ERRORS[code];
  return NextResponse.json(
    { ok: false, error: code, message, ...options.extra },
    { status, headers: { 'Cache-Control': 'no-store', ...options.headers } },
  );
}
