# Roadmap

Tracks what's built so far and what's left before harang-calendar matches
the spec in `AGENTS.md`. Update this as steps land.

## Done

- Project scaffold: build tooling, i18n (`getLanguage()` + en/ko), empty
  Vue 3 calendar view (sidebar + tab), settings tab shell.
- Settings: CalDAV account CRUD (name/server URL/username/password) and a
  per-account time zone setting (IANA zone picker sourced from
  `Intl.supportedValuesOf("timeZone")`, or a manual UTC offset for zones
  not in that list).
- `src/caldav/client.ts` (`CalDavClient`): calendar discovery (PROPFIND
  walk of principal → calendar-home-set → calendar collections, with a
  self-is-already-a-calendar shortcut) and event fetching (REPORT
  `calendar-query`, optionally windowed by a UTC time range).
- `src/caldav/ics.ts`: VEVENT parsing - UID/SUMMARY/DESCRIPTION/LOCATION,
  DTSTART/DTEND (UTC, date-only/all-day, and TZID/floating via the
  account's configured time zone), DURATION as a DTEND fallback, EXDATE,
  and RRULE (kept raw). VALARM and other sub-components are correctly
  skipped so their properties don't leak into the parent event.
- `src/caldav/recurrence.ts`: expands an RRULE (+ EXDATE) into concrete
  occurrences within a date range, using the `rrule` package.
- `src/caldav/store.ts` (`CalendarStore`): orchestrates `CalDavClient`
  across every account/calendar, caches the merged result with a
  configurable TTL (`cacheTtlMinutes` setting + "Refresh all calendars
  now" button, mirrors `harang-contacts`' `ContactStore`), and exposes
  `getEventsInRange` (recurrence-expanded, correct all-day-event
  day-boundary overlap, optional calendar-name scoping), `getEventByUid`,
  and `searchEvents`. Wired into `main.ts`: a "Refresh calendars" command
  and an auto-refresh-if-stale on load (only fires once any account has
  registered calendars). Two fetch strategies, both unit-tested
  (`eventKey` = `calendarId:uid` dedup on merge):
  - `refreshAll`/`refreshIfStale`: the original fixed
    3-months-back/12-months-forward preload, replacing the whole cache.
    Used for the initial load and the agenda sidebar.
  - `ensureRangeFetched`/`refreshRange`: on-demand, added for the month
    view's navigation (see below) - only the not-yet-cached part of a
    requested range is actually fetched and merged in (tracked via a
    single contiguous `coveredRange`, so re-visiting already-covered,
    still-fresh territory costs no network call at all), and
    `refreshRange` force re-fetches a specific range regardless of
    coverage/staleness (used by the month view's "Refresh" button, so it
    always re-fetches exactly what's on screen, not the old fixed
    window).
- **Settings: connect & discover calendars** - a "Test connection &
  discover" button per account that calls `discoverCalendars()` and
  merges the result into `account.calendars`, matched and preserved by
  URL (so re-discovery keeps existing `enabled`/`color` overrides but
  drops calendars no longer on the server). Each registered calendar gets
  its own row with an enabled toggle (the "per-calendar filter" from
  `AGENTS.md`) and an editable color override. A successful discovery
  immediately triggers `CalendarStore.refreshAll()`, so the store now has
  real data flowing into it end-to-end.
- **Two Vue calendar views wired to `CalendarStore`**, matching different
  screen widths per `AGENTS.md`:
  - **Sidebar - agenda list** (`AgendaItemView.ts` + `AgendaView.vue`,
    `VIEW_TYPE_CALENDAR_AGENDA`): owns a reactive `CalendarViewState`
    (`src/view/agenda.ts`), refreshes on open (`refreshIfStale`) and via a
    toolbar button (`refreshAll`), queries `getEventsInRange` over a fixed
    30-day window from today, and renders events grouped by local
    calendar day (with "Today"/"Tomorrow" labels), sorted chronologically,
    each card colored by its calendar's configured color.
  - **Full tab - month grid** (`MonthItemView.ts` + `MonthView.vue`,
    `VIEW_TYPE_CALENDAR_MONTH`): a Sunday-start month grid built by the
    pure/unit-tested `src/view/monthGrid.ts` (`buildMonthGrid`, which
    reuses `groupEventsByLocalDay`, plus leading/trailing days from
    adjacent months to fill whole weeks). Prev/next/today navigation
    fetches on demand per displayed month via
    `CalendarStore.ensureRangeFetched`; the toolbar's "Refresh" button
    calls `refreshRange` to force re-fetch exactly the month on screen
    (so newly-created server-side events show up without waiting on the
    cache TTL). Each day cell shows up to 3 events as colored pills with
    a "+N more" overflow; clicking a day selects it and lists its events
    below the grid; clicking an event (in a cell or the selected-day
    list) opens the same detail popup as an event chip. The toolbar keeps
    only `‹`/`›` (step one month at a time) - year stepping isn't
    duplicated there. Clicking the month/year label opens
    `MonthPickerModal` (a plain `Modal`): the year shows as plain
    clickable text; clicking it swaps in a text input (type a year, Enter
    to commit / Escape to cancel), which reverts back to text afterward -
    above a pick-directly 12-month grid, divided from it by a horizontal
    rule. This went through two earlier shapes first - a year stepper,
    then a pick-directly 12-year grid with `«`/`»` paging - both dropped
    in favor of typing the year directly, which reaches any year
    (including ones decades away) in one action without paging through a
    grid of them. The month grid is unaffected by that churn - it's always been
    pick-directly, one click per month.
  - **Keyboard navigation** for the month grid: a roving `tabindex` (only
    the selected day is a tab stop, matching the native pattern for
    composite widgets like this) plus Left/Right/Up/Down to move the
    selection by 1/7 days, Enter/Space to select. Moving within the
    currently *rendered* grid (which includes a few leading/trailing days
    from adjacent months to fill whole weeks) just changes the selection;
    moving past its edge navigates the view to the month containing the
    target date (`MonthItemView.navigateToDate`, unit-verified against
    the grid's actual boundaries) before landing there. A `watch` on
    `selectedDateKey` moves real DOM focus to match after each Vue
    re-render (`nextTick`), so arrow keys feel like a native date picker
    instead of just updating a highlight nothing is focused on.
  Both distinguish "no calendars configured" from "no events in this
  range" for the empty state, and both are separate registered view
  types (not one view reused in two places) so their content can differ
  by placement while still each being open-able from either the sidebar
  or a tab if the user drags them there.
- **`EditorSuggest`s** (`src/editorSuggest/`): the note-syntax pieces from
  `AGENTS.md` now insert real references.
  - `DateEditorSuggest`: `@date[` + a progressively typed `YYYY-MM-DD` (via
    the pure, unit-tested `dateCandidates.ts`) inserts `[[cal:YYYY-MM-DD]]`.
    An empty query offers the next 10 days; matching is against the
    zero-padded month/day form, so digits are matched the way they're
    typed left-to-right with a leading zero (typing "0" then "7" narrows
    to July) - a bare single digit like "2" therefore matches "2X" (20s),
    not day/month 2 itself, which would need a leading "0" typed first.
  - `EventEditorSuggest`: `@event[` + a free-text title search (via
    `CalendarStore.searchEvents`) inserts `[[event:<uid>]]`. Spaces are
    allowed in the query so multi-word titles are searchable.
  - `FrontmatterCalendarSuggest`: typing inside a `harang-calendar: [...]`
    frontmatter line (only the inline array form, detected via the
    pure/tested `frontmatterQuery.ts`) suggests registered *enabled*
    calendar display names. Unrelated to the two triggers above - this one
    lives in the frontmatter, not the note body.

  `@date[`/`@event[` (switched from bare `@`/`!` after review - see below)
  mirror `harang-contacts`' `@contact[...]` bracket convention: typing the
  trigger auto-closes the `]`, and `selectSuggestion` replaces the whole
  `@date[query`/`@event[query` span (from the `@` through the cursor) with
  the final `[[...]]` text, then consumes the auto-closed `]` immediately
  after it so no stray bracket is left behind. Unlike `harang-contacts`
  (where the typed trigger form *is* the stored form), the typed and
  stored syntaxes differ here, so the wrapper has to be fully replaced
  rather than just filled in.
- **Rendering** (`src/render/`): `[[cal:YYYY-MM-DD]]` and `[[event:<uid>]]`
  now actually render, in both Live Preview (`livePreview.ts`, a
  CodeMirror `ViewPlugin`, decorations skip code/comment nodes and any
  range overlapping the selection so the raw text stays editable) and
  Reading view (`postProcessor.ts`). Reading view has two passes:
  `replaceWikilinks` runs first and handles the common case - Obsidian's
  own renderer parses `[[...]]` as a wikilink *before* any
  `MarkdownPostProcessor` runs, so by the time we see the DOM it's
  already an `a.internal-link`, not literal bracket text, and matching
  is done against the link's `data-href`/`href` (which preserves the
  full target even through a `[[cal:...|alias]]` display-text override,
  or a UID containing colons); `replaceRawText` (a `TreeWalker` over text
  nodes, skipping `code`/`pre`) is a fallback for any bracket text that
  didn't get parsed into a link. (Found via manual testing: chips worked
  in Live Preview but silently reverted to a plain wikilink in Reading
  view - Live Preview never hits the wikilink-parsing path at all, since
  its CodeMirror decoration replaces the raw source text directly.) Both
  passes share one text-matching pass (`combinedMatches`, unit-tested) so
  date/event references interleaved in the same text node render in the
  right order regardless of which regex found them first.
  - `[[cal:...]]` → `dateWidget.ts`: an inline "unfolded" block - a day
    heading plus that day's events (recurrence-expanded, via
    `CalendarStore.getEventsInRange`) as clickable rows, each colored by
    its calendar's configured color. Scoped to the note's
    `harang-calendar` frontmatter calendars via the new
    `frontmatterScope.ts` helper, when present. A semantically-invalid
    date (e.g. `2026-02-30`) is left as plain text rather than rendering a
    broken widget - `dateWidget.ts` exports `isValidIsoDate` for this.
  - `[[event:...]]` → `eventChip.ts` (compact inline pill, dashed/faded if
    the uid can't be resolved) + `eventCard.ts` (click/Enter/Space opens a
    floating detail popup with when/location/notes/calendar - same
    singleton-popup pattern as `harang-contacts`' contact card, including
    Escape-to-close wired in `main.ts`). Rows inside a date widget open
    the same popup, so there's one detail view shared by both syntaxes.
