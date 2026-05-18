import NextAuth, { type DefaultSession } from "next-auth";
import MicrosoftEntraID from "next-auth/providers/microsoft-entra-id";
import Credentials from "next-auth/providers/credentials";
import { DEV_USER, findExecByEmail, type ExecRole } from "./users";
import { authenticateLocalUser, findUserByEmail } from "./local-users";
import { DEFAULT_USER_SECTIONS, GLOBAL_ADMIN_EMAIL, allSectionIds, normalizeSections, type SectionId, type UserRole } from "./access-control";

const isDevBypass = process.env.DEV_AUTH_BYPASS === "1";
const allowDevLogin = isDevBypass && process.env.NODE_ENV !== "production";

declare module "next-auth" {
  interface Session {
    user: {
      role: ExecRole | null;
      appRole: UserRole;
      title: string | null;
      sections: SectionId[];
      msAccessToken?: string;
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
              const localUser = await authenticateLocalUser(email, password);
              if (!localUser) return null;
              return { id: localUser.email, email: localUser.email, name: localUser.name };
            }
            if (!allowDevLogin) return null;
            return { id: DEV_USER.email, email: DEV_USER.email, name: DEV_USER.name };
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
            const localUser = await authenticateLocalUser(email, password);
            if (!localUser) return null;
            return { id: localUser.email, email: localUser.email, name: localUser.name };
          },
        }),
        ...(process.env.AUTH_MICROSOFT_ENTRA_ID_ID
          ? [
              MicrosoftEntraID({
                clientId: process.env.AUTH_MICROSOFT_ENTRA_ID_ID,
                clientSecret: process.env.AUTH_MICROSOFT_ENTRA_ID_SECRET,
                issuer: process.env.AUTH_MICROSOFT_ENTRA_ID_ISSUER,
                authorization: {
                  params: {
                    scope:
                      "openid profile email offline_access User.Read Mail.Read Mail.Send Calendars.Read Chat.Read Presence.Read",
                  },
                },
              }),
            ]
          : []),
      ],
  callbacks: {
    async jwt({ token, user, account }) {
      // On initial Microsoft sign-in, store the Graph access token.
      if (account?.provider === "microsoft-entra-id") {
        token.msAccessToken = account.access_token;
        token.msRefreshToken = account.refresh_token;
        token.msExpiresAt = account.expires_at;
      }

      const MS_SECTIONS: SectionId[] = ["email", "calendar", "teams"];
      const isMicrosoftLogin = account?.provider === "microsoft-entra-id";

      if (user?.email) {
        const email = user.email.toLowerCase();
        const isGlobalAdmin = email === GLOBAL_ADMIN_EMAIL.toLowerCase();
        const localUser = await findUserByEmail(email);
        const exec = findExecByEmail(email);
        token.role = exec?.role ?? null;
        token.appRole = isGlobalAdmin ? "global_admin" : (localUser?.role ?? "user");
        token.title = localUser?.title ?? exec?.title ?? (isGlobalAdmin ? "Global Admin" : null);
        // Always use real name — never fall back to a hardcoded exec name
        token.name = localUser?.name ?? user.name ?? token.name;

        if (isGlobalAdmin) {
          token.sections = allSectionIds();
        } else {
          const baseSections = localUser?.sections ?? normalizeSections(DEFAULT_USER_SECTIONS, "user");
          token.sections = isMicrosoftLogin
            ? Array.from(new Set<SectionId>([...(baseSections as SectionId[]), ...MS_SECTIONS]))
            : baseSections;
        }
      } else if (token.email) {
        const email = String(token.email).toLowerCase();
        const isGlobalAdmin = email === GLOBAL_ADMIN_EMAIL.toLowerCase();
        if (isGlobalAdmin) {
          token.appRole = "global_admin";
          token.sections = allSectionIds();
          token.title = token.title ?? "Global Admin";
        } else {
          const localUser = await findUserByEmail(email);
          if (localUser) {
            token.appRole = localUser.role;
            token.title = localUser.title;
            token.sections = localUser.sections;
            token.name = localUser.name;
          }
        }
      }

      // Refresh Microsoft Graph token if expired.
      if (
        token.msRefreshToken &&
        token.msExpiresAt &&
        Date.now() > (token.msExpiresAt as number) * 1000 - 60_000
      ) {
        try {
          const tenantId =
            process.env.AUTH_MICROSOFT_ENTRA_ID_ISSUER?.split("/")[3] ?? "common";
          const refreshRes = await fetch(
            `https://login.microsoftonline.com/${tenantId}/oauth2/v2.0/token`,
            {
              method: "POST",
              headers: { "Content-Type": "application/x-www-form-urlencoded" },
              body: new URLSearchParams({
                client_id: process.env.AUTH_MICROSOFT_ENTRA_ID_ID ?? "",
                client_secret: process.env.AUTH_MICROSOFT_ENTRA_ID_SECRET ?? "",
                refresh_token: String(token.msRefreshToken),
                grant_type: "refresh_token",
                scope:
                  "openid profile email offline_access User.Read Mail.Read Mail.Send Calendars.Read Chat.Read Presence.Read",
              }),
            },
          );
          if (refreshRes.ok) {
            const refreshed = (await refreshRes.json()) as {
              access_token: string;
              expires_in: number;
              refresh_token?: string;
            };
            token.msAccessToken = refreshed.access_token;
            token.msExpiresAt = Math.floor(Date.now() / 1000) + refreshed.expires_in;
            if (refreshed.refresh_token) token.msRefreshToken = refreshed.refresh_token;
          }
        } catch {
          // Token refresh failed; user will see "Sign in with Microsoft" prompt.
        }
      }

      return token;
    },
    async session({ session, token }) {
      session.user.role = (token.role as ExecRole | null) ?? null;
      session.user.appRole = (token.appRole as UserRole | null) ?? "user";
      session.user.title = (token.title as string | null) ?? null;
      session.user.sections = normalizeSections(token.sections, session.user.appRole);
      // Explicitly carry the real name through — prevents fallback to DEV_USER
      session.user.name = (token.name as string | null) ?? session.user.name ?? null;
      if (token.msAccessToken) {
        session.user.msAccessToken = token.msAccessToken as string;
      }
      return session;
    },
  },
});
