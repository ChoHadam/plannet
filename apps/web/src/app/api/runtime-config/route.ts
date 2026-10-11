import { connection, NextResponse } from 'next/server';
import { isAuthEnabled, isLocalBackupEnabled } from '@/lib/featureFlags';
import type { RuntimeConfig } from '@/lib/runtimeConfig';

// 빌드 시점 값으로 굳지 않도록 매 요청마다 환경변수를 읽는다.
export const dynamic = 'force-dynamic';

export async function GET() {
  await connection();

  const config: RuntimeConfig = {
    authEnabled: isAuthEnabled(),
    backupEnabled: isLocalBackupEnabled(),
  };

  return NextResponse.json(config, {
    headers: { 'Cache-Control': 'no-store' },
  });
}
