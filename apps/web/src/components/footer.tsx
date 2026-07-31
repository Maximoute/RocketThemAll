import Link from "next/link";

const legalLinks = [
  ["/legal/mentions-legales", "Mentions légales"],
  ["/legal/conditions-utilisation", "CGU"],
  ["/legal/confidentialite", "Confidentialité"],
  ["/legal/cookies", "Cookies"],
  ["/legal/conditions-vente", "Conditions de vente"],
  ["/legal/retractation", "Rétractation"]
] as const;

export default function Footer() {
  return (
    <footer className="border-t border-rta-border bg-rta-surface/70 px-6 py-7">
      <div className="mx-auto flex max-w-[1200px] flex-col gap-5 md:flex-row md:items-end md:justify-between">
        <div>
          <Link href="/" className="font-black tracking-tight text-rta-ink">
            Rocket <span className="text-rta-cta">Them All</span>
          </Link>
          <p className="mt-1 max-w-xl text-xs leading-5 text-rta-muted">
            Jeu communautaire de collection accessible via Discord et le web.
            Rocket Them All n’est ni affilié ni approuvé par Discord Inc.
          </p>
        </div>
        <nav
          aria-label="Informations légales"
          className="flex max-w-2xl flex-wrap gap-x-4 gap-y-2 text-xs"
        >
          <Link href="/legal" className="font-bold text-rta-cta hover:text-rta-ink">
            Centre légal
          </Link>
          {legalLinks.map(([href, label]) => (
            <Link
              key={href}
              href={href}
              className="text-rta-muted transition-colors hover:text-rta-ink"
            >
              {label}
            </Link>
          ))}
        </nav>
      </div>
    </footer>
  );
}
