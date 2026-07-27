import { CalDavAccount, HarangCalendarSettings } from "./types";
import { t } from "./i18n";
import { getSystemTimezone } from "./caldav/timezone";

export const DEFAULT_SETTINGS: HarangCalendarSettings = {
	accounts: [],
	cacheTtlMinutes: 30,
};

export function createEmptyAccount(): CalDavAccount {
	return {
		id: `account-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
		name: t("settingsNewAccountDefaultName"),
		serverUrl: "",
		username: "",
		password: "",
		timezone: { kind: "iana", zone: getSystemTimezone() },
		calendars: [],
	};
}
