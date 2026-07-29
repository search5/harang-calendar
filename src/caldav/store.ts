import { Notice } from "obsidian";
import { CalDavAccount, CalDavCalendar, CalDavEvent, CalendarScope, HarangCalendarSettings } from "../types";
import { CalDavClient, CalDavTimeRange } from "./client";
import { expandRecurrence } from "./recurrence";
import { t } from "../i18n";

const FETCH_WINDOW_PAST_MS = 90 * 24 * 60 * 60 * 1000; // 3 months
const FETCH_WINDOW_FUTURE_MS = 365 * 24 * 60 * 60 * 1000; // 12 months

interface FetchJob {
	account: CalDavAccount;
	calendar: CalDavCalendar;
}

function eventKey(event: CalDavEvent): string {
	return `${event.calendarId}:${event.uid}`;
}

/**
 * All-day boundaries ("YYYY-MM-DD") have no time zone, so they're parsed via
 * local calendar components - not `new Date(str)`, which the JS spec treats
 * as UTC midnight for a date-only ISO string. That mismatch against the
 * locally-constructed query range let an all-day event with an explicit end
 * date (e.g. a single-day event with DTEND the following day) leak into the
 * day after it should end, in any zone ahead of UTC (found via manual
 * testing in Asia/Seoul, UTC+9). Timed events are unaffected - their ISO
 * strings already carry a "Z" and parse the same way either way.
 */
function parseEventBoundary(iso: string, allDay: boolean): number {
	if (!allDay) return new Date(iso).getTime();
	const [year, month, day] = iso.split("-").map(Number);
	return new Date(year, month - 1, day).getTime();
}

/** The parts of `union` not already inside `covered` (`covered` is always contained within `union` by construction - see ensureRangeFetched). At most two: before and after. */
function subtractRange(union: CalDavTimeRange, covered: CalDavTimeRange): CalDavTimeRange[] {
	const gaps: CalDavTimeRange[] = [];
	if (union.start.getTime() < covered.start.getTime()) {
		gaps.push({ start: union.start, end: covered.start });
	}
	if (union.end.getTime() > covered.end.getTime()) {
		gaps.push({ start: covered.end, end: union.end });
	}
	return gaps;
}

/**
 * Caches CalDAV events across every registered account/calendar and answers
 * date-range/UID/text queries against them.
 *
 * Two fetch strategies:
 * - `refreshAll`/`refreshIfStale`: the original fixed 3-months-back /
 *   12-months-forward preload, used for the initial load and the agenda
 *   sidebar (whose 30-day window always fits comfortably inside it).
 * - `ensureRangeFetched`/`refreshRange`: on-demand, for views (the month
 *   grid) that navigate outside that fixed window - only the not-yet-cached
 *   part of a requested range is actually fetched and merged in, so
 *   re-visiting already-covered territory is free.
 */
export class CalendarStore {
	private eventsByKey: Map<string, CalDavEvent> = new Map();
	private lastFetchedAt = 0;
	private coveredRange: CalDavTimeRange | null = null;

	constructor(private getSettings: () => HarangCalendarSettings) {}

	getAll(): CalDavEvent[] {
		return Array.from(this.eventsByKey.values());
	}

	isStale(): boolean {
		const ttlMs = this.getSettings().cacheTtlMinutes * 60 * 1000;
		return Date.now() - this.lastFetchedAt > ttlMs;
	}

	async refreshIfStale(): Promise<void> {
		if (this.eventsByKey.size === 0 || this.isStale()) {
			await this.refreshAll();
		}
	}

	/** Re-fetches every registered calendar over the fixed default window and replaces the whole cache. */
	async refreshAll(): Promise<void> {
		const now = Date.now();
		const range: CalDavTimeRange = { start: new Date(now - FETCH_WINDOW_PAST_MS), end: new Date(now + FETCH_WINDOW_FUTURE_MS) };
		const fetched = await this.fetchRange(range);
		this.eventsByKey = new Map(fetched.map((event) => [eventKey(event), event]));
		this.coveredRange = range;
		this.lastFetchedAt = Date.now();
	}

	/**
	 * Ensures every event in `range` is cached. If part of `range` was never
	 * fetched, only that gap is requested (merged in, not replacing the rest
	 * of the cache). If `range` is already fully covered but the cache has
	 * gone stale, it's treated like `refreshRange(range)` instead of doing
	 * nothing - navigating back to old territory should still notice server
	 * changes eventually, just without paying for a network round-trip on
	 * every visit to already-fresh territory.
	 */
	async ensureRangeFetched(range: CalDavTimeRange): Promise<void> {
		const fullyCovered =
			this.coveredRange !== null &&
			range.start.getTime() >= this.coveredRange.start.getTime() &&
			range.end.getTime() <= this.coveredRange.end.getTime();

		if (fullyCovered) {
			if (!this.isStale()) return;
			await this.refreshRange(range);
			return;
		}

		const union = this.coveredRange
			? {
					start: new Date(Math.min(range.start.getTime(), this.coveredRange.start.getTime())),
					end: new Date(Math.max(range.end.getTime(), this.coveredRange.end.getTime())),
				}
			: range;
		const gaps = this.coveredRange ? subtractRange(union, this.coveredRange) : [union];
		for (const gap of gaps) {
			await this.mergeRange(gap);
		}
		this.coveredRange = union;
	}

