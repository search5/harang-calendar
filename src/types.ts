import type { TFile } from "obsidian";
import type { GoogleAccount } from "./google/types";

export interface CalDavCalendar {
	id: string;
	displayName: string;
	url: string;
	color: string | null;
	/** Whether CalendarStore fetches this calendar. Acts as the "per-calendar filter" from AGENTS.md. */
	enabled: boolean;
}

/**
 * How to resolve non-UTC event times (TZID-qualified or floating) for an
 * account. An IANA zone is resolved via Intl (DST-aware); a fixed offset is
 * applied as-is. See src/caldav/timezone.ts.
 */
export type CalDavTimezone = { kind: "iana"; zone: string } | { kind: "offset"; offsetMinutes: number };

export interface CalDavAccount {
	id: string;
	name: string;
	serverUrl: string;
	username: string;
	password: string;
	timezone: CalDavTimezone;
	calendars: CalDavCalendar[];
	/**
	 * Set only for a Google-connected account (OAuth device flow, see
	 * google/). CalDavClient uses this account's accessToken as a Bearer
	 * token instead of username/password Basic auth - Google's CalDAV
	 * server rejects Basic auth outright. serverUrl/username/password are
	 * unused (left blank) for these accounts; calendar discovery goes
	 * through the Google Calendar API's calendarList instead of PROPFIND,
	 * since CalDAV alone can't enumerate a Google account's calendars -
	 * see settingsTab.ts.
	 */
	google: GoogleAccount | null;
}

export interface HarangCalendarSettings {
	accounts: CalDavAccount[];
	cacheTtlMinutes: number;
}

/**
 * An optional account/calendar filter for `CalendarStore` lookups. `accountId` is what
 * `{{hrcal:...}}` references use (see HrcalScope below); `accountName` exists only for the
 * still-unused frontmatter-scope feature (render/frontmatterScope.ts), which is deliberately
 * name-based since its whole design is "type what you see in settings, no autocomplete" -- an id
 * would be untypeable there. `calendarName` is shared by both (see AGENTS.md: only the account
 * segment of {{hrcal:...}} moved to id, the calendar segment stays name-based on purpose).
 */
export interface CalendarScope {
	accountId: string | null;
	accountName: string | null;
	calendarName: string | null;
}

/** A fully-specified account+calendar pair, embedded directly in a `{{hrcal:...}}` reference (see render/postProcessor.ts). Not directly assignable to `CalendarScope` anymore (accountId vs accountName) -- construct one explicitly at each call site. */
export interface HrcalScope {
	accountId: string;
	calendarName: string;
}

export interface CalDavEvent {
	uid: string;
	calendarId: string;
	calendarName: string;
	/** The CalDAV account's stable id this event's calendar belongs to -- what {{hrcal:...}}
	 * scoping actually matches against, so renaming the account never breaks a reference. */
	accountId: string;
	/** The account's display name as of this event's last fetch. Display/frontmatter-scope only
	 * (see CalendarScope) -- never used to identify a {{hrcal:...}} reference, that's accountId. */
	accountName: string;
	summary: string;
	description: string | null;
	location: string | null;
	/** ISO 8601. Date-only ("YYYY-MM-DD") when allDay is true. */
	start: string;
	end: string | null;
	allDay: boolean;
	/** Raw RRULE value, if any. Expand with src/caldav/recurrence.ts. */
	rrule: string | null;
	/** Occurrence dates excluded from rrule, as UTC ISO strings. */
	exdates: string[];
	url: string;
	etag: string | null;
}

/**
 * A note carrying `harang-date`/`harang-repeat` frontmatter, resolved to one
 * occurrence. Purely local to Obsidian - never written to or read from a
 * CalDAV server. See src/notes/noteEvents.ts.
 */
export interface NoteEvent {
	file: TFile;
	/** The note's own filename (without extension). */
	title: string;
	/** YYYY-MM-DD, the local calendar day this occurrence falls on. */
	dateKey: string;
	/** "HH:MM" (24-hour), from `harang-time`. Both set together or both null (all-day). */
	startTime: string | null;
	endTime: string | null;
}

/**
 * The agenda/month views merge CalDAV events and note events into one
 * chronological list; this is the shared shape they're rendered through.
 * `{{hrcal:...}}` date widgets and event chips are unaffected - they only
 * ever deal with `CalDavEvent`.
 */
export type CalendarListItem = { kind: "caldav"; event: CalDavEvent } | { kind: "note"; noteEvent: NoteEvent };
