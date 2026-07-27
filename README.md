# harang-calendar

🌐 **English** | [한국어](README.ko.md)

📖 **[Documentation](https://search5.github.io/harang-calendar/)** (English / 한국어)

An [Obsidian](https://obsidian.md) plugin that lets you view events from a [CalDAV](https://www.rfc-editor.org/rfc/rfc4791) calendar directly from your notes. The plugin is **read-only** — it never creates, edits, or deletes anything on your CalDAV server.

> **Status:** everything in `AGENTS.md`'s spec is implemented. What's left are non-blocking enhancements. See [ROADMAP.md](ROADMAP.md) for the detailed status and known limitations.

## Features

- **`@date[` autocomplete for dates** — type `@date[2026-07-26` (narrowed progressively as you type) and pick it from the popup; it inserts `[[cal:2026-07-26]]`, which renders as a widget listing that day's events as cards.
- **`@event[` autocomplete for events** — type `@event[` plus a title search and pick an event; it inserts `[[event:<uid>]]`, which renders as an inline chip. Click a chip (or a card in a date widget) to see the full detail popup.
- **Calendar view** — an agenda list of upcoming events in the sidebar, and a full month grid (with navigation, and click-a-day to see its events) in a workspace tab, both built with Vue 3.
- **Frontmatter linking** — connect a note to one or more calendars via a `harang-calendar: [Name, ...]` frontmatter key (with autocomplete for registered calendar names), scoping that note's date widgets to those calendars.
- **Multiple CalDAV servers and calendars** — configure any number of server accounts; each account is tested and its calendars discovered and individually enabled/colored from Settings.
- **Configurable time zone** — pick your calendar's IANA time zone or a manual UTC offset per account, used to resolve event times that aren't already UTC.
- **Recurring events** — `RRULE`/`EXDATE` are expanded into their actual occurrences within whatever range is being viewed.
- **Follows Obsidian's UI language** — Korean or English depending on your Obsidian language setting (via the official `getLanguage()` API).
- **Frontmatter validation** — a date widget warns if any name in its note's `harang-calendar` frontmatter doesn't match a registered calendar.

## Prerequisites

- A CalDAV-compatible calendar reachable over HTTP(S) with Basic Auth — e.g. [Radicale](https://radicale.org/), Nextcloud Calendar, Fastmail, or any [RFC 4791](https://www.rfc-editor.org/rfc/rfc4791) server.
- Obsidian 1.12.7 or later.

## Installation

**harang-calendar** is not yet published to the Obsidian Community Plugins directory, so it must be built from source.

**Requirements:** [Node.js](https://nodejs.org/) 18 or later

```bash
git clone https://github.com/search5/harang-calendar.git
cd harang-calendar
npm install
npm run build
```

Copy the resulting `main.js`, along with `manifest.json` and `styles.css`, into `<vault>/.obsidian/plugins/harang-calendar/`, then enable **Harang Calendar** under **Settings → Community plugins**.

## Development

```bash
npm run dev    # esbuild in watch mode
npm run build  # type-check + production build
npm run lint   # eslint (includes eslint-plugin-obsidianmd)
```

## License

BSD-3-Clause — see [LICENSE](LICENSE).
