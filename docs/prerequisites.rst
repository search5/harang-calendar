Prerequisites
=============

Before using **harang-calendar**, make sure the following are in place.

1. A reachable CalDAV server
---------------------------------

You need at least one CalDAV-compatible calendar you can reach over
HTTP(S) — for example `Radicale <https://radicale.org/>`_, Nextcloud
Calendar, Fastmail, or any other server that implements
`RFC 4791 <https://www.rfc-editor.org/rfc/rfc4791>`_. The plugin only reads
from this server; it never writes, so a read-only account is fine if your
server supports one. Only Basic Auth is supported — a server that requires
OAuth2 (Google Calendar's own CalDAV endpoint, for example) cannot be used
directly.

You will need:

.. list-table::
   :header-rows: 1

   * - Item
     - Notes
   * - Server URL
     - Either the CalDAV base URL or the exact calendar collection URL. The
       plugin auto-discovers every calendar under the account from either.
   * - Username
     - Your CalDAV account's username.
   * - Password
     - Your CalDAV account's password, or an app-specific password if your
       server supports one (recommended over your main account password).

2. Obsidian 1.12.7 or later
------------------------------

This is the plugin's declared minimum supported Obsidian version. Among
other things, it uses Obsidian's official ``getLanguage()`` API (available
since 1.8.7) to match its UI language to your Obsidian language setting.

Once both are in place, continue to :doc:`installation`.