- **Frontmatter validation**: `dateWidget.ts` exports `unknownCalendarNames`
  (pure, unit-tested), which checks the note's `harang-calendar` frontmatter
  entries against every *registered* calendar name across all accounts
  (enabled or not - a disabled calendar is a known name, just filtered
  out, not "unregistered"). Any that don't match are shown as a warning
  line inside the date widget.
- **UI restyle to Material Design 3**: shape scale (chips/buttons = full
  pill, cards/popups = 12px), M3-style elevation (embedded widgets are
  "outlined" - border, no shadow; the floating event popup is "elevated"
  - shadow, no border, consistent with M3's own component conventions),
  state-layer hover/focus treatment, and `--hc-*` shape/motion tokens
  defined in `styles.css`. All actual colors stayed on Obsidian's own
  theme variables rather than the M3 baseline palette, so it still
  follows the user's chosen Obsidian theme instead of forcing Material's
  colors on top of it.
- **Month grid restyled after M3's actual Date Picker component**
  (https://m3.material.io/components/date-pickers), not just a generic
  "prettier grid" pass. The first cut still drew a bordered/hairline grid
  (basically a Material-2/spreadsheet look), which isn't what M3's own
  date picker does: no cell borders or grid lines at all, days are just
  numbers in fixed-size circular touch targets laid out with whitespace.
  Now: "today" gets an outlined accent ring *around the day-number circle
  specifically* (not the whole cell), and the selected day gets a
  *filled* accent circle with contrasting text - the actual M3
  selected-date treatment, replacing the earlier inset-ring-on-the-cell
  approach. Event pills (M3 has no per-day data concept in its picker
  spec, so this part is our own addition) sit below the number. Cell
  dividers between days came back after this landed - a bare date picker
  can get away with no grid lines because there's nothing but a number in
  each cell, but ours also carries a variable amount of event data per
  day, and without *some* separation the grid read as shapeless. Done as
  a 1px hairline (grid background showing through a 1px gap between
  opaque cells) rather than per-cell borders, which would double up at
  shared edges; outside-month days get a slightly different background
  again too. The month-picker modal's "current month" button was updated to match the
  same filled-accent language for consistency.
- **Fixed an all-day event boundary bug in `store.ts`, found via live CDP
  testing against the real running Obsidian instance with real server
  data.** An all-day event with an explicit end date (e.g. a single-day
  event whose `DTEND` is the following day, per RFC 5545) incorrectly
  appeared on both its intended day and the day after, in any time zone
  ahead of UTC (confirmed in Asia/Seoul, UTC+9). Root cause:
  `overlapsRange`/`eventEndMs` parsed `YYYY-MM-DD` boundary strings with
  `new Date(str)`, which the JS spec treats as UTC midnight for a
  date-only ISO string, while the query range was built from local
  calendar components - the same bug class already fixed in `agenda.ts`
  and `monthGrid.ts`'s display-layer date arithmetic, but missed
  independently in `store.ts`'s own query-filtering layer. Fixed with a
  shared `parseEventBoundary(iso, allDay)` helper that parses via local
  calendar components for all-day events; verified with a unit test
  across three time zones (Asia/Seoul, America/New_York, UTC) and by
  hot-reloading the fix into the live instance and re-checking against
  the actual event that exposed it.
- **Added calendar-name autocomplete to the native Properties panel**, not
  just source-mode YAML editing. `AbstractInputSuggest` (public API since
  1.4.10) accepts any contenteditable div, and the Properties panel's
  list-type "add item" input (`.multi-select-input`) happens to be exactly
  that - so `registerFrontmatterPropertySuggest` (in
  `frontmatterPropertySuggest.ts`) watches the document for that input
  under a `[data-property-key="harang-calendar"]` row via
  `MutationObserver` and attaches a suggest to each one found. Selecting a
  suggestion writes through `app.fileManager.processFrontMatter` rather
  than replaying the panel's own (undocumented) Enter-to-commit-pill
  behavior, which turned out to be unreliable when triggered from a
  suggestion click instead of raw typing (confirmed via CDP: the same
  synthetic focus+insertText+Enter sequence that worked standalone
  silently failed to commit a pill when fired from inside
  `selectSuggestion`). Verified end-to-end via CDP against the real
  instance - correct calendar names suggested while typing, frontmatter
  correctly updated and persisted.
  - **Related, and probably the actual cause of the earlier "이름을
    입력해도 아무 변화가 없음" report**: a freshly-added custom property in
    the Properties panel defaults to the "Text" type (single string), not
    "List" (array) - so even a correctly-typed calendar name wouldn't be
    read by `getFrontmatterScope` (which requires `Array.isArray`) unless
    the user manually switches the property's type to List first. Fixed by
    also attaching the suggest to the Text-type input
    (`.metadata-input-longtext`), not just the List-type one - either way,
    `selectSuggestion` writes an array, which upgrades the property to List
    on next render regardless of which input type it started as.
  - **Found via real (non-CDP) manual testing, not caught during CDP
    verification**: clicking a suggestion appeared to silently "undo"
    itself - the same suggestion list would immediately reappear instead of
    the value committing. Root cause: clearing the input's leftover typed
    query text used `execCommand("delete")`, which fires a real `input`
    event - re-triggering this same suggest's own listener and reopening
    the popup against the now-empty query (an empty query matches every
    candidate via the `includes("")` filter, so it looked like the full
    list "came back"). Fixed by clearing via a plain `textContent = ""`
    assignment instead, which doesn't fire input events. This slipped past
    the earlier CDP testing because that testing dispatched the suggestion
    click as a single synthetic `MouseEvent`, which doesn't reproduce the
    exact focus/event sequence a real click produces closely enough to
    surface this.
  - **Known caveat**: after `processFrontMatter` writes the new value, the
    *already-open* Properties panel for that same note doesn't visually
    show the new pill until something forces it to resync - confirmed via
    CDP that `metadataCache.trigger("changed", file)` and several internal
    `MetadataEditor` methods (`synchronize`, `setCollapse` toggle,
    `unload`/`load`) don't trigger a refresh either, so this looks like a
    genuine Obsidian platform characteristic rather than something fixable
    from a plugin. Navigating away to any other note and back (same leaf,
    no need to close/reopen the tab) does refresh it correctly, which
    covers ordinary usage; staying on the exact same note is the only case
    where the pill visually lags behind the (already-correctly-saved)
    data.
  - **Found via real (non-CDP) manual testing, reported as "box gets big
    then small" / needing two clicks**: repeated plugin disable/enable
    cycles during this same debugging session (each one re-running
    `registerFrontmatterPropertySuggest`) had silently stacked multiple
    live `FrontmatterPropertyCalendarSuggest` instances onto the *same*
    still-open input element - `AbstractInputSuggest` has no public
    teardown, so a prior load's instance keeps listening forever even
    after the plugin "unloads". Each stacked instance opened its own
    popup for the same keystroke, at a very slightly different size/
    position, which read as one popup shrinking into another. First fix
    attempt used a `dataset` flag on the element to prevent re-attaching,
    which wasn't enough - CDP polling (`getBoundingClientRect` snapshots
    at 100ms intervals while the suggestion was open) showed the flag
    getting silently cleared, most likely because Obsidian's own
    Properties panel re-renders that row's value input in place on
    frontmatter changes (reusing the same DOM node but reconciling its
    attributes against its own template) - a `dataset` entry is a real
    HTML attribute, so it's caught in that reconciliation same as any
    other. Fixed by marking the element with a `Symbol.for(...)`-keyed
    object property instead: not an HTML attribute at all, so untouched
    by attribute diffing, and `Symbol.for` (vs. a module-local `Symbol`)
    resolves to the same key across separate plugin reloads despite each
    reload creating a fresh copy of this module. Verified by disabling/
    re-enabling the plugin twice in a row against the same open note and
    confirming only one popup ever opens.
  - **The `Symbol.for` fix above turned out to be real but not the actual
    cause of what the user kept reporting** ("2개 열려 있다", needing two
    clicks, a popup reappearing right after selecting) - a stacked-
    instance duplicate never reproduced under CDP even across repeated
    reload cycles once the `Symbol.for` fix landed, yet the user still saw
    it live. Diagnosed by polling `.suggestion-container` state at 50ms
    resolution across an open-ended window while asking the user to
    interact whenever ready (synchronizing a live user action to a
    bounded CDP capture window turned out to be the hard part - the user
    telling me "done" was itself enough to blur the input and resolve the
    broken state before I could inspect it, so a short/blocking capture
    always sampled *after* the interesting part was already over).  The
    poll showed the popup closing correctly on selection and then
    *reopening* ~300ms later against an empty query (matching every
    candidate, i.e. showing the single registered calendar again) - traced
    to `selectSuggestion` calling `this.inputEl.focus()` after clearing
    the input, which re-triggers this same suggest's own focus listener.
    Fixed by simply not refocusing the input after a selection.
  - **Still not fully resolved after the `focus()` fix** - live testing
    kept finding the same "two popups"/"reappears" symptom on the *second*
    full type-and-select cycle against the same input specifically (the
    first cycle was always clean), which never reproduced under CDP no
    matter what typing method was simulated (direct `execCommand`
    insertion, or genuine IME-style composition via CDP's
    `Input.insertText`) across many attempts - only real, live user
    interaction triggered it. Concluded the bug lives inside
    `AbstractInputSuggest`/`PopoverSuggest`'s own private state handling
    for this specific attach-to-an-arbitrary-contenteditable-div usage,
    not in anything in this file, and that patching around each new
    symptom (a `dataset` flag, then a `Symbol`, then a "remove the older
    of two same-content popups" `MutationObserver`) wasn't converging.
    Replaced the whole `AbstractInputSuggest` subclass with a small
    self-contained `InlineCalendarSuggest` class instead: its own
    `input`/`focus` listeners, its own absolutely-positioned popup div
    (`.harang-calendar-property-suggest`), and `mousedown` +
    `preventDefault` (not `click`) on each item to select without ever
    blurring the input mid-interaction - the same outside-click-close
    pattern already used by `eventCard.ts`'s event detail popup. This
    fully owns open/close/select, so there's no remaining dependency on
    `AbstractInputSuggest`'s internal behavior. Verified clean (single
    popup, correct data, no reopen) across two full type-select cycles in
    a row and across two plugin disable/enable cycles in a row, both via
    real CDP `Input.dispatchMouseEvent` clicks rather than synthetic
    `MouseEvent`s.
  - **Also fixed the Properties-panel-doesn't-refresh-live issue** (the
    write was always correct via `processFrontMatter`, but the panel row
    - especially a brand-new property's Text→List swap - often wouldn't
    visually update without reopening the note). Root cause, isolated via
    a sequence of targeted CDP tests: the panel simply won't re-render a
    row's pill list while that row's own value input still has focus,
    regardless of how the underlying value changes underneath it
    (`processFrontMatter`, or even an identical `editor.replaceRange`
    edit both worked and failed depending purely on this one variable in
    back-to-back tests). Fixed in `select()` by switching from
    `processFrontMatter` to a direct `editor.replaceRange` over just the
    frontmatter block - located via the official `frontmatterPosition` on
    `CachedMetadata` and rebuilt with the official `stringifyYaml`, so
    only that block's text is touched - immediately preceded by
    `this.inputEl.blur()`. Also switched from `workspace.getActiveFile()`
    to walking `workspace.iterateAllLeaves()` for the `MarkdownView`
    whose `containerEl` actually contains the input, so this now targets
    the correct note even when the Properties panel being edited isn't in
    the focused pane (split-layout) - the old `processFrontMatter` path
    (kept as a fallback if no such view is found) never had this
    precision. Verified via CDP: a real click through the full "brand-new
    Text-type property, first-ever selection" scenario now shows the pill
    immediately with no reopen needed, and the earlier two-cycle and
    reload-cycle regression checks above still pass unchanged.
  - **Follow-up correctness/hygiene pass, prompted by a direct request to
    check this file against `eslint-plugin-obsidianmd`, `tsc`, and
    Obsidian's own developer guidance** (not just "does it work"). Found
    and fixed one real gap the linter doesn't catch: `InlineCalendarSuggest`
    attached its `input`/`focus` listeners via a raw `addEventListener`
    with no corresponding cleanup, so they'd stay attached to the
    Properties-panel input indefinitely if the plugin unloaded while a
    note stayed open - a stale closure over the *old* plugin instance
    (and its settings) would keep responding to typing rather than being
    replaced. Switched both to `plugin.registerDomEvent(...)`, which ties
    their lifetime to the plugin's own unload.
    - That fix immediately made the `Symbol.for(...)`-keyed
      cross-reload-persistent attach-flag (see above) actively wrong: with
      listeners now correctly torn down on unload, the flag surviving on
      the DOM node across reloads told a *fresh* load's `attachAll` to
      skip elements that no longer had any active listener at all -
      confirmed via CDP, one reload with a note already open silently
      killed the feature for that note. Reverted to a plain per-load
      `WeakSet` (reset naturally each `registerFrontmatterPropertySuggest`
      call, no longer needing to survive a reload now that
      `registerDomEvent` handles that). Verified clean (exactly one
      popup, no reopen) across 0/1/2 reload cycles with the note open the
      whole time and a full click-to-select pass after two reloads - all
      against a *freshly restarted* Obsidian instance specifically, after
      an initial run against the long-lived instance from this session
      showed a misleading duplicate that turned out to be leftover state
      from the many earlier ad-hoc test scripts run against it, not a
      real bug (a instructive reminder to distrust results from a CDP
      target that's accumulated a long, ad-hoc test history without a
      restart).
  - `tsc -noEmit` and `eslint` (whole project) both clean throughout - the
    project has no other warnings besides one pre-existing, unrelated one
    in `settingsTab.ts` (`prefer-setting-definitions`, already suppressed
    there deliberately per that file's own comment). Worth being explicit
    that "lint-clean" isn't the same as "textbook Obsidian style" here:
    `eslint-plugin-obsidianmd` ships a `prefer-abstract-input-suggest`
    rule specifically meant to steer plugins away from reinventing
    suggest popups, but it only pattern-matches one well-known
    Popper.js-based community snippet - it doesn't (and structurally
    can't) recognize that `InlineCalendarSuggest` is *also* a reinvented
    suggest popup, just built differently. Its existence is a real signal
    that Obsidian's own preference is `AbstractInputSuggest`; the
    departure here was deliberate and is already documented at length
    above and in that class's own doc comment, not an oversight.
    Similarly, relying on undocumented internal class names
    (`.metadata-property`, `.multi-select-input`,
    `.metadata-input-longtext`) and reaching for `editor.replaceRange`
    over hand-built YAML instead of the officially-recommended
    `processFrontMatter` are both departures from Obsidian's general
    developer guidance, made deliberately and for documented reasons
    (see above), not things the linter has an opinion on either way.
- **Scrapped the whole per-calendar-name array + frontmatter autocomplete
  design above (everything from "Added calendar-name autocomplete to the
  native Properties panel" onward) and replaced it with a much simpler
  one: `harang-calendar` frontmatter now holds a single CalDAV *account*
  name (a plain string, not an array), scoping a note to that account's
  events - no calendar-level granularity in frontmatter at all (use each
  calendar's `enabled` toggle in settings for that), and no autocomplete
  anywhere for this value - it's meant to be copy-pasted or typed by hand
  from the account name already visible in settings.** Explicit user
  call: after watching how much back-and-forth the Properties-panel
  autocomplete took to get right (and after `AbstractInputSuggest` itself
  turned out to be unreliable for this specific usage even after several
  fix attempts), decided the calendar-array design was solving a problem
  not worth its own complexity, and asked for the simpler account-level
  scheme instead.
  - `CalDavAccount.name` already existed and was already editable in
    Settings (it just wasn't being used for anything besides section
    headings and error-message prefixes) - added a `.setDesc()` there
    explaining its new frontmatter role instead of adding a new field.
  - `CalDavEvent` gained an `accountName` field, populated in
    `store.ts`'s `fetchCalendar` (the one place that already knows both
    the fetched events and which `FetchJob.account` they came from) -
    `ics.ts`'s `buildEvent` sets a placeholder `""` for it since account
    identity isn't known that deep in the parse call chain, immediately
    overwritten by the mapping in `fetchCalendar`.
  - `store.ts`'s `scopeToCalendars`/`getEventsInRange`/`getEventByUid`
    changed from `string[]` (calendar display names, `Array.includes`)
    to a single `string | undefined` (account name, `===`) -
    `scopeToAccount` now.
  - `frontmatterScope.ts`'s `getFrontmatterScope` now reads the
    frontmatter value as a plain string (`typeof raw === "string"`)
    instead of requiring `Array.isArray`.
  - `dateWidget.ts`'s `unknownCalendarNames` (returning the subset of an
    array that didn't match any calendar) became `unknownAccountName`
    (returning the single scope value itself, or `null`, based on whether
    it matches any account's `name`) - `postProcessor.ts`/`livePreview.ts`
    updated to thread a `string | null` scope through instead of
    `string[] | null`.
  - Deleted entirely: `editorSuggest/FrontmatterCalendarSuggest.ts`
    (source-mode array-item `EditorSuggest`), `editorSuggest/
    frontmatterQuery.ts` (its array-position-finding helper, with no
    other callers), and `editorSuggest/frontmatterPropertySuggest.ts`
    (the `InlineCalendarSuggest` Properties-panel popup from the section
    above) - along with their `main.ts` registrations and the now-unused
    `.harang-calendar-property-suggest*` CSS. `i18n.ts`'s
    `dateWidgetUnknownCalendars` (`{names}`, joined) became
    `dateWidgetUnknownAccount` (`{name}`, singular).
  - `tsc -noEmit` and `eslint` both clean after the removal
    (`ics.ts`'s placeholder `accountName: ""` was the only spot the
    compiler needed a nudge - the field being newly required surfaced it
    immediately).
- **Split frontmatter scoping into two independent keys, `harang-account`
  and `harang-calendar` (the latter now means *calendar* name again, not
  a fallback for the account name from the previous entry).** Prompted by
  the user actually creating two calendars under the same CalDAV account
  ("radicale") and realizing account-only scoping (the design from the
  entry right above this one) couldn't tell those two calendars apart in
  frontmatter - only the global per-calendar `enabled` toggle in settings
  could, which isn't per-note. Either key alone matches across every
  account/calendar; both together narrow to that specific pairing - added
  `FrontmatterScope { accountName, calendarName }` (`types.ts`) as the
  shared shape threaded through `frontmatterScope.ts`,
  `store.ts`'s `scopeToFrontmatter` (was `scopeToAccount`),
  `dateWidget.ts`'s `unknownScopeNames` (was `unknownAccountName`,
  now returns however many of the two values didn't match instead of at
  most one), and the `postProcessor.ts`/`livePreview.ts` call sites.
  Manual copy-paste/typing (no autocomplete) stays the design from the
  entry above - only the number of independent scope dimensions changed,
  not the "no autocomplete" decision. Also added a `.setDesc()` on the
  account-name setting field explaining its frontmatter role, since that
  field already existed (just wasn't being used for anything besides
  section headings and error-message prefixes) and didn't need a new UI
  element, just documentation of its new purpose.
- **Fixed frontmatter scoping silently no-oping for real users, found
  immediately by the user testing their own real note.** `harang-account:
  radicale` worked, but `harang-calendar: tt` didn't scope anything even
  though it looked identical in the frontmatter block. Reading the note's
  actual cached frontmatter via CDP showed why: `harang-calendar` was
  stored as a one-item YAML list (`harang-calendar:\n  - tt`), not a plain
  string - Obsidian remembers a property's last-used Properties-panel
  widget type *per key, vault-wide*, and `harang-calendar` had spent this
  entire project's earlier life as a List-type (array) property, so a
  freshly-typed value still defaulted into list form. `readTextFrontmatter`
  only accepted `typeof raw === "string"`, so the array value was silently
  treated as absent - not an error, just quietly not scoping anything.
  Fixed by also accepting a one-item array (using its first string
  element) alongside a plain string. Verified against the user's actual
  note post-fix: the date widget now correctly shows only the "tt"
  calendar's event, not events from the other calendar under the same
  account.
- **Added `harang-date`/`harang-repeat` frontmatter: a note carrying it now
  shows up as an item in the sidebar agenda list and the month grid,
  merged alongside real CalDAV events - purely local to Obsidian, nothing
  written to or read from a CalDAV server.** User-requested, and distinct
  from `harang-account`/`harang-calendar` above (those scope a note's own
  `[[cal:...]]` widgets to a subset of CalDAV data; this makes the note
  itself an entry in the two *views*). `harang-date` is required
  (`YYYY-MM-DD`); `harang-repeat` is optional and reuses the exact same
  `rrule` package/parsing approach already used for CalDAV `RRULE`
  expansion, so a note can repeat with the same syntax a real recurring
  event would use.
  - New `src/notes/noteEvents.ts`: scans `vault.getMarkdownFiles()` for
    the frontmatter (no live file-watcher/index - re-scanned fresh on
    each view open/refresh/navigation, the same "good enough without a
    watcher" tradeoff `CalendarStore`'s own TTL-based staleness already
    accepts) and expands `harang-repeat` into occurrences inside a range.
    Deliberately re-derives all-day-safe date math from scratch rather
    than reusing `caldav/recurrence.ts`'s `expandEvent` - that function
    anchors DTSTART to a true UTC instant (`new Date(event.start)`,
    appropriate for a real timestamped CalDAV event) where a note event
    has no time-of-day at all, so both the RRULE's DTSTART and the
    range bounds are instead expressed as UTC-midnight-per-calendar-day
    throughout, consistently - the same local/UTC all-day mismatch fixed
    three separate times elsewhere in this project (see above) would
    otherwise show up a fourth time here.
  - `types.ts` gained `NoteEvent` and a `CalendarListItem` discriminated
    union (`{kind: "caldav", event} | {kind: "note", noteEvent}`) - the
    shared shape the agenda/month views now render through.
    `[[cal:...]]` date widgets and event chips are untouched, still
    dealing only in `CalDavEvent` directly - the union only exists at the
    two views' own boundary.
  - `view/agenda.ts`'s `groupEventsByLocalDay` became
    `groupItemsByLocalDay`, generalized to sort/group either item kind (a
    note event sorts as if all-day, using its own resolved `dateKey`).
    `view/monthGrid.ts`'s `buildMonthGrid` and both view states
    (`CalendarViewState`/`MonthViewState`) were updated the same way
    (`events` -> `items`). `AgendaItemView.ts`/`MonthItemView.ts` now
    merge `CalendarStore.getEventsInRange` with
    `getNoteEventsInRange` into one `CalendarListItem[]` before handing
    it to the Vue layer.
  - `AgendaView.vue`/`MonthView.vue` branch rendering on `item.kind`: a
    note item shows its filename with an "all day" label and a dashed
    left border/outline (`.harang-calendar-note-event-card`/
    `.harang-calendar-month-day-pill-note`) to stay visually distinct
    from a real CalDAV event in the same list, and opens the note itself
    on click (`onOpenNote`, a new prop backed by
    `workspace.getLeaf(false).openFile(file)`) rather than the event
    detail popup.
  - **Incidentally fixed a real, separate gap found while touching this
    code**: `AgendaView.vue`'s CalDAV event cards had no click handler at
    all - clicking one in the sidebar agenda list did nothing, unlike the
    month view and date widgets, which already opened the detail popup.
    `usage.rst` had already (incorrectly) documented the sidebar as
    supporting this. Fixed by wiring the same `openEventCard` call the
    month view already uses, plus keyboard support (Enter/Space) and
    focus/hover styling, matching the existing pattern from
    `dateWidget.ts`'s item rows.
  - Verified via CDP against the real running instance: a one-off note
    event, a `FREQ=WEEKLY;COUNT=4` repeating note event, and real CalDAV
    events all correctly interleaved and sorted in both the agenda list
    and the month grid; clicking a note item (in both views) opened the
    correct note; clicking a CalDAV item (in both views, including the
    now-fixed agenda list) opened the correct event popup with accurate
    data.
- **`expandDates`'s invalid-RRULE catch block now falls back to a single
  occurrence on `harang-date` instead of returning `[]`.** Caught during a
  documentation cross-check, not user-reported: `usage.rst` was about to
  claim "an invalid `harang-repeat` value is ignored silently (the note
  simply doesn't repeat)", but the actual `catch` block returned `[]`,
  which drops the note from every range entirely rather than just not
  repeating it. Fixed by extracting the existing single-date logic into
  `expandSingleDate` and calling it from the `catch` block too, so the
  note's own `harang-date` still resolves even when `harang-repeat` fails
  to parse - the note itself is still valid, so silently disappearing
  everywhere would be a worse failure mode than just not repeating.
  Verified via CDP with a deliberately-broken `harang-repeat` value: the
  note still shows on its `harang-date`, no crash.
- **Added `harang-time` frontmatter: an optional `HH:MM-HH:MM` (24-hour)
  time range for a note event, layered on top of `harang-date`/
  `harang-repeat`.** User-requested follow-up after reviewing the note-
  event feature above ("looking again, I think we need to add time too"),
  confirmed to be a range (not a single time) and to live in its own key
  rather than folding into `harang-date` - `harang-date` stays a pure
  `YYYY-MM-DD` date either way. Absence means the note event stays
  all-day, exactly as before - fully backward compatible.
  - `notes/noteEvents.ts`: `HarangDateFrontmatter` gained `startTime`/
    `endTime` (both `"HH:MM"` strings or both `null`), parsed from
    `harang-time` by a `parseTimeRange` helper matching
    `/^([01]\d|2[0-3]):([0-5]\d)-([01]\d|2[0-3]):([0-5]\d)$/` and
    rejecting a start not strictly before the end. Anything that doesn't
    match - missing, malformed, wrong order - falls back to `null`/`null`
    (all-day), the same graceful-fallback principle just applied to
    invalid `harang-repeat` above, rather than crashing or hiding the
    note.
  - `types.ts`'s `NoteEvent` gained matching `startTime`/`endTime` fields,
    threaded straight through from `getNoteEventsInRange`.
  - `view/agenda.ts`'s `itemSortMs` now sorts a timed note event at its
    own start time (converted to minutes-since-local-midnight added to
    the day's UTC-midnight-anchored `dateKey`) instead of always at the
    start of the day, so it interleaves correctly with timed CalDAV
    events on the same day. A new `formatNoteEventTime` helper mirrors
    `formatEventTime`: the `"HH:MM–HH:MM"` range when both times are set,
    else the all-day label.
  - `AgendaView.vue`/`MonthView.vue` both call `formatNoteEventTime`
    instead of always rendering the all-day label for a note item.
  - Verified via CDP against the real running instance: a note with a
    valid `harang-time` shows `"14:00–15:00"` and sorts correctly next to
    a same-day timed CalDAV event; a note without `harang-time` and one
    with an invalid value (`not-a-time`) both still render as all-day, no
    regression and no crash - in both the sidebar agenda list and the
    month view's day-detail list.

## Remaining steps

Everything in `AGENTS.md`'s spec is implemented. What's left is
non-blocking polish:

1. Move this file's now-empty roadmap into a plain changelog/feature list
   once no more "remaining steps" are pending; README.md/README.ko.md
   already list the shipped features.
2. **Enhancements** (revisit if it comes up): agenda sidebar's window is
   still a fixed 30 days (unlike the month view, which now navigates);
   showing multi-day events on every day they span instead of only their
   start day; live preview's frontmatter scope is read from the active
   file (`workspace.getActiveFile()`), which can be imprecise with
   multiple panes open side by side.

## Known limitations (accepted scope for now)

- **`harang-account`/`harang-calendar` frontmatter scoping can't disambiguate two same-*named* calendars within the same account.** CalDAV servers key a calendar by its URL, not its display name, and don't enforce display-name uniqueness - nothing stops a user from having two calendars named identically under one account. Scoping matches on the display-name string (see above), so even specifying both keys together wouldn't tell such a pair apart; only the calendar's own URL/ID would, and that's not a value meant to be hand-typed into frontmatter (breaks the "copy what you see in Settings" intent this scoping is built around). Confirmed as an accepted, deliberate gap - not a real concern raised by the user, just a design-limits question they asked and wanted on record.
- **No VTIMEZONE parsing / no RECURRENCE-ID override matching.** TZID and
  floating times are resolved using the account's configured time zone
  (see above) rather than the ICS's own `TZID` string, since real-world
  servers frequently emit non-IANA zone names (e.g. Windows zone IDs).
  Per-instance edits to a recurring event (a separate VEVENT with a
  matching UID + `RECURRENCE-ID`) aren't matched against expanded
  occurrences yet - the base rule's occurrence is shown instead.
- **All-day recurring events aren't expanded.** `expandRecurrence` returns
  them as a single occurrence on their original `DTSTART` date.
- **DST-crossing recurrence.** `rrule` (like all `rrule.js` usage) does
  its math on UTC calendar fields, so a recurring event's *local* clock
  time can drift by the DST amount across a transition in zones that
  observe it. This is a documented characteristic of the library, not
  something specific to this plugin - fixing it would require re-basing
  each occurrence through the account's time zone offset individually.
- **No `DURATION` on `VALARM`/other sub-components**, and no support for
  a `VEVENT` providing both a recurring `RDATE` list or `EXRULE` (only
  `RRULE` + `EXDATE` are read).
- **`ensureRangeFetched`'s gap-filling assumes contiguous navigation.**
  It tracks one `coveredRange` and only computes at-most-two gaps (before/
  after); a hypothetical "jump to an arbitrary distant month" feature
  would re-fetch the whole span in between too, not just the target
  month, since the covered range would grow to cover the gap between old
  and new territory. Not an issue today - the month view only moves one
  month at a time - but worth revisiting if direct month/year jumping is
  added.
- **Once a range is covered, re-visiting it only re-checks staleness by
  the global `cacheTtlMinutes` TTL**, not on every visit. This is
  deliberate (that's the point of on-demand caching), but it means a
  server-side change to an already-cached month won't show up until the
  TTL elapses or the user clicks "Refresh" - there's no push/webhook
  notification from the CalDAV server.
- **A frontmatter-only edit may leave already-rendered widgets/chips
  stale in Reading view until the note is reopened.** If a note's
  `harang-calendar` frontmatter changes but the body text of a
  `[[cal:...]]`/`[[event:...]]` line doesn't, Obsidian's own preview
  diffing can reuse the previously-rendered HTML for that line rather
  than re-invoking our post-processor, so the scope change doesn't take
  effect until something forces a full re-render (reopening the note,
  editing the line itself, etc.). Confirmed via CDP testing: scoping
  logic itself (`scopeToCalendars`/`unknownCalendarNames`) is correct
  and takes effect immediately on a fresh render - this is purely a
  side effect of Obsidian's own rendering pipeline having no way to
  know our post-processor's output depends on frontmatter, not a bug
  in this plugin's scoping.
- **Do not use `app.metadataTypeManager.setType()` from this plugin.** It
  was tried while chasing the Properties-panel refresh issue below and
  found to be destructive: calling it on "harang-calendar" reset the
  property's value back to `null`, discarding a selection that had just
  been correctly written - confirmed by reading the raw file content
  immediately after the call. It's presumably designed around Obsidian's
  own manual type-switcher menu, where the user is expected to want a
  fresh value of the new type, not preserving what was there under the
  old one.
