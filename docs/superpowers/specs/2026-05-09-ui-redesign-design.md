# UI Redesign — Rocket Them All

**Date:** 2026-05-09  
**Scope:** Full app redesign (user-facing + admin)  
**Stack:** Next.js · Tailwind CSS · plain CSS vars replaced by Tailwind config

---

## Context

The current web app has a functional but minimal UI — basic warm beige CSS variables, no component library, and no visual identity matching the TCG/collectible nature of the app. The goal is a full redesign that makes the app feel like a premium multi-universe trading card game, using the existing palette the user selected.

---

## Design System

### Color Tokens (Tailwind config)

| Token | Value | Usage |
|-------|-------|-------|
| `bg` | `#0D0D0D` | Page background |
| `surface` | `#1F0E59` | Cards, panels |
| `surface-2` | `#2A1870` | Elevated panels, hover states |
| `border` | `#481CA6` | Default border |
| `accent` | `#481CA6` | Primary purple (links, focus rings) |
| `accent-hi` | `#6B3FD4` | Hover/active purple |
| `cta` | `#F28241` | Orange CTAs and primary buttons |
| `success` | `#5ABF86` | Mint: success states, confirm actions, trades |
| `ink` | `#F0ECF8` | Primary text |
| `muted` | `#9B8FC0` | Secondary text, placeholders |

### Rarity Glow System

Applied via `box-shadow` on collectible card components:

| Rarity | Border | Glow color |
|--------|--------|------------|
| Common | `#481CA6` | none |
| Uncommon | `#5ABF86` | `rgba(90,191,134,0.35)` |
| Rare | `#6B3FD4` | `rgba(107,63,212,0.5)` |
| Epic | `#F28241` | `rgba(242,130,65,0.5)` |
| Legendary | `#f5c842` | animated pulse glow gold/orange |

### Typography

- **Font:** Space Grotesk (already in use, kept)
- **Headings:** `font-weight: 800`, `letter-spacing: -0.03em`
- **Labels:** `font-weight: 700`, `text-transform: uppercase`, `letter-spacing: 0.08em`
- **Body:** 16px base, `font-weight: 400`

### Spacing & Radius

- Base unit: 4px — scale: 4 / 8 / 12 / 16 / 24 / 32 / 48px
- Border radius: `4px` (chips/badges), `8px` (buttons/inputs), `12px` (cards), `14–16px` (panels)

---

## Navigation

### User nav (sticky top bar)

- Background: `#1F0E59`, border-bottom: `1px solid #481CA6`
- Left: logo image (circular quadrant emblem, 40px) + wordmark "Rocket **Them All**" (orange "Them All")
- Center: nav links — Accueil · Profil · Inventaire · Boutique · Collection · Trades
- Active link: `color: #F28241`, `border-bottom: 2px solid #F28241`
- Right: auth button (ghost orange style when logged in, shows Discord username)
- Admin link shown only when `status === "authenticated"` (existing logic kept)

### Admin layout

- Top bar: same brand + "Admin" badge + "← Retour au site" link
- Left sidebar (220px, collapsible): sections Contenu / Utilisateurs / Système
- Active sidebar item: orange left border + subtle orange background tint
- Notification badges on imports and logs items

---

## Pages

### Home (`/`)

- Full-width hero: gradient background (`#1F0E59` → `#2A1870` → `#0D0D0D`), purple radial glow, large logo, title, subtitle, two CTA buttons (Inventaire / Booster)
- Global stats row: cartes collectées · joueurs actifs · légendaires en jeu
- Two-column grid: Leaderboard panel + Activité récente panel

### Profile (`/profile`)

- Profile header panel: Discord avatar, username, level badge (orange), badges (Collectionneur, Trader actif, Early Adopter)
- XP progress bar: gradient purple→orange, label with current/max XP and formula reminder
- Stats grid (4 cols): cartes · trades · boosters · légendaires
- Recent cards strip: horizontal row of mini card thumbnails with rarity glows

### Inventory (`/inventory`)

- Page header: title + subtitle + stat counters (total / uniques / légendaires)
- Universe tabs (pill style): Tout · Rocket League · Pokémon · Cinéma · Jeux · Pop Figures
- Filter bar: search input + rarity filter chips
- Card grid: `auto-fill minmax(175px, 1fr)`, cards with art, rarity badge, universe tag, count badge

### Collection (`/collection`)

- Same layout as Inventory but shows all available cards (owned = highlighted, unowned = dimmed)
- Progress counter per universe

### Shop (`/shop`)

- Coins balance bar at top
- Booster grid: each card shows type, contents summary, price in coins, buy button
- Special boosters: "🔥 Populaire" badge (orange), "✨ Nouveau" badge (mint), "👑 Légendaire" with animated glow
- Buy button disabled + "Insuffisant" label when balance too low

### Trades (`/trades`)

- "Nouveau trade" CTA button (mint green)
- Active trades section: each trade shows status dot, offering user, cards offered ↔ cards requested, confirm/cancel buttons
- History section: completed (mint) and expired (muted) trades

### Admin pages

All admin pages share the sidebar layout. Content area stays dark theme but uses table/list layouts optimized for data management:

- `/admin` — Dashboard with stat cards + recent cards table
- `/admin/cards` — Full cards table with universe tags, rarity dots, image status
- `/admin/imports` — Import job queue with status indicators
- `/admin/users` — Users table
- `/admin/inventories` — Per-user inventory view
- `/admin/logs` — Log feed
- `/admin/servers` — Discord servers list
- `/admin/config` — Config form
- `/admin/economy` — Economy settings

---

## Components

### `<CollectibleCard>`
Props: `name`, `rarity`, `universe`, `imageUrl`, `count?`  
Renders: card image (3:4 aspect ratio), rarity badge, universe tag, count badge, rarity glow via `box-shadow`.

### `<RarityGlow>`
Utility: Tailwind `box-shadow` classes per rarity, with `animate-pulse` variant for Legendary.

### `<UniverseTag>`
Small pill showing universe abbreviation (RL, PKM, FILM, POP, etc.).

### `<XpBar>`
Props: `current`, `max`, `level`  
Renders: labeled progress bar with gradient fill.

### `<BoosterCard>`
Props: `name`, `description`, `price`, `coins`, `variant?`  
Renders: booster image area, name, contents, price, buy button.

### `<TradeItem>`
Props: `status`, `offerer`, `receiver`, `offeredCards`, `requestedCards`  
Renders: status dot, user names with card thumbnails, action buttons.

### `<AdminSidebar>`
Collapsible sidebar with section groups, active state, notification badges.

---

## Implementation Notes

- Replace `globals.css` CSS variables with Tailwind config (`tailwind.config.ts`) — custom color scale under `colors.rta.*`
- Keep Space Grotesk font (already loaded or add via `next/font/google`)
- Logo image: copy from `D:/téléchargements/Screenshot_2026-05-03-13-01-33-420_com.openai.chatgpt.webp` → `apps/web/public/logo.webp`
- Add `.superpowers/` to `.gitignore`
- Rarity glow animations use CSS `@keyframes` defined in Tailwind `theme.extend.keyframes`

---

## Verification

- [ ] `npm run dev` — all pages render without layout errors
- [ ] Nav active state correct on all routes
- [ ] Rarity glows visible on inventory/collection pages
- [ ] Legendary pulse animation runs
- [ ] Admin sidebar active state matches current route
- [ ] Shop buy button disabled when coins insufficient
- [ ] Trades confirm/cancel buttons visible for pending trades
- [ ] Responsive: grid collapses gracefully on narrow viewports
