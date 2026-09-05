"use client";

import Image from "next/image";
import Link from "next/link";
import { signOut, useSession } from "next-auth/react";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import DiscordAvatar from "./discord-avatar";

const MAIN_LINKS = [
  { href: "/", label: "Accueil" },
  { href: "/play", label: "Jouer" },
  { href: "/community", label: "Communauté" },
  { href: "/leaderboards", label: "Classements" },
  { href: "/shop", label: "Boutique", playerOnly: true },
] as const;

const ACCOUNT_LINKS = [
  { href: "/profile", label: "Vue d’ensemble" },
  { href: "/inventory", label: "Inventaire" },
  { href: "/skills", label: "Compétences" },
  { href: "/achievements", label: "Achievements" },
  { href: "/trades", label: "Échanges" },
] as const;

export default function Nav({ isDevelopment = false }: { isDevelopment?: boolean }) {
  const pathname = usePathname();
  const { data: session, status } = useSession();
  const [mobileOpen, setMobileOpen] = useState(false);
  const isAuthenticated = status === "authenticated";

  useEffect(() => setMobileOpen(false), [pathname]);

  function destination(href: string, playerOnly = false) {
    if (playerOnly && !isAuthenticated) {
      return `/login?callbackUrl=${encodeURIComponent(href)}`;
    }
    return href;
  }

  function isActive(href: string) {
    return href === "/"
      ? pathname === "/"
      : pathname === href || pathname.startsWith(`${href}/`);
  }

  return (
    <header className="sticky top-0 z-40 border-b border-rta-border/80 bg-[#100a1d]/95 shadow-[0_12px_35px_rgba(0,0,0,0.28)] backdrop-blur-xl">
      {isDevelopment && (
        <div className="border-b border-cyan-400/30 bg-cyan-400/10 px-4 py-1.5 text-center text-[0.65rem] font-black uppercase tracking-[0.28em] text-cyan-200">
          RTA Web V2 — Development
        </div>
      )}

      <div className="mx-auto flex min-h-16 max-w-[1440px] items-center gap-4 px-4 sm:px-6">
        <Link href="/" className="flex shrink-0 items-center gap-2.5 font-black tracking-tight text-rta-ink">
          <span className="h-10 w-10 overflow-hidden rounded-xl border border-rta-border bg-rta-surface shadow-[0_0_18px_rgba(72,28,166,0.65)]">
            <Image src="/favicon.png" alt="" width={40} height={40} className="h-full w-full object-cover" />
          </span>
          <span className="hidden sm:inline">Rocket <span className="text-rta-cta">Them All</span></span>
        </Link>

        <nav className="hidden flex-1 items-center justify-center gap-1 lg:flex" aria-label="Navigation principale">
          {MAIN_LINKS.map(({ href, label, ...item }) => (
            <Link
              key={href}
              href={destination(href, "playerOnly" in item && item.playerOnly)}
              className={[
                "rounded-lg px-3 py-2 text-sm font-bold transition-colors",
                isActive(href)
                  ? "bg-rta-cta/10 text-rta-cta"
                  : "text-rta-muted hover:bg-white/5 hover:text-rta-ink",
              ].join(" ")}
            >
              {label}
            </Link>
          ))}
        </nav>

        <div className="ml-auto hidden items-center gap-2 lg:flex">
          <Link
            href={destination("/setup", true)}
            className="rounded-lg border border-rta-cta/70 px-3.5 py-2 text-sm font-black text-rta-cta transition-colors hover:bg-rta-cta hover:text-rta-bg"
          >
            Ajouter RTA
          </Link>

          {status === "loading" ? (
            <div className="h-10 w-32 animate-pulse rounded-lg bg-rta-surface2" />
          ) : session ? (
            <details className="group relative">
              <summary className="flex cursor-pointer list-none items-center gap-2 rounded-lg bg-rta-surface px-2.5 py-1.5 text-sm font-bold text-rta-ink ring-1 ring-rta-border transition-colors hover:bg-rta-surface2">
                <span className="h-7 w-7 overflow-hidden rounded-full border border-rta-cta/50">
                  <DiscordAvatar avatarUrl={session.user?.image} discordId={session.user?.discordId} username={session.user?.name ?? "Joueur"} size={28} />
                </span>
                <span className="max-w-28 truncate">{session.user?.name ?? "Compte"}</span>
                <span aria-hidden="true" className="text-rta-muted transition-transform group-open:rotate-180">⌄</span>
              </summary>
              <div className="absolute right-0 mt-2 w-60 overflow-hidden rounded-xl border border-rta-border bg-[#171126] p-2 shadow-2xl">
                <p className="px-3 pb-2 pt-1 text-[0.62rem] font-black uppercase tracking-[0.2em] text-rta-muted">Espace personnel</p>
                {ACCOUNT_LINKS.map((item) => (
                  <Link key={item.href} href={item.href} className="block rounded-lg px-3 py-2 text-sm text-rta-muted hover:bg-rta-surface2 hover:text-rta-ink">{item.label}</Link>
                ))}
                {session.user?.isAdmin === true && (
                  <Link href="/admin" className="mt-1 block rounded-lg bg-rta-cta/10 px-3 py-2 text-sm font-bold text-rta-cta hover:bg-rta-cta/20">Administration</Link>
                )}
                <button onClick={() => signOut({ callbackUrl: "/" })} className="mt-2 w-full border-t border-rta-border px-3 py-2 text-left text-sm text-rta-muted hover:text-rta-ink">Se déconnecter</button>
              </div>
            </details>
          ) : (
            <Link href="/login" className="rounded-lg bg-rta-cta px-4 py-2 text-sm font-black text-rta-bg hover:bg-rta-cta/90">Connexion</Link>
          )}
        </div>

        <button type="button" aria-label="Ouvrir la navigation" aria-expanded={mobileOpen} onClick={() => setMobileOpen((open) => !open)} className="ml-auto grid h-10 w-10 place-items-center rounded-lg border border-rta-border bg-rta-surface text-xl text-rta-ink lg:hidden">
          {mobileOpen ? "×" : "☰"}
        </button>
      </div>

      {mobileOpen && (
        <div className="border-t border-rta-border bg-[#100a1d] px-4 py-4 lg:hidden">
          <nav className="mx-auto grid max-w-[1320px] grid-cols-2 gap-2" aria-label="Navigation mobile">
            {MAIN_LINKS.map(({ href, label, ...item }) => (
              <Link key={href} href={destination(href, "playerOnly" in item && item.playerOnly)} className="rounded-lg bg-rta-surface px-3 py-3 text-sm font-bold text-rta-ink">{label}</Link>
            ))}
            <Link href={destination("/setup", true)} className="rounded-lg bg-rta-cta px-3 py-3 text-sm font-black text-rta-bg">Ajouter RTA</Link>
            {session ? (
              <>
                {ACCOUNT_LINKS.map((item) => (
                  <Link key={item.href} href={item.href} className="rounded-lg border border-rta-border px-3 py-3 text-sm text-rta-muted">{item.label}</Link>
                ))}
                {session.user?.isAdmin === true && <Link href="/admin" className="rounded-lg border border-rta-cta px-3 py-3 text-sm font-bold text-rta-cta">Administration</Link>}
                <button onClick={() => signOut({ callbackUrl: "/" })} className="rounded-lg border border-rta-border px-3 py-3 text-left text-sm text-rta-muted">Se déconnecter</button>
              </>
            ) : (
              <Link href="/login" className="rounded-lg border border-rta-cta px-3 py-3 text-sm font-black text-rta-cta">Connexion Discord</Link>
            )}
          </nav>
        </div>
      )}
    </header>
  );
}
