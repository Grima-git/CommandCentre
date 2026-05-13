import NextAuth, { type DefaultSession } from "next-auth";
import MicrosoftEntraID from "next-auth/providers/microsoft-entra-id";
import Credentials from "next-auth/providers/credentials";
import { DEV_USER, findExecByEmail, type ExecRole } from "./users";
import { authenticateLocalUser, findUserByEmail } from "./local-users";
import { DEFAULT_USER_SECTIONS, normalizeSections, type SectionId, type UserRole } from "./access-control";

const isDevBypass = process.env.DEV_AUTH_BYPASS === "1";
const allowDevLogin = isDevBypass && process.env.NODE_ENV !== "production";

declare module "next-auth" {
  interface Session {
    user: {
      role: ExecRole | null;
      appRole: UserRole;
      title: string | null;
      sections: SectionId[];
    } & DefaultSession["user"];
  }
}

export const { handlers, signIn, signOut, auth } = NextAuth({
  trustHost: true,
  session: { strategy: "jwt" },
  pages: {
    signIn: "/login",
  },
  providers: isDevBypass
    ? [
        Credentials({
          id: "credentials",
          name: "Command Centre",
          credentials: {
            email: { label: "Email", type: "email" },
            password: { label: "Password", type: "password" },
          },
          async authorize(credentials) {
            const email = typeof credentials?.email === "string" ? credentials.email : "";
            const password = typeof credentials?.password === "string" ? credentials.password : "";
            if (email && password) {
              const localUser = authenticateLocalUser(email, password);
              if (!localUser) return null;
              return {
                id: localUser.email,
                email: localUser.email,
                name: localUser.name,
              };
            }
            if (!allowDevLogin) return null;
            return {
              id: DEV_USER.email,
              email: DEV_USER.email,
              name: DEV_USER.name,
            };
          },
        }),
      ]
    : [
        Credentials({
          id: "credentials",
          name: "Command Centre",
          credentials: {
            email: { label: "Email", type: "email" },
            password: { label: "Password", type: "password" },
          },
          async authorize(credentials) {
            const email = typeof credentials?.email === "string" ? credentials.email : "";
            const password = typeof credentials?.password === "string" ? credentials.password : "";
            if (!email || !password) return null;
            const localUser = authenticateLocalUser(email, password);
            if (!localUser) return null;
            return {
              id: localUser.email,
              email: localUser.email,
              name: localUser.name,
            };
          },
        }),
        ...(process.env.AUTH_MICROSOFT_ENTRA_ID_ID
          ? [
              MicrosoftEntraID({
                clientId: process.env.AUTH_MICROSOFT_ENTRA_ID_ID,
                clientSecret: process.env.AUTH_MICROSOFT_ENTRA_ID_SECRET,
                issuer: process.env.AUTH_MICROSOFT_ENTRA_ID_ISSUER,
              }),
            ]
          : []),
      ],
  callbacks: {
    async jwt({ token, user }) {
      if (user?.email) {
        const localUser = findUserByEmail(user.email);
        const exec = findExecByEmail(user.email);
        token.role = exec?.role ?? null;
        token.appRole = localUser?.role ?? "user";
        token.title = localUser?.title ?? exec?.title ?? null;
        token.sections = localUser?.sections ?? normalizeSections(DEFAULT_USER_SECTIONS, "user");
        token.name = localUser?.name ?? user.name ?? token.name;
      } else if (token.email) {
        const localUser = findUserByEmail(String(token.email));
        if (localUser) {
          token.appRole = localUser.role;
          token.title = localUser.title;
          token.sections = localUser.sections;
          token.name = localUser.name;
        }
      }
      return token;
    },
    async session({ session, token }) {
      session.user.role = (token.role as ExecRole | null) ?? null;
      session.user.appRole = (token.appRole as UserRole | null) ?? "user";
      session.user.title = (token.title as string | null) ?? null;
      session.user.sections = normalizeSections(token.sections, session.user.appRole);
      return session;
    },
  },
});
