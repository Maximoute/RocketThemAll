"use client";

import Link from "next/link";
import Image from "next/image";
import { usePathname, useSearchParams } from "next/navigation";
import { useSession } from "next-auth/react";
import AuthButton from "./auth-button";

export default function Nav() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const { status } = useSession();

  const link = (href: string, label: string) => {
    const premiumShop = searchParams.get("section") === "premium";
    const active = href === "/shop"
      ? pathname === "/shop" && !premiumShop
      : href === "/shop?section=premium"
        ? pathname === "/shop" && premiumShop
        : pathname === href || (href !== "/" && pathname.startsWith(href));
    return (
      <Link
        href={href}
        className={[
          "px-2 sm:px-3 py-2 text-sm rounded-md border-b-2 transition-colors whitespace-nowrap text-center",
          active
            ? "text-rta-cta border-rta-cta"
            : "text-rta-muted border-transparent hover:text-rta-ink",
        ].join(" ")}
      >
        {label}
      </Link>
    );
  };

  return (
    <header className="sticky top-0 z-20 bg-rta-surface border-b border-rta-border px-4 sm:px-6 py-2 flex items-center justify-between gap-3 flex-wrap">
      <Link href="/" className="order-1 flex items-center gap-2.5 font-extrabold text-rta-ink tracking-tight shrink-0">
        <div className="w-10 h-10 rounded-full overflow-hidden shadow-[0_0_14px_rgba(72,28,166,0.7)] shrink-0">
          <Image src="/logo.webp" alt="Rocket Them All" width={40} height={40} className="object-cover object-[center_15%]" />
        </div>
        Rocket <span className="text-rta-cta ml-1">Them All</span>
      </Link>

      <nav className="order-3 w-full grid grid-cols-3 gap-1 md:order-2 md:w-auto md:flex md:items-center md:gap-0.5">
        {link("/", "Accueil")}
        {link("/profile", "Profil")}
        {link("/inventory", "Inventaire")}
        {link("/shop", "Boutique crédits")}
        {link("/skills", "Compétences")}
        {link("/achievements", "Achievements")}
        {link("/collection", "Collection")}
        {link("/shop?section=premium", "Boutique €")}
        {status === "authenticated" && link("/admin", "Admin")}
      </nav>

      <div className="order-2 shrink-0 md:order-3">
        <AuthButton connectLabel="Connexion" logoutLabel="Log out" callbackUrl="/profile" />
      </div>
    </header>
  );
}
