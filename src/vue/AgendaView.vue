<script lang="ts">
import { computed, defineComponent, type PropType } from "vue";
import type { TFile } from "obsidian";
import type { CalDavEvent, CalendarListItem, NoteEvent } from "../types";
import { groupItemsByLocalDay, formatDate, formatEventTime, formatNoteEventTime, todayKey, tomorrowKey, type AgendaDay, type CalendarViewState } from "../view/agenda";
import { openEventCard } from "../render/eventCard";
import { t } from "../i18n";

const AGENDA_WINDOW_DAYS = 30;

export default defineComponent({
	name: "HarangCalendarAgendaView",
	props: {
		state: { type: Object as PropType<CalendarViewState>, required: true },
		onRefresh: { type: Function as PropType<() => void>, required: true },
		onOpenNote: { type: Function as PropType<(file: TFile) => void>, required: true },
	},
	setup(props) {
		const today = todayKey();
		const tomorrow = tomorrowKey();
		const groupedDays = computed<AgendaDay[]>(() => groupItemsByLocalDay(props.state.items));

		function dayHeading(day: AgendaDay): string {
			if (day.dateKey === today) return t("agendaToday");
			if (day.dateKey === tomorrow) return t("agendaTomorrow");
			return formatDate(day.date);
		}

		function itemKey(item: CalendarListItem): string {
			return item.kind === "note"
				? `note:${item.noteEvent.file.path}:${item.noteEvent.dateKey}`
				: `caldav:${item.event.calendarId}:${item.event.uid}:${item.event.start}`;
		}

		function eventTime(event: CalDavEvent): string {
			return formatEventTime(event, t("agendaAllDay"));
		}

		function noteEventTime(noteEvent: NoteEvent): string {
			return formatNoteEventTime(noteEvent, t("agendaAllDay"));
		}

		function eventColor(event: CalDavEvent): string {
			return props.state.calendarColors[event.calendarId] || "var(--interactive-accent)";
		}

		function openItem(item: CalendarListItem, evt: MouseEvent): void {
			if (item.kind === "note") props.onOpenNote(item.noteEvent.file);
			else openEventCard(item.event, item.event.uid, evt.currentTarget as HTMLElement);
		}

		return { t, groupedDays, dayHeading, itemKey, eventTime, noteEventTime, eventColor, openItem, agendaWindowDays: AGENDA_WINDOW_DAYS };
	},
});
</script>

<template>
	<div class="harang-calendar-agenda">
		<div class="harang-calendar-toolbar">
			<button class="harang-calendar-refresh-btn" :disabled="state.loading" @click="onRefresh">
				{{ state.loading ? t('settingsRefreshButtonLoading') : t('settingsRefreshButtonIdle') }}
			</button>
		</div>

		<div v-if="!state.hasCalendars && state.items.length === 0" class="harang-calendar-empty-state">
			<p>{{ t('viewEmptyState') }}</p>
		</div>
		<div v-else-if="groupedDays.length === 0 && !state.loading" class="harang-calendar-empty-state">
			<p>{{ t('agendaEmptyNoEvents', { days: agendaWindowDays }) }}</p>
		</div>
		<div v-else class="harang-calendar-days">
			<section v-for="day in groupedDays" :key="day.dateKey" class="harang-calendar-day">
				<h3 class="harang-calendar-day-heading">{{ dayHeading(day) }}</h3>
				<ul class="harang-calendar-event-list">
					<li
						v-for="item in day.items"
						:key="itemKey(item)"
						class="harang-calendar-event-card"
						:class="{ 'harang-calendar-note-event-card': item.kind === 'note' }"
						:style="item.kind === 'caldav' ? { borderLeftColor: eventColor(item.event) } : {}"
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
							<span v-if="item.event.location" class="harang-calendar-event-location">{{ item.event.location }}</span>
						</template>
					</li>
				</ul>
			</section>
		</div>
	</div>
</template>
