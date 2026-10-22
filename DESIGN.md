---
version: alpha
name: "Citi"
website: "https://www.citi.com"
description: >-
  A major consumer banking brand whose marketing homepage layers navy blue and cerulean on a white canvas — the top navigation carries the Citi arc wordmark in deep navy, link text runs in cerulean blue at high frequency, and call-to-action buttons echo that same cerulean tone. The system runs Interstate (a geometric highway sans in Light, Regular, and Bold weights) exclusively across every typographic tier, from a 42px Bold display headline down to 12px caption labels. Corner radii sit at a practical 8px default. The overall aesthetic is disciplined and institutional — no gradients, no expressive brand moments, just a highly legible banking system optimized for trust and information density.

seo:
  title: "Citi Design System for React — navy and cerulean blue, Interstate, 15 components"
  metaDescription: "Citi's marketing-site design system as a DESIGN.md file. Navy primary #002d72, cerulean link blue #056dae, Interstate type family, 12 color tokens, 15 components. For React, Next.js, and AI tools."
  highlights:
    - "Dual-blue hierarchy — deep navy #002d72 anchors the brand primary while cerulean #056dae carries all interactive link and CTA surfaces, appearing 115 times across the page"
    - "Interstate across every tier — the proprietary highway sans runs in three weights (Light/Regular/Bold) with no secondary family, from 42px display to 12px caption"
    - "Institutional white canvas — the page floor is pure white with light grey (#f4f4f4) section bands; no hero canvas fill, no expressive color moments outside the nav"
    - "8px default radius — consistent rounded-md on every card, button, and input; the system neither commits to sharp corners nor to generous rounding"
    - "High-density nav with utility links — the top nav bands a thin utility strip (Find a branch, Sign on) above the primary product nav (Credit Cards, Banking, Loans, Investing)"
  tags:
    - "Banking & Payments"
  lastUpdated: "2026-05-19"
  author:
    name: "Dov Azencot"
    url: "https://x.com/dovazencot"
  opening: |
    Citi's homepage is a banking page in the most literal sense: white canvas, navy top navigation, cerulean link text everywhere, card product photography, and dense utility navigation above the fold. The Citi arc logo — the two blue arcs framing the wordmark — is the only expressive brand mark on the page. Below it, the system is entirely workhorse. Where Chase leans on dark navy fills and JPMorgan applies institutional photography at scale, Citi holds everything on white and lets the cerulean link color do all the wayfinding. The hero area is a light blue-tinted band that sits just below the nav, not a full-bleed canvas; the brand color never escapes to fill a section.

    The DESIGN.md file packages the system into machine-readable tokens for React and AI tools. Inside: 12 color tokens anchored by deep navy #002d72 (the CSS --cdsbs-primary, layer: brand) and cerulean #056dae (appearing 115 times as the link and interactive surface color), with a supporting cast of near-black #333333 for body text, white for the canvas, and a light grey #f4f4f4 for alternate section fills. Typography runs Interstate exclusively — Light at 300 weight for caption and body, Regular at 400 for nav and running text, Bold at 700 for display headlines (42px) and label accents. Fifteen components cover the dual-button nav, credit card product tiles, the sign-on form, and the primary CTA.

    Feed this file to an AI coding tool and it reproduces Citi's specific moves: dual-blue wayfinding, Interstate weight system, 8px radius on every interactive surface, and white-canvas banking-first layout. The one discipline worth borrowing for any financial product: separating the brand blue (deep navy, used sparingly for the logo and primary variable) from the interactive blue (cerulean, used everywhere that needs to feel clickable), rather than collapsing both into a single brand accent. Citi's link color and button color are the same cerulean — a deliberate convention that trains users to trust the color as interactive rather than decorative.
  related:
    - href: "/design"
      title: "Browse all design systems"
      description: "The full directory of DESIGN.md files on shadcn.io, with live mockups for each."
    - href: "https://www.citi.com"
      title: "Citi — official site"
      description: "Citi's public marketing site — the source of truth for the live tokens captured in this file."
    - href: "https://github.com/google-labs-code/design.md"
      title: "The DESIGN.md specification"
      description: "Google Labs' open spec for machine-readable design system files — the format this page is built on."
  questions:
    - id: "primary-color"
      title: "What is Citi's primary brand color?"
      answer: "Citi declares deep navy #002d72 as its CSS primary (wired as --cdsbs-primary and --cdsbs-focus-ring-color) and marks it as layer: brand in the extraction. However, the color that appears most visibly across the rendered marketing page is cerulean #056dae — wired as --cdsbs-link-color and appearing 115 times (52 as text, 55 as border, 8 as background). The dual-blue system is intentional: navy anchors the brand identity and appears in the logo, the nav stripe, and the focus ring; cerulean carries every interactive surface — links, CTAs, the sign-on button. The arc wordmark uses both, with the arc itself in a saturated blue-red sweep."
    - id: "typography"
      title: "What typeface does Citi use, and what should I substitute?"
      answer: "Citi runs Interstate exclusively — a proprietary geometric highway sans-serif — in three weight variants: Interstate_Light (weight 300) for caption and small body text, Interstate_Regular (weight 400) for nav links and running text, and Interstate_Bold (weight 700) for display headlines (42px) and emphasis labels. There is no secondary or serif family. The closest open-source substitute for Interstate is Barlow (which shares the squared-off geometry) or Franklin Gothic at the bold tier. Inter works well for the Regular and Light tiers but reads slightly narrower than Interstate's characteristic width."
    - id: "canvas-color"
      title: "Why is Citi's page white instead of navy?"
      answer: "The white canvas is a deliberate accessibility and trust signal for a retail banking brand. Citi's primary audiences include credit-card applicants and banking customers reading product details and fine print — a dark or colored canvas would increase cognitive load for dense legal disclaimers and product comparison tables. The navy is held for the top navigation (branded, identity-carrying) and the Citi arc logo. Below the nav, white lets the product photography (credit card renders, lifestyle imagery) carry all visual weight without competing with a tinted canvas. Wells Fargo uses the same convention; Chase applies a darker navy primarily to its hero band."
    - id: "button-style"
      title: "What do Citi's buttons look like?"
      answer: "Citi's primary button is a cerulean #056dae fill with white text, Interstate_Regular at 16px / 400 weight, 8px corner radius, and approximately 11px top/bottom padding at 15–20px horizontal padding, rendering at 46px height. A secondary outlined variant uses the same cerulean as border and text on a white or light-blue fill. The CTA labels are short imperatives — 'Learn More', 'Apply Now', 'Explore Rewards'. There is no pill variant; every button uses the practical 8px radius shared by cards and inputs. Button hierarchy is driven by fill (primary) vs. outline (secondary) rather than by size difference."
    - id: "use-in-project"
      title: "Can I use this DESIGN.md to build a banking or fintech UI?"
      answer: "Yes — the file is built to feed into Claude, Cursor, or any AI tool that reads structured design tokens. The agent will reproduce Citi's specific moves: dual-blue wayfinding (navy brand, cerulean interactive), Interstate weight system, 8px radius on every surface, and white-canvas banking layout with light-grey section bands. The token references resolve cleanly: {colors.primary} for the brand navy, {colors.link} for cerulean, {typography.display-xl} for the 42px headline. One nuance: the system does not expose a product-tier color split (unlike Cloudflare's domain colors), so all product categories (credit cards, banking, loans, investing) share the same cerulean accent — a deliberate homogeneity that keeps the page from feeling chaotic."

