/** 검증 대상 주소. 값은 scripts/verify-local.sh 가 scripts/lib.sh 에서 넘긴다. */
export const HOST = process.env.VERIFY_HOST ?? 'plannet.test';
export const MOCK_HOST = process.env.VERIFY_MOCK_HOST ?? 'mock.test';
export const HTTPS_PORT = Number(process.env.VERIFY_HTTPS_PORT ?? 19643);
export const HTTP_PORT = Number(process.env.VERIFY_HTTP_PORT ?? 19680);
export const KUBECONFIG = process.env.VERIFY_KUBECONFIG ?? '';

export const PUBLIC_ORIGIN = `https://${HOST}:${HTTPS_PORT}`;
export const MOCK_ORIGIN = `https://${MOCK_HOST}:${HTTPS_PORT}`;
/** Google Console에 등록하는 값과 같은 규칙: {공개 origin}/login/oauth2/code/google */
export const PUBLIC_CALLBACK = `${PUBLIC_ORIGIN}/login/oauth2/code/google`;

/** 브라우저가 검증용 도메인을 로컬 kind 진입점으로 해석하게 한다 (/etc/hosts 수정 없음). */
export const BROWSER_HOST_RULES = `MAP ${HOST} 127.0.0.1, MAP ${MOCK_HOST} 127.0.0.1`;

export const SESSION_COOKIE = 'PLANNET_SESSION';
export const APP_NAMESPACE = 'plannet';
export const MOCK_NAMESPACE = 'plannet-mocks';

/** overlays/local-verify: AI_RATE_LIMIT_PER_MINUTE */
export const AI_LIMIT_PER_MINUTE = 3;
