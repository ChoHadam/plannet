import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
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
};

export default nextConfig;
