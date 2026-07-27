import { CalDavEvent } from "../types";
import { formatEventDateTime } from "../view/agenda";
import { t } from "../i18n";

let activeCard: HTMLElement | null = null;
let outsideClickHandler: ((evt: MouseEvent) => void) | null = null;

export function closeEventCard(): void {
	if (activeCard) {
		activeCard.remove();
		activeCard = null;
	}
	if (outsideClickHandler) {
		document.removeEventListener("mousedown", outsideClickHandler, true);
		outsideClickHandler = null;
	}
}

function addField(container: HTMLElement, label: string, value: string): void {
	const row = container.createDiv({ cls: "harang-calendar-event-popup-row" });
	row.createSpan({ cls: "harang-calendar-event-popup-label", text: label });
	row.createSpan({ cls: "harang-calendar-event-popup-value", text: value });
}

function positionCard(card: HTMLElement, anchor: HTMLElement): void {
	const rect = anchor.getBoundingClientRect();
	const width = 280;
	const left = `${Math.max(8, Math.min(rect.left, window.innerWidth - width - 8))}px`;
	const openUpward = rect.bottom + 8 > window.innerHeight * 0.75;
	card.setCssStyles(
		openUpward
			? { position: "fixed", left, bottom: `${window.innerHeight - rect.top + 4}px` }
			: { position: "fixed", left, top: `${rect.bottom + 4}px` }
	);
}

/** Opens (or, if `event` is undefined, a "not found" version of) the event detail popup anchored to `anchor`. */
export function openEventCard(event: CalDavEvent | undefined, rawUid: string, anchor: HTMLElement): void {
	closeEventCard();

	const card = createDiv({ cls: "harang-calendar-event-popup" });

	if (!event) {
		card.createDiv({ cls: "harang-calendar-event-popup-title", text: rawUid });
		card.createDiv({ cls: "harang-calendar-event-popup-missing", text: t("cardMissingEvent") });
	} else {
		card.createDiv({ cls: "harang-calendar-event-popup-title", text: event.summary });
		const fields = card.createDiv({ cls: "harang-calendar-event-popup-fields" });
		addField(fields, t("cardFieldWhen"), formatEventDateTime(event, t("agendaAllDay")));
		if (event.location) addField(fields, t("cardFieldLocation"), event.location);
		if (event.description) addField(fields, t("cardFieldDescription"), event.description);
		card.createDiv({ cls: "harang-calendar-event-popup-source", text: event.calendarName });
	}

	document.body.appendChild(card);
	positionCard(card, anchor);
	activeCard = card;

	outsideClickHandler = (evt: MouseEvent) => {
		const target = evt.target as Node;
		if (card.contains(target) || anchor.contains(target)) return;
		closeEventCard();
	};
	window.setTimeout(() => {
		if (outsideClickHandler) document.addEventListener("mousedown", outsideClickHandler, true);
	}, 0);
}
