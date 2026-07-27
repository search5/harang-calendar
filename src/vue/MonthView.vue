<script lang="ts">
import { computed, defineComponent, nextTick, watch, type PropType } from "vue";
import type { TFile } from "obsidian";
import type { CalDavEvent, CalendarListItem, NoteEvent } from "../types";
import { buildMonthGrid, weekdayShortNames, type MonthGridDay, type MonthViewState } from "../view/monthGrid";
import { resolveLocale, formatEventTime, formatNoteEventTime, localDayKey, todayKey } from "../view/agenda";
import { openEventCard } from "../render/eventCard";
import { t } from "../i18n";

const ARROW_KEY_DAY_DELTA: Record<string, number> = {
	ArrowLeft: -1,
	ArrowRight: 1,
	ArrowUp: -7,
	ArrowDown: 7,
};

export default defineComponent({
	name: "HarangCalendarMonthView",
	props: {
		state: { type: Object as PropType<MonthViewState>, required: true },
		onRefresh: { type: Function as PropType<() => void>, required: true },
		onPrevMonth: { type: Function as PropType<() => void>, required: true },
		onNextMonth: { type: Function as PropType<() => void>, required: true },
		onToday: { type: Function as PropType<() => void>, required: true },
		onSelectDay: { type: Function as PropType<(dateKey: string) => void>, required: true },
		onNavigateToDate: { type: Function as PropType<(dateKey: string) => void>, required: true },
		onOpenPicker: { type: Function as PropType<() => void>, required: true },
		onOpenNote: { type: Function as PropType<(file: TFile) => void>, required: true },
	},
	setup(props) {
		const today = todayKey();
		const weekdayNames = weekdayShortNames();

		const gridDays = computed<MonthGridDay[]>(() => buildMonthGrid(props.state.year, props.state.month, props.state.items));
		const selectedDay = computed<MonthGridDay | null>(
			() => gridDays.value.find((d) => d.dateKey === props.state.selectedDateKey) ?? null
		);
		const monthLabel = computed(() =>
			new Intl.DateTimeFormat(resolveLocale(), { year: "numeric", month: "long" }).format(
				new Date(props.state.year, props.state.month - 1, 1)
			)
		);
		const selectedDayHeading = computed(() => {
			if (!selectedDay.value) return "";
			return new Intl.DateTimeFormat(resolveLocale(), { month: "long", day: "numeric", weekday: "short" }).format(
				selectedDay.value.date
			);
		});

		function itemKey(item: CalendarListItem): string {
			return item.kind === "note"
				? `note:${item.noteEvent.file.path}:${item.noteEvent.dateKey}`
				: `caldav:${item.event.calendarId}:${item.event.uid}:${item.event.start}`;
		}

		function itemLabel(item: CalendarListItem): string {
			return item.kind === "note" ? item.noteEvent.title : item.event.summary;
		}

		function itemColor(item: CalendarListItem): string | null {
			if (item.kind === "note") return null;
			return props.state.calendarColors[item.event.calendarId] || "var(--interactive-accent)";
		}

		function eventTime(event: CalDavEvent): string {
			return formatEventTime(event, t("agendaAllDay"));
		}

		function noteEventTime(noteEvent: NoteEvent): string {
			return formatNoteEventTime(noteEvent, t("agendaAllDay"));
		}

		function openItem(item: CalendarListItem, evt: MouseEvent): void {
			if (item.kind === "note") props.onOpenNote(item.noteEvent.file);
			else openEventCard(item.event, item.event.uid, evt.currentTarget as HTMLElement);
		}

		// Roving tabindex: only the selected day is a tab stop. Arrow keys
		// move the selection (possibly across months) and follow it with
		// real keyboard focus, so Left/Right/Up/Down works the way it does
		// in a native date picker.
		const dayEls = new Map<string, HTMLElement>();
		function setDayRef(dateKey: string, el: Element | null): void {
			if (el instanceof HTMLElement) dayEls.set(dateKey, el);
			else dayEls.delete(dateKey);
		}

		watch(
			() => props.state.selectedDateKey,
			async (dateKey) => {
				if (!dateKey) return;
				await nextTick();
				dayEls.get(dateKey)?.focus();
			}
		);

		function onDayKeydown(evt: KeyboardEvent, day: MonthGridDay): void {
			if (evt.key === "Enter" || evt.key === " ") {
				evt.preventDefault();
				props.onSelectDay(day.dateKey);
				return;
			}
			const delta = ARROW_KEY_DAY_DELTA[evt.key];
			if (delta === undefined) return;
			evt.preventDefault();
			const target = new Date(day.date);
			target.setDate(target.getDate() + delta);
			props.onNavigateToDate(localDayKey(target));
		}

		return {
			t,
			today,
			weekdayNames,
			gridDays,
			selectedDay,
			monthLabel,
			selectedDayHeading,
			itemKey,
			itemLabel,
			itemColor,
			eventTime,
			noteEventTime,
			openItem,
			setDayRef,
			onDayKeydown,
		};
	},
});
</script>

