# BorrowBuddy · Buddy Brackets

Approved direction B, selected by the user on 21 October 2026. Two equal,
opposing modules hold a shared opening: lending between peers. Keep the original
campus cargo palette, uppercase name and existing website/app typography.

## Choose the right artwork

| Use | File |
| --- | --- |
| White background | `source/borrowbuddy-horizontal-color.svg` or `source/borrowbuddy-symbol-color.svg` |
| Navy, blue or black background | `source/borrowbuddy-horizontal-dark.svg` or `source/borrowbuddy-symbol-dark.svg` |
| One-colour reproduction | `*-black.svg`, `*-white.svg` or `*-navy.svg` |
| Square composition | `source/borrowbuddy-stacked-*.svg` |
| Name without symbol | `source/borrowbuddy-wordmark-*.svg` |
| Browser tab / 16–24 px symbol | Compact cut, supplied favicon files |
| PWA / Apple / launcher preview | `digital/icon-192.png`, `icon-512.png`, `maskable-512.png`, `apple-touch-icon.png` |
| Android | Generated adaptive, round and themed resources in the project |

`source/` contains vector masters, with outlined typography and filled geometry.
`digital/` contains transparent PNGs and web icons. `slides/` and
`presentation.html` show six illustrative uses. The mockups are identity studies;
the existing website and app retain their actual layouts and workflows.

## Space and size

The master uses a 256-unit canvas. One main stem is 32 units: reserve at least
that much clear space around the visible symbol or lockup. Keep both modules
equal and preserve the opening. Standard symbol: 24 px minimum; compact symbol:
16 px minimum; horizontal lockup: 200 px minimum; stacked lockup: 192 px minimum.
Existing compact interface headers keep their original symbol/name layout.

Use the supplied icon tile for circular/squircle crops. Android's foreground is
placed inside its adaptive safe zone; its monochrome layer supports themed
icons. Never put the full name into the launcher icon. Use the supplied opaque
navy favicon so a pale module cannot disappear on a light browser tab.

## Colour

| Colour | HEX | RGB | Approximate process CMYK |
| --- | --- | --- | --- |
| Navy | `#021249` | 2, 18, 73 | 97, 75, 0, 71 |
| Campus blue | `#003993` | 0, 57, 147 | 100, 61, 0, 42 |
| Amber | `#cb840e` | 203, 132, 14 | 0, 35, 93, 20 |
| Paper | `#f0f0f0` | 240, 240, 240 | 0, 0, 0, 6 |
| Ink | `#080b10` | 8, 11, 16 | 50, 31, 0, 94 |

Full colour is blue/amber on **white**. Use navy monochrome on paper/light grey;
amber against paper has less than 3:1 contrast. On navy, paper has 15.55:1 and
amber 5.78:1 contrast. Student/admin cards retain their existing signal orange
`#ff9f00`; against the existing blue header it has 5.09:1 contrast. Do not recolour
the surrounding interface to match a mockup. CMYK values are arithmetic RGB
approximations, not ICC proofs. No Pantone/spot match is assigned.

## Craft and consistency

All masters contain paths, not live text, embedded bitmaps, filters or strokes.
The one-colour white symbol is inset by 0.5 units per edge (about 3% of the stem)
to balance its apparent weight. The compact cut opens the centre from 24 to 32
units and simplifies the inner tips. Use those supplied drawings; do not invent
new corner cuts, gradients, outlines, shadows, rotations or module spacing.

The lockup outlines the project's existing **Noto Sans Mono**, licensed under
SIL Open Font License 1.1 in the embedded font metadata. Existing app/web body,
display and ticket fonts remain unchanged. No font installation is needed to
display the SVGs. Reference-library logos are not included in this final kit.

## Project handover

Canonical geometry and palette: `packages/shared/src/brand.ts`.
Regenerate in this order: run `build_kit.py` for the masters; use the installed
logo-design skill's `export_variants.py --web-icons --icon-fg keep` with the compact
dark symbol, navy icon background and the `digital/` output folder. Copy the
opaque `digital/borrowbuddy-icon-tile.svg` as `favicon.svg`; render that tile at
16/32/48 px for the favicon PNGs and at 512 px for
`borrowbuddy-icon-tile-512.png`. Render the other transparent PNGs from their
matching SVG masters with the skill's `render_png.py`. Inspect the new exports
before running `export_project_brand.py` to copy them into the application and
generate native paths and adaptive resources. The project exporter consumes
existing PNGs; it does not render them. It packs RGBA PNG entries in the ICO,
as required by this project's Next image decoder. Keep the existing dynamic web
manifest, start route, authentication and permissions; the standalone manifest
in `digital/` is an icon-package template, not a replacement for application code.

Student/admin ID-card front, back and strap gain only the approved mark. Their
personal data, membership codes, geometry, physics, drag, flip, fallback,
reduced-motion and lifecycle controls remain part of app acceptance.

The source audit, rendered pixel tests and integration checks accompany the
project. Trademark clearance and physical print/spot-colour proofing were not
performed. Android production signing and full app acceptance remain separate
from completion of this logo kit.
