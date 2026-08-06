import { CalDavEvent, CalDavTimezone } from "../types";
import { zonedWallTimeToUtcIso } from "./timezone";

function unfold(raw: string): string {
	return raw.replace(/\r\n/g, "\n").replace(/\n[ \t]/g, "");
}

function unescapeValue(value: string): string {
	return value
		.replace(/\\n/gi, "\n")
		.replace(/\\,/g, ",")
		.replace(/\\;/g, ";")
		.replace(/\\\\/g, "\\");
}

interface ICalLine {
	name: string;
	params: Record<string, string>;
	value: string;
}

function parseLine(line: string): ICalLine | null {
	const colonIndex = line.indexOf(":");
	if (colonIndex === -1) return null;
	const head = line.slice(0, colonIndex);
	const value = line.slice(colonIndex + 1);
	const parts = head.split(";");
	const name = parts[0].toUpperCase();
	const params: Record<string, string> = {};
	for (const part of parts.slice(1)) {
		const eq = part.indexOf("=");
		if (eq === -1) continue;
		// Param values (e.g. TZID) are case-sensitive, unlike param names.
		params[part.slice(0, eq).toUpperCase()] = part.slice(eq + 1);
	}
	return { name, params, value: unescapeValue(value) };
}

interface ParsedDateTime {
	iso: string;
	allDay: boolean;
}

/**
 * Converts an iCalendar DATE or DATE-TIME value into an ISO 8601 UTC string.
 * A trailing "Z" is treated as UTC as-is. Anything else - a TZID-qualified
 * or floating value - is resolved using the account's configured timezone
 * setting rather than the TZID string itself, since servers often emit
 * non-IANA zone names (e.g. Windows zone IDs) that wouldn't resolve here.
 */
function parseICalDateTime(value: string, params: Record<string, string>, timezone: CalDavTimezone): ParsedDateTime | null {
	const dateMatch = /^(\d{4})(\d{2})(\d{2})/.exec(value);
	if (!dateMatch) return null;
	const [, yearText, monthText, dayText] = dateMatch;

	const isDateOnly = params["VALUE"] === "DATE" || !value.includes("T");
	if (isDateOnly) {
		return { iso: `${yearText}-${monthText}-${dayText}`, allDay: true };
	}

	const timeMatch = /T(\d{2})(\d{2})(\d{2})(Z)?/.exec(value);
	if (!timeMatch) return null;
	const [, hourText, minuteText, secondText, utc] = timeMatch;

	if (utc) {
		return { iso: `${yearText}-${monthText}-${dayText}T${hourText}:${minuteText}:${secondText}Z`, allDay: false };
	}

	const iso = zonedWallTimeToUtcIso(
		Number(yearText),
		Number(monthText),
		Number(dayText),
		Number(hourText),
		Number(minuteText),
		Number(secondText),
		timezone
	);
	return { iso, allDay: false };
}

