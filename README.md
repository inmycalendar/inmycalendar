# inmycalendar

A daily sticky-note kanban board joined to a multi-year calendar laid out by week.

Live at **[inmycalendar.com](https://inmycalendar.com)** · No account, no server, no tracking.

---

## What it does

Most task apps forget the calendar and most calendars forget the tasks. This keeps both
in one place and one visual language.

**Board** — three columns (to do / in progress / done) side by side at every screen width,
phones included. Each task is a single line, so a full day fits without scrolling. Type
into a column to add straight to it; drag or use the arrows to reorder. Position *is*
priority, so ranking costs no extra interaction. Switching scope to week or month
aggregates that stretch of time into a read-only list.

**Calendar** — years side by side, laid out by week rather than by month, so a long span
reads at a glance. Colour a day and the whole cell takes that colour. Track dates you
count toward or away from, with a live day count.

---

## Running it

There is no build step. Clone the repo and open `index.html` in a browser — that is the
whole development setup.

```
git clone https://github.com/<you>/inmycalendar.git
cd inmycalendar
npm install      # only needed to run the tests
npm test
```

---

## How it is built

Plain HTML, CSS and JavaScript. No framework, no bundler, no transpiler.

```
index.html          the app
about.html          content pages, sharing one shell
contact.html
privacy.html
assets/
  site.css          tokens, ribbon, footer, content-page type — shared by all four pages
  app.css           board, calendar, rail, modal — loaded only by the app
  app.js            all application logic
  site.js           the content pages' menu toggle
tests/
  app.test.js       101 behavioural and layout checks
```

`site.css` loads before `app.css`, so app rules win where the two overlap. That ordering
is deliberate and load-bearing — see the CSS notes below.

### Why no framework

The app is one screen with a small, well-understood state shape. A framework would have
added a build step, a dependency tree and a deployment pipeline in exchange for
ergonomics this size of problem does not need. The concrete payoff: the whole thing can
be edited and shipped from a browser on a tablet, because there is nothing to compile.

The trade-off is real and worth naming — there is no component model, so shared rendering
is enforced by convention rather than by the type system. Two functions do the heavy
lifting and are reused everywhere they apply:

- `renderKanban(host, date)` — used by the day board *and* by the calendar's day popup
- `renderWeekGrid(opts)` — used by the full calendar *and* by the year-at-a-glance,
  differing only by a density flag

Look-alike duplicates of either would have drifted apart within a week. They did, once,
in an earlier version: the two grids ended up labelling weekdays differently.

### Data

Everything lives in `localStorage` under four keys:

| Key | Shape |
|---|---|
| `imc.tasks` | `[{ id, date, text, status, order, ts:{todo,doing,done} }]` |
| `imc.notes` | `{ "yyyy-mm-dd": { color, note } }` |
| `imc.track` | `[{ id, label, date, note, repeat, unit }]` |
| `imc.cfg`   | week start, calendar span, view, scope, category labels |

Two decisions worth pointing out:

**Status change and reordering are the same operation.** `placeTask(id, status, index)`
is the only mutation primitive. Dragging within a column, dragging across columns, the
arrow buttons and the keyboard path all call it. Earlier versions had separate move and
reorder functions and the ordering integers drifted out of sync.

**Timestamps are first-entry only.** A task records when it *first* entered each column,
never overwriting. Moving a task back and then forward again preserves the original
crossing time, which is what makes the CSV export useful for looking at cycle time.

### Dates

Week 1 is the week containing January 1st; the last week is the week containing
December 31st. Edge weeks therefore borrow a few days from the adjacent year, and those
are rendered greyed rather than dropped. An earlier version tidied them away and made
December 31st vanish from the calendar entirely.

Elapsed and remaining counts use a deliberate sign convention: **past dates count up
positive, future dates count down negative.** `1990-03-15` reads `12,808 days elapsed`;
a deadline reads `-432 days left`. Months and years use real calendar arithmetic, not
`days / 30` or `days / 365` — over a ten-year span the naive version is a month out.

---

## Testing

```
npm test
```

101 checks run against a real DOM (`jsdom`), driving the app with synthetic clicks and
keystrokes rather than inspecting source. They cover behaviour (adding, reordering,
moving across columns, scope switching, persistence across reload), date correctness
(every day of a year appearing exactly once, leap years, the sign convention), layout
rules that are easy to regress, and consistency across all four pages.

The suite exists because this project has been bitten repeatedly by bugs that static
review missed. The one that motivated it: a `const` declared *after* a function that used
it threw a temporal dead zone error on load, which silently killed every line of script
after it. It presented as two unrelated bugs — a missing UI section and unresponsive
buttons elsewhere — and reading the code did not find it. Running the code found it in
seconds.

### CSS notes that are load-bearing

Each of these caused a real bug here and is now asserted in the test suite:

- `position: sticky` silently stops working under any ancestor with `overflow: hidden`
- Grid `1fr` overflows its container; `minmax(0, 1fr)` plus `min-width: 0` on the items
  is what actually holds
- Never measure layout offsets in JS at load time when web fonts are involved — the
  measurement can run before the font swaps in and the value is stale. Sticky offsets
  here are fixed CSS custom properties for exactly this reason
- Later rules win on source order regardless of apparent specificity

---

## Accessibility and browser support

Keyboard shortcuts: `←`/`→` change day, `T` jumps to today, `N` focuses a new task,
`1`/`2`/`3` switch scope, `B`/`C` switch view. Shortcuts are suppressed while typing.
Interactive elements are real buttons with labels; the fold state is announced via
`aria-expanded`. Works in current Chrome, Firefox, Safari and Edge. Drag-and-drop is
desktop only by design — on touch it fights with page scroll, so the arrow controls are
the primary path there.

---

## Roadmap

- [ ] Sign in with Google and Microsoft (Supabase Auth)
- [ ] Postgres persistence with row-level security, so a board follows you between devices
- [ ] Offline-first sync with conflict resolution
- [ ] Ad-free tier (Lemon Squeezy, merchant of record — EU VAT handled)
- [ ] Consent management platform, required before advertising to EU visitors
- [ ] Installable as a PWA

---

## Licence

MIT.
