# DESIGN_SYSTEM.md — Sylk

The reference implementation for the **clean-minimal** aesthetic mandated by `DESIGN.md`.
Every visual decision below is grounded in that document — no improvisation. Read this
file before adding sections, components, or pages so the language stays consistent.

---

## 1. Aesthetic principles

| Principle | What it means in code |
|---|---|
| **Gallery, not theme park** | Near-white canvas, restrained motion, content earns the pixel. No particles, no purple gradients, no glow halos chasing the cursor. |
| **One accent in a sea of neutrals** | `#0071e3` is reserved for interactive surfaces — links, focused borders, primary CTAs, progress fills, the active dot in a sparkline. Anything else is achromatic. |
| **Three text levels, every page** | Primary `#171717`, Secondary `#525252`, Muted `#a3a3a3`. Never collapse to two. |
| **Whisper-level shadows, layered** | Always multi-layer (`0_1px_2px` + `0_1px_3px` minimum). Never single `shadow-lg`. |
| **Ring borders, not borders** | `ring-1 ring-black/[0.05]` over `border-1 border-black/10` — refines the edge without claiming a pixel. |
| **Aggressive negative tracking on display type** | Hero: `tracking-[-0.045em]`. Section: `-0.02em`. Body: `0`. |

---

## 2. Tokens

All tokens live in `src/app/globals.css` (foundation). New code references them via
Tailwind utilities or CSS variables — never hard-code colors that already have a token.

### Color

| Role | Token | Value | Where it shows up |
|---|---|---|---|
| Canvas | `--bg-canvas` | `#fafafa` | `body`, hero background |
| Surface | `--bg-surface` | `#f5f5f5` | hover surfaces, alternate sections |
| Elevated | `--bg-elevated` | `#efefef` | progress track, dot grid |
| Card | — | `#ffffff` | cards, navbar pill, preview panel |
| Text primary | `--text-primary` | `#171717` | headlines, names, KPI values |
| Text secondary | `--text-secondary` | `#525252` | body copy, nav links |
| Text muted | `--text-muted` | `#a3a3a3` | metadata, eyebrow labels, time stamps |
| Accent | `--accent` | `#0071e3` | primary CTA, active nav, focus ring, progress fill, links |
| Accent hover | `--accent-hover` | `#005bb5` | primary CTA hover |
| Accent light | `--accent-light` | `rgba(0,113,227,0.08)` | active-nav background, eyebrow chip |
| Border subtle | `--border-subtle` | `rgba(0,0,0,0.06)` | default ring on cards |
| Border standard | `--border-standard` | `rgba(0,0,0,0.10)` | input ring |
| Success | — | `#34c759` | live dot, status indicator |

> Pure `#000` and pure `#fff` are not allowed for text/background. Use the tokens.

### Type

Family: **Inter** (`--font-inter`) for everything except numerics; **JetBrains Mono**
(`--font-jetbrains`) for money, dates, IDs, percentages, version strings — always with
`tabular-nums`. Both are loaded via `next/font/google` in `src/app/layout.tsx`.

| Role | Size | Weight | Line | Tracking | Tailwind |
|---|---|---|---|---|---|
| Display Hero (lg) | 96px | 600 | 0.95 | -0.045em | `text-[96px] leading-[0.95] tracking-[-0.045em] font-semibold` |
| Display Hero (md) | 80px | 600 | 0.95 | -0.045em | `md:text-[80px]` |
| Display Hero (sm) | 64px | 600 | 0.95 | -0.045em | `sm:text-[64px]` |
| Section Heading | 36px | 600 | 1.1 | -0.02em | `text-4xl font-semibold tracking-tight` |
| Sub-heading | 24px | 600 | 1.2 | -0.01em | `text-2xl font-semibold` |
| Card title | 18px | 600 | 1.3 | -0.01em | `text-lg font-semibold` |
| Body | 16px | 400 | 1.6 | 0 | `text-base leading-relaxed` |
| Body large | 17–18px | 400 | 1.6 | 0 | `text-[17px] md:text-lg leading-relaxed` |
| Small | 14px | 400 | 1.5 | 0 | `text-sm` |
| Caption | 12px | 500 | 1.4 | 0.03em | `text-xs font-medium tracking-wide` |
| Label (eyebrow) | 11px | 600 | 1.3 | 0.08em | `text-[11px] font-semibold uppercase tracking-[0.08em]` |