	/** Force re-fetches exactly `range` (e.g. a manual "Refresh" click while viewing it), merging the result in regardless of staleness. */
	async refreshRange(range: CalDavTimeRange): Promise<void> {
		await this.mergeRange(range);
		this.coveredRange = this.coveredRange
			? {
					start: new Date(Math.min(range.start.getTime(), this.coveredRange.start.getTime())),
					end: new Date(Math.max(range.end.getTime(), this.coveredRange.end.getTime())),
				}
			: range;
	}

	private async mergeRange(range: CalDavTimeRange): Promise<void> {
		const fetched = await this.fetchRange(range);
		for (const event of fetched) this.eventsByKey.set(eventKey(event), event);
		this.lastFetchedAt = Date.now();
	}

	private async fetchRange(range: CalDavTimeRange): Promise<CalDavEvent[]> {
		const jobs: FetchJob[] = [];
		for (const account of this.getSettings().accounts) {
			for (const calendar of account.calendars) {
				if (!calendar.enabled) continue;
				jobs.push({ account, calendar });
			}
		}

		const results = await Promise.allSettled(jobs.map((job) => this.fetchCalendar(job, range)));

		const merged: CalDavEvent[] = [];
		const failures: string[] = [];
		results.forEach((result, i) => {
			if (result.status === "fulfilled") {
				merged.push(...result.value);
			} else {
				const reason = result.reason instanceof Error ? result.reason.message : String(result.reason);
				failures.push(`${jobs[i].account.name} / ${jobs[i].calendar.displayName}: ${reason}`);
			}
		});

		if (failures.length > 0) {
			// Also log to the console - the Notice toast disappears too quickly to read/copy a multi-line failure list.
			console.error("Harang calendar: calendar refresh failures\n" + failures.join("\n"));
			new Notice(t("storeRefreshFailedNotice", { failures: failures.join("\n") }));
		}
		return merged;
	}

	private async fetchCalendar(job: FetchJob, range: CalDavTimeRange): Promise<CalDavEvent[]> {
		const client = new CalDavClient(job.account);
		const events = await client.fetchEvents(job.calendar.id, job.calendar.displayName, job.calendar.url, range);
		return events.map((event) => ({ ...event, accountName: job.account.name }));
	}

	/** Events overlapping `range` (recurrence expanded), optionally scoped to an account/calendar. */
	getEventsInRange(range: CalDavTimeRange, scope?: CalendarScope): CalDavEvent[] {
		const scoped = this.applyScope(scope);
		return expandRecurrence(scoped, range).filter((event) => this.overlapsRange(event, range));
	}

	/**
	 * Looks up an event by its master UID. For a recurring event this
	 * returns the base rule's own DTSTART occurrence, not a specific
	 * expanded instance - see ROADMAP.md.
	 */
	getEventByUid(uid: string, scope?: CalendarScope): CalDavEvent | undefined {
		return this.applyScope(scope).find((event) => event.uid === uid);
	}

	/** Case-insensitive substring search over event titles, optionally scoped to an account/calendar. */
	searchEvents(query: string, limit = Infinity, scope?: CalendarScope): CalDavEvent[] {
		const q = query.trim().toLowerCase();
		const all = this.applyScope(scope);
		const source = q.length === 0 ? all : all.filter((event) => event.summary.toLowerCase().includes(q));
		return source.slice(0, limit);
	}

	/** Either field alone matches across every account/calendar; both together require the specific pairing. */
	private applyScope(scope: CalendarScope | undefined): CalDavEvent[] {
		const all = this.getAll();
		if (!scope) return all;
		return all.filter(
			(event) =>
				(!scope.accountName || event.accountName === scope.accountName) &&
				(!scope.calendarName || event.calendarName === scope.calendarName)
		);
	}

	private overlapsRange(event: CalDavEvent, range: CalDavTimeRange): boolean {
		const startMs = parseEventBoundary(event.start, event.allDay);
		const endMs = this.eventEndMs(event, startMs);
		return startMs < range.end.getTime() && endMs > range.start.getTime();
	}

	/** All-day events with no DTEND span exactly one day per RFC 5545; timed events with no DTEND/DURATION are treated as instants. */
	private eventEndMs(event: CalDavEvent, startMs: number): number {
		if (event.end) return parseEventBoundary(event.end, event.allDay);
		return event.allDay ? startMs + 24 * 60 * 60 * 1000 : startMs;
	}
}
