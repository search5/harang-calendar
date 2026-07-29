import { requestUrl } from "obsidian";
import { GoogleAccount } from "./types";
import { refreshAccessToken } from "./deviceAuth";
import { t } from "../i18n";

const API_BASE = "https://www.googleapis.com/calendar/v3";

export class GoogleCalendarError extends Error {}

export interface GoogleCalendarListEntry {
	id: string;
	summary: string;
	primary?: boolean;
	backgroundColor?: string;
}

/**
 * Used only to enumerate a Google account's calendars (calendarList) - CalDAV
 * has no equivalent discovery for Google (you need to already know a
 * calendar's ID to address it). Actual event fetching goes through
 * CalDavClient against Google's CalDAV endpoint instead - see
 * settingsTab.ts's discoverGoogleCalendars.
 */
export class GoogleCalendarClient {
	private account: GoogleAccount;

	constructor(
		account: GoogleAccount,
		private onTokenRefreshed: (account: GoogleAccount) => void
	) {
		this.account = account;
	}

	private async ensureFreshToken(): Promise<string> {
		if (Date.now() < this.account.expiresAt - 60_000) return this.account.accessToken;
		const refreshed = await refreshAccessToken(this.account.refreshToken);
		this.account = { ...this.account, accessToken: refreshed.accessToken, expiresAt: refreshed.expiresAt };
		this.onTokenRefreshed(this.account);
		return this.account.accessToken;
	}

	async listCalendars(): Promise<GoogleCalendarListEntry[]> {
		const token = await this.ensureFreshToken();
		const res = await requestUrl({
			url: `${API_BASE}/users/me/calendarList`,
			headers: { Authorization: `Bearer ${token}` },
			throw: false,
		});
		if (res.status >= 400) {
			throw new GoogleCalendarError(t("googleApiRequestFailed", { method: "GET", path: "/users/me/calendarList", status: res.status }));
		}
		const json = res.json as { items?: GoogleCalendarListEntry[] };
		return json.items ?? [];
	}
}
