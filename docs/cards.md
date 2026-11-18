# Cards view

The cards view has two layout modes and, in card mode, a card width setting. Both are per-machine display preferences stored in `localStorage`, not per-project data.

## Layout modes

| Mode | Grid | Note preview |
| --- | --- | --- |
| Row | one full-width column (`--card-columns: 1`) | only while the card is expanded |
| Card | responsive grid, `repeat(auto-fill, minmax(var(--card-min-width), 1fr))` | always (`always-show-notes`) |

The mode is chosen with the Row/Card switcher in the header and persisted under the `card-layout` key. It defaults to card mode.

## Masonry

Cards in a column follow each other without regard to the other columns' row heights. CSS grid has no masonry mode yet (Chromium keeps it behind a flag), so the grid has 1px implicit rows (`grid-auto-rows` on `.cards-grid.masonry`) and each card spans as many rows as its rendered height needs. The `v-masonry-item` directive in `utils/masonry.js` sets that span from a `ResizeObserver` on the card: once when the card is first laid out and again whenever its height changes, after layout and before paint. The span is computed from the grid's own `grid-auto-rows` and `row-gap`, so the stylesheet is the only place where the row unit and gap are defined. There are no timers; nothing has to guess when content has finished rendering.

## Card width

Card mode packs as many columns as fit at the chosen minimum card width; row mode is always a single full-width column, so the width control is shown only while card mode is active.

| Setting | Minimum card width |
| --- | --- |
| S | 320px |
| M | 440px |
| L | 600px |

These are minimum widths, not fixed widths. `auto-fill` fits as many columns of at least that width as the window allows and then divides the leftover space evenly among them, so cards are usually wider than the number in the table. Choosing a larger setting means fewer, wider columns at the same window width.

The setting is persisted under the `card-width` key as `s`, `m`, or `l`, and reaches the CSS as the `--card-min-width` variable set on the grid container. The default is M. A missing or unrecognized value is discarded on startup by `localStorageValidation.js` and falls back to M.
