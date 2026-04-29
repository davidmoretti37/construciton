# DESIGN.md — Clean Minimal

## 1. Visual Theme & Atmosphere

A gallery-like expanse of near-white where every element earns its pixel. Inspired by Vercel and Apple — this is minimalism as engineering principle, not aesthetic preference. The interface retreats until content is all that remains. Precision spacing, compressed typography, and whisper-level shadows create a system that feels machined rather than designed.

The color story is achromatic — warm near-whites and cool near-blacks — with a single accent color reserved exclusively for interactive elements. This singular accent in a sea of neutrals gives every clickable element unmistakable visibility.

**Mood:** Gallery curator's desk. Precise, airy, confident.

## 2. Color Palette & Roles

### Backgrounds
- **Canvas** (`#fafafa`): Page background — not pure white, the slight warmth prevents sterility
- **Surface** (`#f5f5f5`): Cards, elevated containers, alternate section backgrounds
- **Elevated** (`#efefef`): Hover states, active surfaces

### Text
- **Primary** (`#171717`): Headlines, primary content — near-black, not pure black
- **Secondary** (`#525252`): Body text, descriptions
- **Muted** (`#a3a3a3`): Captions, metadata, placeholders
- **Disabled** (`#d4d4d4`): Disabled states

### Accent (ONE color — the entire interactive budget)
- **Accent** (`#0071e3`): CTAs, links, focus rings, active states
- **Accent Hover** (`#005bb5`): Darker on hover
- **Accent Light** (`rgba(0, 113, 227, 0.08)`): Subtle accent backgrounds

### Borders (shadow-as-border technique — Vercel style)
- **Border Subtle** (`rgba(0, 0, 0, 0.06)`): Default card outlines
- **Border Standard** (`rgba(0, 0, 0, 0.10)`): Inputs, interactive borders
- **Border Strong** (`rgba(0, 0, 0, 0.15)`): Focused/active borders
- **Ring Border**: Use `ring-1 ring-black/5` instead of `border` — looks more refined

### CSS Variables
```css
:root {
  --bg-canvas: #fafafa;
  --bg-surface: #f5f5f5;
  --bg-elevated: #efefef;
  --text-primary: #171717;
  --text-secondary: #525252;
  --text-muted: #a3a3a3;
  --accent: #0071e3;
  --accent-hover: #005bb5;
  --border-subtle: rgba(0, 0, 0, 0.06);
  --border-standard: rgba(0, 0, 0, 0.10);
}
```

## 3. Typography Rules

### Font Family
- **Heading**: `"Geist Sans"` or `"Inter"` — clean geometric sans-serif
- **Body**: `"Inter"` — screen-optimized, excellent legibility
- **Mono**: `"Geist Mono"` or `"JetBrains Mono"` — technical labels and code
- Load via Google Fonts if Geist unavailable: `Inter:wght@300;400;500;600;700`
- For Geist: install via `npm install geist` or use `next/font`

### Hierarchy

| Role | Font | Size | Weight | Line Height | Letter Spacing | Tailwind |
|------|------|------|--------|-------------|----------------|----------|
| Display Hero | Inter/Geist | 64px (4rem) | 700 | 1.0 | -0.04em | `text-6xl font-bold leading-none tracking-tighter` |
| Display | Inter/Geist | 48px (3rem) | 600 | 1.05 | -0.03em | `text-5xl font-semibold leading-tight` |
| Section Heading | Inter/Geist | 36px (2.25rem) | 600 | 1.1 | -0.02em | `text-4xl font-semibold leading-tight tracking-tight` |
| Sub-heading | Inter/Geist | 24px (1.5rem) | 600 | 1.2 | -0.01em | `text-2xl font-semibold` |
| Card Title | Inter | 18px (1.125rem) | 600 | 1.3 | -0.01em | `text-lg font-semibold` |
| Body Large | Inter | 18px (1.125rem) | 400 | 1.7 | 0 | `text-lg leading-relaxed` |
| Body | Inter | 16px (1rem) | 400 | 1.6 | 0 | `text-base leading-relaxed` |
| Small | Inter | 14px (0.875rem) | 400 | 1.5 | 0 | `text-sm` |
| Caption | Inter | 12px (0.75rem) | 500 | 1.4 | 0.03em | `text-xs font-medium tracking-wide` |
| Label | Inter | 11px (0.6875rem) | 600 | 1.3 | 0.08em | `text-[11px] font-semibold tracking-wider uppercase` |

