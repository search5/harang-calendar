import { CalendarListItem } from "../types";
import { groupItemsByLocalDay, localDayKey, resolveLocale } from "./agenda";

export interface MonthViewState {
	year: number;
	/** 1-12 */
	month: number;
	items: CalendarListItem[];
	loading: boolean;
	hasCalendars: boolean;
	calendarColors: Record<string, string | null>;
	selectedDateKey: string | null;
}

export interface MonthGridDay {
	dateKey: string;
	date: Date;
	inCurrentMonth: boolean;
	items: CalendarListItem[];
}

/** First day of the grid (a Sunday on/before the 1st) through the last (a Saturday on/after the month's last day). */
export function monthGridRange(year: number, month: number): { start: Date; end: Date } {
	const firstOfMonth = new Date(year, month - 1, 1);
	const start = new Date(firstOfMonth);
	start.setDate(start.getDate() - start.getDay());

	const lastOfMonth = new Date(year, month, 0);
	const end = new Date(lastOfMonth);
	end.setDate(end.getDate() + (6 - end.getDay()));

	return { start, end };
}

/**
 * Builds a full weeks-of-the-month grid (Sunday-start, always a multiple of
 * 7 days so the layout is a clean rectangle), including the leading/trailing
 * days from the adjacent months needed to fill the first/last week.
 * `items` only needs to cover `monthGridRange(year, month)`.
 */
export function buildMonthGrid(year: number, month: number, items: CalendarListItem[]): MonthGridDay[] {
	const itemsByDay = new Map(groupItemsByLocalDay(items).map((day) => [day.dateKey, day.items]));
	const { start, end } = monthGridRange(year, month);

	const days: MonthGridDay[] = [];
	for (const cursor = new Date(start); cursor.getTime() <= end.getTime(); cursor.setDate(cursor.getDate() + 1)) {
		const dateKey = localDayKey(cursor);
		days.push({
			dateKey,
			date: new Date(cursor),
			inCurrentMonth: cursor.getMonth() === month - 1,
			items: itemsByDay.get(dateKey) ?? [],
		});
	}
	return days;
}

export function chunkIntoWeeks(days: MonthGridDay[]): MonthGridDay[][] {
	const weeks: MonthGridDay[][] = [];
	for (let i = 0; i < days.length; i += 7) weeks.push(days.slice(i, i + 7));
	return weeks;
}

/** Sunday-first short weekday names ("Sun", "Mon", ...) in Obsidian's configured UI language. */
export function weekdayShortNames(): string[] {
	const formatter = new Intl.DateTimeFormat(resolveLocale(), { weekday: "short" });
	// 2023-01-01 was a Sunday - an arbitrary known-Sunday anchor.
	const sunday = new Date(2023, 0, 1);
	return Array.from({ length: 7 }, (_, i) => {
		const d = new Date(sunday);
		d.setDate(d.getDate() + i);
		return formatter.format(d);
	});
}
