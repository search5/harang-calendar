import { CalDavTimezone } from "../types";

/** All IANA time zone names known to the current runtime's ICU data. */
export function listKnownTimezones(): string[] {
	try {
		return Intl.supportedValuesOf("timeZone");
	} catch {
		return ["UTC"];
	}
}

/** The Obsidian host's own time zone, used as the default for new accounts. */
export function getSystemTimezone(): string {
	try {
		return Intl.DateTimeFormat().resolvedOptions().timeZone;
	} catch {
		return "UTC";
	}
}

function ianaOffsetMinutes(zone: string, atUtcMs: number): number {
	try {
		const formatter = new Intl.DateTimeFormat("en-US", {
			timeZone: zone,
			hour12: false,
			year: "numeric",
			month: "2-digit",
			day: "2-digit",
			hour: "2-digit",
			minute: "2-digit",
			second: "2-digit",
		});
		const parts = formatter.formatToParts(new Date(atUtcMs));
		const value = (type: string) => Number(parts.find((p) => p.type === type)?.value ?? "0");
		// Some engines format midnight as "24" with hour12: false.
		const hour = value("hour") % 24;
		const asIfUtc = Date.UTC(value("year"), value("month") - 1, value("day"), hour, value("minute"), value("second"));
		return Math.round((asIfUtc - atUtcMs) / 60000);
	} catch {
		return 0;
	}
}

/** Resolves the zone's offset from UTC (in minutes, east-positive) at the given instant. */
export function resolveTimezoneOffsetMinutes(timezone: CalDavTimezone, atUtcMs: number): number {
	return timezone.kind === "offset" ? timezone.offsetMinutes : ianaOffsetMinutes(timezone.zone, atUtcMs);
}

/**
 * Converts wall-clock date/time components in `timezone` to a UTC ISO 8601
 * string. Offsets are resolved for the given date, so IANA zones apply the
 * correct DST rule instead of a single fixed offset.
 */
export function zonedWallTimeToUtcIso(
	year: number,
	month: number,
	day: number,
	hour: number,
	minute: number,
	second: number,
	timezone: CalDavTimezone
): string {
	const naiveUtcMs = Date.UTC(year, month - 1, day, hour, minute, second);
	const offsetMinutes = resolveTimezoneOffsetMinutes(timezone, naiveUtcMs);
	const trueUtcMs = naiveUtcMs - offsetMinutes * 60000;
	return new Date(trueUtcMs).toISOString().replace(/\.\d{3}Z$/, "Z");
}

const OFFSET_PATTERN = /^([+-])(\d{1,2}):?(\d{2})?$/;

/** Parses a "+09:00" / "-0530" style manual UTC offset. Returns null if malformed. */
export function parseUtcOffsetInput(text: string): number | null {
	const match = OFFSET_PATTERN.exec(text.trim());
	if (!match) return null;
	const [, sign, hoursText, minutesText = "0"] = match;
	const hours = Number(hoursText);
	const minutes = Number(minutesText);
	if (hours > 14 || minutes > 59) return null;
	const total = hours * 60 + minutes;
	return sign === "-" ? -total : total;
}

export function formatUtcOffsetMinutes(offsetMinutes: number): string {
	const sign = offsetMinutes < 0 ? "-" : "+";
	const abs = Math.abs(offsetMinutes);
	const hours = String(Math.floor(abs / 60)).padStart(2, "0");
	const minutes = String(abs % 60).padStart(2, "0");
	return `${sign}${hours}:${minutes}`;
}
