# Brand: match legiitkeywords.com

Legiit Overviews uses the Legiit Keywords design system. Values below were read from the live site's stylesheet (Tailwind v4.3.3) and computed styles on 2026-10-07.

## Tokens

Font: **Inter Variable** (`@fontsource-variable/inter`), fallback `Inter, ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif`. Body text is 14px with a 21px line height.

```css
@theme {
  --font-sans: "Inter Variable", Inter, ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
  --color-ink: #0f172a;           /* primary text */
  --color-ink-muted: #64748b;     /* secondary text */
  --color-ink-soft: #94a3b8;      /* tertiary text, placeholders */
  --color-line: #e5e7eb;          /* borders */
  --color-line-strong: #d1d5db;
  --color-surface: #fff;
  --color-surface-alt: #f7f7fb;   /* page background in the app and login */
  --color-surface-sunken: #f1f1f6;
  --color-brand: #8a12dc;         /* purple: buttons, links, eyebrows, numbers */
  --color-brand-strong: #6e0db1;  /* hover */
  --color-brand-soft: #e9d5ff;    /* chips, tinted text on dark */
  --color-brand-faint: #f3e8ff;   /* chip and number-badge backgrounds */
  --color-plum: #12081f;          /* dark hero and login panel background */
  --color-good: #15803d;   --color-good-soft: #dcfce7;
  --color-warn: #b45309;   --color-warn-soft: #fef3c7;
  --color-bad: #b91c1c;    --color-bad-soft: #fee2e2;
  --radius-card: .75rem;          /* 12px cards */
}
```

Logo mark: 28px rounded square in the header (`h-7 w-7 rounded-lg`; the SVG uses rx 16 on 64) with a diagonal gradient `#8A12DC` to `#1863DC`, white glyph. Legiit Keywords uses a magnifier; Legiit Overviews uses a sparkle/overview glyph in the same style. Wordmark: "Legiit" in ink, product word in brand purple, 15px, weight 700, tight tracking ("Legiit" + "Overviews"). The gradient headline accent runs from `#a855f7` through `#d946ef` to `#ec4899`.

## Type scale

| Use | Size / line height | Weight | Tracking | Color |
|---|---|---|---|---|
| Hero h1 | 48px / 52.8px | 700 | -1.2px | white on plum; accent line in the purple-pink gradient |
| Section h2 | 30px / 36px | 700 | -0.75px | ink |
| Page title in app | 24px | 600 | tight | ink |
| Card title h3 | 16px / 24px | 700 | normal | ink |
| Eyebrow | 11px / 16.5px | 600 | 1.98px (0.18em), uppercase | brand on light, brand-soft on dark |
| Body | 14px / 21px | 400 | normal | ink or ink-muted |
| Small meta | 12px | 400-500 | normal | ink-muted / ink-soft |

## Components

- **Header:** white at 90% opacity with backdrop blur, 52px tall, bottom border `line`, content constrained to about 992px (`max-w-5xl`) centered. Left: logo mark plus wordmark. Right: plain ink-muted 14px links, then a small pill CTA.
- **Buttons:** fully rounded pills. Primary: `brand` background, white 600 text, `shadow-sm`; small 12px with 6x12 padding, medium 14px 8x16, large 16px 10x20 (hero 18px with a chevron). Hover `brand-strong`. Secondary: white with `line` border and ink text, same pill shape.
- **Cards:** white, 1px `line` border, 12px radius, soft shadow (`0 1px 2px rgba(0,0,0,.05)`), 20-24px padding.
- **Browser-frame cards** (marketing): a 36px top bar in `surface-alt` with three grey dots and a small pill showing the page name.
- **Stat cards:** a row of 4 cards; small ink-muted label top-left with a thin line icon top-right; big number 24px 700 (brand purple for the hero metric, green for good, ink otherwise); one-line caption in ink-muted 12px.
- **Numbered rows:** a 28px circle in `brand-faint` with a brand-colored number; title 15px 600; meta line in ink-muted 12px; right-aligned status chips.
- **Status chips:** rounded-full, 12px 500 text, 2x8 padding, a 6px dot in the text color. Green `good` on `good-soft` ("Clear opening", "Reachable"), amber `warn` on `warn-soft` ("Partial opening"), red `bad` on `bad-soft`, purple `brand` on `brand-faint` for neutral/category tags. Grey tags: ink-muted on `surface-sunken`.
- **Progress bars:** 6px tall, rounded, brand purple fill on `surface-sunken`.
- **Section labels inside cards:** uppercase 11px tracked ("WHY THIS SITE CAN WIN IT", "DEMAND", "OPENING"). The live site uses `ink-soft`; the app renders them `ink-muted` on purpose, because `#94a3b8` on white is 2.6:1 and fails AA.
- **Inputs:** 40px tall, white, `line` border, 8px radius (rounded-full when paired with a pill button on dark), placeholder `ink-soft`, focus ring brand.
- **Check list items:** small brand-colored check icon then ink-muted 14px text.

## Layouts

- **Marketing page:** white header; dark hero on `plum` with a subtle dot grid (`radial-gradient(#ffffff0f 1px, transparent 1px)` at 22px) and a large blurred purple glow; left column eyebrow + h1 + paragraph (`white/75`) + input-and-button row + small note; right column a white product card. Below: a white strip of four check-marked proof points. Sections alternate white and `surface-alt` backgrounds with about 96px vertical padding, each with eyebrow + h2 + muted intro. Final CTA section repeats the dark hero style. Footer: white, wordmark + "· A Legiit product", links row, divider, small legal links, copyright.
- **Login:** split screen. Left half `plum` with dot grid and glow: logo top-left, eyebrow, two-line headline with the gradient accent line, three check-marked points, "A Legiit product." bottom-left. Right half `surface-alt` with a centered white card (about 384px): "Sign in" 24px 700, muted subline, Email label and input, full-width primary button "Email me a sign-in link", small muted terms line, "Have a password? Sign in with it instead" link.
- **App / report pages:** white header (logo, right-side pill tag or account menu), page background `surface-alt` or white, content column about 864px (`max-w-4xl`) centered. Page header: small uppercase muted kicker ("AI OVERVIEW"), 24px title, muted meta line ("Sep 21, 2026 · US · en"), a one-paragraph summary at 18px. Then a 4-up stat card row, then section headings at 18px 600 with cards below. Recommendation cards: numbered circle at left, title and action chip on one line, body text, a 3-column label/value row (uppercase labels), grey keyword tags, bullet lists, and a bottom row of grey tags separated by a divider.

## Verification

Re-verified on 2026-10-07 against the live stylesheet (`/_next/static/css/...css` on legiitkeywords.com): every token above is present with the same value, the font is Inter Variable, buttons are `rounded-full`, cards use `--radius-card: .75rem`. Two app deviations found and scheduled for session 4 of `PLAN.md`: `--color-ink-muted` must be `#64748b` (the app had darkened it) and input focus rings must use `ring-brand-soft`. To re-check later: download the homepage, follow its stylesheet link, and grep the hex values in the Tokens block.
