import type HarangCalendarPlugin from "../main";
import { CalDavEvent, HrcalScope } from "../types";
import { formatDate, formatEventTime, todayKey, tomorrowKey } from "../view/agenda";
import { openEventCard } from "./eventCard";
import { t } from "../i18n";

export function isValidIsoDate(iso: string): boolean {
	const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
	if (!match) return false;
	const year = Number(match[1]);
	const month = Number(match[2]);
	const day = Number(match[3]);
	const date = new Date(year, month - 1, day);
	return date.getFullYear() === year && date.getMonth() === month - 1 && date.getDate() === day;
}

function colorForCalendar(plugin: HarangCalendarPlugin, calendarId: string): string | null {
	for (const account of plugin.settings.accounts) {
		const calendar = account.calendars.find((c) => c.id === calendarId);
		if (calendar) return calendar.color;
	}
	return null;
}

/** Account/calendar names in `scope` (from a `{{hrcal:...}}` reference) that don't match any registered account/calendar - e.g. a hand-typed or stale reference. */
export function unknownScopeNames(plugin: HarangCalendarPlugin, scope: HrcalScope): string[] {
	const unknown: string[] = [];
	if (!plugin.settings.accounts.some((account) => account.id === scope.accountId)) {
		unknown.push(scope.accountId);
	}
	const knownCalendars = new Set(plugin.settings.accounts.flatMap((account) => account.calendars.map((c) => c.displayName)));
	if (!knownCalendars.has(scope.calendarName)) {
		unknown.push(scope.calendarName);
	}
	return unknown;
}

function createDateWidgetItem(plugin: HarangCalendarPlugin, event: CalDavEvent): HTMLElement {
	const item = createDiv({ cls: "harang-calendar-date-widget-item", attr: { tabindex: "0", role: "button" } });
	item.setCssStyles({ borderLeftColor: colorForCalendar(plugin, event.calendarId) || "var(--interactive-accent)" });
	item.createSpan({ cls: "harang-calendar-event-time", text: formatEventTime(event, t("agendaAllDay")) });
	item.createSpan({ cls: "harang-calendar-event-summary", text: event.summary });
	item.createSpan({ cls: "harang-calendar-event-calendar", text: event.calendarName });

	const open = (evt: Event) => {
		evt.preventDefault();
		evt.stopPropagation();
		openEventCard(event, event.uid, item);
	};
	item.addEventListener("click", open);
	item.addEventListener("keydown", (evt: KeyboardEvent) => {
		if (evt.key === "Enter" || evt.key === " ") open(evt);
	});
	return item;
}

/**
 * Builds the inline "{{hrcal:<accountId>:<calendarName>:date:YYYY-MM-DD}}"
 * widget: a heading plus that day's events (from that one specific
 * account/calendar) unfolded as clickable rows (click/Enter/Space opens the
 * same detail popup as an event chip).
 */
export function createDateWidget(plugin: HarangCalendarPlugin, dateIso: string, scope: HrcalScope): HTMLElement {
	const container = createDiv({ cls: "harang-calendar-date-widget" });
	const [year, month, day] = dateIso.split("-").map(Number);

	let heading: string;
	if (dateIso === todayKey()) heading = t("agendaToday");
	else if (dateIso === tomorrowKey()) heading = t("agendaTomorrow");
	else heading = formatDate(new Date(year, month - 1, day));
	container.createDiv({ cls: "harang-calendar-date-widget-heading", text: heading });

	const unknown = unknownScopeNames(plugin, scope);
	if (unknown.length > 0) {
		container.createDiv({
			cls: "harang-calendar-date-widget-warning",
			text: t("dateWidgetUnknownScope", { names: unknown.join(", ") }),
		});
	}

	const start = new Date(year, month - 1, day);
	const end = new Date(year, month - 1, day + 1);
	const events = plugin.calendarStore
		.getEventsInRange({ start, end }, { accountId: scope.accountId, accountName: null, calendarName: scope.calendarName })
		.sort((a, b) => new Date(a.start).getTime() - new Date(b.start).getTime());

	if (events.length === 0) {
		container.createDiv({ cls: "harang-calendar-date-widget-empty", text: t("dateWidgetEmpty") });
		return container;
	}

	const list = container.createDiv({ cls: "harang-calendar-date-widget-list" });
	for (const event of events) {
		list.appendChild(createDateWidgetItem(plugin, event));
	}
	return container;
}
