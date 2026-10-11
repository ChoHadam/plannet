import 'server-only';
import type { NextRequest } from 'next/server';

/**
 * Web(Next.js)이 직접 처리하는 변경 요청의 CSRF 방어.
 * Spring의 CSRF 토큰과 별개로, Web route가 스스로 검증한다.
 *
 * 1. Content-Type이 application/json이어야 한다.
 *    HTML form·no-cors fetch는 이 타입을 보낼 수 없어, 교차 출처 요청은 preflight에서 막힌다.
 * 2. Origin이 허용 출처와 같아야 한다.
 *    Origin이 없으면 Sec-Fetch-Site가 same-origin일 때만 통과한다.
 *
 * 허용 출처는 APP_ORIGINS(쉼표 구분, 예: https://plannet.example)로 고정할 수 있다.
 * 없으면 요청의 Host와 Origin의 host가 같은지 본다.
 */

export type CsrfCheck = { ok: true } | { ok: false; reason: CsrfRejectReason };
export type CsrfRejectReason = 'content-type' | 'origin-mismatch' | 'origin-missing';

const JSON_CONTENT_TYPE = 'application/json';

function getConfiguredOrigins(): string[] | null {
  const raw = process.env.APP_ORIGINS?.trim();
  if (!raw) return null;
  const origins = raw
    .split(',')
    .map((value) => {
      try {
        return new URL(value.trim()).origin;
      } catch {
        return null;
      }
    })
    .filter((value): value is string => value !== null);
  return origins.length > 0 ? origins : null;
}

function isAllowedOrigin(origin: string, request: NextRequest): boolean {
  let parsed: URL;
  try {
    parsed = new URL(origin);
  } catch {
    return false; // 'null' 등 해석할 수 없는 Origin
  }

  const configured = getConfiguredOrigins();
  if (configured) return configured.includes(parsed.origin);

  const host = request.headers.get('host');
  return host !== null && parsed.host === host;
}

export function checkCsrf(request: NextRequest): CsrfCheck {
  const contentType = request.headers.get('content-type') ?? '';
  if (contentType.split(';')[0].trim().toLowerCase() !== JSON_CONTENT_TYPE) {
    return { ok: false, reason: 'content-type' };
  }

  const origin = request.headers.get('origin');
  if (origin !== null) {
    return isAllowedOrigin(origin, request) ? { ok: true } : { ok: false, reason: 'origin-mismatch' };
  }

  return request.headers.get('sec-fetch-site') === 'same-origin'
    ? { ok: true }
    : { ok: false, reason: 'origin-missing' };
}
