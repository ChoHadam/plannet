import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  // 로컬 백업 스냅샷(사용자 데이터)이 빌드 산출물·이미지에 섞이지 않게 추적에서 제외한다.
  outputFileTracingExcludes: {
    "/api/backup": [".local-backup/**"],
  },
};

export default nextConfig;
