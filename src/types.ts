import type { TFile } from "obsidian";

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
}

export interface HarangCalendarSettings {
	accounts: CalDavAccount[];
	cacheTtlMinutes: number;
}

/**
 * A note's `harang-account`/`harang-calendar` frontmatter, parsed. Either
 * field alone scopes to that account or that calendar name (across every
 * account); both together scope to that specific calendar within that
 * specific account. Never both null - see `getFrontmatterScope`.
 */
export interface FrontmatterScope {
	accountName: string | null;
	calendarName: string | null;
}

export interface CalDavEvent {
	uid: string;
	calendarId: string;
	calendarName: string;
	/** The CalDAV account's `name` this event's calendar belongs to. */
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
 * `[[cal:...]]` date widgets and event chips are unaffected - they only
 * ever deal with `CalDavEvent`.
 */
export type CalendarListItem = { kind: "caldav"; event: CalDavEvent } | { kind: "note"; noteEvent: NoteEvent };
