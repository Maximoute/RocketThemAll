# UI Redesign — Rocket Them All Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Restyle the entire Next.js web app with a dark TCG aesthetic using Tailwind CSS and the RTA color palette (#0D0D0D / #1F0E59 / #481CA6 / #F28241 / #5ABF86).

**Architecture:** Install Tailwind v3, define RTA color tokens in `tailwind.config.ts`, replace `globals.css` CSS variables and all inline styles with Tailwind utility classes. Shared UI components go in `apps/web/src/components/ui/`. All backend logic (server actions, Prisma queries) is untouched — only JSX structure and styling changes.

**Tech Stack:** Next.js 14, React 18, Tailwind CSS v3, TypeScript, Space Grotesk font

---

## File Map

**New files:**
- `apps/web/tailwind.config.ts`
- `apps/web/postcss.config.js`
- `apps/web/src/components/ui/collectible-card.tsx`
- `apps/web/src/components/ui/xp-bar.tsx`
- `apps/web/src/components/ui/booster-card.tsx`
- `apps/web/src/components/ui/trade-item.tsx`
- `apps/web/src/components/ui/page-header.tsx`
- `apps/web/src/components/ui/stat-box.tsx`
- `apps/web/src/app/admin/AdminSidebar.client.tsx`
- `apps/web/public/logo.webp`

**Modified files:**
- `apps/web/package.json` — add tailwindcss, postcss, autoprefixer devDependencies
- `apps/web/src/app/globals.css` — replace with Tailwind directives + font import
- `apps/web/src/components/nav.tsx` — full restyle
- `apps/web/src/components/auth-button.tsx` — restyle
- `apps/web/src/app/layout.tsx` — add font class
- `apps/web/src/app/page.tsx` — home page restyle
- `apps/web/src/app/profile/page.tsx` — profile page restyle
- `apps/web/src/app/inventory/page.tsx` — inventory page restyle
- `apps/web/src/app/inventory/filters.client.tsx` — filters restyle
- `apps/web/src/app/collection/page.tsx` — collection page restyle
- `apps/web/src/app/shop/page.tsx` — shop page restyle
- `apps/web/src/app/trades/page.tsx` — trades page restyle
- `apps/web/src/app/admin/layout.tsx` — switch to sidebar layout
- `apps/web/src/app/admin/AdminNav.client.tsx` — replace with sidebar
- `apps/web/src/app/admin/page.tsx` — dashboard restyle
- `apps/web/src/app/admin/cards/page.tsx` — table restyle
- `apps/web/src/app/admin/users/page.tsx` — table restyle
- `apps/web/src/app/admin/logs/page.tsx` — feed restyle
- `apps/web/src/app/admin/imports/page.tsx` — restyle

---

## Task 1: Install Tailwind CSS

**Files:**
- Modify: `apps/web/package.json`
- Create: `apps/web/tailwind.config.ts`
- Create: `apps/web/postcss.config.js`

- [ ] **Step 1: Install dependencies**

Run in `apps/web/`:
```bash
cd apps/web && npm install -D tailwindcss@3 postcss autoprefixer
```
Expected: `node_modules/tailwindcss` present, no errors.

- [ ] **Step 2: Create `tailwind.config.ts`**

```ts
// apps/web/tailwind.config.ts
import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        rta: {
          bg:        "#0D0D0D",
          surface:   "#1F0E59",
          surface2:  "#2A1870",
          border:    "#481CA6",
          accent:    "#481CA6",
          accentHi:  "#6B3FD4",
          cta:       "#F28241",
          success:   "#5ABF86",
          ink:       "#F0ECF8",
          muted:     "#9B8FC0",
          gold:      "#f5c842",
        },
      },
      fontFamily: {
        sans: ['"Space Grotesk"', '"Segoe UI"', "sans-serif"],
      },
      keyframes: {
        legendaryPulse: {
          "0%, 100%": { boxShadow: "0 0 20px rgba(245,200,66,0.5), 0 0 40px rgba(242,130,65,0.25)" },
          "50%":       { boxShadow: "0 0 30px rgba(245,200,66,0.8), 0 0 60px rgba(242,130,65,0.4)" },
        },
      },
      animation: {
        legendaryPulse: "legendaryPulse 2.5s ease-in-out infinite",
      },
    },
  },
  plugins: [],
};

export default config;
```

- [ ] **Step 3: Create `postcss.config.js`**

```js
// apps/web/postcss.config.js
module.exports = {
  plugins: {
    tailwindcss: {},
    autoprefixer: {},
  },
};
```

- [ ] **Step 4: Verify Tailwind picks up the config**

Run:
```bash
cd apps/web && npx tailwindcss --input src/app/globals.css --output /tmp/tw-test.css --content "src/**/*.tsx"
```
Expected: outputs CSS without errors.

- [ ] **Step 5: Commit**

```bash
git add apps/web/package.json apps/web/package-lock.json apps/web/tailwind.config.ts apps/web/postcss.config.js
git commit -m "feat(web): install tailwind css v3"
```

---

## Task 2: Update globals.css & copy logo

**Files:**
- Modify: `apps/web/src/app/globals.css`
- Create: `apps/web/public/logo.webp`

- [ ] **Step 1: Replace globals.css**

```css
/* apps/web/src/app/globals.css */
@import url('https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@400;500;600;700;800&display=swap');
@tailwind base;
@tailwind components;
@tailwind utilities;

@layer base {
  body {
    background-color: #0D0D0D;
    color: #F0ECF8;
    font-family: 'Space Grotesk', 'Segoe UI', sans-serif;
  }
}

@layer components {
  /* Rarity glow utilities */
  .glow-uncommon {
    border-color: #5ABF86;
    box-shadow: 0 0 12px rgba(90, 191, 134, 0.35);
  }
  .glow-uncommon:hover {
    box-shadow: 0 0 20px rgba(90, 191, 134, 0.55);
  }
  .glow-rare {
    border-color: #6B3FD4;
    box-shadow: 0 0 14px rgba(107, 63, 212, 0.5);
  }
  .glow-rare:hover {
    box-shadow: 0 0 28px rgba(107, 63, 212, 0.7);
  }
  .glow-very-rare {
    border-color: #8B5CF6;
    box-shadow: 0 0 14px rgba(139, 92, 246, 0.5);
  }
  .glow-import {
    border-color: #F28241;
    box-shadow: 0 0 16px rgba(242, 130, 65, 0.5);
  }
  .glow-exotic {
    border-color: #ef4444;
    box-shadow: 0 0 16px rgba(239, 68, 68, 0.5);
  }
  .glow-black-market {
    border-color: #f5c842;
    box-shadow: 0 0 20px rgba(245, 200, 66, 0.5), 0 0 40px rgba(242, 130, 65, 0.25);
    animation: legendaryPulse 2.5s ease-in-out infinite;
  }
  .glow-limited {
    border-color: #f5c842;
    box-shadow: 0 0 16px rgba(245, 200, 66, 0.5);
  }
}
```

- [ ] **Step 2: Copy logo asset**

```bash
cp "D:/téléchargements/Screenshot_2026-05-03-13-01-33-420_com.openai.chatgpt.webp" apps/web/public/logo.webp
```

- [ ] **Step 3: Add .superpowers to .gitignore**