mockups:
  - "marketing-hero"
  - "checkout-flow"

colors:
  primary: "#163A70"
  link: "#2A64A5"
  link-hover: "#163A70"
  ink: "#16233B"
  ink-muted: "#56637A"
  ink-subtle: "#56637A"
  canvas: "#ffffff"
  surface-1: "#F2F5FA"
  hairline: "#DCE3EE"
  hairline-strong: "#9AA7BA"
  danger: "#A3201A"
  success: "#1F7A58"
  warn: "#8A5A00"
  urgent: "#B84A36"
  next-step: "#F2A900"

typography:
  display-xl:
    fontFamily: "Interstate_Bold, sans-serif"
    fontSize: 42px
    fontWeight: 700
    lineHeight: 50px
    letterSpacing: 0
  heading-md:
    fontFamily: "Interstate_Regular, sans-serif"
    fontSize: 16px
    fontWeight: 400
    lineHeight: 24px
    letterSpacing: 0
  body-lg:
    fontFamily: "Interstate_Light, sans-serif"
    fontSize: 16px
    fontWeight: 300
    lineHeight: 24px
    letterSpacing: 0
  body-md:
    fontFamily: "Interstate_Light, sans-serif"
    fontSize: 14px
    fontWeight: 300
    lineHeight: 21px
    letterSpacing: 0
  body-sm:
    fontFamily: "Interstate_Light, sans-serif"
    fontSize: 12px
    fontWeight: 300
    lineHeight: 18px
    letterSpacing: 0
  label-md:
    fontFamily: "Interstate_Bold, sans-serif"
    fontSize: 14px
    fontWeight: 700
    lineHeight: 20px
    letterSpacing: 0
  label-sm:
    fontFamily: "Interstate_Regular, sans-serif"
    fontSize: 12px
    fontWeight: 400
    lineHeight: 18px
    letterSpacing: 0
  label-caps:
    fontFamily: "Interstate_Regular, sans-serif"
    fontSize: 12px
    fontWeight: 400
    lineHeight: 18px
    letterSpacing: "2px"
  button-md:
    fontFamily: "Interstate_Bold, sans-serif"
    fontSize: 16px
    fontWeight: 400
    lineHeight: 24px
    letterSpacing: 0
  nav-link:
    fontFamily: "Interstate_Regular, sans-serif"
    fontSize: 16px
    fontWeight: 400
    lineHeight: 30px
    letterSpacing: 0
  caption:
    fontFamily: "Interstate_Light, sans-serif"
    fontSize: 12px
    fontWeight: 400
    lineHeight: 18px
    letterSpacing: 0

