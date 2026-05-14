import NextAuth, { type NextAuthOptions } from "next-auth";
import DiscordProvider from "next-auth/providers/discord";
import { redirect } from "next/navigation";
import { prisma } from "@rta/database";

type DiscordProfile = {
  id: string;
  username?: string;
  avatar?: string;
};

export const authOptions: NextAuthOptions = {
  providers: [
    DiscordProvider({
      clientId: process.env.DISCORD_CLIENT_ID ?? "",
      clientSecret: process.env.DISCORD_CLIENT_SECRET ?? ""
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
      const username = String(p.username ?? "unknown");
      const avatar = p.avatar ? `https://cdn.discordapp.com/avatars/${discordId}/${p.avatar}.png` : undefined;
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
      if (p?.id) {
        token.sub = String(p.id);
      }

      if (token.sub) {
        const user = await prisma.user.findUnique({
          where: { discordId: String(token.sub) },
          select: { isAdmin: true }
        });
        (token as any).isAdmin = user?.isAdmin ?? false;
      }

      return token;
    },
    async session({ session, token }) {
      if (session.user) {
        session.user.id = String(token.sub ?? "");
        (session.user as any).isAdmin = (token as any).isAdmin ?? false;
      }
      return session;
    }
  }
};

export const authHandler = NextAuth(authOptions);

export function requireUser(session: any) {
  if (!session?.user?.email && !session?.user?.name) {
    redirect("/login");
  }
  return session;
}

export function requireAdmin(session: any) {
  const s = requireUser(session);
  if (!s.user?.isAdmin) {
    redirect("/profile");
  }
  return s;
}
