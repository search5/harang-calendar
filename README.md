# harang-calendar

🌐 **English** | [한국어](README.ko.md)

📖 **[Documentation](https://search5.github.io/harang-calendar/)** (English / 한국어)

An [Obsidian](https://obsidian.md) plugin that lets you view events from a [CalDAV](https://www.rfc-editor.org/rfc/rfc4791) calendar directly from your notes. The plugin is **read-only** — it never creates, edits, or deletes anything on your CalDAV server.

## Features

- **`{{hrcal:` staged autocomplete** — type `{{hrcal:` and pick an account, then a calendar, then either a date or an event title from one combined list. It inserts `{{hrcal:<accountName>:<calendarName>:date:yyyy-mm-dd}}` (renders as a widget listing that day's events as cards) or `{{hrcal:<accountName>:<calendarName>:event:<uid>}}` (renders as an inline chip). Click a chip (or a card in a date widget) to see the full detail popup.
- **Calendar view** — an agenda list of upcoming events in the sidebar, and a full month grid (with navigation, and click-a-day to see its events) in a workspace tab, both built with Vue 3.
- **Multiple CalDAV servers and calendars** — configure any number of server accounts; each account is tested and its calendars discovered and individually enabled/colored from Settings.
- **Configurable time zone** — pick your calendar's IANA time zone or a manual UTC offset per account, used to resolve event times that aren't already UTC.
- **Recurring events** — `RRULE`/`EXDATE` are expanded into their actual occurrences within whatever range is being viewed.
- **Follows Obsidian's UI language** — Korean or English depending on your Obsidian language setting (via the official `getLanguage()` API).
- **Stale-reference warnings** — a date widget warns if the account or calendar named in its `{{hrcal:...}}` reference no longer matches one you have configured (e.g. after a rename).

## Prerequisites

- A CalDAV-compatible calendar reachable over HTTP(S) with Basic Auth — e.g. [Radicale](https://radicale.org/), Nextcloud Calendar, Fastmail, or any [RFC 4791](https://www.rfc-editor.org/rfc/rfc4791) server.
- Obsidian 1.13.4 or later.

## Installation

Open **Settings → Community plugins → Browse**, search for **Harang Calendar**, then click **Install** and **Enable**.

Prefer installing pre-built files manually instead? See the [Installation guide](https://search5.github.io/harang-calendar/en/installation.html) in the documentation for that and other options.

## Usage

1. Open **Settings → Harang Calendar** and click **Add CalDAV server** to configure an account, then **Test connection & discover** to find its calendars.
2. In any note, type `{{hrcal:` and pick an account, then a calendar, then a date or an event to insert a reference.
3. Browse events any time with the **Open calendar in sidebar** or **Open calendar in a new tab** commands.

See the [Usage guide](https://search5.github.io/harang-calendar/en/usage.html) for full details.

## License

BSD-3-Clause — see [LICENSE](LICENSE).
