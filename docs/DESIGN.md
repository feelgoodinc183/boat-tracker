# TMTRAC design direction (draft)

**Owner direction (2026-11-07):** "Make the style like Meshtastic, and apply the antislop design rules."

This file records that direction as design fields. The colour and type values are taken from Meshtastic's own published source (the meshtastic.org site `src/css/variables.css` and the web client `apps/web/src/index.css`), then checked for contrast. Items marked **[OWNER]** need your answer before UI work starts.

Borrow Meshtastic's *visual language* only. Do not use the Meshtastic name or logo anywhere in TMTRAC's UI. They are trademarks, and TMTRAC is a separate product.

---

## Design Read

> Reading this as: a race-management and live-tracking web app for race officers, skippers and spectators at Malaysian sailing clubs, in Meshtastic's visual language (dark slate surfaces, one mesh-green accent, plain Inter type), dial **ENERGY 1 / RHYTHM 1 / MOTION 1** for the app screens.

| Dial | Value | Reason |
|---|---|---|
| ENERGY | 1 | The Meshtastic client is a calm utility. Race officers use it under pressure, in sun, on a moving boat. |
| RHYTHM | 1 | App screens stay consistent so controls are always where the hand expects them. |
| MOTION | 1 | Hover and press states only. The boats moving on the map are the motion; nothing else needs to move. |

The public landing page on tmtrac.my may go to ENERGY 2. **[OWNER]** confirm.

---

## Themes

Two themes, matching how Meshtastic ships light and dark, and matching what tmtrac already has (dark default + "sunlight" theme):

- **Dark (default).** Reason: tmtrac already defaults to dark, and Meshtastic's client looks like this. Spectators often watch evening races and replays indoors.
- **Sunlight (light).** Reason: a race officer on a committee boat in midday sun can't read a dark screen. Uses Meshtastic's warm off-white light theme.
- Both themes must pass every contrast check below (R-34). The switch stays visible on every screen.

## Colour tokens

Token names follow the ones tmtrac already uses (`src/theme/tokens.css`), so the restyle is a value swap, not a rename.

| Token | Dark | Sunlight | Use |
|---|---|---|---|
| canvas | `#0e1015` | `#f6f5f3` | page background |
| surface | `#14171f` | `#fbfaf9` | panels, dialogs |
| raised | `#272b35` | `#e9e7e2` | controls, hover fills |
| line | `#676e7e` | `#847e71` | borders of inputs and controls |
| ink | `#fafafa` | `#22201c` | primary text |
| ink-muted | `#9da3af` | `#544f45` | secondary text |
| **accent** | **`#67ea94`** | **`#127d4b`** | the one accent: primary action, selection, links |
| on-accent | `#0e1015` | `#ffffff` | text on an accent fill |
| danger | `#dc2626` | `#b91c1c` | destructive fills |
| danger-ink | `#fca5a5` | `#b91c1c` | error text |
| warning-ink | `#fbbc04` | `#92400e` | flags, cautions |
| success-ink | `#67ea94` | `#166534` | success text |
| focus | `#ffffff` | `#22201c` | keyboard focus ring |

Contrast, measured (WCAG ratio, need 4.5 for text, 3 for lines and focus):

| Pair | Dark | Sunlight |
|---|---|---|
| ink on surface | 17.2 | 15.6 |
| ink-muted on surface | 7.1 | 7.8 |
| ink-muted on raised | 5.6 | 6.6 |
| line on surface | 3.5 | 3.9 |
| accent on surface | 11.8 | 5.0 |
| on-accent on accent | 12.5 | 5.2 |
| danger-ink on surface | 9.4 | 6.2 |
| warning-ink on surface | 10.5 | 6.8 |
| focus on surface | 17.9 | 15.6 |

Notes:
- `line` is lighter than Meshtastic's own border colour, which is decorative and below 3:1. Inputs need to be visible, so tmtrac's existing 3:1 rule wins.
- In dark, success and accent are the same green (Meshtastic's brand green). Success messages therefore also carry a word or icon, never colour alone.
- **Boat and class colours on the map** are data colours, not part of the UI palette. They get their own checked categorical palette when the map is built.

## Type

- **Inter** (variable), as Meshtastic uses. Reason: it's the owner's reference, it is very legible at small sizes on phones, and it has tabular numerals (`font-variant-numeric: tabular-nums`) so race clocks, elapsed times and sail numbers don't jitter as digits change.
- **Monospace** only for tracker and node IDs (e.g. `!a1b2c3d4`), which is where Meshtastic uses it too. Never for headings.
- Smallest size 12 px (tmtrac's existing rule). Race clock and countdown are the largest type on the RO screens.

## Shape

- Radius: `0.625rem` on controls (Meshtastic's value), `1rem` on dialogs and panels. Nothing pill-shaped except toggles.
- Shadows only on things that float above the map (dialogs, the boat detail sheet).
- No glass, no glow, no gradients. Meshtastic uses none of these either.

## Icons [OWNER]

Meshtastic's client uses **Lucide** icons, and tmtrac already does too. The antislop rules flag Lucide as a common default look (R-04). Since your reference uses it, it is a fair choice, but it's your call:

1. **Keep Lucide** (matches Meshtastic, no extra work), or
2. **Drop it** for a sailing-specific set (flags, marks, boats) where Lucide has no good glyph.

A middle path: Lucide for generic UI (close, menu, settings) plus a small custom set for racing concepts (code flags, marks, start line). The code flags (P, I, Z, U, black, X, first substitute, AP) should be drawn properly regardless, as racers recognise them.

## Identity [OWNER]

Not decided yet:
- TMTRAC logo or wordmark. Until one exists, the UI shows "TMTRAC" as text in Inter Semibold.
- An identity motif: one repeated element that makes TMTRAC feel like itself, not like a Meshtastic reskin. Candidates come from you or your club.

## Fixed rules for every screen

- 44 px minimum tap targets. Must work at 375 px wide.
- Every screen has empty, loading and error states that say what happened and what to do next.
- Every control works by keyboard, with a visible focus ring.
- No invented numbers, boats, sailors or clubs in the UI. Demo data is labelled as demo.
- No em dashes in UI text.
