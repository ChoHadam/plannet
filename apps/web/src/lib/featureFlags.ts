/**
 * 런타임 피처 토글.
 *
 * NEXT_PUBLIC_ 접두사를 쓰지 않는다. NEXT_PUBLIC_* 는 빌드 시점에 번들로 구워져
 * 컨테이너 환경변수를 바꿔도 반영되지 않기 때문이다. 서버에서만 읽고,
 * 클라이언트에는 Provider를 통해 내려준다.
 */

/** 값이 없으면 꺼진 것으로 본다 (opt-in). */
function isEnabled(value: string | undefined): boolean {
  return value === 'true';
}

/**
 * Google 로그인(next-auth) 활성화 여부.
 *
 * FIXME: 인증 기능은 아직 미완성이다. 기본값 off로 두고,
 * 아래가 정리되기 전에는 AUTH_ENABLED=true로 켜지 말 것.
 *   - 인증 소유 주체 결정 (web next-auth vs API Spring Security)
 *     → docs/research/2026-07-31-api-owned-auth-phase1.md
 *   - AUTH_URL이 localhost:3000 고정이라 k8s 진입점(18080)에서 콜백이 어긋남
 *   - 로그인 이후 사용자 데이터 연결(현재 플래너 데이터는 LocalStorage 전용)
 */
export function isAuthEnabled(): boolean {
  return isEnabled(process.env.AUTH_ENABLED);
}
