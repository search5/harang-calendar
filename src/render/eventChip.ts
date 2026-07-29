import { CalDavEvent } from "../types";
import { openEventCard } from "./eventCard";
import { formatEventTime } from "../view/agenda";
import { t } from "../i18n";

/** Renders a `{{hrcal:<accountName>:<calendarName>:event:<uid>}}` reference as an inline chip; click/Enter/Space opens the detail popup. */
export function createEventChip(event: CalDavEvent | undefined, rawUid: string): HTMLElement {
	const chip = createSpan({ cls: "harang-calendar-event-chip" });
	if (!event) chip.addClass("harang-calendar-event-chip-unresolved");
	chip.setAttribute("tabindex", "0");
	chip.setAttribute("role", "button");

	chip.createSpan({ cls: "harang-calendar-event-chip-title", text: event?.summary ?? rawUid });
	if (event) {
		chip.createSpan({ cls: "harang-calendar-event-chip-time", text: formatEventTime(event, t("agendaAllDay")) });
	}

	const open = (evt: Event) => {
		evt.preventDefault();
		evt.stopPropagation();
		openEventCard(event, rawUid, chip);
	};
	chip.addEventListener("click", open);
	chip.addEventListener("keydown", (evt: KeyboardEvent) => {
		if (evt.key === "Enter" || evt.key === " ") open(evt);
	});

	return chip;
}