Headlines reveal **word-by-word** via Framer Motion (see Hero choreography). Each word
is wrapped in `relative inline-block overflow-hidden align-bottom` so the y-axis slide
clips cleanly.

### Spacing (8px grid)

Use the Tailwind scale verbatim. Section padding minimum:

```
py-20 md:py-28 lg:py-32
```

Hero is the exception — it sits between the navbar (top-4) and the preview card, so the
top is `pt-32 md:pt-40` to clear the pill nav.

Card internal padding: `p-3.5` (compact KPI), `p-5` (rail card), `p-6` / `p-8` (page
cards). Wider horizontal than vertical when in doubt (`px-8 py-6`).

### Radii

| Token | Value | Use |
|---|---|---|
| `rounded-md` | 6px | inline pills, dot avatars |
| `rounded-lg` | 8px | inputs, primary buttons |
| `rounded-xl` | 12px | KPI cards, table frames |
| `rounded-2xl` | 16px | mobile-nav drawer, primary content cards |
| `rounded-[20px]` | 20px | hero preview "window" |
| `rounded-full` | — | pill nav, status dots, eyebrow chip |

Never mix `rounded-md` and `rounded-xl` randomly — match radius to scale of the surface.

### Shadows

Always layered. Three canonical recipes:

```
/* shadow-subtle — default card */
shadow-[0_1px_2px_rgba(0,0,0,0.04),0_1px_3px_rgba(0,0,0,0.06)]

/* shadow-elevated — card hover */
shadow-[0_2px_4px_rgba(0,0,0,0.04),0_4px_8px_rgba(0,0,0,0.06),0_8px_16px_rgba(0,0,0,0.04)]

/* shadow-float — hero preview, nav-on-scroll */
shadow-[0_1px_2px_rgba(0,0,0,0.04),0_8px_16px_rgba(0,0,0,0.05),0_24px_48px_rgba(0,0,0,0.06),0_48px_96px_rgba(0,0,0,0.05)]
```

Layer opacities stay between **0.02 and 0.08**. Anything stronger is a tell that you've
left the aesthetic.

### Borders

Prefer `ring-1 ring-black/[0.05]` for default surfaces and `ring-1 ring-black/[0.06]`
for slightly stronger cards. Reserve full `border` only for table-row dividers
(`border-b border-black/[0.04]`).

---

## 3. Components

### `Button` (`src/components/ui/Button.tsx`)

```
<Button variant="primary" size="md">…</Button>
<Button variant="ghost"   size="lg">…</Button>
<Button variant="secondary">…</Button>
```

| Variant | Surface | Text | Notes |
|---|---|---|---|
| `primary` | `#0071e3` → hover `#005bb5` | white | Default. Layered shadow + accent glow. Active scales `0.97`. |
| `secondary` | `#171717` → hover `#2d2d2d` | white | High-contrast neutral CTA. |
| `ghost` | white | `#171717` | `ring-1 ring-inset ring-black/10`. Quiet alternative on light surfaces. |

Sizes: `sm` (36px), `md` (40px), `lg` (48px). All buttons share `focus-visible` ring on
accent with 2px offset against the canvas. Override `rounded-full` per-instance for the
hero (capsule) styling.

### `Navbar` (`src/components/landing/Navbar.tsx`)

Pill nav floating at `top-4 left-1/2 -translate-x-1/2` per `DESIGN.md §4`. Glass-morphism
via `bg-white/75 backdrop-blur-xl`. On scroll past 8px the nav swaps to a stronger
shadow + `bg-white/90` — the only "scroll reward" on the page besides the entrance.

Mobile collapses to a top-edge rounded card with a hamburger that drops a popover panel.
Both desktop and mobile fade-and-slide in at delay `0` (the head of the entrance sequence).

