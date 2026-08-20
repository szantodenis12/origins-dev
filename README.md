# Origins Platform

Web platform for Origins Coffee & Drinks Oradea (client: `CLIENTI/OriginsCafe/`).
Digital menu + Wallet loyalty card + staff admin. Browser-only, no store app.

- **Spec:** `CLIENTI/OriginsCafe/PLATFORMA/SPEC_ARHITECTURA_PLATFORMA.md`
- **Design reference:** `CLIENTI/OriginsCafe/PLATFORMA/MOCKUP_PAGINA_LOCATIE.html` (approved 25.07.2026)
- **Stack:** Next.js 16 (App Router, Turbopack) + Tailwind v4 + lucide-react; Supabase in phase 3+ (schema in `supabase/migrations/`)

## Phases

1. ✅ Scaffold + design tokens (`src/app/globals.css`)
2. ✅ Public pages: `/` selector and `/[locatie]` menu — seed data in `src/lib/data.ts` (66 products / 13 categories, RO·HU·EN)
2.5. ✅ Real signup + browser-based loyalty card (`/card/{memberId}`)
3. ⛔ Wallet passes (Apple PassKit + Google Wallet) — blocked on Apple/Google accounts; artwork is done, see `CLIENTI/OriginsCafe/PLATFORMA/SPEC_WALLET_PASSES.md`
4. ✅ Admin: scan/stamp flow (`/admin`, `/admin/scan`)
5. ✅ Manager admin on the memory adapter: menu CRUD + photo editor, locations, program editor (`/admin/setari`), team (`/admin/echipa`), push composer, stats, GDPR tools

## Hard rules

- `src/lib/data.ts` holds ONLY verified facts (Qubs 25.07.2026 + Google listings). `null` means "not confirmed" and the UI hides the element. Never fill a null with a guess.
- All copy through `src/lib/i18n.tsx` (RO + natural HU, proper diacritics, no em dashes in RO).
- Colors only from `@theme` tokens. No blue. Icons: lucide-react, never emojis.

## Admin (staff)

- `/admin` — shift login: shared PIN from `ADMIN_DEV_PIN` (default `0000` only in development) + the café this phone sits at. The 12h httpOnly cookie is HMAC-signed with `ADMIN_SESSION_SECRET`; Supabase Auth replaces PIN auth in phase 3/5.
- `/admin/scan` — camera viewfinder (getUserMedia + jsQR, no BarcodeDetector: iOS Safari) with a manual serial field as fallback, then the member panel: stamp, redeem, review bonus, student verify.
- Screens are Romanian only; strings live in a local `strings` object per file.

**Data access is ports and adapters.** `src/lib/db/index.ts` holds the `Db` interface and `getDb()`, the single place the adapter is chosen. Supabase is not provisioned yet, so `src/lib/db/memory.ts` serves 10 obviously-fake demo members (`ORIG-DEMO-0001` to `ORIG-DEMO-0010`) from a module-level singleton. A later `supabase.ts` implements the same interface.

**The loyalty mechanics are DATA, not code.** `src/lib/program.ts` holds `LoyaltyConfig` + `sanitizeLoyaltyConfig`; the manager edits it in `/admin/setari` and every public sentence is generated from it by `src/lib/program-copy.ts` (RO·HU·EN). Never hardcode a number like "5 ștampile" in copy. Defaults today: standard card 5+1, Gold after 4 completed cards, Gold card 4+1, rotating Gold perk every 2 weeks, takeaway only.

**Card rules** — `src/lib/loyalty.ts` (stamping, the 2h anti-abuse window, cycle reset with surplus carry-over), `src/lib/gold.ts` (`goldStatus()` — status is DERIVED from event history, never stored), and `src/lib/card.ts` (`memberCard()` — the one place gold → card spec → earned rewards is resolved; the adapter, the admin panel and the card page all go through it). All pure, no side-effecting imports.

```bash
npm run dev    # Roland uses port 4319; demo data reseeds on every restart
npm run build
npm test       # node --test — 125 tests: business rules + memory adapter flows
```

Production PIN auth fails closed unless all three secrets are configured:

- `ADMIN_SESSION_SECRET` — minimum 32 characters, stable across instances;
- `ADMIN_DEV_PIN` — shared barista PIN;
- `ADMIN_MANAGER_PIN` — shared manager PIN.

These remain a temporary bridge. Real launch still requires Supabase Auth and
transactional database functions for stamping and redemption.