rounded:
  none: "0px"
  sm: "4px"
  md: "8px"
  lg: "16px"
  pill: "50rem"

spacing:
  xs: "4px"
  sm: "8px"
  md: "12px"
  base: "16px"
  lg: "20px"
  xl: "24px"
  2xl: "32px"
  3xl: "48px"

components:
  button-primary:
    backgroundColor: "{colors.link}"
    textColor: "{colors.canvas}"
    typography: "{typography.button-md}"
    rounded: "{rounded.md}"
    padding: "11px 16px"
    height: "46px"
  button-secondary:
    backgroundColor: "{colors.canvas}"
    textColor: "{colors.link}"
    typography: "{typography.button-md}"
    rounded: "{rounded.md}"
    padding: "11px 16px"
    height: "46px"
    borderColor: "{colors.link}"
  top-nav:
    backgroundColor: "{colors.canvas}"
    textColor: "{colors.ink}"
    typography: "{typography.nav-link}"
    rounded: "{rounded.none}"
    padding: "0px 12px"
    height: "48px"
  nav-link:
    backgroundColor: "transparent"
    textColor: "{colors.link}"
    typography: "{typography.nav-link}"
    padding: "6px 20px 6px 0px"
  hero-heading:
    backgroundColor: "transparent"
    textColor: "{colors.ink}"
    typography: "{typography.display-xl}"
    padding: "0px"
  body-paragraph:
    backgroundColor: "transparent"
    textColor: "{colors.ink}"
    typography: "{typography.body-lg}"
  body-paragraph-muted:
    backgroundColor: "transparent"
    textColor: "{colors.ink-muted}"
    typography: "{typography.body-md}"
  card:
    backgroundColor: "{colors.canvas}"
    textColor: "{colors.ink}"
    typography: "{typography.body-md}"
    rounded: "{rounded.md}"
    padding: "16px"
    borderColor: "{colors.hairline}"
  card-blue:
    backgroundColor: "{colors.surface-1}"
    textColor: "{colors.ink}"
    typography: "{typography.body-md}"
    rounded: "{rounded.md}"
    padding: "16px"
  section-band:
    backgroundColor: "{colors.surface-1}"
    textColor: "{colors.ink}"
    typography: "{typography.body-md}"
    padding: "24px 16px"
  text-input:
    backgroundColor: "{colors.canvas}"
    textColor: "{colors.link}"
    typography: "{typography.body-lg}"
    rounded: "{rounded.md}"
    padding: "13px 16px"
    height: "52px"
    borderColor: "{colors.hairline-strong}"
  label:
    backgroundColor: "transparent"
    textColor: "{colors.ink}"
    typography: "{typography.label-md}"
  caption-label:
    backgroundColor: "transparent"
    textColor: "{colors.ink-muted}"
    typography: "{typography.caption}"
  footer:
    backgroundColor: "{colors.ink}"
    textColor: "{colors.canvas}"
    typography: "{typography.body-sm}"
    padding: "24px 16px"