### Rules
- Aggressive negative tracking on headings: `-0.04em` hero, `-0.02em` sections
- Three weights only: 400 (body), 500 (UI), 600-700 (headings)
- Body line-height: 1.6-1.7 for comfortable reading
- Responsive type: `text-3xl md:text-4xl lg:text-6xl`
- Text color hierarchy: always use 3 levels (primary, secondary, muted) — never just one

## 4. Component Stylings

### Buttons
**Primary (Accent)**
```
bg-[#0071e3] text-white px-5 py-2.5 rounded-lg font-medium text-sm
hover:bg-[#005bb5] active:scale-[0.98]
transition-all duration-200
```

**Secondary (Dark)**
```
bg-[#171717] text-white px-5 py-2.5 rounded-lg font-medium text-sm
hover:bg-[#2d2d2d]
transition-all duration-200
```

**Ghost**
```
bg-white text-[#171717] px-5 py-2.5 rounded-lg font-medium text-sm
ring-1 ring-black/10
hover:bg-[#f5f5f5] hover:ring-black/15
transition-all duration-200
```

**Pill Badge**
```
bg-[#f0f7ff] text-[#0068d6] px-3 py-1 rounded-full text-xs font-medium
ring-1 ring-[#0071e3]/10
```

### Cards
```
bg-white rounded-xl p-6 md:p-8
ring-1 ring-black/[0.05]
shadow-[0_1px_2px_rgba(0,0,0,0.04),0_1px_3px_rgba(0,0,0,0.06)]
hover:shadow-[0_2px_4px_rgba(0,0,0,0.04),0_4px_8px_rgba(0,0,0,0.06),0_8px_16px_rgba(0,0,0,0.04)]
hover:-translate-y-0.5
transition-all duration-300
```

### Inputs
```
bg-white text-[#171717] px-4 py-2.5 rounded-lg text-sm
ring-1 ring-inset ring-black/10 placeholder:text-[#a3a3a3]
focus:ring-2 focus:ring-[#0071e3] focus:ring-inset
transition-all duration-200
```

### Navigation
```
fixed top-4 left-1/2 -translate-x-1/2 z-50
bg-white/80 backdrop-blur-xl rounded-full
px-6 py-3
ring-1 ring-black/[0.05]
shadow-[0_1px_2px_rgba(0,0,0,0.04),0_1px_3px_rgba(0,0,0,0.06)]
```

### Section Divider (premium gradient fade)
```
h-px bg-gradient-to-r from-transparent via-black/10 to-transparent
```

## 5. Layout Principles

### Spacing (8px grid)
| Token | Value | Tailwind | Use |
|-------|-------|----------|-----|
| xs | 4px | `gap-1` | Icon gaps |
| sm | 8px | `gap-2` | Tight element spacing |
| md | 16px | `gap-4` | Standard gaps |
| lg | 24px | `gap-6` | Related groups |
| xl | 32px | `gap-8` | Card padding |
| 2xl | 48px | `gap-12` | Component groups |
| 3xl | 80px | `py-20` | Section padding mobile |
| 4xl | 112px | `md:py-28` | Section padding tablet |
| 5xl | 144px | `lg:py-36` | Section padding desktop |

### Section Spacing (MORE generous than dark themes)
```
py-20 md:py-28 lg:py-36  /* clean minimal needs MORE whitespace */
```

