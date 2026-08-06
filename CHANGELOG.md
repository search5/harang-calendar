# Changelog

All notable changes to this project are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/).

## [Unreleased]

### Changed

- The account segment of a `{{hrcal:...}}` reference (e.g.
  `{{hrcal:<account>:<calendar>:date:yyyy-mm-dd}}`) now embeds the account's
  stable internal id instead of its display name, so renaming a CalDAV/Google
  account in Settings no longer breaks references you insert afterward. The
  calendar segment is unchanged and still uses the calendar's display name, so
  renaming a calendar can still break existing references exactly as before.
- **Not backward compatible for existing notes:** any `{{hrcal:...}}`
  reference already in your vault from before this change used the old
  account-name-based segment and will no longer resolve — there is no
  id-or-name fallback. Delete and re-insert those references via the
  `{{hrcal:` autocomplete to fix them.
