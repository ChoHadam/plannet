import NextAuth from 'next-auth';
import Google from 'next-auth/providers/google';

export const { handlers, auth, signIn, signOut } = NextAuth({
  providers: [Google],
  session: {
    strategy: 'jwt',
  },
  callbacks: {
    jwt({ token, account }) {
      if (account?.provider) {
        token.authProvider = account.provider;
      }
      if (account?.providerAccountId) {
        token.externalSubject = account.providerAccountId;
      }
      return token;
    },
    session({ session, token }) {
      if (session.user) {
        session.user.authProvider = typeof token.authProvider === 'string' ? token.authProvider : undefined;
        session.user.externalSubject = typeof token.externalSubject === 'string' ? token.externalSubject : undefined;
      }
      return session;
    },
  },
});
