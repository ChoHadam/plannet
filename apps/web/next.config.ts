import type { NextConfig } from "next";

// HTTPS 여부에 따라 달라지는 정책(HSTS)은 Gateway가 붙인다 (infra/deploy/k8s/base/gateway.yaml).
// 여기서는 프로토콜과 무관한 기본값만 둔다. Gateway가 같은 이름을 set 하므로 값이 겹쳐도 충돌하지 않는다.
const SECURITY_HEADERS = [
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "DENY" },
  // 스크립트 정책은 두지 않고 프레임 삽입만 막는다 (Next 인라인 스크립트·html2canvas PNG 내보내기 호환).
  { key: "Content-Security-Policy", value: "frame-ancestors 'none'" },
  // OAuth는 전체 페이지 이동이라 cross-origin에는 origin만 보내도 된다.
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), payment=(), usb=()" },
];

const nextConfig: NextConfig = {
  output: "standalone",
  // 프레임워크 노출 헤더(X-Powered-By: Next.js)를 보내지 않는다.
  poweredByHeader: false,
  // E2E는 개발자의 .next를 건드리지 않도록 별도 디렉터리에 빌드한다 (e2e/support/start-stack.mjs).
  distDir: process.env.NEXT_DIST_DIR || ".next",
  // 로컬 백업 스냅샷(사용자 데이터)이 빌드 산출물·이미지에 섞이지 않게 추적에서 제외한다.
  outputFileTracingExcludes: {
    "/api/backup": [".local-backup/**"],
  },
  typescript: {
    // E2E 빌드는 개발용 .next 타입을 포함하지 않는 전용 tsconfig로 검사한다.
    tsconfigPath: process.env.NEXT_TSCONFIG_PATH || "tsconfig.json",
  },
  async headers() {
    return [{ source: "/:path*", headers: SECURITY_HEADERS }];
  },
};

export default nextConfig;
