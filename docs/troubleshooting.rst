Troubleshooting & FAQ
======================

"Connection failed" when discovering calendars
-------------------------------------------------------------

**Symptom:** clicking **Test connection & discover** shows a
"Harang calendar: Connection failed - ..." notice.

**Cause:** most commonly one of:

* The Server URL is wrong, unreachable, or missing the ``https://`` scheme.
* The username or password is incorrect.
* The server doesn't support the standard CalDAV discovery chain
  (``current-user-principal`` → ``calendar-home-set``) and isn't pointed
  directly at a calendar collection either.
* The server requires OAuth2 rather than Basic Auth — only Basic Auth is
  supported.

**Fix:** double-check the credentials, and if discovery keeps failing, try
pointing Server URL directly at a calendar collection URL instead of the
server root.

An event chip looks faded with a dashed border ("unresolved")
-------------------------------------------------------------

**Symptom:** a ``{{hrcal:...:event:...}}`` chip renders with reduced
opacity and a dashed border instead of a normal filled chip, and clicking it
shows "This event could not be found. A refresh may be needed."

**Cause:** the plugin could not find a matching event in its current
cache. This happens when the referenced event was deleted from the server,
the calendar it belonged to was disabled, or the local cache simply hasn't
been refreshed since the note was written.

**Fix:** run the **Refresh calendars** command (or click **Refresh** in
settings), then reopen the note. If the chip is still unresolved after a
refresh, the event may genuinely no longer exist on the server (or its
calendar is disabled — check **Show this calendar** in settings).

A recurring event's time looks off by an hour around a DST change
-------------------------------------------------------------------------------

**Cause:** the underlying ``rrule`` library expands recurrence using UTC
calendar fields, so a recurring event's *local* clock time can drift by
the DST amount across a transition in a zone that observes it. This is a
known, accepted limitation of the current implementation.

The plugin doesn't appear after installing
------------------------------------------------

**Fix:** confirm the plugin is enabled under **Settings → Community
plugins** (installing it via **Browse** does not enable it automatically),
and that Obsidian is on version 1.12.7 or later (see :doc:`prerequisites`).
If you installed manually, also confirm ``main.js``, ``manifest.json``, and
``styles.css`` are directly inside
``<vault>/.obsidian/plugins/harang-calendar/`` (not a subfolder), and fully
restart Obsidian after copying the files.

If you installed from source
-------------------------------------------------

The following applies only if you built the plugin yourself, per
:doc:`installation` Method 3 — most users installing through Community
Plugins will never hit this.

**Symptom:** you pulled the latest source changes, but Obsidian still
behaves like the old version.

**Cause:** installing from source requires an explicit rebuild and a
manual copy step — pulling new source alone does not update the files
Obsidian actually loads.

**Fix:** run the full update sequence:

.. code-block:: bash

   git pull
   npm install
   npm run build

Then copy the freshly built ``main.js`` (and ``manifest.json``/
``styles.css`` if they changed) into
``<vault>/.obsidian/plugins/harang-calendar/`` again, and restart Obsidian.
