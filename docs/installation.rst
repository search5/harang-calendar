Installation
============

Make sure you have completed the steps in :doc:`prerequisites` first.

**harang-calendar** is listed in Obsidian's Community Plugins directory, so
most people should use Method 1 below. Manual installation (Methods 2 and 3)
remains available for people who prefer it, or who want to install a
specific pre-release build.

Method 1 — Community Plugins (recommended)
-------------------------------------------------

1. In Obsidian, open **Settings → Community plugins**.
2. Click **Browse**, then search for **Harang Calendar**.
3. Click **Install**, then **Enable**.

Method 2 — Manual install of pre-built files
-------------------------------------------------

Use this method if you already have a built copy of the plugin (``main.js``,
``manifest.json``, ``styles.css``) — for example from a release archive —
and would rather not go through the Community Plugins browser.

1. In your vault, create the folder
   ``<vault>/.obsidian/plugins/harang-calendar/`` if it doesn't already
   exist.
2. Copy ``main.js``, ``manifest.json``, and ``styles.css`` into that folder.
3. Restart Obsidian, then enable **Harang Calendar** under
   **Settings → Community plugins**.

Method 3 — Clone the Git repository and build from source
-------------------------------------------------------------

Use this method if you want to build from a specific commit or contribute
to the plugin.

**Requirements:** `Node.js <https://nodejs.org/>`_ 18 or later.

.. code-block:: bash

   git clone https://github.com/search5/harang-calendar.git
   cd harang-calendar
   npm install
   npm run build

This produces ``main.js`` in the project root. Copy it, together with
``manifest.json`` and ``styles.css``, into
``<vault>/.obsidian/plugins/harang-calendar/`` as described in Method 2,
then restart Obsidian and enable the plugin.

.. note::

   ``npm run dev`` starts esbuild in watch mode, rebuilding ``main.js`` on
   every source change — useful when iterating on the plugin itself.

Once installed, continue to :doc:`usage` to set up a CalDAV account.
