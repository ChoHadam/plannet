import { NextRequest, NextResponse } from 'next/server';
import { isAuthEnabled } from '@/lib/featureFlags';

// 토글이 꺼진 동안에는 '@/auth'를 정적으로 import하지 않는다.
// 정적 import는 모듈 로드 시점에 NextAuth()를 실행시켜, 인증을 쓰지 않는 환경에서도
// AUTH_SECRET 같은 설정을 요구하게 만든다.
function authDisabled() {
  return NextResponse.json({ error: 'Auth is disabled' }, { status: 404 });
}

export async function GET(request: NextRequest) {
  if (!isAuthEnabled()) return authDisabled();
  const { handlers } = await import('@/auth');
  return handlers.GET(request);
}

export async function POST(request: NextRequest) {
  if (!isAuthEnabled()) return authDisabled();
  const { handlers } = await import('@/auth');
  return handlers.POST(request);
}
