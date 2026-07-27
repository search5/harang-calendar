import { ItemView, TFile, WorkspaceLeaf } from "obsidian";
import { createApp, reactive, type App as VueApp } from "vue";
import AgendaView from "../vue/AgendaView.vue";
import { CalendarViewState } from "./agenda";
import { getNoteEventsInRange } from "../notes/noteEvents";
import { CalendarListItem } from "../types";
import type HarangCalendarPlugin from "../main";
import { t } from "../i18n";

export const VIEW_TYPE_CALENDAR_AGENDA = "harang-calendar-agenda-view";
const AGENDA_WINDOW_DAYS = 30;

/** The compact, sidebar-sized view: an upcoming-events agenda list. See MonthItemView for the full-tab month grid. */
export class AgendaItemView extends ItemView {
	private vueApp: VueApp | null = null;
	private state: CalendarViewState = reactive({ items: [], loading: false, hasCalendars: false, calendarColors: {} });

	constructor(leaf: WorkspaceLeaf, private plugin: HarangCalendarPlugin) {
		super(leaf);
	}

	getViewType(): string {
		return VIEW_TYPE_CALENDAR_AGENDA;
	}

	getDisplayText(): string {
		return t("viewDisplayName");
	}

	getIcon(): string {
		return "calendar";
	}

	async onOpen(): Promise<void> {
		this.contentEl.empty();
		const mountEl = this.contentEl.createDiv({ cls: "harang-calendar-view" });
		this.vueApp = createApp(AgendaView, {
			state: this.state,
			onRefresh: () => void this.refresh(true),
			onOpenNote: (file: TFile) => void this.app.workspace.getLeaf(false).openFile(file),
		});
		this.vueApp.mount(mountEl);
		void this.refresh(false);
	}

	async onClose(): Promise<void> {
		this.vueApp?.unmount();
		this.vueApp = null;
	}

	private async refresh(force: boolean): Promise<void> {
		this.state.loading = true;
		try {
			if (force) {
				await this.plugin.calendarStore.refreshAll();
			} else {
				await this.plugin.calendarStore.refreshIfStale();
			}
			this.syncState();
		} finally {
			this.state.loading = false;
		}
	}

	private syncState(): void {
		this.state.hasCalendars = this.plugin.settings.accounts.some((account) => account.calendars.some((c) => c.enabled));

		const colors: Record<string, string | null> = {};
		for (const account of this.plugin.settings.accounts) {
			for (const calendar of account.calendars) colors[calendar.id] = calendar.color;
		}
		this.state.calendarColors = colors;

		const start = new Date();
		start.setHours(0, 0, 0, 0);
		const end = new Date(start.getTime() + AGENDA_WINDOW_DAYS * 24 * 60 * 60 * 1000);
		const range = { start, end };

		const caldavItems: CalendarListItem[] = this.plugin.calendarStore
			.getEventsInRange(range)
			.map((event) => ({ kind: "caldav", event }));
		const noteItems: CalendarListItem[] = getNoteEventsInRange(this.app, range).map((noteEvent) => ({
			kind: "note",
			noteEvent,
		}));
		this.state.items = [...caldavItems, ...noteItems];
	}
}