Open `.gitignore` at repo root and add:
```
.superpowers/
```

- [ ] **Step 4: Start dev server and verify page loads**

```bash
cd apps/web && npm run dev
```
Open http://localhost:3000 — page should load without CSS errors (it may look unstyled yet since we haven't updated components). Expected: no build errors in terminal.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/app/globals.css apps/web/public/logo.webp .gitignore
git commit -m "feat(web): add tailwind directives, rta glow classes, logo asset"
```

---

## Task 3: Nav & Auth Button

**Files:**
- Modify: `apps/web/src/components/nav.tsx`
- Modify: `apps/web/src/components/auth-button.tsx`
- Modify: `apps/web/src/app/layout.tsx`

- [ ] **Step 1: Rewrite `nav.tsx`**

```tsx
// apps/web/src/components/nav.tsx
"use client";

import Link from "next/link";
import Image from "next/image";
import { usePathname } from "next/navigation";
import { useSession } from "next-auth/react";
import AuthButton from "./auth-button";

export default function Nav() {
  const pathname = usePathname();
  const { status } = useSession();

  const link = (href: string, label: string) => {
    const active = pathname === href || (href !== "/" && pathname.startsWith(href));
    return (
      <Link
        href={href}
        className={[
          "px-3 py-2 text-sm rounded-md border-b-2 transition-colors",
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
    <header className="sticky top-0 z-20 bg-rta-surface border-b border-rta-border px-6 py-2 flex items-center justify-between gap-4">
      <Link href="/" className="flex items-center gap-2.5 font-extrabold text-rta-ink tracking-tight shrink-0">
        <div className="w-10 h-10 rounded-full overflow-hidden shadow-[0_0_14px_rgba(72,28,166,0.7)] shrink-0">
          <Image src="/logo.webp" alt="Rocket Them All" width={40} height={40} className="object-cover object-[center_15%]" />
        </div>
        Rocket <span className="text-rta-cta ml-1">Them All</span>
      </Link>

      <nav className="flex items-center gap-0.5 flex-wrap">
        {link("/", "Accueil")}
        {link("/profile", "Profil")}
        {link("/inventory", "Inventaire")}
        {link("/shop", "Boutique")}
        {link("/collection", "Collection")}
        {link("/trades", "Trades")}
        {status === "authenticated" && link("/admin", "Admin")}
      </nav>

      <div className="shrink-0">
        <AuthButton connectLabel="Connexion" logoutLabel="Log out" callbackUrl="/profile" />
      </div>
    </header>
  );
}
```

- [ ] **Step 2: Rewrite `auth-button.tsx`**

```tsx
// apps/web/src/components/auth-button.tsx
"use client";

import { useSession, signIn, signOut } from "next-auth/react";

type Props = { connectLabel: string; logoutLabel: string; callbackUrl?: string };

export default function AuthButton({ connectLabel, logoutLabel, callbackUrl }: Props) {
  const { data: session, status } = useSession();

  if (status === "loading") {
    return <div className="w-24 h-8 rounded-md bg-rta-surface2 animate-pulse" />;
  }

  if (session) {
    return (
      <button
        onClick={() => signOut()}
        className="flex items-center gap-2 px-3 py-1.5 rounded-md text-sm font-bold text-rta-cta border border-rta-cta bg-rta-cta/10 hover:bg-rta-cta/20 transition-colors"
      >
        <span className="w-5 h-5 rounded-full bg-gradient-to-br from-rta-accent to-rta-success inline-block shrink-0" />
        {session.user?.name ?? logoutLabel}
      </button>
    );
  }

  return (
    <button
      onClick={() => signIn("discord", { callbackUrl })}
      className="px-3 py-1.5 rounded-md text-sm font-bold text-rta-bg bg-rta-cta hover:bg-rta-cta/90 transition-colors"
    >
      {connectLabel}
    </button>
  );
}
```

- [ ] **Step 3: Update `layout.tsx` to remove old body styles**

```tsx
// apps/web/src/app/layout.tsx
import "./globals.css";
import type { ReactNode } from "react";
import Providers from "../components/providers";
import Nav from "../components/nav";

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="fr">
      <body className="bg-rta-bg text-rta-ink font-sans min-h-screen">
        <Providers>
          <Nav />
          <main className="max-w-[1200px] mx-auto px-6 py-7">{children}</main>
        </Providers>
      </body>
    </html>
  );
}
```

- [ ] **Step 4: Check nav renders**

Run `npm run dev`, open http://localhost:3000. Expected: dark nav bar with logo and links visible.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/components/nav.tsx apps/web/src/components/auth-button.tsx apps/web/src/app/layout.tsx
git commit -m "feat(web): restyle nav, auth button with dark TCG theme"
```

---

## Task 4: Shared UI Components

**Files:**
- Create: `apps/web/src/components/ui/collectible-card.tsx`
- Create: `apps/web/src/components/ui/xp-bar.tsx`
- Create: `apps/web/src/components/ui/stat-box.tsx`
- Create: `apps/web/src/components/ui/page-header.tsx`

- [ ] **Step 1: Create `collectible-card.tsx`**

```tsx
// apps/web/src/components/ui/collectible-card.tsx
import Image from "next/image";
import Link from "next/link";

type Rarity = "Common" | "Uncommon" | "Rare" | "Very Rare" | "Import" | "Exotic" | "Black Market" | "Limited";

const rarityGlow: Record<Rarity, string> = {
  "Common":       "border-rta-border",
  "Uncommon":     "glow-uncommon",
  "Rare":         "glow-rare",
  "Very Rare":    "glow-very-rare",
  "Import":       "glow-import",
  "Exotic":       "glow-exotic",
  "Black Market": "glow-black-market",
  "Limited":      "glow-limited",
};

const rarityBadge: Record<Rarity, string> = {
  "Common":       "bg-rta-surface2 text-rta-muted",
  "Uncommon":     "bg-rta-success/15 text-rta-success border border-rta-success",
  "Rare":         "bg-rta-accentHi/20 text-purple-300 border border-rta-accentHi",
  "Very Rare":    "bg-purple-500/15 text-purple-300 border border-purple-500",
  "Import":       "bg-rta-cta/15 text-rta-cta border border-rta-cta",
  "Exotic":       "bg-red-500/15 text-red-400 border border-red-500",
  "Black Market": "bg-gradient-to-r from-rta-gold to-rta-cta text-rta-bg font-black",
  "Limited":      "bg-rta-gold/15 text-rta-gold border border-rta-gold",
};

type Props = {
  name: string;
  rarity: string;
  deck: string;
  imageUrl?: string | null;
  count?: number;
  href?: string;
};

export default function CollectibleCard({ name, rarity, deck, imageUrl, count, href }: Props) {
  const r = rarity as Rarity;
  const glowClass = rarityGlow[r] ?? "border-rta-border";
  const badgeClass = rarityBadge[r] ?? "bg-rta-surface2 text-rta-muted";

  const card = (
    <article className={`bg-rta-surface border rounded-xl overflow-hidden transition-transform duration-200 hover:-translate-y-1 cursor-pointer relative ${glowClass}`}>
      <div className="aspect-[3/4] w-full bg-gradient-to-b from-rta-surface2 to-rta-bg flex items-center justify-center relative">
        {imageUrl ? (
          <Image src={imageUrl} alt={name} fill className="object-cover" sizes="220px" />
        ) : (
          <span className="text-4xl opacity-30">🃏</span>
        )}
        <span className={`absolute top-2 right-2 text-[0.6rem] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded ${badgeClass}`}>
          {rarity}
        </span>
        <span className="absolute bottom-2 left-2 text-[0.6rem] font-semibold px-1.5 py-0.5 rounded-full bg-rta-bg/80 text-rta-muted border border-rta-ink/15">
          {deck}
        </span>
        {count !== undefined && (
          <span className="absolute bottom-2 right-2 text-[0.6rem] font-bold px-1.5 py-0.5 rounded-full bg-rta-bg/85 text-rta-cta border border-rta-cta/30">
            ×{count}
          </span>
        )}
      </div>
      <div className="p-3">
        <p className="text-sm font-bold text-rta-ink truncate">{name}</p>
        <p className="text-[0.68rem] text-rta-muted uppercase tracking-wide mt-0.5">{rarity}</p>
      </div>
    </article>
  );

  return href ? <Link href={href} className="block">{card}</Link> : card;
}
```

- [ ] **Step 2: Create `xp-bar.tsx`**

```tsx
// apps/web/src/components/ui/xp-bar.tsx
type Props = { current: number; max: number; level: number };

export default function XpBar({ current, max, level }: Props) {
  const pct = Math.min(100, Math.round((current / max) * 100));
  return (
    <div className="bg-rta-surface border border-rta-border rounded-xl p-4">
      <div className="flex items-center justify-between mb-2">
        <span className="text-[0.68rem] uppercase tracking-widest text-rta-muted font-bold">
          XP · Niveau {level}
        </span>
        <span className="text-sm font-bold text-rta-cta">
          {current.toLocaleString("fr-FR")} / {max.toLocaleString("fr-FR")} XP
        </span>
      </div>
      <div className="h-2 bg-rta-bg rounded border border-rta-border overflow-hidden">
        <div
          className="h-full rounded bg-gradient-to-r from-rta-accent to-rta-cta transition-all duration-500"
          style={{ width: `${pct}%` }}
        />
      </div>
      <p className="text-[0.7rem] text-rta-muted mt-1.5">
        {(max - current).toLocaleString("fr-FR")} XP pour le niveau {level + 1}
      </p>
    </div>
  );
}
```

- [ ] **Step 3: Create `stat-box.tsx`**

```tsx
// apps/web/src/components/ui/stat-box.tsx
type Props = { value: string | number; label: string; color?: string };

export default function StatBox({ value, label, color = "text-rta-success" }: Props) {
  return (
    <div className="bg-rta-bg/50 border border-rta-border rounded-lg p-3 text-center">
      <div className={`text-xl font-black ${color}`}>{value}</div>
      <div className="text-[0.62rem] uppercase tracking-widest text-rta-muted mt-0.5">{label}</div>
    </div>
  );
}
```

- [ ] **Step 4: Create `page-header.tsx`**

```tsx
// apps/web/src/components/ui/page-header.tsx
type Props = { title: string; subtitle?: string; right?: React.ReactNode };

export default function PageHeader({ title, subtitle, right }: Props) {
  return (
    <div className="flex items-end justify-between gap-4 mb-6 flex-wrap">
      <div>
        <h1 className="text-3xl font-black tracking-tight">{title}</h1>
        {subtitle && <p className="text-rta-muted text-sm mt-1">{subtitle}</p>}
      </div>
      {right && <div>{right}</div>}
    </div>
  );
}
```

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/components/ui/
git commit -m "feat(web): add shared ui components (card, xp-bar, stat-box, page-header)"
```

---

## Task 5: Home Page

**Files:**
- Modify: `apps/web/src/app/page.tsx`

- [ ] **Step 1: Rewrite home page**

```tsx
// apps/web/src/app/page.tsx
import Link from "next/link";
import { prisma } from "@rta/database";

export default async function HomePage() {
  const [cardCount, userCount] = await Promise.all([
    prisma.inventoryItem.aggregate({ _sum: { quantity: true } }).catch(() => ({ _sum: { quantity: 0 } })),
    prisma.user.count().catch(() => 0),
  ]);

  const totalCards = cardCount._sum.quantity ?? 0;

  return (
    <div>
      {/* Hero */}
      <section className="relative bg-gradient-to-br from-rta-surface via-rta-surface2 to-rta-bg border border-rta-border rounded-2xl p-12 text-center mb-6 overflow-hidden">
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-80 h-80 bg-rta-accent/20 rounded-full blur-3xl pointer-events-none" />
        <div className="relative z-10">
          <p className="text-6xl mb-4">🚀</p>
          <h1 className="text-4xl font-black tracking-tight mb-2">
            Rocket <span className="text-rta-cta">Them All</span>
          </h1>
          <p className="text-rta-muted text-base mb-7">
            Collectionne des cartes sur Discord · Suis ta progression sur le web
          </p>
          <div className="flex gap-3 justify-center flex-wrap">
            <Link href="/inventory" className="px-5 py-2.5 bg-rta-cta text-rta-bg font-bold rounded-lg hover:bg-rta-cta/90 transition-colors">
              Voir mon inventaire →
            </Link>
            <Link href="/shop" className="px-5 py-2.5 border border-rta-success text-rta-success font-bold rounded-lg hover:bg-rta-success/10 transition-colors">
              Boutique
            </Link>
          </div>
        </div>
      </section>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-3 mb-6">
        {[
          { value: totalCards.toLocaleString("fr-FR"), label: "Cartes collectées", color: "text-rta-success" },
          { value: userCount.toLocaleString("fr-FR"), label: "Joueurs inscrits",   color: "text-rta-cta"     },
          { value: "Multi-univers",                   label: "Univers disponibles", color: "text-rta-gold"   },
        ].map(({ value, label, color }) => (
          <div key={label} className="bg-rta-surface border border-rta-border rounded-xl p-4 text-center">
            <div className={`text-2xl font-black ${color}`}>{value}</div>
            <div className="text-[0.68rem] uppercase tracking-widest text-rta-muted mt-1">{label}</div>
          </div>
        ))}
      </div>

      {/* Quick links */}
      <div className="grid grid-cols-2 gap-4">
        {[
          { href: "/profile",   emoji: "👤", title: "Profil",     desc: "Niveau, XP, historique" },
          { href: "/inventory", emoji: "🃏", title: "Inventaire", desc: "Tes cartes collectées"  },
          { href: "/shop",      emoji: "🛒", title: "Boutique",   desc: "Achète des boosters"    },
          { href: "/trades",    emoji: "🔄", title: "Trades",     desc: "Échange avec d'autres"  },
        ].map(({ href, emoji, title, desc }) => (
          <Link key={href} href={href} className="bg-rta-surface border border-rta-border rounded-xl p-5 flex items-center gap-4 hover:border-rta-accentHi hover:bg-rta-surface2 transition-colors group">
            <span className="text-3xl">{emoji}</span>
            <div>
              <div className="font-bold text-rta-ink group-hover:text-rta-cta transition-colors">{title}</div>
              <div className="text-xs text-rta-muted mt-0.5">{desc}</div>
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Check home page renders**

Open http://localhost:3000. Expected: dark hero section, stats row, quick-link grid.

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/app/page.tsx
git commit -m "feat(web): restyle home page with hero, stats, quick links"
```

---

## Task 6: Profile Page

**Files:**
- Modify: `apps/web/src/app/profile/page.tsx`

- [ ] **Step 1: Replace JSX return in profile page**

Keep all the data-fetching logic unchanged (lines 1–48). Replace only the `return (...)` block starting at line 49:

```tsx
  return (
    <div>
      {/* Header */}
      <div className="bg-gradient-to-br from-rta-surface to-rta-surface2 border border-rta-border rounded-2xl p-6 flex items-center gap-5 mb-4">
        <div className="w-16 h-16 rounded-full bg-gradient-to-br from-rta-accent to-rta-success flex items-center justify-center text-2xl border-2 border-rta-cta shadow-[0_0_16px_rgba(242,130,65,0.4)] shrink-0">
          👤
        </div>
        <div className="flex-1 min-w-0">
          <h1 className="text-2xl font-black tracking-tight truncate">{user.username}</h1>
          <p className="text-rta-muted text-sm mb-2">Discord</p>
          <div className="flex gap-2 flex-wrap">
            <span className="text-xs font-bold uppercase tracking-wider px-2 py-0.5 rounded-full bg-rta-accentHi/20 text-purple-300 border border-rta-accentHi">
              Collectionneur
            </span>
          </div>
        </div>
        <span className="shrink-0 px-3 py-1.5 rounded-full bg-rta-cta/15 border border-rta-cta text-rta-cta font-black text-sm">
          ⚡ Niveau {user.level}
        </span>
      </div>

      {/* XP Bar */}
      <div className="bg-rta-surface border border-rta-border rounded-xl p-4 mb-4">
        <div className="flex items-center justify-between mb-2">
          <span className="text-[0.68rem] uppercase tracking-widest text-rta-muted font-bold">XP · Niveau {user.level}</span>
          <span className="text-sm font-bold text-rta-cta">{user.xp.toLocaleString("fr-FR")} / {xpNeeded.toLocaleString("fr-FR")} XP</span>
        </div>
        <div className="h-2 bg-rta-bg rounded border border-rta-border overflow-hidden">
          <div
            className="h-full rounded bg-gradient-to-r from-rta-accent to-rta-cta"
            style={{ width: `${Math.min(100, Math.round((user.xp / xpNeeded) * 100))}%` }}
          />
        </div>
        <p className="text-[0.7rem] text-rta-muted mt-1.5">
          {(xpNeeded - user.xp).toLocaleString("fr-FR")} XP pour le niveau {user.level + 1} · formule: 100 × level^1.5
        </p>
      </div>

      {/* Stats grid */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4">
        {[
          { value: user.credits.toLocaleString("fr-FR"), label: "Crédits",   color: "text-rta-gold"    },
          { value: user.fragments,                        label: "Fragments", color: "text-purple-300"  },
          { value: inventoryValue,                        label: "Valeur inv.", color: "text-rta-success" },
          { value: `${energy.charges}/${energy.maxCharges}`, label: "Charges", color: "text-rta-cta"   },
        ].map(({ value, label, color }) => (
          <div key={label} className="bg-rta-bg/50 border border-rta-border rounded-lg p-3 text-center">
            <div className={`text-xl font-black ${color}`}>{value}</div>
            <div className="text-[0.62rem] uppercase tracking-widest text-rta-muted mt-0.5">{label}</div>
          </div>
        ))}
      </div>

      {/* Boosters */}
      <div className="bg-rta-surface border border-rta-border rounded-xl p-4 mb-4">
        <h2 className="text-sm font-bold mb-3 flex items-center gap-2 after:flex-1 after:h-px after:bg-rta-surface2">
          🎁 Boosters en stock
        </h2>
        <div className="flex gap-3 flex-wrap">
          {(["basic", "rare", "epic", "legendary"] as const).map((type) => (
            <div key={type} className="bg-rta-bg/50 border border-rta-border rounded-lg px-4 py-2 text-center">
              <div className="text-lg font-black text-rta-gold">{boosterMap.get(type) ?? 0}</div>
              <div className="text-[0.65rem] uppercase tracking-wider text-rta-muted capitalize">{type}</div>
            </div>
          ))}
        </div>
      </div>

      {/* Fragments */}
      <div className="bg-rta-surface border border-rta-border rounded-xl p-4 mb-4">
        <h2 className="text-sm font-bold mb-3 flex items-center gap-2 after:flex-1 after:h-px after:bg-rta-surface2">
          🔮 Fragments par tier
        </h2>
        <p className="text-xs text-rta-muted mb-3">
          {FRAGMENT_CRAFT_COST} fragments du tier inférieur = 1 carte du tier supérieur
        </p>
        <div className="flex gap-2 flex-wrap">
          {fragmentBalances.map((row) => (
            <span key={row.rarityName} className="text-xs px-2 py-1 rounded bg-rta-bg/50 border border-rta-border text-rta-ink">
              {row.rarityName}: <strong className="text-rta-success">{row.quantity}</strong>
            </span>
          ))}
        </div>
      </div>

      {/* Energy */}
      <div className="bg-rta-surface border border-rta-border rounded-xl p-4 mb-4">
        <h2 className="text-sm font-bold mb-2 flex items-center gap-2 after:flex-1 after:h-px after:bg-rta-surface2">
          ⚡ Énergie spawn
        </h2>
        <p className="text-sm text-rta-muted">
          Prochaine recharge : <span className="text-rta-cta font-bold">{formatDuration(energy.nextChargeInMs)}</span>
        </p>
      </div>

      {/* Recent transactions */}
      <div className="bg-rta-surface border border-rta-border rounded-xl p-4 mb-4">
        <h2 className="text-sm font-bold mb-3 flex items-center gap-2 after:flex-1 after:h-px after:bg-rta-surface2">
          💰 Historique économique
        </h2>
        {transactions.length === 0 ? (
          <p className="text-rta-muted text-sm">Aucune transaction.</p>
        ) : (
          <ul className="flex flex-col gap-1.5">
            {transactions.map((tx) => (
              <li key={tx.id} className="flex justify-between text-xs text-rta-muted border-b border-rta-surface2 pb-1.5">
                <span className="capitalize text-rta-ink">{tx.type}</span>
                <span>{tx.createdAt.toLocaleString("fr-FR")}</span>
                <span className={tx.amount >= 0 ? "text-rta-success font-bold" : "text-rta-cta font-bold"}>
                  {tx.amount >= 0 ? "+" : ""}{tx.amount}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* Recent spawns */}
      <div className="bg-rta-surface border border-rta-border rounded-xl p-4">
        <h2 className="text-sm font-bold mb-3 flex items-center gap-2 after:flex-1 after:h-px after:bg-rta-surface2">
          🃏 Derniers spawns
        </h2>
        {recentSpawns.length === 0 ? (
          <p className="text-rta-muted text-sm">Aucun spawn.</p>
        ) : (
          <ul className="flex flex-col gap-1.5">
            {recentSpawns.map((spawn) => (
              <li key={spawn.id} className="flex justify-between text-xs text-rta-muted border-b border-rta-surface2 pb-1.5">
                <span className="text-rta-ink font-medium">{spawn.card.name}</span>
                <span className="capitalize">{spawn.spawnType}</span>
                <span>{spawn.createdAt.toLocaleString("fr-FR")}</span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
```

- [ ] **Step 2: Check profile page**

Open http://localhost:3000/profile (must be logged in). Expected: dark profile with level badge, XP bar, stats grid, boosters, fragments, transactions.

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/app/profile/page.tsx
git commit -m "feat(web): restyle profile page"
```

---

## Task 7: Inventory Page

**Files:**
- Modify: `apps/web/src/app/inventory/page.tsx`
- Modify: `apps/web/src/app/inventory/filters.client.tsx`

- [ ] **Step 1: Replace inventory page JSX return**

Keep all logic (lines 1–370). Replace only the `return (...)` block:

```tsx
  return (
    <div>
      {/* Header */}
      <div className="flex items-end justify-between gap-4 mb-6 flex-wrap">
        <div>
          <h1 className="text-3xl font-black tracking-tight">Mon Inventaire</h1>
          <p className="text-rta-muted text-sm mt-1">Toutes tes cartes collectées via Discord</p>
        </div>
        <div className="flex gap-6">
          {[
            { value: totalItems, label: "total",      color: "text-rta-success" },
            { value: user.credits, label: "crédits",  color: "text-rta-gold"   },
            { value: user.fragments, label: "frags",  color: "text-purple-300" },
          ].map(({ value, label, color }) => (
            <div key={label} className="text-right">
              <div className={`text-2xl font-black ${color}`}>{value.toLocaleString("fr-FR")}</div>
              <div className="text-[0.65rem] uppercase tracking-widest text-rta-muted">{label}</div>
            </div>
          ))}
        </div>
      </div>

      {/* Fragment craft */}
      <div className="bg-rta-surface border border-rta-border rounded-xl p-4 mb-5">
        <h2 className="text-sm font-bold mb-1">🔮 Craft de fragments</h2>
        <p className="text-xs text-rta-muted mb-3">
          {FRAGMENT_CRAFT_COST} fragments du tier inférieur = 1 carte du tier supérieur · Valeur inventaire: <strong className="text-rta-success">{totalInventoryValue}</strong> crédits
        </p>
        <div className="flex gap-3 flex-wrap items-center">
          {fragmentBalances.map((row) => (
            <span key={row.rarityName} className="text-xs px-2 py-1 rounded bg-rta-bg/50 border border-rta-border">
              {row.rarityName}: <strong className="text-rta-success">{row.quantity}</strong>
            </span>
          ))}
          <form action={craftCardFromFragments} className="flex gap-2 items-center ml-auto">
            <select name="targetRarity" defaultValue="Uncommon" className="bg-rta-bg border border-rta-border rounded-lg px-3 py-1.5 text-sm text-rta-ink">
              {FRAGMENT_CHAIN.filter((r) => r !== "Common").map((r) => (
                <option key={r} value={r}>{r}</option>
              ))}
            </select>
            <button type="submit" className="px-3 py-1.5 rounded-lg bg-rta-accent text-rta-ink text-sm font-bold hover:bg-rta-accentHi transition-colors">
              Craft
            </button>
          </form>
        </div>
      </div>

      {/* Filters */}
      <InventoryFiltersClient
        decks={deckRows.map((d) => ({ value: d.name, label: d.name }))}
        rarities={RARITIES.map((r) => ({ value: r, label: r }))}
        categories={POP_CATEGORIES}
        initial={{ q: searchParams.q, deck: searchParams.deck, rarity: searchParams.rarity, category: searchParams.category, sort, order }}
      />

      {/* Pagination */}
      <div className="flex items-center justify-between mb-4 text-sm">
        <span className="text-rta-muted">Page {safePage} / {totalPages} · {items.length} cartes</span>
        <div className="flex gap-2">
          {safePage > 1 ? (
            <a href={buildPageHref(safePage - 1)} className="px-3 py-1.5 rounded-lg border border-rta-border text-rta-muted hover:text-rta-ink hover:border-rta-accentHi transition-colors">
              ← Précédente
            </a>
          ) : null}
          {safePage < totalPages ? (
            <a href={buildPageHref(safePage + 1)} className="px-3 py-1.5 rounded-lg border border-rta-border text-rta-muted hover:text-rta-ink hover:border-rta-accentHi transition-colors">
              Suivante →
            </a>
          ) : null}
        </div>
      </div>

      {/* Card grid */}
      {items.length === 0 ? (
        <p className="text-rta-muted text-sm">Aucune carte trouvée.</p>
      ) : (
        <div className="grid gap-4" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(175px, 1fr))" }}>
          {items.map((item) => {
            const dynamic = dynamicValues.get(`${item.cardId}:${item.variant}`);
            const rarity = item.card.rarity.name;
            const rarityGlow: Record<string, string> = {
              "Common": "border-rta-border",
              "Uncommon": "glow-uncommon",
              "Rare": "glow-rare",
              "Very Rare": "glow-very-rare",
              "Import": "glow-import",
              "Exotic": "glow-exotic",
              "Black Market": "glow-black-market",
              "Limited": "glow-limited",
            };
            const rarityBadgeClass: Record<string, string> = {
              "Common":       "bg-rta-surface2 text-rta-muted",
              "Uncommon":     "bg-rta-success/15 text-rta-success border border-rta-success",
              "Rare":         "bg-rta-accentHi/20 text-purple-300 border border-rta-accentHi",
              "Very Rare":    "bg-purple-500/15 text-purple-300 border border-purple-500",
              "Import":       "bg-rta-cta/15 text-rta-cta border border-rta-cta",
              "Exotic":       "bg-red-500/15 text-red-400 border border-red-500",
              "Black Market": "bg-gradient-to-r from-rta-gold to-rta-cta text-rta-bg font-black",
              "Limited":      "bg-rta-gold/15 text-rta-gold border border-rta-gold",
            };
            return (
              <article key={item.id} className={`bg-rta-surface border rounded-xl overflow-hidden transition-transform duration-200 hover:-translate-y-1 relative ${rarityGlow[rarity] ?? "border-rta-border"}`}>
                <div className="aspect-[3/4] w-full bg-gradient-to-b from-rta-surface2 to-rta-bg flex items-center justify-center relative">
                  {item.card.imageUrl ? (
                    <img src={item.card.imageUrl} alt={item.card.name} className="w-full h-full object-cover absolute inset-0" />
                  ) : (
                    <span className="text-4xl opacity-30">🃏</span>
                  )}
                  <span className={`absolute top-2 right-2 text-[0.58rem] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded ${rarityBadgeClass[rarity] ?? "bg-rta-surface2 text-rta-muted"}`}>
                    {rarity}
                  </span>
                  <span className="absolute bottom-2 left-2 text-[0.58rem] px-1.5 py-0.5 rounded-full bg-rta-bg/80 text-rta-muted border border-rta-ink/15">
                    {item.card.deck.name}
                  </span>
                  <span className="absolute bottom-2 right-2 text-[0.6rem] font-bold px-1.5 py-0.5 rounded-full bg-rta-bg/85 text-rta-cta border border-rta-cta/30">
                    ×{item.quantity}
                  </span>
                </div>
                <div className="p-3">
                  <p className="text-sm font-bold text-rta-ink truncate">{item.card.name}</p>
                  {item.card.category && (
                    <p className="text-[0.65rem] text-rta-muted mt-0.5">{categoryLabel(item.card.category)}</p>
                  )}
                  <p className="text-[0.65rem] text-rta-muted mt-1">
                    {dynamic?.unitPrice ?? 0} crédits / unité
                  </p>
                  <a href={`/inventory/card/${item.id}`} className="text-xs text-rta-success hover:underline mt-1 block">
                    Voir la fiche →
                  </a>
                  <div className="flex gap-1.5 mt-2">
                    <form action={recycleFromInventory} className="flex-1">
                      <input type="hidden" name="itemId" value={item.id} />
                      <input type="hidden" name="quantity" value={1} />
                      <button type="submit" className="w-full text-[0.68rem] py-1 rounded bg-rta-bg border border-rta-border text-rta-muted hover:text-rta-ink hover:border-rta-accent transition-colors">
                        Fragmenter
                      </button>
                    </form>
                    <form action={sellFromInventory} className="flex-1">
                      <input type="hidden" name="itemId" value={item.id} />
                      <input type="hidden" name="quantity" value={1} />
                      <button type="submit" className="w-full text-[0.68rem] py-1 rounded bg-rta-bg border border-rta-border text-rta-muted hover:text-rta-ink hover:border-rta-cta transition-colors">
                        Vendre 80%
                      </button>
                    </form>
                  </div>
                </div>
              </article>
            );
          })}
        </div>
      )}
    </div>
  );
```

- [ ] **Step 2: Restyle `filters.client.tsx`**

Read the current file first, then replace its JSX return with Tailwind-styled selects and inputs. The filter component uses URL search params — keep that logic. Wrap inputs in:
```tsx
<div className="bg-rta-surface border border-rta-border rounded-xl p-3 flex gap-3 flex-wrap items-center mb-4">
  {/* search input */}
  <input className="bg-rta-bg border border-rta-border rounded-lg px-3 py-1.5 text-sm text-rta-ink placeholder:text-rta-muted flex-1 min-w-[160px] focus:outline-none focus:border-rta-accentHi" ... />
  {/* selects */}
  <select className="bg-rta-bg border border-rta-border rounded-lg px-3 py-1.5 text-sm text-rta-ink focus:outline-none focus:border-rta-accentHi" ... />
</div>
```

- [ ] **Step 3: Check inventory page**

Open http://localhost:3000/inventory. Expected: dark card grid with rarity glow borders, fragment craft section, pagination.

- [ ] **Step 4: Commit**

```bash
git add apps/web/src/app/inventory/page.tsx apps/web/src/app/inventory/filters.client.tsx
git commit -m "feat(web): restyle inventory page with rarity glows and card grid"
```

---

## Task 8: Shop Page

**Files:**
- Modify: `apps/web/src/app/shop/page.tsx`

- [ ] **Step 1: Replace shop page JSX return**

Keep all logic (lines 1–91). Replace only the `return (...)`:

```tsx
  const boosterConfig = [
    { type: "basic"     as const, emoji: "📦", name: "Booster Classique",  desc: "3 Common · 1 Uncommon · 1 Rare+",     featured: false, premium: false },
    { type: "rare"      as const, emoji: "🎰", name: "Booster Rare",       desc: "2 Uncommon · 2 Rare · 1 Import+",     featured: true,  premium: false },
    { type: "epic"      as const, emoji: "🔮", name: "Booster Épic",       desc: "1 Rare · 2 Import · 1 Exotic+",       featured: false, premium: false },
    { type: "legendary" as const, emoji: "👑", name: "Booster Légendaire", desc: "Garantit 1 Black Market · 4 Exotic",  featured: false, premium: true  },
  ] as const;

  return (
    <div>
      <div className="flex items-end justify-between gap-4 mb-6 flex-wrap">
        <div>
          <h1 className="text-3xl font-black tracking-tight">Boutique</h1>
          <p className="text-rta-muted text-sm mt-1">Dépense tes crédits pour ouvrir des boosters</p>
        </div>
        <div className="bg-rta-surface border border-rta-border rounded-xl px-5 py-3 text-right">
          <div className="text-[0.65rem] uppercase tracking-widest text-rta-muted">Ton solde</div>
          <div className="text-2xl font-black text-rta-gold">⚡ {user.credits.toLocaleString("fr-FR")} crédits</div>
        </div>
      </div>

      <p className="text-sm text-rta-muted mb-6">
        Achète ici puis ouvre tes boosters sur Discord avec <code className="bg-rta-surface2 px-1.5 py-0.5 rounded text-rta-ink text-xs">/booster open</code>.
      </p>

      <div className="grid gap-4" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))" }}>
        {boosterConfig.map(({ type, emoji, name, desc, featured, premium }) => {
          const price = getBoosterPrice(config, type);
          const canBuy = user.credits >= price;
          return (
            <article
              key={type}
              className={[
                "bg-rta-surface border rounded-xl overflow-hidden transition-transform duration-200 hover:-translate-y-1",
                premium  ? "border-rta-gold shadow-[0_0_18px_rgba(245,200,66,0.4)] animate-legendaryPulse" : "",
                featured && !premium ? "border-rta-cta shadow-[0_0_16px_rgba(242,130,65,0.35)]" : "",
                !featured && !premium ? "border-rta-border" : "",
              ].join(" ")}
            >
              <div className={[
                "aspect-[2/1] flex items-center justify-center text-5xl relative",
                premium  ? "bg-gradient-to-br from-rta-surface2 to-rta-gold/20" : "",
                featured ? "bg-gradient-to-br from-rta-surface2 to-rta-cta/15" : "",
                !featured && !premium ? "bg-gradient-to-b from-rta-surface2 to-rta-bg" : "",
              ].join(" ")}>
                {featured && <span className="absolute top-2 left-2 bg-rta-cta text-rta-bg text-[0.6rem] font-black uppercase px-2 py-0.5 rounded">🔥 Populaire</span>}
                {premium  && <span className="absolute top-2 left-2 bg-rta-gold text-rta-bg text-[0.6rem] font-black uppercase px-2 py-0.5 rounded">★ Premium</span>}
                {emoji}
              </div>
              <div className="p-4">
                <h2 className="font-bold text-rta-ink mb-1">{name}</h2>
                <p className="text-xs text-rta-muted mb-4">{desc}</p>
                <div className="flex items-center justify-between">
                  <span className={`text-lg font-black ${canBuy ? "text-rta-gold" : "text-rta-muted"}`}>
                    ⚡ {price.toLocaleString("fr-FR")}
                  </span>
                  <form action={buyBooster}>
                    <input type="hidden" name="boosterType" value={type} />
                    <button
                      type="submit"
                      disabled={!canBuy}
                      className={[
                        "px-4 py-1.5 rounded-lg text-sm font-bold transition-colors",
                        canBuy
                          ? "bg-rta-cta text-rta-bg hover:bg-rta-cta/90"
                          : "bg-rta-surface2 text-rta-muted cursor-not-allowed",
                      ].join(" ")}
                    >
                      {canBuy ? "Acheter" : "Insuffisant"}
                    </button>
                  </form>
                </div>
                <p className="text-xs text-rta-muted mt-2">En stock: {stock.get(type) ?? 0}</p>
              </div>
            </article>
          );
        })}
      </div>
    </div>
  );
```

- [ ] **Step 2: Check shop page**

Open http://localhost:3000/shop. Expected: coins balance, booster grid with glow on featured/legendary, disabled buy button when insufficient.

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/app/shop/page.tsx
git commit -m "feat(web): restyle shop page with booster cards and glow effects"
```

---

## Task 9: Trades Page

**Files:**
- Modify: `apps/web/src/app/trades/page.tsx`

- [ ] **Step 1: Replace trades page JSX return**

Keep all logic. Replace only the `return (...)`:

```tsx
  const pending  = trades.filter((t) => t.status === "pending");
  const finished = trades.filter((t) => t.status !== "pending");

  const statusDot: Record<string, string> = {
    pending:   "bg-rta-cta shadow-[0_0_6px_rgba(242,130,65,0.7)]",
    confirmed: "bg-rta-success shadow-[0_0_6px_rgba(90,191,134,0.7)]",
    expired:   "bg-rta-muted",
    cancelled: "bg-rta-muted",
  };

  return (
    <div>
      <h1 className="text-3xl font-black tracking-tight mb-1">Mes Trades</h1>
      <p className="text-rta-muted text-sm mb-6">Échange des cartes avec d'autres joueurs via Discord avec /trade</p>

      {pending.length > 0 && (
        <div className="mb-6">
          <h2 className="text-xs font-bold uppercase tracking-widest text-rta-muted mb-3 flex items-center gap-2 after:flex-1 after:h-px after:bg-rta-surface2">
            ⏳ En attente ({pending.length})
          </h2>
          <div className="flex flex-col gap-3">
            {pending.map((trade) => (
              <div key={trade.id} className="bg-rta-surface border border-rta-cta rounded-xl p-4 flex items-start gap-4">
                <div className={`w-2.5 h-2.5 rounded-full mt-1.5 shrink-0 ${statusDot.pending}`} />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 text-sm mb-2">
                    <span className="font-bold text-rta-ink">{trade.user1.username}</span>
                    <span className="text-rta-muted">↔</span>
                    <span className="font-bold text-rta-ink">{trade.user2.username}</span>
                    <span className="ml-auto text-[0.65rem] text-rta-muted">#{trade.id.slice(0, 8)}</span>
                  </div>
                  {trade.items.length > 0 && (
                    <ul className="flex flex-col gap-1">
                      {trade.items.map((item) => (
                        <li key={item.id} className="text-xs text-rta-muted">
                          <span className="text-rta-ink font-medium">
                            {item.userId === trade.user1Id ? trade.user1.username : trade.user2.username}
                          </span>{" "}
                          propose <span className="text-rta-success">{item.quantity}×</span> {item.card.name}
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {finished.length > 0 && (
        <div>
          <h2 className="text-xs font-bold uppercase tracking-widest text-rta-muted mb-3 flex items-center gap-2 after:flex-1 after:h-px after:bg-rta-surface2">
            ✅ Historique ({finished.length})
          </h2>
          <div className="flex flex-col gap-2">
            {finished.map((trade) => (
              <div key={trade.id} className={`bg-rta-surface border rounded-xl p-4 flex items-center gap-3 ${trade.status === "confirmed" ? "border-rta-success/40" : "border-rta-border opacity-60"}`}>
                <div className={`w-2.5 h-2.5 rounded-full shrink-0 ${statusDot[trade.status] ?? statusDot.expired}`} />
                <span className="text-sm flex-1 text-rta-muted">
                  <strong className="text-rta-ink">{trade.user1.username}</strong> ↔ <strong className="text-rta-ink">{trade.user2.username}</strong>
                  <span className="ml-2">· {trade.createdAt.toLocaleString("fr-FR")}</span>
                </span>
                <span className={`text-xs font-bold uppercase px-2 py-0.5 rounded ${trade.status === "confirmed" ? "bg-rta-success/15 text-rta-success" : "bg-rta-surface2 text-rta-muted"}`}>
                  {trade.status}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {trades.length === 0 && (
        <div className="bg-rta-surface border border-rta-border rounded-xl p-8 text-center">
          <p className="text-rta-muted">Aucun trade. Lance /trade start @user sur Discord.</p>
        </div>
      )}
    </div>
  );
```

- [ ] **Step 2: Commit**

```bash
git add apps/web/src/app/trades/page.tsx
git commit -m "feat(web): restyle trades page"
```

---

## Task 10: Admin Layout & Sidebar

**Files:**
- Create: `apps/web/src/app/admin/AdminSidebar.client.tsx`
- Modify: `apps/web/src/app/admin/layout.tsx`
- Modify: `apps/web/src/app/admin/AdminNav.client.tsx`

- [ ] **Step 1: Create `AdminSidebar.client.tsx`**

```tsx
// apps/web/src/app/admin/AdminSidebar.client.tsx
"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

type NavItem = { href: string; icon: string; label: string; badge?: number };

const NAV: { section: string; items: NavItem[] }[] = [
  {
    section: "Vue d'ensemble",
    items: [{ href: "/admin", icon: "📊", label: "Dashboard" }],
  },
  {
    section: "Contenu",
    items: [
      { href: "/admin/cards",   icon: "🃏", label: "Cartes"  },
      { href: "/admin/imports", icon: "📥", label: "Imports" },
    ],
  },
  {
    section: "Utilisateurs",
    items: [
      { href: "/admin/users",       icon: "👥", label: "Utilisateurs" },
      { href: "/admin/inventories", icon: "🎒", label: "Inventaires"  },
    ],
  },
  {
    section: "Système",
    items: [
      { href: "/admin/logs",    icon: "📋", label: "Logs"     },
      { href: "/admin/servers", icon: "🖥️", label: "Serveurs" },
      { href: "/admin/config",  icon: "⚙️", label: "Config"   },
      { href: "/admin/economy", icon: "💰", label: "Économie" },
    ],
  },
];

export default function AdminSidebar() {
  const pathname = usePathname();

  return (
    <aside className="w-52 shrink-0 bg-[#140A3A] border-r border-rta-border flex flex-col gap-0.5 py-4 overflow-y-auto">
      {NAV.map(({ section, items }) => (
        <div key={section}>
          <p className="text-[0.6rem] font-bold uppercase tracking-widest text-rta-border px-4 pt-3 pb-1">
            {section}
          </p>
          {items.map(({ href, icon, label, badge }) => {
            const active = pathname === href || (href !== "/admin" && pathname.startsWith(href));
            return (
              <Link
                key={href}
                href={href}
                className={[
                  "flex items-center gap-2.5 px-4 py-2 text-sm border-l-[3px] transition-colors",
                  active
                    ? "text-rta-ink border-rta-cta bg-rta-cta/8"
                    : "text-rta-muted border-transparent hover:text-rta-ink hover:bg-rta-accent/10",
                ].join(" ")}
              >
                <span className="w-4 text-center">{icon}</span>
                <span className="flex-1">{label}</span>
                {badge !== undefined && (
                  <span className="bg-rta-cta text-rta-bg text-[0.6rem] font-black px-1.5 py-0.5 rounded-full">
                    {badge}
                  </span>
                )}
              </Link>
            );
          })}
        </div>
      ))}
    </aside>
  );
}
```

- [ ] **Step 2: Update `admin/layout.tsx`**

```tsx
// apps/web/src/app/admin/layout.tsx
import type { ReactNode } from "react";
import Link from "next/link";
import AdminSidebar from "./AdminSidebar.client";

export default function AdminLayout({ children }: { children: ReactNode }) {
  return (
    <div className="-mx-6 -mt-7 flex min-h-screen">
      {/* Top bar */}
      <div className="fixed top-0 left-0 right-0 z-30 bg-rta-surface border-b border-rta-border px-6 py-2.5 flex items-center justify-between">
        <div className="flex items-center gap-3 font-extrabold text-rta-ink">
          <span className="text-xl">🚀</span>
          Rocket Them All
          <span className="text-xs font-bold uppercase tracking-wider px-2 py-0.5 rounded bg-rta-cta/15 text-rta-cta border border-rta-cta/40">
            Admin
          </span>
        </div>
        <Link href="/" className="text-sm text-rta-muted hover:text-rta-ink transition-colors">
          ← Retour au site
        </Link>
      </div>

      {/* Body */}
      <div className="flex flex-1 pt-[53px]">
        <AdminSidebar />
        <main className="flex-1 min-w-0 p-6 overflow-y-auto">{children}</main>
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Keep `AdminNav.client.tsx` but mark it unused**

The old `AdminNav.client.tsx` is no longer imported. Leave it in place for now — it will be cleaned up in a future commit once all admin pages are confirmed working.

- [ ] **Step 4: Check admin layout**

Open http://localhost:3000/admin. Expected: dark top bar + left sidebar with nav sections. Main content area renders on the right.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/app/admin/AdminSidebar.client.tsx apps/web/src/app/admin/layout.tsx
git commit -m "feat(web): replace admin top-tabs with sidebar layout"
```

---

## Task 11: Admin Pages

**Files:**
- Modify: `apps/web/src/app/admin/page.tsx`
- Modify: `apps/web/src/app/admin/cards/page.tsx`
- Modify: `apps/web/src/app/admin/users/page.tsx`
- Modify: `apps/web/src/app/admin/logs/page.tsx`
- Modify: `apps/web/src/app/admin/imports/page.tsx`

Read each file before editing. The pattern for all admin pages is the same:
- Replace `<section className="card">` wrapper with `<div>`
- Replace `<h1>` with `<h1 className="text-2xl font-black tracking-tight mb-1">`
- Replace inline tables with Tailwind-styled tables using this wrapper:

```tsx
<div className="bg-rta-surface border border-rta-border rounded-xl overflow-hidden">
  <table className="w-full border-collapse">
    <thead>
      <tr className="border-b border-rta-surface2">
        <th className="text-left px-4 py-2.5 text-[0.68rem] uppercase tracking-wider text-rta-muted font-semibold">Col</th>
      </tr>
    </thead>
    <tbody>
      <tr className="border-b border-rta-surface2/50 hover:bg-rta-accent/5 transition-colors">
        <td className="px-4 py-2.5 text-sm text-rta-ink">Value</td>
      </tr>
    </tbody>
  </table>
</div>
```

- [ ] **Step 1: Restyle `admin/page.tsx` (dashboard)**

Read the file, then replace the JSX return with a dark dashboard: stat cards in a 4-col grid, then the main content table. The stat cards pattern:

```tsx
<div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-6">
  <div className="bg-rta-surface border border-rta-border rounded-xl p-4">
    <div className="text-2xl font-black text-rta-success">{value}</div>
    <div className="text-[0.68rem] uppercase tracking-widest text-rta-muted mt-1">{label}</div>
  </div>
</div>
```

- [ ] **Step 2: Restyle `admin/cards/page.tsx`**

Read the file, then update the cards table. Add rarity color dot before rarity name:

```tsx
const rarityDot: Record<string, string> = {
  "Common":       "bg-rta-muted",
  "Uncommon":     "bg-rta-success shadow-[0_0_4px_rgba(90,191,134,0.6)]",
  "Rare":         "bg-rta-accentHi shadow-[0_0_4px_rgba(107,63,212,0.6)]",
  "Very Rare":    "bg-purple-500 shadow-[0_0_4px_rgba(139,92,246,0.6)]",
  "Import":       "bg-rta-cta shadow-[0_0_4px_rgba(242,130,65,0.6)]",
  "Exotic":       "bg-red-500 shadow-[0_0_4px_rgba(239,68,68,0.6)]",
  "Black Market": "bg-rta-gold shadow-[0_0_4px_rgba(245,200,66,0.6)]",
  "Limited":      "bg-rta-gold shadow-[0_0_4px_rgba(245,200,66,0.6)]",
};

// In the table cell:
<td className="px-4 py-2.5 text-sm text-rta-ink flex items-center gap-2">
  <span className={`w-2 h-2 rounded-full shrink-0 ${rarityDot[rarity] ?? "bg-rta-muted"}`} />
  {rarity}
</td>
```

- [ ] **Step 3: Restyle remaining admin pages**

Apply the same table pattern to `users/page.tsx`, `logs/page.tsx`, `imports/page.tsx`. Each gets a `<div>` root, dark `<h1>`, and the table wrapper above.

- [ ] **Step 4: Check all admin pages**

Visit /admin, /admin/cards, /admin/users, /admin/logs, /admin/imports. Expected: all render with sidebar and dark table layout.

- [ ] **Step 5: Delete old AdminNav**

```bash
git rm apps/web/src/app/admin/AdminNav.client.tsx
```

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/app/admin/
git commit -m "feat(web): restyle all admin pages with dark table layout"
```

---

## Task 12: Collection Page

**Files:**
- Modify: `apps/web/src/app/collection/page.tsx`
- Modify: `apps/web/src/app/collection/filters.client.tsx`

- [ ] **Step 1: Read and restyle `collection/page.tsx`**

Read the file. The collection page shows all cards (not just owned ones). Apply the same card grid as the inventory page, but for unowned cards add:
```tsx
className="... opacity-40 grayscale"
```
and show a "Non possédée" badge instead of count.

Apply the same filter bar restyle as inventory.

- [ ] **Step 2: Check collection page**

Open http://localhost:3000/collection. Expected: dark grid, owned cards full color, unowned cards dimmed.

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/app/collection/page.tsx apps/web/src/app/collection/filters.client.tsx
git commit -m "feat(web): restyle collection page"
```

---

## Verification Checklist

- [ ] `npm run build` in `apps/web` — no TypeScript or Tailwind errors
- [ ] Nav active state updates on all routes
- [ ] Rarity glows visible on inventory/collection
- [ ] Legendary `animate-legendaryPulse` animation runs on Black Market cards
- [ ] Shop buy button disabled + "Insuffisant" when credits too low
- [ ] Admin sidebar active link highlights correctly per route
- [ ] Trades pending section shows cards
- [ ] No console errors in browser
- [ ] Logo displays in nav (may need path fix if `/logo.webp` isn't found)
