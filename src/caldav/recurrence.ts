import { RRule, RRuleSet } from "rrule";
import { CalDavEvent } from "../types";

export interface RecurrenceRange {
	start: Date;
	end: Date;
}

function toRRuleUtcString(date: Date): string {
	return date.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z");
}

function toIsoUtc(date: Date): string {
	return date.toISOString().replace(/\.\d{3}Z$/, "Z");
}

/**
 * Expands a single recurring event into one CalDavEvent per occurrence
 * inside `range`. rrule.js does its date math on the UTC calendar fields of
 * `event.start` (which is already resolved to a true UTC instant), the same
 * way the library itself always operates - see https://github.com/jkbrzt/rrule#important-use-utc-dates.
 * For zones that observe DST, this means the *local* clock time of later
 * occurrences can drift by the DST amount across a transition; there's no
 * VTIMEZONE-aware re-basing here yet (see ROADMAP.md).
 */
function expandEvent(event: CalDavEvent, range: RecurrenceRange): CalDavEvent[] {
	if (!event.rrule) return [event];

	const dtstart = new Date(event.start);
	if (Number.isNaN(dtstart.getTime())) return [event];

	let rule: RRule;
	try {
		rule = RRule.fromString(`DTSTART:${toRRuleUtcString(dtstart)}\nRRULE:${event.rrule}`);
	} catch {
		return [event];
	}

	const ruleSet = new RRuleSet();
	ruleSet.rrule(rule);
	for (const exdate of event.exdates) {
		const excluded = new Date(exdate);
		if (!Number.isNaN(excluded.getTime())) ruleSet.exdate(excluded);
	}

	const durationMs = event.end ? new Date(event.end).getTime() - dtstart.getTime() : null;
	const occurrences = ruleSet.between(range.start, range.end, true);

	return occurrences.map((occurrence) => ({
		...event,
		start: toIsoUtc(occurrence),
		end: durationMs !== null ? toIsoUtc(new Date(occurrence.getTime() + durationMs)) : null,
	}));
}

/**
 * Expands every recurring VEVENT in `events` into its occurrences inside
 * `range`; non-recurring events pass through unchanged. All-day recurring
 * events aren't expanded yet (see ROADMAP.md) and are returned as their
 * single original occurrence. RECURRENCE-ID overrides aren't matched
 * against expanded occurrences yet either.
 */
export function expandRecurrence(events: CalDavEvent[], range: RecurrenceRange): CalDavEvent[] {
	const expanded: CalDavEvent[] = [];
	for (const event of events) {
		if (!event.rrule || event.allDay) {
			expanded.push(event);
			continue;
		}
		expanded.push(...expandEvent(event, range));
	}
	return expanded;
}
