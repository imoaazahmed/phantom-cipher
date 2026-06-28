# Claude Instructions

## Git

**Never commit or push unless explicitly told to.** Always show changes first and wait for the user to say "commit" or "push".

## Design System

**No rounded borders.** The design system is intentionally sharp-cornered — never use `rounded`, `rounded-sm`, `rounded-md`, `rounded-lg`, etc. on any UI element (buttons, inputs, cards, menus, hover states, dialogs, etc.). Use `rounded-none` if you need to explicitly override a default.

**Invalid state is input + message only.** When a field has a validation error, only the input border and the `FieldError` message turn red — never the label, never surrounding UI like toggle groups or descriptions. Do not add `text-destructive` to the `Field` container or `FieldLabel`. The `FieldError` component already carries its own `text-destructive`; inputs handle their own invalid styling via `aria-invalid`.

## Performance

**Performance is the #1 priority.** Every decision must favor speed:
- Prefer Server Components; only use `"use client"` when necessary
- Minimize client-side JS and bundle size
- Avoid request waterfalls — fetch in parallel or at the server level
- Lazy load non-critical UI

## App Overview

**Phantom Cipher** — a personal multi-tool platform. Core product is a trade journaling app; also hosts public calculator tools (no auth required). Future roadmap includes auto-fetching trades from connected brokers (not in scope yet).

## Pages & Layout

### Pre-login
- Landing page (`/`)
- Auth: login, signup, forgot password, reset password
- Tools: `/tools/*` — public, no auth required

### Post-login
- **Navbar** (top):
  - Left: brand logo (links to `/trades/overview` post-login) | Trades nav link | Tools dropdown
  - Right: dark/light theme toggle | language toggle (EN ↔ AR) | user avatar menu (settings, logout)
- **Sidebar** (left):
  - Overview → `/trades/overview`
  - Trades → `/trades/patches`

### Routes
- `/trades/overview` — trades overview dashboard
- `/trades/patches` — patches / trade logs
- `/tools/cd-calculator` — CD Investment Calculator
- `/tools/position-calculator` — Position Calculator (placeholder)
- `/tools/return-calculator` — Return Calculator (placeholder)

## Buttons

- **Primary action** → `<Button>` (default variant, no `variant` prop needed)
- **Secondary action** → `<Button variant="outline">`
- Never use `ghost` for visible action buttons; reserve it for icon-only controls (theme toggle, locale switcher, etc.)
- **Loading state** — add `<Spinner data-icon="inline-start" />` inside the button; it handles spacing automatically. Never swap the label text for "Saving…" or similar.

## Forms

**All forms use react-hook-form + yup. No exceptions.**

- Define schemas in `lib/schemas/` using `yup.object()`
- Use `yupResolver` from `@hookform/resolvers/yup`
- Yup error messages must be translation keys (e.g. `"validation.email.required"`) so they pass through `t()`
- Server action signatures accept plain typed objects (not `FormData`)
- Call server actions inside `handleSubmit`; handle server errors with `setError("root", ...)`
- Display field errors below each input; display root errors at the top of the form

## i18n Rule

**Every piece of visible text must use `t()` — no hardcoded strings in JSX, ever.**

When adding any English text:
1. Add the key + English value to `messages/en.json`
2. Add the key + Arabic translation to `messages/ar.json`
3. Use `t("key")` in the component

Components that call `useTranslation()` must be `"use client"`. If a Server Component needs translated text, extract the text into a child Client Component.

Server actions that return user-facing messages should return a translation key (e.g. `{ error: "auth.resetPassword.mismatch" }`), not a raw string. The client then calls `t(state.error)`.

## Tech Stack

| Concern | Tool |
|---|---|
| Framework | Next.js App Router, TypeScript |
| Styling | Tailwind CSS v4 |
| UI Components | shadcn/ui (`radix-lyra` style, `rtl: true` in `components.json`) |
| Icons | Lucide |
| i18n | react-i18next, cookie-based locale (`NEXT_LOCALE`), `en` + `ar` |
| RTL | `dir` on `<html>` + `DirectionProvider` in `layout.tsx`; Noto Sans Arabic via `[dir="rtl"]` in `globals.css` |
| URL State | nuqs — always use `useQueryState` / `useQueryStates` for URL search params, never roll manual `useSearchParams` + `router.push` |
| Tables | TanStack Table (`@tanstack/react-table`) — always use for any table UI, no exceptions |
| Charts | Recharts — always use for any chart/data visualization, no exceptions |
| QR Codes | qrcode.react — always use for any QR code generation, no exceptions |
| Drag & Drop | @dnd-kit (`@dnd-kit/core`, `@dnd-kit/sortable`, `@dnd-kit/utilities`) — always use for any drag-and-drop UI, no exceptions |
| Scroll | shadcn `ScrollArea` (`components/ui/scroll-area.tsx`) — use for styled scrollable regions; for horizontal-only bars use `ScrollAreaPrimitive` from `radix-ui` directly so the scrollbar can be placed correctly |
| Empty States | shadcn `Empty` (`components/ui/empty.tsx`) — use `Empty`, `EmptyHeader`, `EmptyMedia`, `EmptyTitle`, `EmptyDescription`, `EmptyContent`; add `flex-none` to override the baked-in `flex-1` when centering inside a flex container |
| Database & Auth | Supabase |
| Deployment | Vercel |