const DURATION_PATTERN = /^([+-])?P(?:(\d+)W)?(?:(\d+)D)?(?:T(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?)?$/;

/** Parses an iCalendar DURATION value (RFC 5545 3.3.6), e.g. "PT1H30M" or "-P1D", into seconds. */
function parseICalDurationSeconds(value: string): number | null {
	const match = DURATION_PATTERN.exec(value.trim());
	if (!match) return null;
	const [, sign, weeks, days, hours, minutes, seconds] = match;
	if (!weeks && !days && !hours && !minutes && !seconds) return null;
	const totalSeconds =
		Number(weeks ?? 0) * 7 * 86400 +
		Number(days ?? 0) * 86400 +
		Number(hours ?? 0) * 3600 +
		Number(minutes ?? 0) * 60 +
		Number(seconds ?? 0);
	return sign === "-" ? -totalSeconds : totalSeconds;
}

/** Adds a DURATION to a parsed DTSTART to derive an end when DTEND is absent. */
function addDurationSeconds(start: ParsedDateTime, durationSeconds: number): ParsedDateTime {
	if (start.allDay) {
		const dayMs = Date.parse(`${start.iso}T00:00:00Z`) + durationSeconds * 1000;
		return { iso: new Date(dayMs).toISOString().slice(0, 10), allDay: true };
	}
	const ms = Date.parse(start.iso) + durationSeconds * 1000;
	return { iso: new Date(ms).toISOString().replace(/\.\d{3}Z$/, "Z"), allDay: false };
}

function firstValue(props: Record<string, ICalLine[]>, name: string): ICalLine | undefined {
	return props[name]?.[0];
}

/** EXDATE may repeat and each occurrence may hold a comma-separated list of values. */
function parseExdates(props: Record<string, ICalLine[]>, timezone: CalDavTimezone): string[] {
	const lines = props["EXDATE"] ?? [];
	const dates: string[] = [];
	for (const line of lines) {
		for (const rawValue of line.value.split(",")) {
			const parsed = parseICalDateTime(rawValue.trim(), line.params, timezone);
			if (parsed) dates.push(parsed.iso);
		}
	}
	return dates;
}

function buildEvent(
	props: Record<string, ICalLine[]>,
	calendarId: string,
	calendarName: string,
	sourceUrl: string,
	etag: string | null,
	timezone: CalDavTimezone
): CalDavEvent | null {
	const uid = firstValue(props, "UID")?.value.trim();
	const dtstart = firstValue(props, "DTSTART");
	if (!uid || !dtstart) return null;

	const start = parseICalDateTime(dtstart.value, dtstart.params, timezone);
	if (!start) return null;

	const dtend = firstValue(props, "DTEND");
	let end = dtend ? parseICalDateTime(dtend.value, dtend.params, timezone) : null;

	if (!end) {
		const duration = firstValue(props, "DURATION");
		const durationSeconds = duration ? parseICalDurationSeconds(duration.value) : null;
		if (durationSeconds !== null) end = addDurationSeconds(start, durationSeconds);
	}

	return {
		uid,
		calendarId,
		calendarName,
		// Overwritten by store.ts's fetchCalendar right after this returns - the account isn't known this deep in the parsing call chain.
		accountId: "",
		accountName: "",
		summary: firstValue(props, "SUMMARY")?.value.trim() || uid,
		description: firstValue(props, "DESCRIPTION")?.value.trim() || null,
		location: firstValue(props, "LOCATION")?.value.trim() || null,
		start: start.iso,
		end: end?.iso ?? null,
		allDay: start.allDay,
		rrule: firstValue(props, "RRULE")?.value.trim() ?? null,
		exdates: parseExdates(props, timezone),
		url: sourceUrl,
		etag,
	};
}

/** Parses every VEVENT in an iCalendar (ICS) blob fetched from a CalDAV calendar collection. */
export function parseICalEvents(
	text: string,
	calendarId: string,
	calendarName: string,
	sourceUrl: string,
	etag: string | null,
	timezone: CalDavTimezone
): CalDavEvent[] {
	const lines = unfold(text)
		.split("\n")
		.filter((l) => l.trim().length > 0);

	const events: CalDavEvent[] = [];
	let current: Record<string, ICalLine[]> | null = null;
	// Tracks nesting inside sub-components (e.g. VALARM) so their
	// properties (which can reuse names like DESCRIPTION) aren't mistaken
	// for the parent VEVENT's own properties.
	let subComponentDepth = 0;

	for (const raw of lines) {
		const trimmed = raw.trim();

		if (trimmed === "BEGIN:VEVENT") {
			current = {};
			subComponentDepth = 0;
			continue;
		}
		if (trimmed === "END:VEVENT") {
			if (current) {
				const event = buildEvent(current, calendarId, calendarName, sourceUrl, etag, timezone);
				if (event) events.push(event);
			}
			current = null;
			continue;
		}
		if (!current) continue;

		if (trimmed.startsWith("BEGIN:")) {
			subComponentDepth++;
			continue;
		}
		if (trimmed.startsWith("END:")) {
			subComponentDepth = Math.max(0, subComponentDepth - 1);
			continue;
		}
		if (subComponentDepth > 0) continue;

		const parsed = parseLine(raw);
		if (!parsed) continue;
		(current[parsed.name] ??= []).push(parsed);
	}

	return events;
}
