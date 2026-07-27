Architecture
============

Source layout
--------------

All of the plugin's logic lives under ``src/``:

.. list-table::
   :header-rows: 1
   :widths: 35 65

   * - File
     - Responsibility
   * - ``main.ts``
     - Plugin entry point: loads settings, registers the sidebar/month
       views, both editor suggests, the live preview extension, and the
       post-processor; adds the **Open calendar in sidebar**, **Open
       calendar in a new tab**, and **Refresh calendars** commands.
   * - ``types.ts``
     - Shared types: ``CalDavEvent``, ``CalDavCalendar``, ``CalDavAccount``,
       ``CalDavTimezone``, ``HarangCalendarSettings``, ``FrontmatterScope``,
       ``NoteEvent``, ``CalendarListItem``.
   * - ``settings.ts`` / ``settingsTab.ts``
     - Default settings and the settings UI. ``settingsTab.ts`` implements
       Obsidian's classic imperative ``display()`` API rather than the
       newer declarative ``getSettingDefinitions()`` API (1.13.0+), so the
       settings UI works on Obsidian versions below 1.13.0 too.
   * - ``i18n.ts``
     - Looks up the current Obsidian UI language via the official
       ``getLanguage()`` API and returns matching strings from a small
       ``ko``/``en`` dictionary (falling back to English).
   * - ``caldav/client.ts``
     - A minimal read-only CalDAV client: calendar discovery
       (``PROPFIND``/``current-user-principal``/``calendar-home-set``) and
       event fetching (``REPORT`` ``calendar-query``, optionally windowed
       to a time range), over Obsidian's ``requestUrl``.
   * - ``caldav/ics.ts``
     - An iCalendar (RFC 5545) parser extracting ``VEVENT`` properties into
       a ``CalDavEvent``, skipping ``VALARM``/other sub-components so their
       properties don't leak into the parent event.
   * - ``caldav/recurrence.ts``
     - Expands a ``CalDavEvent`` with an ``RRULE`` into concrete occurrences
       within a range, via the `rrule <https://github.com/jkbrzt/rrule>`_
       package (``EXDATE`` entries excluded).
   * - ``caldav/timezone.ts``
     - Resolves an account's configured time zone (an IANA zone name via
       ``Intl``, or a fixed UTC offset) and lists known IANA zones for the
       settings dropdown.
   * - ``caldav/store.ts``
     - ``CalendarStore``: merges and caches events from every configured
       account/calendar, with TTL-based staleness, on-demand gap-filling
       for the month view's range navigation, and scope/search/lookup
       helpers.
   * - ``editorSuggest/DateEditorSuggest.ts``, ``dateCandidates.ts``
     - Triggers on ``@date[``, suggests upcoming dates matching the typed
       query, and inserts ``[[cal:YYYY-MM-DD]]``.
   * - ``editorSuggest/EventEditorSuggest.ts``
     - Triggers on ``@event[``, searches the cached event store by title,
       and inserts ``[[event:<uid>]]``.
   * - ``render/frontmatterScope.ts``
     - Reads a note's ``harang-account``/``harang-calendar`` frontmatter
       into a ``FrontmatterScope``.
   * - ``notes/noteEvents.ts``
     - Scans the vault for ``harang-date``/``harang-repeat``/``harang-time``
       frontmatter and expands each into ``NoteEvent`` occurrences inside a
       range - purely local to Obsidian, unrelated to any CalDAV server.
       Re-derives its own all-day-safe RRULE expansion rather than reusing
       ``caldav/recurrence.ts`` (see below).
   * - ``render/dateWidget.ts``
     - Builds the ``[[cal:YYYY-MM-DD]]`` card widget: a heading, a warning
       if the note's frontmatter scope names an unregistered account/
       calendar, and the day's events (scoped accordingly) as clickable
       rows.
   * - ``render/eventChip.ts`` / ``render/eventCard.ts``
     - The inline event chip, and the click-to-open detail popup (a
       manually positioned floating panel, closed on outside click or
       Esc). Event lookups are never scoped by frontmatter — a
       ``[[event:<uid>]]`` reference already names one exact event.
   * - ``render/livePreview.ts``
     - A CodeMirror 6 ``ViewPlugin`` that replaces
       ``[[cal:...]]``/``[[event:...]]`` ranges with widget/chip widgets in
       Live Preview, skipping ranges the cursor or selection currently
       overlaps so the raw syntax stays editable.
   * - ``render/postProcessor.ts``
     - A Markdown post-processor that does the same replacement for Reading
       view. Obsidian parses ``[[...]]`` into a wikilink
       (``a.internal-link``) before any post-processor runs, so this reads
       each link's ``href``/``data-href`` rather than scanning raw text (a
       raw-text fallback still runs for bracket text that isn't inside a
       parsed wikilink).
   * - ``view/agenda.ts``, ``view/AgendaItemView.ts``, ``vue/AgendaView.vue``
     - The sidebar agenda list: a fixed 30-day window of ``CalendarListItem``
       (CalDAV events and note events merged) grouped by local day, rendered
       by a Vue 3 component the ``ItemView`` hosts.
   * - ``view/monthGrid.ts``, ``view/MonthItemView.ts``, ``vue/MonthView.vue``
     - The full-tab month grid view (same ``CalendarListItem`` merge as the
       agenda list), including keyboard (arrow-key) date navigation and
       cross-month boundary handling.
   * - ``view/MonthPickerModal.ts``
     - The year/month picker opened from the month view's heading, with a
       click-to-edit year field.

Data flow
----------

.. code-block:: text

   settingsTab.ts          -->  CalDavAccount[] (server URL, credentials, calendars)
        |
        v
   caldav/client.ts         -->  PROPFIND/REPORT over requestUrl
        |                        (discovery + event fetch)
        v
   caldav/ics.ts              -->  parses each VEVENT into a CalDavEvent
        |
        v
   caldav/recurrence.ts         -->  expands RRULE occurrences on demand
        |
        v
   caldav/store.ts                -->  merged, cached, scoped CalDavEvent[]
        |
        +--> editorSuggest/*.ts          -->  autocomplete while typing
        |
        +--> render/livePreview.ts       -->  widget/chip (Live Preview)
        |
        +--> render/postProcessor.ts     -->  widget/chip (Reading view)
        |        |
        |        v
        |  render/eventChip.ts + eventCard.ts  -->  click-to-open detail popup
        |
        +--> view/AgendaItemView.ts / vue/AgendaView.vue   -->  sidebar list
        |
        +--> view/MonthItemView.ts / vue/MonthView.vue     -->  month grid

   notes/noteEvents.ts (vault-wide frontmatter scan) --> NoteEvent[]
        |
        +--> (merged into a CalendarListItem[] alongside CalDavEvent[],
              inside AgendaItemView.ts/MonthItemView.ts, right before
              the sidebar list / month grid above render - nothing else
              in this diagram ever sees a NoteEvent)

Reference syntax
------------------

``[[cal:YYYY-MM-DD]]`` renders as a date widget; ``[[event:<uid>]]``
renders as an event chip. Both are normally inserted by the ``@date[``/
``@event[`` editor suggests, but either can be typed by hand too — an
unresolvable ``event`` UID renders as a faded, dashed chip instead of
failing silently.

Frontmatter scoping (``harang-account``/``harang-calendar``, see
:doc:`usage`) only affects date widgets, not event chips, since a chip
already names one exact event by UID.

Note events (``harang-date``/``harang-repeat``/``harang-time``)
-------------------------------------------------------------------------

Unrelated to the reference syntax above: a note carrying ``harang-date``
frontmatter (see :doc:`usage`) becomes a ``NoteEvent`` and shows up as an
item in the sidebar agenda list and month grid only - never in a
``[[cal:...]]`` date widget or as an event chip, and never written to or
read from a CalDAV server. ``harang-repeat`` reuses the same ``rrule``
package as ``caldav/recurrence.ts``, but with its own from-scratch
expansion logic (see ``notes/noteEvents.ts`` above) rather than sharing
that module's function directly, since a note event has no time-of-day at
all by default and needs consistently UTC-midnight-anchored date math
throughout to avoid the local/UTC all-day mismatch this project has hit
(and fixed) several times elsewhere. ``harang-time`` layers an optional
``HH:MM-HH:MM`` display range on top of that all-day date math - it only
affects how a ``NoteEvent`` is labeled and sorted alongside timed CalDAV
events, not the (still UTC-midnight-anchored) date expansion itself.

No runtime dependencies beyond ``rrule``
--------------------------------------------

Beyond what Obsidian itself provides (the ``obsidian`` package, CodeMirror
6, Vue 3) and the `rrule <https://github.com/jkbrzt/rrule>`_ package for
recurrence expansion, the plugin has no runtime dependencies — the CalDAV
client and iCalendar parser are both hand-written rather than pulled in
from npm, keeping the bundle small and avoiding exposure to a third-party
HTTP/XML parsing library's own vulnerabilities.