## Trades Page Patterns

- **Active patch** is persisted in `localStorage` (key `trading-logs:last-patch`) and synced to the URL param `?patch=`. On mount, read from localStorage via a lazy `useState` initializer; defer `setPatchId` with `setTimeout(0)` so it fires after Next.js navigation transitions settle.
- **Empty states**: when `patches.length === 0` → "No patches yet"; when all patches are hidden → "All patches are hidden". Both use the `Empty` component. The Add Trade button is hidden in these states. The `PatchTabs` bar is always rendered.
- **PatchTabs** exposes `openCreate()` via `forwardRef` + `useImperativeHandle` (`PatchTabsHandle` type) so parent components can imperatively open the create dialog (e.g. from the empty state button).
- **Server actions** (`lib/trades/actions.ts`) never auto-create patches — the page renders an empty state instead.
- **Duplicate patch** (`duplicatePatch` action) creates a new patch with name `"Copy of <name>"`, same `patch_limit`, and copies all trades.

## Calculator Tools Patterns

Calculators live under `/tools/*` in the `app/(tools)/` route group — public, no auth required, no database.

### Route & layout
- Each calculator gets its own route: `app/(tools)/tools/<name>/page.tsx`
- Add a nav item to `ToolsNavMenuItem` in `components/layout/tools-nav-menu.tsx` with an icon, label key, and description key

### State & persistence
- All state is `"use client"` — no server components inside calculator pages
- Use **one localStorage key per tab** (e.g. `phantom-cipher:cd-calculator:car`), not one blob for the whole calculator
- Active tab is stored separately: `phantom-cipher:<calculator>:active-tab`
- State shape per tab: `{ values: Partial<FormValues>, periodUnit, ... }` — keep it flat and typed
- Load from localStorage in a `useEffect` on mount (never in `useState` initializer — causes SSR hydration mismatch)
- Save on every change via a separate `useEffect` watching the relevant state
- On tab switch: save current tab state first, then apply the new tab's state

### Forms
- Use `react-hook-form` + `yup` with `mode: "onChange"`
- All form values are **strings** (text inputs), never `type="number"`
- Strip non-numeric characters on `onChange` before passing to react-hook-form:
  - Decimal fields (currency, rate): `/[^0-9,.]/g`
  - Integer fields (period): `/[^0-9,]/g`
- Parse values for calculation with a `parseNum` helper that strips commas before `parseFloat`
- Yup schema uses `.string().test(...)` — not `.number()` — since inputs are text
- Validation errors use translation keys (e.g. `"validation.required"`, `"validation.positive"`)

### Layout & UI
- Page container: `mx-auto max-w-6xl px-6 pt-6 pb-10 space-y-8`
- Two-column grid for inputs + results: `grid grid-cols-1 gap-6 md:grid-cols-2`
- Each section uses `Card` / `CardHeader` / `CardTitle` / `CardAction` / `CardContent` from shadcn
- Section titles: `uppercase tracking-wide text-muted-foreground` override on `CardTitle`
- Use `Field` + `FieldLabel` + `FieldDescription` + `FieldError` from `components/ui/field.tsx` for every input
- Use `InputGroup` + `InputGroupAddon` + `InputGroupInput` from shadcn for inputs with prefixes/suffixes
- `FieldDescription` goes **below** the input, not above
- Tabs (car, house, etc.) use shadcn `Tabs` with icons from Lucide; define tabs as a `TABS` array with `id`, `labelKey`, `sectionLabelKey`, `icon`, and `fields[]`
- Each `FieldDef` has `key`, `labelKey`, `placeholder`, `type` (`"currency" | "period" | "rate"`), and optional `descKey`
- Input IDs: `${tab.id}-${field.key}` — wire to `FieldLabel` via `htmlFor`

### Currency
- Use `CurrencyPicker` (`components/ui/currency-picker.tsx`) as the `InputGroupAddon` for currency fields
- Currency is stored **per tab** in localStorage (not global)
- Currency names are resolved via `Intl.DisplayNames` with the current i18n locale — no static translations
- Format results with `Intl.NumberFormat` using the selected currency code; wrap in try/catch for unknown codes

### Clear all
- Every calculator has a "Clear all" button in `CardAction` of the first card
- Clearing resets form fields, period unit, and any other tab-local state back to defaults; also wipes that tab's localStorage entry
- Clearing does **not** reset the selected currency

## Environments

| Env | Supabase Project |
|---|---|
| Development | `trading-logs-dev` |
| Production | `trading-logs-prod` |

See `docs/deployment.md` for deploy checklist and `docs/database-queries.md` for production DB queries.
