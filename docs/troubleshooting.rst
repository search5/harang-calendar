Troubleshooting & FAQ
======================

"Connection failed" when discovering calendars
-------------------------------------------------------------

**Symptom:** clicking **Test connection & discover calendars** shows a
"Harang calendar: Connection failed - ..." notice.

**Cause:** most commonly one of:

* The Server URL is wrong, unreachable, or missing the ``https://`` scheme.
* The username or password is incorrect.
* The server doesn't support the standard CalDAV discovery chain
  (``current-user-principal`` → ``calendar-home-set``) and isn't pointed
  directly at a calendar collection either.
* The server requires OAuth2 rather than Basic Auth (Google Calendar's own
  CalDAV endpoint, for example) — only Basic Auth is supported.

**Fix:** double-check the credentials, and if discovery keeps failing, try
pointing Server URL directly at a calendar collection URL instead of the
server root.

An event chip looks faded with a dashed border ("unresolved")
-------------------------------------------------------------

**Symptom:** an ``[[event:...]]`` chip renders with reduced opacity and a
dashed border instead of a normal filled chip, and clicking it shows "This
event could not be found. A refresh may be needed."

**Cause:** the plugin could not find a matching event in its current
cache. This happens when the referenced event was deleted from the server,
the calendar it belonged to was disabled, or the local cache simply hasn't
been refreshed since the note was written.

**Fix:** run the **Refresh calendars** command (or click **Refresh** in
settings), then reopen the note. If the chip is still unresolved after a
refresh, the event may genuinely no longer exist on the server (or its
calendar is disabled — check **Show this calendar** in settings).

``harang-account``/``harang-calendar`` frontmatter doesn't seem to filter anything
-----------------------------------------------------------------------------------------

**Symptom:** frontmatter is set, but a ``[[cal:...]]`` widget in the same
note still shows events from every account/calendar, with no warning about
an unrecognized name either.

**Cause:** this most often means the value isn't actually a plain string
under the hood. If you added the property through Obsidian's Properties
panel (rather than typing raw YAML), a freshly-created property defaults
to the **Text** type — but if ``harang-account``/``harang-calendar`` was
ever used as a **List** property anywhere in your vault before, Obsidian
remembers that per property *key*, vault-wide, and may keep offering (or
silently produce) a list value instead. A single-item list is read the
same as a plain string, so this specific case isn't actually the problem
by itself — but an *empty* list, or a value that isn't a string or a
one-item string list at all, is treated as "no scope."

**Fix:** open the note's frontmatter in source mode
(``harang-account: Work``, not ``harang-account:`` with nothing after it)
and confirm there's an actual non-empty value on the line. If the
Properties panel shows the field as a list with items in it, that's fine
as long as there's exactly one item.

A note's frontmatter change doesn't show up until you reopen the note
-------------------------------------------------------------------------------

**Symptom:** you just edited ``harang-account``/``harang-calendar`` in a
note that's already open, but the ``[[cal:...]]`` widget(s) in Reading view
still reflect the old scope.

**Cause:** if only the frontmatter changed and the body text of the widget
line didn't, Obsidian's own Reading-view rendering can reuse the
previously-rendered HTML for that line instead of re-invoking this
plugin's post-processor.

**Fix:** switch to Source/Live Preview mode and back, or close and reopen
the note, to force a fresh render.

Two calendars can't be told apart even with both frontmatter keys set
-------------------------------------------------------------------------------

**Symptom:** ``harang-account`` and ``harang-calendar`` are both set to a
specific pairing, but events from a different calendar under the same
account still show up.

**Cause:** CalDAV servers identify a calendar by its URL, not its display
name, and don't enforce display-name uniqueness — if two calendars under
the same account happen to share the exact same name, frontmatter scoping
(which matches on the display name) can't distinguish between them.

**Fix:** rename one of the calendars on the server so their display names
differ; there's no way to disambiguate purely from frontmatter.

A recurring event's time looks off by an hour around a DST change
-------------------------------------------------------------------------------

**Cause:** the underlying ``rrule`` library expands recurrence using UTC
calendar fields, so a recurring event's *local* clock time can drift by
the DST amount across a transition in a zone that observes it. This is a
known, accepted limitation — see the project's ``ROADMAP.md`` for details.

The plugin doesn't appear after installing
------------------------------------------------

**Fix:** confirm ``main.js``, ``manifest.json``, and ``styles.css`` are
directly inside ``<vault>/.obsidian/plugins/harang-calendar/`` (not a
subfolder), that the plugin is enabled under
**Settings → Community plugins**, and that Obsidian is on version 1.12.7 or
later (see :doc:`prerequisites`). Fully restart Obsidian after installing
or updating the files.

The plugin doesn't update after ``git pull``
--------------------------------------------------

**Symptom:** you pulled the latest source changes, but Obsidian still
behaves like the old version.

**Cause:** installing from source requires an explicit rebuild and a
manual copy step — pulling new source alone does not update the files
Obsidian actually loads.

**Fix:** run the full update sequence from :doc:`installation`, Method 2:

.. code-block:: bash

   git pull
   npm install
   npm run build

Then copy the freshly built ``main.js`` (and ``manifest.json``/
``styles.css`` if they changed) into
``<vault>/.obsidian/plugins/harang-calendar/`` again, and restart Obsidian.
