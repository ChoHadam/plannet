import { auth } from '@/auth';
import { NextResponse } from 'next/server';

export async function GET() {
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