### `Hero` (`src/components/landing/Hero.tsx`)

Full-viewport hero, centered text composition, with a **hand-built faux-cockpit
preview** below the fold instead of stock screenshots. The preview is rendered in JSX
(no images) so it is sharp at any DPR and inherits the same tokens — it is, in effect,
the design system rendering itself.

**Atmospheric layers** (subtle, restrained — clean-minimal does not allow particles):

1. **Accent radial wash** at the top: `rgba(0,113,227,0.10)` ellipse fading to
   transparent at 70%.
2. **Dot grid** behind the wash, masked with a radial so it fades toward the edges:
   `radial-gradient(circle at 1px 1px, rgba(23,23,23,0.10) 1px, transparent 0)` at
   28×28px.
3. **Accent halo** behind the preview card: 600×1100px blur-120 disc at 10% opacity.

**Choreography** (single entrance sequence — never random scattering):

| Element | Delay |
|---|---|
| Navbar | 0 ms |
| Eyebrow chip | 100 ms |
| Headline (per word, stagger 60 ms) | 200 ms onwards |
| Subheading | 400 ms |
| CTAs | 600 ms |
| Trust strip | 750 ms |
| Cockpit preview | 850 ms |

Two of the six headline words (`service`, `businesses.`) are rendered in `text-[#0071e3]`
to anchor the single-accent rule.

### `Footer` (`src/components/landing/Footer.tsx`)

12-column grid: brand+blurb (5), three link columns (2 each), version stamp (1).
A `gradient-fade` rule precedes the copyright row — a section connector inside the
section. Status dot is `#34c759`; version stamp uses JetBrains Mono.

---

## 4. Layout patterns

DESIGN.md mandates **a different layout per section**. The Hero claims:

- **Full-viewport centered text** above the fold
- **Overlapping window-card** below the fold (the cockpit preview)

When you build the next section, do **not** reuse the centered-text pattern. Reach for
asymmetric splits, sticky-rail two-column, bento grids, horizontal scroll strips, or
full-bleed image with overlapping card — any of the patterns listed in DESIGN.md.

Section connectors:

```
<div className="h-px bg-gradient-to-r from-transparent via-black/10 to-transparent" />
```

Use this between every section. Hard color cuts feel cheap; gradient fades feel
machined.

---

## 5. Motion rules

- Default transition for interactive elements: `transition-all duration-200`.
- Card hover: `-translate-y-0.5` + shadow swap from `subtle` to `elevated`.
- Active press: `scale-[0.97]` (buttons) / `scale-[0.99]` (cards).
- Image hover: `scale-[1.03] duration-700 ease-out`.
- Headline reveal uses `cubic-bezier(0.22, 1, 0.36, 1)` for the iOS-style ease.
- Stagger entrance children by 60–100 ms — never less, never more.

Avoid: parallax-everywhere, scroll-locked sections, cursor-trailing dots, neon glows,
text gradients on dark backgrounds (unless the entire section is dark).

---

## 6. Anti-patterns we explicitly avoid