---

## Overview

Citi's marketing homepage runs on institutional restraint. **Dual-blue wayfinding.** Where Chase paints entire hero bands in dark navy and JPMorgan applies deep-blue fills to section panels, Citi holds the entire page on white and separates brand blue (deep navy #002d72) from interactive blue (cerulean #056dae) — the former reserved for the Citi arc logo and the CSS primary variable, the latter deployed 115 times as every link, CTA, and hover accent on the page. The split is the system's organizing principle: users learn to read cerulean as "tap here" rather than "brand identity."

The system's typographic move is equally pragmatic. Interstate — a geometric highway sans — runs in three weight variants (Light 300, Regular 400, Bold 700) across every tier without a secondary family. The display headline at 42px / 700 is the loudest typographic moment; below that, the type scale drops quickly to 16px / 300 and 14px / 300 for running text. There is no editorial display treatment, no tight letter-spacing — the type does information delivery, not brand expression.

Structurally, the page is a series of white sections interrupted by light-grey (#f4f4f4) horizontal bands for alternate sections. Every interactive element — buttons, cards, inputs — uses the same 8px corner radius. The result reads more like a data-dense banking portal than a marketing site, which is precisely the intent for a primary audience of credit-card and deposit-account shoppers comparing features.

**Key Characteristics:**
- Deep navy primary (`{colors.primary}` — #002d72) appears only in the Citi arc logo and CSS variable declarations; the cerulean (`{colors.link}` — #056dae) carries all 115 rendered interactive occurrences.
- Interstate Bold at 700 weight for display (42px) and labels; Interstate Light at 300 weight for all body and caption text — no weight between 300 and 700 is used on the marketing page.
- Pure white canvas with #f4f4f4 alternate-section fills — no expressive hero canvas, no gradient, no brand-colored section fills outside the nav.
- 8px radius universally — buttons, cards, and input fields share the same `{rounded.md}` treatment.
- Dense two-tier navigation: a utility strip (branch finder, sign-on) stacked above the product nav (Credit Cards, Banking, Loans, Investing, Wealth Management).
- Credit card product tiles render at the center of the page with card photography, sub-headlines in Interstate_Regular, and dual-button CTA clusters (primary fill + secondary outline).
- Footer is near-black (`{colors.ink}` — #333333) with white text — the only dark-surface element in the system.

## Colors

### Brand

- **Primary Navy** (`{colors.primary}` — #002d72): declared as `--cdsbs-primary` and `--cdsbs-focus-ring-color`, layer: brand. Appears in the Citi arc logo and as the focus-ring rgba. Not directly rendered as a visible fill on the marketing body — its role is identity anchoring and focus accessibility.
- **Cerulean Link** (`{colors.link}` — #056dae): frequency 115. Used as text (52), border (55), background (8). The interactive system color — every CTA button fill, every hyperlink, every card header accent. Wired as `--cdsbs-link-color`.
- **Link Hover** (`{colors.link-hover}` — #002256): declared as `--cdsbs-link-hover-color`. The darkened cerulean for hover and active states — a noticeably deeper navy-blue rather than a straight tint shift.

### Text

- **Ink** (`{colors.ink}` — #333333): frequency 701 — the dominant text color for body copy, display headlines, and labels. Wired as `--cdsbs-body-color`, `--cdsbs-dark`, `--cdsbs-secondary-color`. Near-black but not pure black; the warmth is standard for banking readability.
- **Ink Muted** (`{colors.ink-muted}` — #666666): frequency 12. Secondary body text, caption footnotes, and sub-label tones.
- **Ink Subtle** (`{colors.ink-subtle}` — #555555): frequency 4. A mid-grey between ink and muted, wired as `--cdsbs-gray-700`.

### Surface

- **Canvas** (`{colors.canvas}` — #ffffff): frequency 72. The page floor and card fill — pure white throughout. Wired as `--cdsbs-body-bg`, `--cdsbs-white`.
- **Surface-1** (`{colors.surface-1}` — #f4f4f4): frequency 9. Alternate-section band fills and the light-blue-tinted hero area. The extractor merged several near-white section tints into this cluster — all carry the same light-grey or faint blue cast that differentiates them from the pure white canvas.

### Hairline

- **Hairline** (`{colors.hairline}` — #dddddd): frequency 4. Card and section dividers. Wired as `--cdsbs-border-color` cluster.
- **Hairline Strong** (`{colors.hairline-strong}` — #888888): frequency 2. Input field border in resting state.

### Semantic

- **Danger** (`{colors.danger}` — #d60000): wired as `--cdsbs-danger`, `--cdsbs-form-invalid-color`. Form validation error state.
- **Success** (`{colors.success}` — #006e0a): wired as `--cdsbs-success`, `--cdsbs-form-valid-color`. Form validation success state.

## Typography

### Font Family

The system runs **Interstate** exclusively — a geometric sans-serif originally designed for U.S. highway signage, licensed as Interstate_Light, Interstate_Regular, and Interstate_Bold. Fallback is `sans-serif`. There is no secondary display family, no serif tier, no monospace voice. **Interstate_Bold** handles every emphasis moment — display headlines at 42px, bold labels, and emphasis spans inside body copy. **Interstate_Light** handles all running text.

### Hierarchy

| Token | Size | Weight | Line Height | Use |
|---|---|---|---|---|
| `{typography.display-xl}` | 42px | 700 | 50px | Primary hero headline ("Choose the right Citi® credit card for you") |
| `{typography.heading-md}` | 16px | 400 | 24px | Section sub-headings ("Great for Balance Transfers") |
| `{typography.body-lg}` | 16px | 300 | 24px | Hero body paragraph and section lead copy |
| `{typography.body-md}` | 14px | 300 | 21px | Card descriptive text and feature lists |
| `{typography.body-sm}` | 12px | 300 | 18px | Caption, fine print, footnotes |
| `{typography.label-md}` | 14px | 700 | 20px | Emphasis labels and card feature highlights |
| `{typography.label-sm}` | 12px | 400 | 18px | Metadata and disclaimer labels |
| `{typography.label-caps}` | 12px | 400 | 18px | All-caps section labels with 2px letter-spacing |
| `{typography.button-md}` | 16px | 400 | 24px | Primary and secondary button labels |
| `{typography.nav-link}` | 16px | 400 | 30px | Product nav and utility nav links |
| `{typography.caption}` | 12px | 400 | 18px | Fine print and legal disclaimer text |

### Principles

The weight system has a binary gap: 300 (Light) for informational text and 700 (Bold) for emphasis, with 400 (Regular) carrying nav links and inline elements. There is no semibold or medium tier. The 42px display headline is the single loudest typographic moment; everything below drops to 16px or 14px. This keeps the display heading functionally large without creating a multi-tier scale that would introduce visual noise on a dense banking page.

### Note on Font Substitutes

Interstate is a licensed family. **Barlow** at the same weight spread is the closest open-source substitute — the squared-off geometry and highway-legibility origins transfer well. **DM Sans** works for the Light and Regular tiers but lacks Interstate's characteristic width at Bold. For a retail banking UI where Interstate feels too branded, **Source Sans Pro** at 300/400/700 is a safe system-neutral alternative.

## Layout

### Spacing System

- **Base unit:** 8px.
- **Tokens:** `{spacing.xs}` 4px · `{spacing.sm}` 8px · `{spacing.md}` 12px · `{spacing.base}` 16px · `{spacing.lg}` 20px · `{spacing.xl}` 24px · `{spacing.2xl}` 32px · `{spacing.3xl}` 48px.
- **Internal card padding:** `{spacing.base}` (16px) on product tiles; `{spacing.xl}` (24px) on hero band.
- **Button padding:** 11px top/bottom, 16px horizontal — the asymmetric vertical keeps the 46px button height without extra padding tokens.
- **Nav link padding:** `{spacing.lg}` (20px) right-only for the cascading utility-link strip.

### Grid & Container

- **Max content width:** approximately 1280px, with a secondary 1024px max on the product-card grid.
- **Hero band:** a full-width light-tinted surface (`{colors.surface-1}`) holding the headline, a lifestyle image or card photograph, and a dual-CTA cluster.
- **Product card grid:** 3-column or 4-column layout of credit card tiles at desktop — each tile holds card photography, a short feature headline, a feature list, and a dual-button cluster (primary fill + secondary outline).
- **Alternate sections:** white and light-grey bands alternate below the hero.

### Rhythm

The page moves in dense horizontal bands — nav, hero, 3-up cards, feature highlight, 2-up feature row, editorial image, footer. There is no breathing room between bands beyond a single `{spacing.xl}` gap; the tempo is intentionally compact for a banking homepage where users scan rather than read.

## Elevation

The system uses **minimal shadow**. Cards use a 1px `{colors.hairline}` border as the primary separation mechanism, not shadow. Depth comes from canvas-color contrast between white cards and the grey section bands. The CSS declares `--cdsbs-box-shadow-sm: 0 0.125rem 0.25rem rgba(0,0,0,.075)` for subtle interactive hover states on cards, but this shadow is nearly invisible in practice.

- **Flat:** all sections, all body text — 99% of surfaces.
- **Card hover:** `rgba(0,0,0,.075)` soft halo on product card hover.
- **Input focus:** `rgba(0,45,114,.25)` focus ring at 4px width using the primary navy — the only visible focus-ring system in the page.

## Shapes

The radius scale is compact and consistent:

- `{rounded.none}` 0px — section bands and the hero background.
- `{rounded.sm}` 4px — small form elements and inner chip labels.
- `{rounded.md}` 8px — the default. Buttons (23 occurrences), input fields, product cards, feature tiles.
- `{rounded.lg}` 16px — larger card treatments (6 occurrences).
- `{rounded.pill}` 50rem — the declared CSS border-radius-pill variable; used for fully circular chips in the UI library.

The dominant radius is 8px. The system makes no expressive use of rounding — 8px is a functional minimum for banking readability, not a design statement.

## Components

**`button-primary`** — Cerulean `{colors.link}` fill, white text, Interstate_Bold at `{typography.button-md}`, `{rounded.md}` 8px, 11×16px padding, 46px height. "Apply Now", "Learn More", and "Explore Rewards" are the canonical instances.

**`button-secondary`** — White fill, cerulean text and 1px cerulean border, same typography and radius. Used alongside `button-primary` in dual-button CTA clusters on product tiles.

**`top-nav`** — White canvas surface, 48px height, holds the Citi arc logo flush left and product nav links center. A secondary utility strip above at approximately 32px height in lighter grey holds branch-finder, sign-on, and language links.

**`nav-link`** — Transparent background, cerulean text in `{typography.nav-link}`, 6px top / 20px right padding for the cascading horizontal strip. No hover fill; underline appears on hover.

**`hero-heading`** — Near-black `{colors.ink}` text at `{typography.display-xl}` (42px / 700). The dominant display moment on the page — "Choose the right Citi® credit card for you" is the canonical instance.

**`body-paragraph`** — Near-black `{colors.ink}` text at `{typography.body-lg}` (16px / 300). Hero sub-paragraph and section lead copy.

**`body-paragraph-muted`** — `{colors.ink-muted}` (#666666) at `{typography.body-md}` for secondary feature descriptions and fine print.

**`card`** — White surface, 1px `{colors.hairline}` border, `{rounded.md}` 8px radius, 16px padding. The default credit card product tile — holds card photography, heading, feature list, and dual CTA.

**`card-blue`** — `{colors.surface-1}` light-grey fill, `{rounded.md}` radius, 16px padding. Used for the hero band and alternate section panels where card content needs light tinting.

**`section-band`** — `{colors.surface-1}` fill, full-width, 24px vertical padding. The alternating-section device that creates visual rhythm without a separate surface color.

**`text-input`** — White fill, cerulean text (inherited from the sign-on form context), `{rounded.md}` 8px radius, 13×16px padding, 52px height, `{colors.hairline-strong}` 1px border. The sign-on username/password fields are the canonical instances.

**`label`** — Near-black text at `{typography.label-md}` (14px / 700). Inline emphasis labels and card feature call-outs.

**`caption-label`** — `{colors.ink-muted}` at `{typography.caption}` (12px / 400). Disclaimer text and legal footnotes below product cards.

**`footer`** — `{colors.ink}` (#333333) fill, white text, `{typography.body-sm}` (12px / 300), 24×16px padding. The footer is the only dark-surface element in the system — a conventional banking footer with three to four column product-link groups.

## Do's and Don'ts

**Do** treat cerulean `{colors.link}` as the sole interactive signal. Every tappable surface on the page uses this color — buttons, links, form highlights. Introducing a second accent color for CTAs would break the user's learned signal that cerulean means "action."

**Do** use Interstate_Bold (700) only for the 42px display headline and emphasis labels. The weight gap between Light (300) and Bold (700) is the system's typographic hierarchy; adding a 600 semibold tier would compress the distinction.

**Do** keep cards and buttons at `{rounded.md}` 8px. The consistent radius across every interactive element creates the visual grammar of "this is a tappable banking surface" — mismatching radii on sibling components breaks that grammar.

**Do** use `{colors.surface-1}` (#f4f4f4) for alternate-section fills rather than tinting with cerulean. The light-grey creates rhythm without introducing a second chromatic voice that would compete with the cerulean interactive signals.

**Don't** fill hero sections with the primary navy `{colors.primary}` (#002d72) as a canvas color. The navy is a brand identity token, not a surface token — Citi does not put the brand color on the floor. Using it as a hero fill would contradict the system's entire white-canvas convention.

**Don't** use `{colors.ink}` (#333333) for interactive text elements. The ink color reads as "non-interactive body text"; any text the user should click must be in `{colors.link}` cerulean. Mixing the two would break the single interactive-color contract.

**Don't** introduce a gradient or expressive hero fill. The page's authority comes from its white restraint — a gradient hero would read as consumer fintech rather than institutional banking and undercut the trust signal.

**Don't** go below `{rounded.md}` 8px on any interactive surface. The system has 23 occurrences of 8px radius and only 5 at 4px (all on small internal chips). Sharp-cornered buttons at 0–4px would feel jarring against the card and input rounding.

## Known Gaps

- **Brand red / Citi arc color:** the Citi logo includes a distinctive red arc, but no red token appears in the rendered marketing page. The arc's red is logo-only, not a system color; it is absent from the token set.
- **Hover states beyond link-hover:** the system documents `{colors.link-hover}` for text links but does not expose hover states for button fills or card overlays from the captured marketing surface.
- **Mobile nav:** the two-tier desktop nav collapses to a hamburger at mobile; the collapsed nav surface and flyout drawer are not represented here.
- **Sign-on form state matrix:** the input captures only the resting state. Error, success, and focus states are wired as CSS variables (`--cdsbs-form-invalid-color`, `--cdsbs-form-valid-color`, `--cdsbs-focus-ring-color`) but not visually captured.
- **Product-tier color variants:** Citi's product family (Double Cash, Custom Cash, Strata Premier, Diamond Preferred) uses slightly different card photography tones but the same system tokens — no per-product color split is captured.
- **Dark mode:** the system has no dark-mode variant on the marketing site; the `--cdsbs-*` variable system does not declare dark-context overrides.
