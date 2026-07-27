import { App, TFile } from "obsidian";
import { RRule } from "rrule";
import { NoteEvent } from "../types";
import { isValidIsoDate } from "../render/dateWidget";

interface HarangDateFrontmatter {
	date: string;
	repeat: string | null;
	/** "HH:MM", both set together or both null (all-day) - see `parseTimeRange`. */
	startTime: string | null;
	endTime: string | null;
}

const TIME_RANGE_RE = /^([01]\d|2[0-3]):([0-5]\d)-([01]\d|2[0-3]):([0-5]\d)$/;

/** `harang-time` as "HH:MM-HH:MM" (24-hour). Anything else - missing, malformed, wrong order - is treated as absent, so the note falls back to all-day rather than showing a garbled time. */
function parseTimeRange(raw: unknown): { startTime: string; endTime: string } | null {
	if (typeof raw !== "string") return null;
	const match = TIME_RANGE_RE.exec(raw.trim());
	if (!match) return null;
	const [, startHour, startMinute, endHour, endMinute] = match;
	const startTime = `${startHour}:${startMinute}`;
	const endTime = `${endHour}:${endMinute}`;
	return startTime < endTime ? { startTime, endTime } : null;
}

function readHarangDateFrontmatter(app: App, file: TFile): HarangDateFrontmatter | null {
	const frontmatter: Record<string, unknown> | undefined = app.metadataCache.getFileCache(file)?.frontmatter;
	const dateRaw = frontmatter?.["harang-date"];
	if (typeof dateRaw !== "string" || !isValidIsoDate(dateRaw)) return null;

	const repeatRaw = frontmatter?.["harang-repeat"];
	const repeat = typeof repeatRaw === "string" && repeatRaw.trim().length > 0 ? repeatRaw.trim() : null;

	const timeRange = parseTimeRange(frontmatter?.["harang-time"]);

	return { date: dateRaw, repeat, startTime: timeRange?.startTime ?? null, endTime: timeRange?.endTime ?? null };
}

function toUtcMidnight(iso: string): Date {
	const [year, month, day] = iso.split("-").map(Number);
	return new Date(Date.UTC(year, month - 1, day));
}

function toIsoDateUtc(date: Date): string {
	const y = date.getUTCFullYear();
	const m = String(date.getUTCMonth() + 1).padStart(2, "0");
	const d = String(date.getUTCDate()).padStart(2, "0");
	return `${y}-${m}-${d}`;
}

function toRRuleUtcString(date: Date): string {
	return date.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z");
}

/**
 * `range.start`/`range.end` are local-midnight `Date` objects (matching
 * every other caller in this codebase - `range.end` exclusive). A note
 * event has no time-of-day at all, so both the range bounds and the
 * RRULE's own DTSTART are re-expressed as UTC-midnight-per-calendar-day
 * before comparing, keeping the whole expansion in one consistent
 * "calendar day" frame - the local/UTC mismatch that's bitten this
 * codebase three separate times already (see ROADMAP.md) otherwise creeps
 * back in here too.
 */
function expandSingleDate(fm: HarangDateFrontmatter, dtstart: Date, rangeStartUtc: Date, rangeEndUtc: Date): string[] {
	const inRange = dtstart.getTime() >= rangeStartUtc.getTime() && dtstart.getTime() < rangeEndUtc.getTime();
	return inRange ? [fm.date] : [];
}

function expandDates(fm: HarangDateFrontmatter, range: { start: Date; end: Date }): string[] {
	const rangeStartUtc = new Date(Date.UTC(range.start.getFullYear(), range.start.getMonth(), range.start.getDate()));
	const rangeEndUtc = new Date(Date.UTC(range.end.getFullYear(), range.end.getMonth(), range.end.getDate()));
	const dtstart = toUtcMidnight(fm.date);

	if (!fm.repeat) return expandSingleDate(fm, dtstart, rangeStartUtc, rangeEndUtc);

	let rule: RRule;
	try {
		rule = RRule.fromString(`DTSTART:${toRRuleUtcString(dtstart)}\nRRULE:${fm.repeat}`);
	} catch {
		// Invalid RRULE syntax: fall back to showing the note on `harang-date`
		// alone rather than dropping it from the calendar entirely - the note
		// itself is still valid, so silently disappearing everywhere would be
		// a worse failure mode than just not repeating.
		return expandSingleDate(fm, dtstart, rangeStartUtc, rangeEndUtc);
	}
	// `between`'s own `inc` flag applies to both ends alike, but `range.end`
	// is meant exclusive - include it (to catch an occurrence exactly on
	// `range.start`) and then drop anything landing exactly on `range.end`.
	return rule
		.between(rangeStartUtc, rangeEndUtc, true)
		.filter((occurrence) => occurrence.getTime() < rangeEndUtc.getTime())
		.map(toIsoDateUtc);
}

/**
 * Scans every markdown file in the vault for `harang-date` frontmatter
 * (optionally repeating via `harang-repeat`, an RRULE string reusing the
 * same `rrule` package the CalDAV side already depends on) and expands
 * each into its occurrences inside `range`. Purely local to Obsidian -
 * nothing here is ever written to or read from a CalDAV server.
 */
export function getNoteEventsInRange(app: App, range: { start: Date; end: Date }): NoteEvent[] {
	const results: NoteEvent[] = [];
	for (const file of app.vault.getMarkdownFiles()) {
		const frontmatter = readHarangDateFrontmatter(app, file);
		if (!frontmatter) continue;
		for (const dateKey of expandDates(frontmatter, range)) {
			results.push({
				file,
				title: file.basename,
				dateKey,
				startTime: frontmatter.startTime,
				endTime: frontmatter.endTime,
			});
		}
	}
	return results;
}
