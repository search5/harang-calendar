import { ItemView, TFile, WorkspaceLeaf } from "obsidian";
import { createApp, reactive, type App as VueApp } from "vue";
import MonthView from "../vue/MonthView.vue";
import { MonthViewState, monthGridRange } from "./monthGrid";
import { localDayKey } from "./agenda";
import { MonthPickerModal } from "./MonthPickerModal";
import { getNoteEventsInRange } from "../notes/noteEvents";
import { CalendarListItem } from "../types";
import type { CalDavTimeRange } from "../caldav/client";
import type HarangCalendarPlugin from "../main";
import { t } from "../i18n";

export const VIEW_TYPE_CALENDAR_MONTH = "harang-calendar-month-view";

/**
 * The full-tab view: a month grid, click a day to see its events below,
 * navigate months. See AgendaItemView for the sidebar agenda list.
 *
 * Event data is fetched on demand per displayed month via
 * `CalendarStore.ensureRangeFetched` (only the not-yet-cached part of a
 * month is actually requested), and the toolbar's "Refresh" button force
 * re-fetches exactly the month currently on screen via `refreshRange`.
 */
export class MonthItemView extends ItemView {
	private vueApp: VueApp | null = null;
	private state: MonthViewState = reactive({
		year: 0,
		month: 0,
		items: [],
		loading: false,
		hasCalendars: false,
		calendarColors: {},
		selectedDateKey: null,
	});

	constructor(leaf: WorkspaceLeaf, private plugin: HarangCalendarPlugin) {
		super(leaf);
	}

	getViewType(): string {
		return VIEW_TYPE_CALENDAR_MONTH;
	}

	getDisplayText(): string {
		return t("monthViewDisplayName");
	}

	getIcon(): string {
		return "calendar";
	}

	async onOpen(): Promise<void> {
		const now = new Date();
		this.state.year = now.getFullYear();
		this.state.month = now.getMonth() + 1;
		this.state.selectedDateKey = localDayKey(now);

		this.contentEl.empty();
		const mountEl = this.contentEl.createDiv({ cls: "harang-calendar-view" });
		this.vueApp = createApp(MonthView, {
			state: this.state,
			onRefresh: () => void this.refresh(true),
			onPrevMonth: () => this.changeMonth(-1),
			onNextMonth: () => this.changeMonth(1),
			onToday: () => this.goToday(),
			onSelectDay: (dateKey: string) => {
				this.state.selectedDateKey = dateKey;
			},
			onNavigateToDate: (dateKey: string) => this.navigateToDate(dateKey),
			onOpenPicker: () => this.openPicker(),
			onOpenNote: (file: TFile) => void this.app.workspace.getLeaf(false).openFile(file),
		});
		this.vueApp.mount(mountEl);
		void this.refresh(false);
	}

	async onClose(): Promise<void> {
		this.vueApp?.unmount();
		this.vueApp = null;
	}

	private changeMonth(delta: number): void {
		let month = this.state.month + delta;
		let year = this.state.year;
		if (month < 1) {
			month = 12;
			year -= 1;
		} else if (month > 12) {
			month = 1;
			year += 1;
		}
		this.state.year = year;
		this.state.month = month;
		void this.refresh(false);
	}

	/**
	 * Selects `dateKey` (an arrow-key move from `MonthView.vue`). If it's
	 * already visible in the currently displayed grid - which includes a
	 * few leading/trailing days from the adjacent months, not just the
	 * exact displayed month - only the selection changes, no re-fetch.
	 * Otherwise the view navigates to the month containing that date.
	 */
	private navigateToDate(dateKey: string): void {
		const [year, month, day] = dateKey.split("-").map(Number);
		const target = new Date(year, month - 1, day);
		const { start, end } = monthGridRange(this.state.year, this.state.month);

		this.state.selectedDateKey = dateKey;

		if (target.getTime() >= start.getTime() && target.getTime() <= end.getTime()) {
			return;
		}

		this.state.year = year;
		this.state.month = month;
		void this.refresh(false);
	}

	private goToday(): void {
		const now = new Date();
		this.state.year = now.getFullYear();
		this.state.month = now.getMonth() + 1;
		this.state.selectedDateKey = localDayKey(now);
		void this.refresh(false);
	}

	/** Lets the user jump directly to any year/month instead of stepping one at a time. */
	private openPicker(): void {
		new MonthPickerModal(this.app, this.state.year, this.state.month, (year, month) => {
			this.state.year = year;
			this.state.month = month;
			void this.refresh(false);
		}).open();
	}

	private async refresh(force: boolean): Promise<void> {
		this.state.loading = true;
		try {
			const range = this.currentGridRange();
			if (force) {
				await this.plugin.calendarStore.refreshRange(range);
			} else {
				await this.plugin.calendarStore.ensureRangeFetched(range);
			}
			this.syncState(range);
		} finally {
			this.state.loading = false;
		}
	}

	private currentGridRange(): CalDavTimeRange {
		const { start, end } = monthGridRange(this.state.year, this.state.month);
		const rangeEnd = new Date(end);
		rangeEnd.setDate(rangeEnd.getDate() + 1);
		return { start, end: rangeEnd };
	}

	private syncState(range: CalDavTimeRange): void {
		this.state.hasCalendars = this.plugin.settings.accounts.some((account) => account.calendars.some((c) => c.enabled));

		const colors: Record<string, string | null> = {};
		for (const account of this.plugin.settings.accounts) {
			for (const calendar of account.calendars) colors[calendar.id] = calendar.color;
		}
		this.state.calendarColors = colors;

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