<template>
	<div class="harang-calendar-month">
		<div class="harang-calendar-month-toolbar">
			<button class="harang-calendar-month-nav-btn" :aria-label="t('monthViewPrevMonth')" @click="onPrevMonth">‹</button>
			<button class="harang-calendar-month-label" :aria-label="t('monthViewOpenPicker')" @click="onOpenPicker">
				{{ monthLabel }}<span class="harang-calendar-month-label-caret">▾</span>
			</button>
			<button class="harang-calendar-month-nav-btn" :aria-label="t('monthViewNextMonth')" @click="onNextMonth">›</button>
			<div class="harang-calendar-month-toolbar-spacer" />
			<button class="harang-calendar-month-today-btn" @click="onToday">{{ t('agendaToday') }}</button>
			<button class="harang-calendar-refresh-btn" :disabled="state.loading" @click="onRefresh">
				{{ state.loading ? t('settingsRefreshButtonLoading') : t('settingsRefreshButtonIdle') }}
			</button>
		</div>

		<div v-if="!state.hasCalendars && state.items.length === 0" class="harang-calendar-empty-state">
			<p>{{ t('viewEmptyState') }}</p>
		</div>
		<template v-else>
			<div class="harang-calendar-month-frame">
				<div class="harang-calendar-month-weekdays">
					<div v-for="name in weekdayNames" :key="name" class="harang-calendar-month-weekday">{{ name }}</div>
				</div>

				<div class="harang-calendar-month-grid" role="grid">
					<div
						v-for="day in gridDays"
						:key="day.dateKey"
						:ref="(el) => setDayRef(day.dateKey, el as Element | null)"
						class="harang-calendar-month-day"
						:class="{
							'harang-calendar-month-day-outside': !day.inCurrentMonth,
							'harang-calendar-month-day-today': day.dateKey === today,
							'harang-calendar-month-day-selected': day.dateKey === state.selectedDateKey,
						}"
						role="gridcell"
						:tabindex="day.dateKey === state.selectedDateKey ? 0 : -1"
						@click="onSelectDay(day.dateKey)"
						@keydown="onDayKeydown($event, day)"
					>
						<span class="harang-calendar-month-day-number">{{ day.date.getDate() }}</span>
						<div class="harang-calendar-month-day-events">
							<span
								v-for="item in day.items.slice(0, 3)"
								:key="itemKey(item)"
								class="harang-calendar-month-day-pill"
								:class="{ 'harang-calendar-month-day-pill-note': item.kind === 'note' }"
								:style="{ backgroundColor: itemColor(item) }"
								:title="itemLabel(item)"
								@click.stop="openItem(item, $event)"
							>{{ itemLabel(item) }}</span>
							<span v-if="day.items.length > 3" class="harang-calendar-month-day-more">
								{{ t('monthViewMoreEvents', { count: day.items.length - 3 }) }}
							</span>
						</div>
					</div>
				</div>
			</div>

			<div v-if="selectedDay" class="harang-calendar-month-selected">
				<h3 class="harang-calendar-day-heading">{{ selectedDayHeading }}</h3>
				<div v-if="selectedDay.items.length === 0" class="harang-calendar-empty-state">
					<p>{{ t('dateWidgetEmpty') }}</p>
				</div>
				<ul v-else class="harang-calendar-event-list">
					<li
						v-for="item in selectedDay.items"
						:key="itemKey(item)"
						class="harang-calendar-event-card"
						:class="{ 'harang-calendar-note-event-card': item.kind === 'note' }"
						:style="item.kind === 'caldav' ? { borderLeftColor: itemColor(item) } : {}"
						tabindex="0"
						role="button"
						@click="openItem(item, $event)"
						@keydown.enter="openItem(item, $event)"
						@keydown.space.prevent="openItem(item, $event)"
					>
						<template v-if="item.kind === 'note'">
							<span class="harang-calendar-event-time">{{ noteEventTime(item.noteEvent) }}</span>
							<span class="harang-calendar-event-summary">{{ item.noteEvent.title }}</span>
						</template>
						<template v-else>
							<span class="harang-calendar-event-time">{{ eventTime(item.event) }}</span>
							<span class="harang-calendar-event-summary">{{ item.event.summary }}</span>
							<span class="harang-calendar-event-calendar">{{ item.event.calendarName }}</span>
						</template>
					</li>
				</ul>
			</div>
		</template>
	</div>
</template>