### Container
```
max-w-6xl mx-auto px-6 md:px-8 lg:px-12
```
Note: narrower than dark themes (6xl vs 7xl) — content breathes more in open space.

### Grid Patterns
- Hero: centered, `max-w-3xl mx-auto text-center`
- Features: `grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8`
- Split: `grid-cols-12` with `col-span-5` / `col-span-7` (asymmetric)
- Text content: constrain to `max-w-2xl` — premium sites never let text run wide

### Border Radius
- Buttons: `rounded-lg` (8px)
- Cards: `rounded-xl` (12px) or `rounded-2xl` (16px)
- Images: `rounded-2xl` (16px)
- Badges: `rounded-full`
- Nav: `rounded-full` (floating pill)
- **Nested rule**: parent radius = child radius + padding

## 6. Depth & Elevation

### Multi-Layer Shadow System
| Level | Treatment | Use |
|-------|-----------|-----|
| Flat | No shadow, `ring-1 ring-black/5` | Page sections, flat containers |
| Subtle | `0 1px 2px rgba(0,0,0,0.04), 0 1px 3px rgba(0,0,0,0.06)` | Cards at rest |
| Elevated | `0 2px 4px rgba(0,0,0,0.04), 0 4px 8px rgba(0,0,0,0.06), 0 8px 16px rgba(0,0,0,0.04)` | Cards on hover, active elements |
| Float | `0 4px 6px rgba(0,0,0,0.02), 0 12px 24px rgba(0,0,0,0.06), 0 24px 48px rgba(0,0,0,0.08)` | Modals, dropdowns |
| Focus | `ring-2 ring-[#0071e3]` | Focused interactive elements |

### Key Principles
- ALWAYS use multi-layer shadows (2-3 layers minimum)
- Max opacity per shadow layer: 0.08 (never heavy shadows)
- Use `ring-1 ring-black/5` instead of `border` — looks more refined
- Cards should have subtle shadow at rest, elevated shadow on hover

## 7. Do's and Don'ts

### Do
- Use `#fafafa` background — not pure white, the warmth matters
- Use `#171717` for headings — not pure black
- Apply multi-layer shadows with low opacity (0.02-0.08)
- Use `ring-1 ring-black/5` instead of `border border-gray-200`
- Apply negative tracking on ALL headings
- Use 3-level text color hierarchy everywhere (primary, secondary, muted)
- Add hover transitions to everything: `transition-all duration-200`
- Use floating pill navigation: `bg-white/80 backdrop-blur-xl rounded-full`
- Give sections GENEROUS padding: `py-20 md:py-28 lg:py-36`
- Use gradient dividers: `from-transparent via-black/10 to-transparent`

### Don't
- Don't use pure `#ffffff` background — use `#fafafa` (not sterile)
- Don't use pure `#000000` text — use `#171717` (softer)
- Don't use single-layer shadows — always multi-layer
- Don't use `border` for cards — use `ring-1 ring-black/5`
- Don't use warm colors beyond the one accent
- Don't skip responsive type scaling
- Don't let text width exceed `max-w-2xl` for body content
- Don't use heavy shadows (> 0.1 opacity per layer)
- Don't use uniform padding on cards (`p-6`) — use `px-8 py-6` (wider horizontal)
- Don't forget the nested border-radius rule

## 8. Responsive Behavior

### Breakpoints
| Name | Width | Key Changes |
|------|-------|-------------|
| Mobile | <640px | Single column, `text-3xl` hero, `py-20` sections |
| Tablet | 640-1024px | 2-column grids, `text-4xl` hero, `py-28` sections |
| Desktop | >1024px | 3-column grids, `text-6xl` hero, `py-36` sections |

### Collapsing Strategy
- Hero: `text-3xl md:text-4xl lg:text-6xl`, tracking adjusts proportionally
- Navigation: floating pill → simplified mobile nav
- Cards: 3-col → 2-col → stacked
- Section padding: `py-20 md:py-28 lg:py-36`
- Images: maintain aspect ratios, scale proportionally

