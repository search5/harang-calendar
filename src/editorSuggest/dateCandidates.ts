function pad2(n: number): string {
	return String(n).padStart(2, "0");
}

function toIso(year: number, month: number, day: number): string {
	return `${year}-${pad2(month)}-${pad2(day)}`;
}

function daysInMonth(year: number, month: number): number {
	return new Date(year, month, 0).getDate();
}

function localDayIso(date: Date): string {
	return toIso(date.getFullYear(), date.getMonth() + 1, date.getDate());
}

function nextDays(today: Date, count: number): string[] {
	const out: string[] = [];
	for (let i = 0; i < count; i++) {
		const d = new Date(today.getFullYear(), today.getMonth(), today.getDate() + i);
		out.push(localDayIso(d));
	}
	return out;
}

const MIN_YEAR = 1970;
const MAX_YEAR = 2999;

/** Matches against the zero-padded "MM" form, so typing "0" then "7" narrows the same way a user types "07". */
function matchingMonths(monthPart: string): number[] {
	if (monthPart.length === 0) return [];
	const months: number[] = [];
	for (let m = 1; m <= 12; m++) {
		if (pad2(m).startsWith(monthPart)) months.push(m);
	}
	return months;
}

function matchingDays(year: number, month: number, dayPart: string): number[] {
	const max = daysInMonth(year, month);
	const days: number[] = [];
	for (let d = 1; d <= max; d++) {
		if (dayPart.length === 0 || pad2(d).startsWith(dayPart)) days.push(d);
	}
	return days;
}

/**
 * Suggests ISO ("YYYY-MM-DD") dates for a typed "@" query.
 *
 * An empty query offers the next `limit` days starting today. Otherwise the
 * query is read progressively as "YYYY", "YYYY-M[M]", "YYYY-M[M]-D[D]" -
 * each month/day segment matched as a zero-padded numeric prefix against the
 * real calendar (so e.g. a 30-day February never appears), matching how
 * `AGENTS.md`'s own example narrows "2026-07" down to July's days. A year
 * alone isn't specific enough to be useful, so nothing is suggested until a
 * month is also typed.
 */
export function suggestDateCandidates(query: string, today: Date, limit: number): string[] {
	const trimmed = query.trim();
	if (trimmed.length === 0) return nextDays(today, limit);

	const [yearPart, monthPart, dayPart] = trimmed.split("-");
	if (!yearPart || !/^\d{4}$/.test(yearPart)) return [];
	const year = Number(yearPart);
	if (year < MIN_YEAR || year > MAX_YEAR) return [];
	if (monthPart === undefined || !/^\d{0,2}$/.test(monthPart)) return [];
	if (dayPart !== undefined && !/^\d{0,2}$/.test(dayPart)) return [];

	const candidates: string[] = [];
	for (const month of matchingMonths(monthPart)) {
		for (const day of matchingDays(year, month, dayPart ?? "")) {
			candidates.push(toIso(year, month, day));
		}
	}
	candidates.sort();
	return candidates.slice(0, limit);
}
