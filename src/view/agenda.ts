import { getLanguage } from "obsidian";
import { CalDavEvent, CalendarListItem, NoteEvent } from "../types";

export interface CalendarViewState {
	items: CalendarListItem[];
	loading: boolean;
	hasCalendars: boolean;
	/** calendar.id -> color, for the event card's accent color. */
	calendarColors: Record<string, string | null>;
}

export interface AgendaDay {
	dateKey: string;
	date: Date;
	items: CalendarListItem[];
}

export function localDayKey(date: Date): string {
	const y = date.getFullYear();
	const m = String(date.getMonth() + 1).padStart(2, "0");
	const d = String(date.getDate()).padStart(2, "0");
	return `${y}-${m}-${d}`;
}

/**
 * The local calendar day an event's start falls on. All-day dates are
 * parsed directly from their "YYYY-MM-DD" components rather than through a
 * UTC instant - going via `new Date(event.start)` would shift the day
 * backward for timezones behind UTC, since an all-day value has no time
 * component to anchor it.
 */
function eventLocalDayStart(event: CalDavEvent): Date {
	if (event.allDay) {
		const [year, month, day] = event.start.split("-").map(Number);
		return new Date(year, month - 1, day);
	}
	const local = new Date(event.start);
	local.setHours(0, 0, 0, 0);
	return local;
}

/** A note event has no time-of-day, so its own `dateKey` (already a resolved local calendar day) is used directly. */
function itemLocalDayStart(item: CalendarListItem): Date {
	if (item.kind === "note") {
		const [year, month, day] = item.noteEvent.dateKey.split("-").map(Number);
		return new Date(year, month - 1, day);
	}
	return eventLocalDayStart(item.event);
}

/** All-day note events sort at the start of their day; a note event carrying `harang-time` sorts at its own start time, interleaved with timed CalDAV events on the same day. */
function itemSortMs(item: CalendarListItem): number {
	if (item.kind === "note") {
		const dayStart = itemLocalDayStart(item);
		if (!item.noteEvent.startTime) return dayStart.getTime();
		const [hours, minutes] = item.noteEvent.startTime.split(":").map(Number);
		return dayStart.getTime() + (hours * 60 + minutes) * 60_000;
	}
	return new Date(item.event.start).getTime();
}

/**
 * Groups items by the local calendar day they fall on, sorted
 * chronologically both across days and within a day. A multi-day CalDAV
 * event is only placed under its start day, not repeated across every day
 * it spans.
 */
export function groupItemsByLocalDay(items: CalendarListItem[]): AgendaDay[] {
	const byKey = new Map<string, AgendaDay>();
	for (const item of items) {
		const dayStart = itemLocalDayStart(item);
		const key = localDayKey(dayStart);
		let day = byKey.get(key);
		if (!day) {
			day = { dateKey: key, date: dayStart, items: [] };
			byKey.set(key, day);
		}
		day.items.push(item);
	}
	const days = Array.from(byKey.values()).sort((a, b) => a.date.getTime() - b.date.getTime());
	for (const day of days) {
		day.items.sort((a, b) => itemSortMs(a) - itemSortMs(b));
	}
	return days;
}

export function todayKey(): string {
	return localDayKey(new Date());
}

export function tomorrowKey(): string {
	const d = new Date();
	d.setDate(d.getDate() + 1);
	return localDayKey(d);
}

/** Obsidian's configured UI language, falling back to English if Intl rejects it as a locale tag. */
export function resolveLocale(): string {
	const lang = getLanguage();
	try {
		new Intl.DateTimeFormat(lang);
		return lang;
	} catch {
		return "en";
	}
}

export function formatDate(date: Date): string {
	return new Intl.DateTimeFormat(resolveLocale(), { month: "long", day: "numeric", weekday: "short" }).format(date);
}

/** Same as formatDate, but with the year included - for contexts (like date suggestions) that aren't implicitly near-term. */
export function formatDateWithYear(date: Date): string {
	return new Intl.DateTimeFormat(resolveLocale(), { year: "numeric", month: "long", day: "numeric", weekday: "short" }).format(date);
}

export function formatEventTime(event: CalDavEvent, allDayLabel: string): string {
	if (event.allDay) return allDayLabel;
	const formatter = new Intl.DateTimeFormat(resolveLocale(), { hour: "2-digit", minute: "2-digit" });
	const start = formatter.format(new Date(event.start));
	if (!event.end) return start;
	return `${start}–${formatter.format(new Date(event.end))}`;
}

/** Mirrors `formatEventTime` for a `NoteEvent`: its `harang-time` range if set, else the all-day label. */
export function formatNoteEventTime(noteEvent: NoteEvent, allDayLabel: string): string {
	if (!noteEvent.startTime || !noteEvent.endTime) return allDayLabel;
	return `${noteEvent.startTime}–${noteEvent.endTime}`;
}

/** Full date (with year) plus time range/all-day label, for a standalone detail view of one event. */
export function formatEventDateTime(event: CalDavEvent, allDayLabel: string): string {
	if (event.allDay) {
		const [year, month, day] = event.start.split("-").map(Number);
		return formatDateWithYear(new Date(year, month - 1, day));
	}
	return `${formatDateWithYear(new Date(event.start))} · ${formatEventTime(event, allDayLabel)}`;
}