## 9. Agent Prompt Guide

### Quick Reference
- Background: `#fafafa` (canvas), `#f5f5f5` (surface), `#ffffff` (cards)
- Text: `#171717` (primary), `#525252` (secondary), `#a3a3a3` (muted)
- Accent: `#0071e3` (CTA), `#005bb5` (hover)
- Borders: `ring-1 ring-black/5` (preferred over border)
- Shadows: multi-layer, max 0.08 opacity
- Fonts: Inter (everything), Geist if available

### Component Prompts
- "Hero: `#fafafa` bg. Inter 64px weight 700, tracking -0.04em, `#171717`. Subtitle 18px weight 400, `#525252`, leading-relaxed. Blue CTA `#0071e3`, white text, `rounded-lg px-5 py-2.5`. Ghost: white bg, `ring-1 ring-black/10`."
- "Card: white bg, `ring-1 ring-black/[0.05]`, `rounded-xl p-8`. Multi-layer shadow: `0 1px 2px rgba(0,0,0,0.04), 0 1px 3px rgba(0,0,0,0.06)`. Hover: elevated shadow + `-translate-y-0.5`."
- "Nav: floating pill `bg-white/80 backdrop-blur-xl rounded-full`, centered, `ring-1 ring-black/5`. Links: Inter 14px weight 500, `#525252`. CTA: `bg-[#0071e3] text-white rounded-full px-4 py-2`."
- "Section divider: `h-px bg-gradient-to-r from-transparent via-black/10 to-transparent`."


---

# Creative Layout & Interaction Patterns

This section is MANDATORY for every build. It defines how sections are laid out, how they connect,
and what visual richness is required. These patterns prevent the "centered text + grid below"
repetition that makes AI-generated sites feel generic.

## Section Layout Variety (CRITICAL)

NEVER use the same layout pattern for consecutive sections. Each page must use at least 3 different
patterns from this list:

### Pattern 1: Full Viewport Hero
```
min-h-screen, centered content, multiple background layers (gradient blobs + particles + dot pattern)
```

### Pattern 2: Asymmetric Split (5/7 or 4/8)
```html
<div class="grid grid-cols-12 gap-8 lg:gap-16 items-center">
  <div class="col-span-12 lg:col-span-5"><!-- Text content --></div>
  <div class="col-span-12 lg:col-span-7"><!-- Visual/image/card --></div>
</div>
```
Use for: About sections, feature highlights, project spotlights. Flip direction on alternating sections.

### Pattern 3: Sticky Sidebar
```html
<div class="grid grid-cols-12 gap-16">
  <div class="col-span-4">
    <div class="sticky top-32"><!-- Section label + heading, stays pinned --></div>
  </div>
  <div class="col-span-8"><!-- Scrolling content: cards, text blocks, etc. --></div>
</div>
```
Use for: Skills, experience, process sections. The heading stays visible while content scrolls.

### Pattern 4: Bento Grid (variable card sizes)
```html
<div class="grid grid-cols-4 gap-4">
  <div class="col-span-2 row-span-2"><!-- Large featured item --></div>
  <div class="col-span-1"><!-- Small item --></div>
  <div class="col-span-1"><!-- Small item --></div>
  <div class="col-span-2"><!-- Wide item --></div>
</div>
```
Use for: Projects, portfolio, skills. Featured items are LARGER than others.

### Pattern 5: Full-Bleed Image with Overlapping Card
```html
<div class="relative">
  <div class="w-full aspect-[21/9] rounded-2xl overflow-hidden">
    <img class="object-cover w-full h-full" />
  </div>
  <div class="absolute -bottom-12 left-8 right-8 md:left-16 md:right-auto md:max-w-lg bg-surface rounded-xl p-8 shadow-float border">
    <!-- Content card overlapping the image -->
  </div>
</div>
```
Use for: Featured project, hero variant, testimonial.

