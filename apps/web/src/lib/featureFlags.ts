/**
 * 런타임 피처 토글.
 *
 * NEXT_PUBLIC_ 접두사를 쓰지 않는다. NEXT_PUBLIC_* 는 빌드 시점에 번들로 구워져
 * 컨테이너 환경변수를 바꿔도 반영되지 않기 때문이다. 서버에서만 읽고,
 * 클라이언트는 /api/runtime-config 로 요청 시점의 값을 받는다.
 */

/** 값이 없으면 꺼진 것으로 본다 (opt-in). */
function isEnabled(value: string | undefined): boolean {
  return value === 'true';
}

/**
 * Spring(apps/api) 인증 연동 활성화 여부.
 * 켜면 로그인 UI가 보이고, /api/chat은 API_INTERNAL_URL로 세션을 검증한다.
 */
export function isAuthEnabled(): boolean {
  return isEnabled(process.env.AUTH_ENABLED);
}

/**
 * 서버 파일 백업(/api/backup) 허용 여부.
 *
 * 백업 파일은 사용자 구분 없는 공용 저장소라 다중 사용자 환경에서는 쓸 수 없다.
 * - 인증이 켜진 배포에서는 설정과 무관하게 항상 끈다.
 * - LOCAL_BACKUP_ENABLED=true/false 로 명시하면 그 값을 따른다.
 * - 명시하지 않으면 `next dev`(개발 서버)에서만 켠다. 프로덕션 빌드는 기본 off.
 */
export function isLocalBackupEnabled(): boolean {
  if (isAuthEnabled()) return false;

  const explicit = process.env.LOCAL_BACKUP_ENABLED;
  if (explicit === 'true') return true;
  if (explicit === 'false') return false;
  return process.env.NODE_ENV === 'development';
}
