import { NextResponse } from 'next/server';
import { isAuthEnabled } from '@/lib/featureFlags';

export async function GET() {
  // 토글이 꺼져 있으면 '로그인하지 않은 상태'로 응답한다.
  // 호출부가 에러를 따로 다루지 않아도 되도록 200을 유지한다.
  if (!isAuthEnabled()) {
    return NextResponse.json({ authenticated: false, authDisabled: true });
  }

  const { auth } = await import('@/auth');
  const session = await auth();

  if (!session?.user) {
    return NextResponse.json({ authenticated: false });
  }

  return NextResponse.json({
    authenticated: true,
    user: {
      name: session.user.name,
      email: session.user.email,
      image: session.user.image,
      authProvider: session.user.authProvider,
      externalSubject: session.user.externalSubject,
    },
  });
}
