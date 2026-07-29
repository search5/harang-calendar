Usage
=====

Adding a CalDAV account
------------------------------------

1. Open **Settings → Harang Calendar**.
2. Under **CalDAV server accounts**, click **Add a new server account**.
3. Fill in the account:

.. list-table::
   :header-rows: 1

   * - Field
     - Description
   * - Account name
     - A label for this account, shown when picking it in the ``{{hrcal:``
       autocomplete and embedded in any reference you insert from it.
   * - Server URL
     - The CalDAV base URL, or the exact calendar collection URL.
   * - Username / Password
     - Your CalDAV account credentials.
   * - Time zone
     - Used to resolve event times that aren't already in UTC. Pick your
       calendar's zone from the list, or **Custom UTC offset…** if it isn't
       listed.

4. Click **Test connection & discover**. The plugin walks the
   standard CalDAV discovery chain (``current-user-principal`` →
   ``calendar-home-set`` → calendar collections) and lists every calendar it
   finds under the account. If your Server URL already points directly at a
   calendar collection, it is used as-is without further discovery.
5. Each discovered calendar gets its own row, with a **Show this calendar**
   toggle and an optional color override (any valid CSS color, e.g.
   ``#4285F4`` — leave blank to use the server's own color, if it provides
   one). Only calendars with the toggle on are fetched and shown anywhere in
   the plugin.

You can add multiple accounts (for multiple servers, or multiple times to
the same server); events from every enabled calendar across every account
are merged in the agenda/month views. Re-run **Test connection & discover**
any time a calendar is added or removed on the server — the
plugin doesn't detect that on its own.

Referencing a date or event in a note
-------------------------------------------

Type ``{{hrcal:`` to start a staged reference - there's no separate trigger
for dates vs. events:

.. code-block:: text

   Let's meet {{hrcal:

1. An autocomplete popup lists your registered **account names**; typing
   narrows it. Selecting one appends ``<accountName>:`` and immediately
   opens the next stage.
2. The popup now lists that account's **calendar names**. Selecting one
   appends ``<calendarName>:``.
3. The popup now shows a combined list of **upcoming dates** and **matching
   events by title** (searched with a case-insensitive substring match,
   spaces included) - typing digits narrows the dates, typing text narrows
   the events, and both can appear together.

Selecting a date candidate inserts
``{{hrcal:<accountName>:<calendarName>:date:2026-08-07}}`` and renders it as
a card widget: a heading for that date, and every matching event that day
from that specific account/calendar listed underneath (or a "No events on
this day." message if there are none).

Selecting an event candidate inserts
``{{hrcal:<accountName>:<calendarName>:event:<uid>}}`` and renders it as an
inline chip — the event's title and time range in a rounded pill.

Both render the same way in Live Preview and Reading view. Clicking a chip
(or an event row inside a date widget) opens a small popup with the event's
date/time, location, and notes (whichever of those fields the event has).
Click anywhere outside the popup, or press **Esc**, to close it. If a chip
looks faded with a dashed border, the plugin could not resolve it to a known
event — see :doc:`troubleshooting`.

Scoping a note to one account or calendar
-------------------------------------------------

.. warning::

   **Currently unused.** ``{{hrcal:...}}`` references name their account and
   calendar directly, so nothing reads this frontmatter to scope anything
   any more. Kept documented here in case it's revived for a future feature.

Historically, a date widget drew from every enabled calendar across every
account by default, and frontmatter on the note narrowed that down:

.. code-block:: yaml

   ---
   harang-account: Work
   harang-calendar: Team events
   ---

.. list-table::
   :header-rows: 1

   * - Frontmatter
     - Scope
   * - ``harang-account`` only
     - Every enabled calendar under that account.
   * - ``harang-calendar`` only
     - Any calendar with that exact name, across every account (useful if
       you only have one account, or don't need to disambiguate).
   * - Both
     - Only that specific calendar within that specific account — the way
       to tell apart two calendars that happen to share a name, or two
       calendars with the same name under different accounts.
   * - Neither
     - No restriction (the default).

Both values are plain text — copy them from Settings exactly as shown
there (account name as you named it; calendar name as the server reports
it) and paste, or type them by hand. There is no autocomplete for either
field. If a value doesn't match any known account/calendar, the date
widget shows a warning naming the unrecognized value(s) instead of silently
showing nothing.

.. note::

   Obsidian's Properties panel remembers a property's value type (Text vs.
   List) per key across your whole vault, not per note. If ``harang-account``
   or ``harang-calendar`` was ever entered as a list anywhere in your vault,
   the Properties panel may keep offering a list-style input for it
   afterward. A single-item list (e.g. ``harang-calendar:\n  - Team
   events``) is read the same as a plain string, so this doesn't break
   anything — but a plain text field is all either key is meant to hold.

Showing a note itself in the calendar views
-------------------------------------------------

The features above all pull from your CalDAV server. Separately, a note can
show up as an item in the sidebar agenda list and the month grid on its own
— purely local to Obsidian, nothing is ever written to or read from the
CalDAV server for this:

.. code-block:: yaml

   ---
   harang-date: 2026-08-15
   harang-repeat: FREQ=WEEKLY;BYDAY=MO
   harang-time: 14:00-15:00
   ---

``harang-date`` (required, ``YYYY-MM-DD``) is the date the note shows up
on. ``harang-repeat`` (optional) is an RRULE string — the exact same syntax
and parsing (the `rrule <https://github.com/jkbrzt/rrule>`_ package) already
used to expand a real recurring CalDAV event — that repeats the note across
every matching occurrence; without it, the note shows up on ``harang-date``
alone. ``harang-time`` (optional) is a 24-hour ``HH:MM-HH:MM`` range; without
it, the note event displays as all-day. A note event always has a dashed
border/outline to keep it visually distinct from a real CalDAV event in the
same list. Clicking it opens the note itself, not an event detail popup.

An invalid ``harang-time`` value (wrong format, or a start not before the
end) is ignored silently — the note falls back to showing as all-day, the
same way an invalid ``harang-repeat`` falls back to not repeating.

``harang-repeat`` accepts the standard iCalendar RRULE keywords:

.. list-table::
   :header-rows: 1

   * - Keyword
     - Meaning
   * - ``FREQ`` (required)
     - ``DAILY``, ``WEEKLY``, ``MONTHLY``, or ``YEARLY``.
   * - ``INTERVAL``
     - Repeat every *N* units instead of every one, e.g. ``INTERVAL=2`` with
       ``FREQ=WEEKLY`` means every 2 weeks.
   * - ``BYDAY``
     - One or more weekdays (``MO``, ``TU``, ``WE``, ``TH``, ``FR``,
       ``SA``, ``SU``), comma-separated, e.g. ``BYDAY=MO,WE,FR``.
   * - ``COUNT``
     - Total number of occurrences. Mutually exclusive with ``UNTIL``.
   * - ``UNTIL``
     - The last date to repeat through, as ``YYYYMMDD``, e.g.
       ``UNTIL=20261231``. Mutually exclusive with ``COUNT``.

.. code-block:: yaml

   harang-repeat: FREQ=WEEKLY;BYDAY=MO                          # every Monday
   harang-repeat: FREQ=DAILY;COUNT=5                             # 5 days in a row
   harang-repeat: FREQ=MONTHLY;INTERVAL=2                        # every other month, same date
   harang-repeat: FREQ=WEEKLY;BYDAY=MO,WE,FR;UNTIL=20261231      # Mon/Wed/Fri through the end of 2026

An invalid ``harang-repeat`` value is ignored silently (the note simply
doesn't repeat) rather than raising an error.

Browsing events: sidebar agenda view
-------------------------------------------

Run the **Open calendar in sidebar** command (from the command palette) to
open a sidebar view listing every event over the next 30 days (CalDAV
events and any note carrying ``harang-date`` alike, merged and sorted
together), grouped by day, with "Today"/"Tomorrow" used in place of those
two dates' headings. All-day events are marked accordingly instead of
showing a time. Click an event to open the same detail popup used
elsewhere, or a note item to open that note.

Browsing events: full month view
---------------------------------------

Run the **Open calendar in a new tab** command to open a full-tab month
grid. Click a date to select it and see that day's events; use the arrow
keys to move the selection (Left/Right by a day, Up/Down by a week) once a
date has focus. Use the ‹/› buttons to move a month at a time, or click the
month/year heading to open a picker for jumping to an arbitrary month and
year directly (click the year to switch it from a label to a text input).

Refreshing calendar data
---------------------------------------

Events are cached and refreshed automatically once the cache lifetime
(**Settings → Harang Calendar → Cache lifetime (minutes)**, default 30
minutes) elapses. Navigating the month view to a range outside what's
already cached fetches just that gap on demand. To refresh immediately:

* Run the **Refresh calendars** command from the command palette, or
* Click **Refresh** next to **Refresh all calendars now** in settings.
