# inmycalendar

A daily Kanban board joined to a week-by-week calendar of the years around it.

Live at **[inmycalendar.com](https://inmycalendar.com)** - free, no sign-up needed to use it.

> **This README is the project's memory.** It records not just what the code does but *why*
> each decision was made, and which bugs cost real time. If you are picking this up cold -
> a new conversation, a new machine, or a new collaborator - read this file first. Nothing
> important should live only in a chat history.

---

## What it does

**Kanban Board** - three columns (to do / in progress / done) for the selected day. Each task
is one line. Position within a column *is* its priority. Tasks can be reordered, moved between
columns, renamed, and moved to a different day. Week and Month scopes aggregate that stretch of
time into read-only lists.

**Calendar** - years side by side, laid out by week rather than by month, so a long span reads
at a glance. Days can be coloured, given a note, and show your country's public holidays.

**Countdowns** - how long since, or until, a date that matters.

---

## Running it

There is no build step. Clone and open `index.html` in a browser - that is the whole setup.

```
git clone https://github.com/suyash-keshri/inmycalendar.git
cd inmycalendar
npm install      # only needed to run the tests
npm test         # expect: 502 passed, 0 failed
```

---

## File map

```
index.html          the app
guide.html          how to use it + what a Kanban board is (main SEO page)
contact.html        contact + roadmap
privacy.html        privacy policy
assets/
  site.css          design tokens, ribbon, footer, content-page type - shared by all four pages
  app.css           board, calendar, rail, modal - loaded only by the app
  app.js            all application logic (~1370 lines)
  auth.js           Supabase sign-in (Google / Microsoft / GitHub / email magic link)
  site.js           marks the current page in the nav on content pages
  favicon.svg .ico apple-touch-icon.png icon-192.png icon-512.png
  holidays/         248 files, one per country, ~16 KB each - loaded on demand
tests/
  app.test.js       502 checks: behaviour, layout, content accuracy, privacy
```

`site.css` loads before `app.css`; app rules win where they overlap. That ordering is
load-bearing.

**Cache busting:** every CSS/JS link carries `?v=N`. **Bump N on every release.** Filenames
never change, so without this browsers serve stale CSS alongside fresh HTML - this caused
several hours of "did the deploy fail?" confusion before it was added.

---

## Architecture and why

### No framework
One screen, a small well-understood state shape. A framework would add a build step and a
dependency tree for ergonomics this size of problem does not need. Concrete payoff: the whole
app can be edited and shipped from a browser on a tablet, because there is nothing to compile.

Two functions do the heavy lifting and are reused rather than duplicated:
- `renderKanban(host, date)` - the day board *and* the calendar's day popup
- `renderWeekGrid(opts)` - the full calendar *and* the year-at-a-glance, differing by a density flag

Look-alike duplicates of either drifted apart within a week when they existed.

### Data (localStorage today, Supabase next)

| Key | Shape |
|---|---|
| `imc.tasks` | `[{ id, date, text, status, order, ts:{todo,doing,done} }]` |
| `imc.notes` | `{ "yyyy-mm-dd": { color, note } }` |
| `imc.track` | `[{ id, label, date, unit }]` |
| `imc.cfg`   | weekStart, country, holRegional, catLabels, view, scope, glanceOpen |
| `imc.pending` | the change journal - `{ full, n, rows:{ "kind:id": {kind,id,op,at,seq} } }` |

**`commit(kind)` is the only way anything is written.** `writeRaw()` is the single place in
the app that calls `localStorage.setItem`, and only `commit()` reaches it. There is no
`save(key, value)` any more, because a call site could pass a mismatched pair.

`commit()` also records **what** changed, into `imc.pending`. It does this by diffing the
bucket against a shadow copy of what was last written, rather than asking each of the forty-odd
call sites to declare the row it touched - forty chances to get it wrong, and that mistake
surfaces weeks later as missing data rather than as a failing test.

Why this exists before any sync code does:

- The agreed rule merges **at task level**. Re-sending the whole array on every keystroke throws
  away exactly the information that makes "most recent edit wins" resolvable.
- **Deletions have to survive as markers.** A row that is simply dropped is invisible to the
  other device, which re-sends the task and resurrects it. The diff produces those markers for
  free, and correctly, because it compares against what was actually last written.
- `settled(rows)` clears a row only if its `at` **and** `seq` still match what was pushed.
  An edit made while a push is in flight therefore stays pending instead of being silently lost.
- Past `PENDING_CAP` (5000) unsynced rows the journal stops growing, sets `full`, and asks the
  next sync to reconcile everything once.

The sync layer attaches through `window.imcStore` (`changes`, `settled`, `needsFullSync`,
`fullSyncDone`) and nothing in `app.js` knows sync exists. A corrupt `imc.pending` starts
from an empty journal rather than stopping the app booting. Section C36 of the test file covers
all of this.

**`placeTask(id, status, index)` is the only mutation primitive.** Status change and reordering
are the same operation. Earlier versions had separate move and reorder functions and the
ordering integers drifted out of sync.

**Timestamps are first-entry only.** A task records when it *first* entered each column. Moving
back and forward again preserves the original crossing time, which is what makes the CSV export
useful for cycle time.

**Settings migrations matter.** A returning user has old values in localStorage. When defaults
change, migrate them (see `OLD_SETS` in `init()`) or the developer testing on their own browser
sees stale data and concludes the deploy failed.

### Dates
Week 1 is the week containing January 1st; the last week is the week containing December 31st.
Edge weeks borrow days from the adjacent year and are rendered greyed, never dropped - an early
version tidied them away and made December 31st vanish.

Counts use a deliberate sign convention: past counts up positive, future counts down negative.
Months and years use real calendar arithmetic, not `days/30` or `days/365`; over ten years the
naive version is a month out.

### Holidays
Data generated from the Python `holidays` + `pycountry` libraries, converted to one file per
country under `assets/holidays/`. Only one file ever loads. They are `.js` calling
`window.__imcHol(code, data)` rather than `.json` fetched, deliberately: `fetch()` is blocked on
`file://` and the app must work when `index.html` is opened straight from disk.

Format: `{"2026":{"0101":["New Year's Day",0]}}` where `0` = national, `1` = regional. National
always wins over regional for the same date.

**Regional holidays are opt-in.** The US has 41 national but 191 total - the regional markers
buried the national ones.

**Regenerating the data:** the `holidays` library lists every country twice, once by alpha-2 and
once by alpha-3 code, and the alpha-3 rows lose their country name. Keep only 2-letter codes, or
you get 495 "countries" instead of 248 and a file twice the size.

### Four independent visual channels
So nothing ever collides on one day: **fill** = category, **bottom stripe** = holiday,
**ring** = today, **corner dot** = has tasks. All four can appear on the same day and stay
readable. This is also why the accent colour is near-black - a coloured chrome accent would
collide with the semantic colours.

---

## Design decisions worth not re-litigating

- **Day colours are Milestone / Travel / Leave / WFH.** People mark *exceptions* to a normal
  working day. "Work" is useless (every weekday is work), "Important" means nothing, "Deadline"
  is wrong (deadlines are moments, not day types).
- **No settings gear.** Two controls hidden behind an icon nobody clicks is worse than two
  controls in the open. Week-start sits in the ribbon; data actions sit in the footer.
- **Sign-in at the far right of the ribbon**, where every app puts accounts.
- **"Day note", not journal or diary** - those words imply a daily-writing commitment and put
  people off.
- **Near-black chrome, light surfaces.** Chosen over indigo/blue/green specifically because the
  app already carries nine semantic colours.
- **Tab title and share title are different strings.** The tab truncates, so it front-loads
  keywords; social previews have room for the fuller line.
- **No em dashes anywhere in copy.**

---

## Testing

```
npm test
```

502 checks against a real DOM (`jsdom`), driving the app with synthetic clicks and keystrokes
rather than inspecting source. The suite exists because this project was repeatedly bitten by
bugs that static review missed.

**Bug classes that recurred - check these first:**

- A `<button>` used as a grid cell keeps the **browser default border** on any side you do not
  set. Setting only `border-top` left heavy black boxes around every date. Always `border:0` first.
- A flex container with `gap` **splits inline text into separate flex items** -
  `in<b>my</b>calendar` rendered as "in my calendar". Wrap wordmarks in one span.
- **Fixing a shared element in one file only.** The wordmark was fixed in `index.html` but not
  the other three pages, and the test only checked `index.html`, so it passed while the bug
  shipped. Any shared-shell fix must be applied to all pages *and* asserted across all of them
  (`PAGES.forEach`).
- **Selecting buttons by index in tests** breaks the moment a row gains a control. Look them up
  by title.
- `position: sticky` silently stops working under any ancestor with `overflow: hidden`.
- Grid `1fr` overflows; `minmax(0, 1fr)` plus `min-width: 0` is what actually holds.
- Never measure layout offsets in JS at load time with web fonts - the measurement can run
  before the font swaps in. Sticky offsets here are fixed CSS custom properties.
- One uncaught JS error kills every line of script after it. A `const` declared after a function
  that used it threw a temporal dead zone error that presented as two unrelated bugs.
- `.meta` needs a **fixed width** - its text changes length between scopes and physically pushed
  the Day/Week/Month buttons sideways as you clicked them.
- Reading a lane's length *inside* a loop that is moving tasks into it counts the task just
  moved, handing two tasks the same order. Set dates first, renumber after.
- **Tests that check structure will not catch stale prose.** `privacy.html` claimed "no accounts,
  no sign-in" for a full release after auth shipped, and the suite passed the whole time. Section
  C14 of the test file now reads the actual words on every content page and asserts they match
  what the app does. When you ship a feature, update the copy in the same commit - the tests will
  fail if you do not.
- **A sign-in token comes back in the URL fragment, and anything that rewrites the
  fragment destroys it.** `setView()` called `history.replaceState(null,"","#board")`
  during `init()`, before `auth.js` had even loaded. Google sign-in therefore succeeded
  on the server every single time and silently failed in the browser: the Supabase auth
  logs showed five successful logins on a day the button never once changed to signed in.
  Nothing in the console, nothing in the network tab, nothing to search for. A query
  string survives that call and a fragment does not, which is why the bug looked like
  "OAuth is broken" rather than "we overwrote the answer". Section C37 boots the app at
  the real URL Google redirects to and fails if the token is not still there.
- **Hiding controls behind `:hover` makes them unreachable on a phone.** The task
  row's edit / move / delete buttons were `visibility:hidden` until `:hover`, which a
  touch screen never produces. `@media (hover:none)` now shows them always.
- **`white-space:nowrap` plus `text-overflow:ellipsis` hides most of a real task.** One
  line showed about three words of a sentence-length task. Two lines via
  `-webkit-line-clamp:2` reads properly and still caps how much vertical space one task
  can take. The row needs `align-items:flex-start` too, or the controls drop to the
  second line with the text.
- **An Enter-only input is unusable on a phone.** Mobile keyboards often show "go" or
  nothing useful, so every add field needs a visible button doing the same job.
- **Never run a blind find/replace across HTML.**
- **A media query that changes `display` does not reset the other properties.** `.shell` is a grid
  with `align-items:start`; the mobile override switched it to `flex-direction:column` but `start`
  survived, and in a column flex container that stops children stretching - the board rendered at
  ~70% of the screen width. Reset `align-items:stretch` explicitly.
- **CSS `order` reorders one item, not the sequence.** Floating the current year with `order:-1`
  left the others in place and produced 2026, 2025, 2027. On a phone, show one year instead.
- **A field with no Done/Cancel feels broken even when it autosaves.** People need a way to say
  "I am finished". Both day notes now have Done and Clear.
- **Silent failure is undiagnosable.** Sign-in hid itself when the anon key was missing and said
  nothing, so "why is there no login button" had no answer. It now logs the reason and the fix.
- **Documentation drifts and no test catches it by default.** The README claimed 363 tests twice
  and 281 once while the real number was 317 - in the file whose entire job is being the source
  of truth. The suite now compares every test-count claim in `README.md` and `HANDOVER.md` to the
  real total and **fails the run** if they disagree.
- **A local folder ahead of the published repo is dangerous with a replace-the-folder workflow.**
  If you unzip a build made from an older base, unpushed work is silently deleted - and `npm test`
  still passes, because the tests that would have caught it are the ones being deleted.
  **Push before accepting a new build.**
 Renaming "Kanban" to "Kanban Board" corrupted
  the etymology sentence into "Kanban Board means signboard in Japanese".

---

## Deployment

GitHub -> Hostinger auto-deploy -> Porkbun domain.

- Repo: `suyash-keshri/inmycalendar` (public)
- Hostinger: hPanel -> Advanced -> Git, branch `main`, root `public_html`, auto-deploy on
- Porkbun nameservers point at Hostinger (`pixel.dns-parking.com`, `byte.dns-parking.com`)
- **Porkbun URL Forwarding must stay OFF** - it hijacked `/guide.html` to a parking page

**The deployment lesson that cost three days:** two repos existed with similar names and
Hostinger was deploying the wrong one, while every check confirmed the right one. Both reported
success.

> **Never trust the dashboard "Completed" label.** Verify the actual file content -
> `raw.githubusercontent.com/<user>/<repo>/main/<file>`, or Hostinger's File Manager.

Local dev must live **outside OneDrive** (it corrupts `.git`).

Loop: edit -> `npm test` -> Source Control -> commit -> Commit & Push -> verify file -> incognito.

---

## Auth (in progress)

`auth.js` is built and wired. **To activate it:** paste the Supabase anon key into
`IMC_SUPABASE_ANON_KEY` at the top of the file.

- The **anon key is designed to be public** and belongs in the file; it is restricted by Row
  Level Security on the database side.
- The **`service_role` key must never appear in this repo**, in the browser, or in any commit.

Supabase project: `inmycalendar`, region Central EU (Frankfurt), matching the Hostinger region.

Providers: Google (enabled), Microsoft and GitHub (need enabling in Supabase), email magic link.
Apple is deliberately excluded - it requires a paid developer account.

**Design rule: the app must stay fully usable signed out.** Sign-in is an upgrade for
cross-device sync, never a gate. If the library fails to load or no key is set, the button hides
itself and the app carries on.

---

## Roadmap

- [ ] Postgres tables + Row Level Security (every table gets RLS enabled in the same breath it
      is created; with no policies defined the table is locked, which is the safe default)
- [ ] Sync. **Agreed conflict rule:** merge at task level, not day level. Different tasks on the
      same day both survive. The same task edited in two places - most recent edit wins.
      Deletions must be recorded as markers, not dropped rows, or deleted tasks resurrect from
      the other device.
- [ ] Row quota + column length constraints per user, to cap abuse
- [ ] Ad-free tier via Lemon Squeezy (merchant of record handles EU VAT)
- [ ] Consent management platform, then AdSense (required for EU visitors; apply only once there
      is real traffic)
- [ ] PWA manifest + service worker

---

## A note on what is public

This repo is public, so it is a portfolio piece as much as a codebase. It contains
no personal information beyond the GitHub username.

`HANDOVER.md` holds personal context (employer, goals, working preferences) used to
brief an AI assistant at the start of a new session. **It is gitignored on purpose
and must never be committed.** Keep it locally, or anywhere private. Test section
C15 fails if any personal term appears in a published file.

## Licence

MIT.
