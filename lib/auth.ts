import NextAuth, { type DefaultSession } from "next-auth";
import MicrosoftEntraID from "next-auth/providers/microsoft-entra-id";
import Credentials from "next-auth/providers/credentials";
import { DEV_USER, findExecByEmail, type ExecRole } from "./users";
import { authenticateLocalUser, findUserByEmail, upsertUserFromLogin } from "./local-users";
import { DEFAULT_USER_SECTIONS, GLOBAL_ADMIN_EMAIL, allSectionIds, normalizeSections, type SectionId, type UserRole } from "./access-control";

const isDevBypass = process.env.DEV_AUTH_BYPASS === "1";
const allowDevLogin = isDevBypass && process.env.NODE_ENV !== "production";
const MICROSOFT_SCOPES =
  "openid profile email offline_access User.Read Mail.Read Mail.Send Calendars.Read Chat.Read Presence.Read";

type EntraProviderConfig = {
  id: string;
  name: string;
  clientId?: string;
  clientSecret?: string;
  issuer?: string;
  company: "myfirst" | "arma";
  allowedDomains: string[];
};

const parseDomains = (value?: string) =>
  (value ?? "")
    .split(",")
    .map((domain) => domain.trim().toLowerCase())
    .filter(Boolean);

type ReadyEntraProviderConfig = EntraProviderConfig & {
  clientId: string;
  clientSecret: string;
  issuer: string;
};

const allEntraProviderConfigs: EntraProviderConfig[] = [
  {
    id: "microsoft-entra-id",
    name: "MyFirst Microsoft",
    clientId: process.env.AUTH_MICROSOFT_ENTRA_ID_ID,
    clientSecret: process.env.AUTH_MICROSOFT_ENTRA_ID_SECRET,
    issuer: process.env.AUTH_MICROSOFT_ENTRA_ID_ISSUER,
    company: "myfirst",
    allowedDomains: parseDomains(process.env.AUTH_MICROSOFT_ENTRA_ALLOWED_DOMAINS),
  },
  {
    id: "arma-microsoft-entra-id",
    name: "ARMA Microsoft",
    clientId: process.env.AUTH_ARMA_ENTRA_ID,
    clientSecret: process.env.AUTH_ARMA_ENTRA_SECRET,
    issuer: process.env.AUTH_ARMA_ENTRA_ISSUER,
    company: "arma",
    allowedDomains: parseDomains(process.env.AUTH_ARMA_ALLOWED_DOMAINS),
  },
];

const entraProviderConfigs = allEntraProviderConfigs.filter(
  (config): config is ReadyEntraProviderConfig =>
    Boolean(config.clientId && config.clientSecret && config.issuer),
);

const getEntraConfig = (providerId?: string | null) =>
  entraProviderConfigs.find((config) => config.id === providerId);

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
        ...entraProviderConfigs.map((config) =>
          MicrosoftEntraID({
            id: config.id,
            name: config.name,
            clientId: config.clientId,
            clientSecret: config.clientSecret,
            issuer: config.issuer,
            authorization: {
              params: {
                scope: MICROSOFT_SCOPES,
              },
            },
          }),
        ),
      ],
  callbacks: {
    async signIn({ user, account }) {
      const config = getEntraConfig(account?.provider);
      if (!config || config.allowedDomains.length === 0) return true;

      const email = user.email?.toLowerCase();
      if (!email) return false;
      const domain = email.split("@")[1] ?? "";
      return config.allowedDomains.includes(domain);
    },
    async jwt({ token, user, account }) {
      // On initial sign-in (account is only present on first login),
      // upsert the user into cc_users so the admin panel shows them.
      if (account && user?.email) {
        await upsertUserFromLogin({
          email: user.email,
          name: user.name ?? user.email.split("@")[0],
        }).catch(() => null); // never block sign-in if DB is down
      }

      // On initial Microsoft sign-in, store the Graph access token.
      const entraConfig = getEntraConfig(account?.provider);
      if (entraConfig) {
        token.msAccessToken = account?.access_token;
        token.msRefreshToken = account?.refresh_token;
        token.msExpiresAt = account?.expires_at;
        token.msProvider = account?.provider;
        token.company = entraConfig.company;
      }

      const MS_SECTIONS: SectionId[] = ["email", "calendar", "teams"];
      const isMicrosoftLogin = Boolean(entraConfig);

      if (user?.email) {
        const email = user.email.toLowerCase();
        const isGlobalAdmin = email === GLOBAL_ADMIN_EMAIL.toLowerCase();
        const localUser = await findUserByEmail(email).catch(() => null);
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
          const localUser = await findUserByEmail(email).catch(() => null);
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
          const refreshConfig = getEntraConfig(String(token.msProvider ?? "microsoft-entra-id"));
          if (!refreshConfig) return token;
          const tenantId = refreshConfig.issuer?.split("/")[3] ?? "common";
          const refreshRes = await fetch(
            `https://login.microsoftonline.com/${tenantId}/oauth2/v2.0/token`,
            {
              method: "POST",
              headers: { "Content-Type": "application/x-www-form-urlencoded" },
              body: new URLSearchParams({
                client_id: refreshConfig.clientId ?? "",
                client_secret: refreshConfig.clientSecret ?? "",
                refresh_token: String(token.msRefreshToken),
                grant_type: "refresh_token",
                scope: MICROSOFT_SCOPES,
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
