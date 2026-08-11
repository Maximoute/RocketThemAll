import * as NextAuthModule from "next-auth";
import type { NextAuthOptions, Session } from "next-auth";
import * as DiscordProviderModule from "next-auth/providers/discord";
import { redirect } from "next/navigation";
import { prisma } from "@rta/database";
import { isDiscordSnowflake, sessionMatchesPersistedIdentity } from "./identity.js";

type NextAuthFactory = typeof import("next-auth").default;
type DiscordProviderFactory = typeof import("next-auth/providers/discord").default;

// NextAuth v4 is CommonJS. Normalize both native Node and webpack ESM interop
// shapes so the compiled workspace package behaves exactly like source imports.
function unwrapCommonJsDefault<T>(module: unknown): T {
  let current = module;
  for (let depth = 0; depth < 3; depth += 1) {
    if (!current || typeof current !== "object" || !("default" in current)) {
      break;
    }
    const next = (current as { default: unknown }).default;
    if (next === current) break;
    current = next;
  }
  return current as T;
}

const NextAuth = unwrapCommonJsDefault<NextAuthFactory>(NextAuthModule);
const getServerSession = NextAuthModule.getServerSession;
const DiscordProvider = unwrapCommonJsDefault<DiscordProviderFactory>(DiscordProviderModule);

type DiscordProfile = {
  id: string;
  username?: string;
  avatar?: string;
};

export const authOptions: NextAuthOptions = {
  providers: [
    DiscordProvider({
      clientId: process.env.DISCORD_CLIENT_ID ?? "",
      clientSecret: process.env.DISCORD_CLIENT_SECRET ?? "",
      authorization: { params: { scope: "identify" } }
    })
  ],
  secret: process.env.NEXTAUTH_SECRET,
  callbacks: {
    async signIn({ profile }) {
      if (!profile) {
        return false;
      }

      const p = profile as unknown as DiscordProfile;
      const discordId = String(p.id);
      if (!isDiscordSnowflake(discordId)) {
        return false;
      }
      const username = String(p.username ?? "unknown");
      const avatar = p.avatar ? `https://cdn.discordapp.com/avatars/${discordId}/${p.avatar}.png` : null;
      await prisma.user.upsert({
        where: { discordId },
        update: { username, avatarUrl: avatar },
        create: {
          discordId,
          username,
          avatarUrl: avatar,
          level: 1,
          xp: 0
        }
      });
      return true;
    },
    async jwt({ token, profile }) {
      const p = profile as unknown as DiscordProfile | undefined;
      if (p?.id && isDiscordSnowflake(String(p.id))) {
        token.sub = String(p.id);
      }

      if (isDiscordSnowflake(token.sub)) {
        const user = await prisma.user.findUnique({
          where: { discordId: token.sub },
          select: { id: true, isAdmin: true, username: true, avatarUrl: true }
        });
        token.userId = user?.id;
        token.isAdmin = user?.isAdmin ?? false;
        token.name = user?.username ?? token.name;
        token.picture = user?.avatarUrl ?? null;
      } else {
        token.userId = undefined;
        token.isAdmin = false;
      }

      return token;
    },
    async session({ session, token }) {
      if (session.user) {
        session.user.id = token.userId;
        session.user.discordId = isDiscordSnowflake(token.sub) ? token.sub : undefined;
        session.user.isAdmin = token.isAdmin ?? false;
      }
      return session;
    }
  }
};

export const authHandler = NextAuth(authOptions);

export function getAuthSession() {
  return getServerSession(authOptions);
}

export async function resolveSessionUser(session?: Session | null) {
  // `null` is a known anonymous session. Only `undefined` means the caller has
  // not resolved authentication yet and requires a server-side lookup.
  const currentSession = session === undefined ? await getAuthSession() : session;
  const userId = currentSession?.user?.id;
  const discordId = currentSession?.user?.discordId;
  if (!userId || !isDiscordSnowflake(discordId)) return null;

  // Discord's immutable snowflake is the authentication authority. The
  // internal id is checked as a second binding so a stale or forged session
  // can never be resolved through a mutable username.
  const user = await prisma.user.findUnique({ where: { discordId } });
  if (!user || !sessionMatchesPersistedIdentity({ id: userId, discordId }, user)) {
    return null;
  }
  return user;
}

export async function requireUser() {
  const user = await resolveSessionUser();
  if (!user) {
    return redirect("/login");
  }
  return user;
}

export async function requireAdmin() {
  const user = await requireUser();
  if (!user.isAdmin) {
    return redirect("/profile");
  }
  return user;
}
