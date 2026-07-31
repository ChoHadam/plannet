import type { DefaultSession } from 'next-auth';

declare module 'next-auth' {
  interface Session {
    user?: DefaultSession['user'] & {
      authProvider?: string;
      externalSubject?: string;
    };
  }
}

declare module 'next-auth/jwt' {
  interface JWT {
    authProvider?: string;
    externalSubject?: string;
  }
}