- Pure `#000` text or pure `#fff` backgrounds.
- Single `shadow-lg` — always layered.
- `border` on cards — use `ring-1`.
- Two-level type hierarchy — always three.
- Purple gradients (the #1 AI tell).
- Particles, glow rings, and BorderBeam on the marketing surface — clean-minimal forbids them. They are reserved for the (separately-styled) cockpit if and only if `ARIA.md` greenlights them.
- Identical `p-6` everywhere — vary horizontal vs. vertical, vary by surface scale.
- Random radius mixing (`rounded-md` next to `rounded-2xl`).
- Trailing summary text under headlines that just paraphrases the headline.

---

## 7. File ownership for this feature

| File | Status |
|---|---|
| `src/components/landing/Hero.tsx` | rewritten |
| `src/components/landing/Navbar.tsx` | rewritten |
| `src/components/landing/Footer.tsx` | rewritten |
| `src/components/ui/Button.tsx` | rewritten — DESIGN.md tokens, `size` prop added |
| `src/components/app/money/CockpitHero.tsx` | new — cockpit hero per ARIA |
| `src/components/app/money/CockpitFooter.tsx` | new — gradient-line + meta |
| `src/components/app/DesktopSidebar.tsx` | retoned to `#0071e3` accent + ring borders |
| `src/components/app/BottomTabBar.tsx` | retoned to `#0071e3` accent + multi-layer shadow |
| `src/components/app/money/MoneyShell.tsx` | added `bank` + `reconciliation` tabs |
| `DESIGN_SYSTEM.md` | this file |

Foundation files (`globals.css`, `constants.ts`, `safe.ts`, `types/index.ts`,
`hooks/useDebouncedValue.ts`) were **not** modified — the design system rides on top of
the tokens already declared there.

---

## 8. Cockpit additions (ARIA — Money II segment)

The marketing surface (Hero / Navbar / Footer) is centered, dramatic, full-viewport.
The cockpit surface (`/app/*`) is denser and starts mid-page below the global topbar.
Both share the same tokens — only the layout language changes.

### `CockpitHero` (`src/components/app/money/CockpitHero.tsx`)

The reusable hero used by every Money cockpit page. Per `ARIA.md`:

```
min-h-[40vh] px-8 py-12 grid grid-cols-12 gap-6 relative overflow-hidden
```

**Atmospheric layers** (clean-minimal — restrained but visible):

1. **Accent gradient blob** — `-top-40 -right-40 w-[700px] h-[700px] rounded-full
   bg-[#0071e3]/[0.08] blur-[140px]`, `pointer-events-none`, `-z-10`.
2. **DotPattern** — 28×28 pattern at `opacity-[0.12]` masked with a radial fade so the
   atmosphere doesn't bleed into the table below.

**Composition (12-col grid)**:

| Slot | Markup |
|---|---|
| Eyebrow | `<StatusBadge variant="accent">` — `Money · Bank Accounts` |
| Headline | `text-[44px] font-semibold tracking-[-0.03em] leading-[1.05] text-[#171717]` |
| Subheadline | `text-[17px] text-[#525252] leading-relaxed max-w-[620px]` |
| Stats row | `grid sm:grid-cols-2 lg:grid-cols-4 gap-4` of `<StatCard>` |
| Divider | `h-px bg-gradient-to-r from-transparent via-black/10 to-transparent` |

**Choreography** — the same iOS easing used in the marketing hero. Word-by-word
headline reveal at 200 ms / 60 ms stagger; stats stagger 80 ms after the
subheadline; divider fades in at 950 ms. Reduced-motion is honored via Framer
Motion's reduced-motion config.

**Loading state** — pass `loading={true}` to swap StatCards for shimmer skeletons
of identical height (112 px) so the layout doesn't shift on hydration.

**Reusability** — the bank, reconciliation and (eventually) subscription pages all
mount the same component with different `eyebrow` / `headline` / `subheadline` /
`stats` props. There is one hero — and many surfaces.

### `CockpitFooter` (`src/components/app/money/CockpitFooter.tsx`)

Per ARIA, `/app/*` does not get the marketing footer. `CockpitFooter` is just a
section connector: a `gradient-line` divider and a one-line meta strip
(`text-[12px] text-[#a3a3a3]`) for `Last sync · {relativeTime}` with a
`#34c759` status dot. Numerics render in JetBrains Mono with `tabular-nums`.

### `DesktopSidebar` & `BottomTabBar`

Both were re-toned away from the legacy `#1E40AF` blue to the canonical `#0071e3`
accent. Active items use the eyebrow chip pattern (`bg-[#0071e3]/[0.08]
text-[#0071e3]`) with a 1.5×1.5 dot on the right edge in the desktop sidebar. The
mobile pill nav swaps the old shimmer-border for the canonical multi-layer shadow
recipe — same recipe as the marketing navbar.

### `MoneyShell.TABS`

`bank` and `reconciliation` are appended (not reordered) so Segment 4 active-tab
highlighting on Invoices / Estimates / Contracts / Recurring is preserved.