### Pattern 6: Horizontal Scroll Strip
```html
<div class="overflow-x-auto scrollbar-hide -mx-6 px-6">
  <div class="flex gap-6 w-max">
    <!-- Cards in horizontal row, scrollable -->
  </div>
</div>
```
Use for: Tech stack, logos, secondary projects, testimonials.

## Atmospheric Layers (MANDATORY per section)

Every section MUST have at least 2 of these background treatments. They must be VISIBLE (not ghost-level opacity):

| Layer | Component/CSS | Opacity Range | Purpose |
|-------|--------------|---------------|---------|
| Gradient blob | `div.absolute.rounded-full.blur-[120px]` | 0.06-0.12 | Ambient color atmosphere |
| Particles | `<Particles quantity={60-100} color="accent" size={0.4} />` | full | Floating depth particles |
| Dot pattern | `<DotPattern className="opacity-[0.08-0.15]" />` | 0.08-0.15 | Subtle texture |
| Gradient line | `h-px bg-gradient-to-r from-transparent via-accent/20 to-transparent` | — | Section divider |
| Noise texture | `bg-[url('/noise.png')] opacity-[0.03]` | 0.02-0.04 | Film grain texture |
| Accent glow | `shadow-[0_0_40px_rgba(accent,0.15)]` | — | Featured item emphasis |

### Gradient Blob Placement Rules:
- Hero: 2 blobs (one accent color top-right, one secondary bottom-left), 600-800px, blur-[120px]
- Content sections: 1 blob centered behind main content, 400-600px, blur-[100px]
- Never place blob at center of viewport — offset to corners or edges
- Blobs should be accent color at LOW but VISIBLE opacity (0.06-0.12, not 0.02)

## Scroll Interactions

| Element | Interaction | Implementation |
|---------|------------|----------------|
| Images | Parallax | `<Parallax speed={0.15}>` — image moves slower than scroll |
| Section headings | Word-by-word reveal | `<TextReveal split="words" trigger="scroll" stagger={0.06}>` |
| Cards | Staggered entrance | `<StaggerGrid stagger={0.1} from="start" y={40}>` |
| Stat numbers | Count up on scroll | `<NumberTicker value={N}>` inside scroll-triggered container |
| Page progress | Thin accent bar | `<ScrollProgress color="accent" height={2}>` at top of page |
| Featured items | Scale up on approach | GSAP ScrollTrigger: scale 0.95 → 1.0 as element enters view |

## Featured Item Treatment

When a project/item is "featured" it MUST be visually distinct:
- Span 2 columns in a grid (or full width)
- Add `<BorderBeam>` animated border accent
- Larger image or visual area
- Accent-colored glow shadow: `shadow-[0_0_40px_rgba(accent,0.12)]`
- Consider a gradient top-border: `before:h-px before:bg-gradient-to-r before:from-transparent before:via-accent before:to-transparent`

Non-featured items should be noticeably smaller/simpler to create hierarchy.

## Section Connectors (between sections)

NEVER have two sections just end/begin with empty space. Add at least one:
- **Gradient fade line**: `<div class="h-px bg-gradient-to-r from-transparent via-white/10 to-transparent" />`
- **Overlapping element**: A card or image that crosses the section boundary (negative margin)
- **Background blend**: Bottom of one section fades into the top of the next via gradient overlay
- **Decorative dots**: Small accent-colored dots in a horizontal line as a visual break

## Page Load Choreography

On initial page load, elements should appear in a STAGGERED sequence, not all at once:
1. Navigation fades in (delay: 0ms)
2. Background layers fade in (delay: 100ms)
3. Eyebrow text appears (delay: 200ms)
4. Headline reveals word-by-word (delay: 300ms, stagger: 60ms per word)
5. Subtitle fades up (delay: 500ms)
6. CTA buttons fade up (delay: 700ms)
7. Scroll indicator appears (delay: 1000ms)

This creates a cinematic entrance that signals quality immediately.
