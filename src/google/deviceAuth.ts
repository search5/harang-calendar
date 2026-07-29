import { requestUrl } from "obsidian";
import { t } from "../i18n";

// Public "TVs and Limited Input devices" OAuth client for the HarangApp GCP
// project, shared with harang-contacts. Not a secret in the confidential-client
// sense (installed-app clients can't keep it hidden), but still keep it out of
// git history in unrelated forks if you ever rotate it.
const CLIENT_ID = "170404645224-d6sc3d748fnerhh44ag8hqf5r4veq28l.apps.googleusercontent.com";
const CLIENT_SECRET = "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";
const SCOPE = "https://www.googleapis.com/auth/calendar https://www.googleapis.com/auth/userinfo.email";
const DEVICE_CODE_URL = "https://oauth2.googleapis.com/device/code";
const TOKEN_URL = "https://oauth2.googleapis.com/token";
const USERINFO_URL = "https://www.googleapis.com/oauth2/v3/userinfo";

export class GoogleAuthError extends Error {}

export interface DeviceCodeInfo {
	deviceCode: string;
	userCode: string;
	verificationUrl: string;
	expiresInSec: number;
	intervalSec: number;
}

export interface DeviceTokenResult {
	accessToken: string;
	refreshToken: string | null;
	expiresAt: number;
	scope: string;
}

/** A mutable flag the caller can flip to stop an in-flight `pollForToken` early (e.g. the user closed the modal). */
export interface CancelSignal {
	cancelled: boolean;
}

interface DeviceCodeApiResponse {
	device_code: string;
	user_code: string;
	verification_url: string;
	expires_in: number;
	interval: number;
}

interface TokenApiResponse {
	error?: string;
	access_token?: string;
	refresh_token?: string;
	expires_in?: number;
	scope?: string;
}

function sleep(ms: number): Promise<void> {
	return new Promise((resolve) => window.setTimeout(resolve, ms));
}

export async function requestDeviceCode(): Promise<DeviceCodeInfo> {
	const res = await requestUrl({
		url: DEVICE_CODE_URL,
		method: "POST",
		headers: { "Content-Type": "application/x-www-form-urlencoded" },
		body: new URLSearchParams({ client_id: CLIENT_ID, scope: SCOPE }).toString(),
		throw: false,
	});
	if (res.status >= 400) throw new GoogleAuthError(t("googleDeviceCodeRequestFailed", { status: res.status }));
	const json = res.json as DeviceCodeApiResponse;
	return {
		deviceCode: json.device_code,
		userCode: json.user_code,
		verificationUrl: json.verification_url,
		expiresInSec: json.expires_in,
		intervalSec: json.interval,
	};
}

/** Polls the token endpoint (RFC 8628) until the user approves, the device code expires, or `signal.cancelled` becomes true. */
export async function pollForToken(deviceCode: string, intervalSec: number, expiresInSec: number, signal: CancelSignal): Promise<DeviceTokenResult> {
	const deadline = Date.now() + expiresInSec * 1000;
	let waitSec = intervalSec;
	while (Date.now() < deadline) {
		if (signal.cancelled) throw new GoogleAuthError(t("googleDeviceFlowCancelled"));
		await sleep(waitSec * 1000);
		if (signal.cancelled) throw new GoogleAuthError(t("googleDeviceFlowCancelled"));

		const res = await requestUrl({
			url: TOKEN_URL,
			method: "POST",
			headers: { "Content-Type": "application/x-www-form-urlencoded" },
			body: new URLSearchParams({
				client_id: CLIENT_ID,
				client_secret: CLIENT_SECRET,
				device_code: deviceCode,
				grant_type: "urn:ietf:params:oauth:grant-type:device_code",
			}).toString(),
			throw: false,
		});
		const json = res.json as TokenApiResponse;
		if (res.status === 200 && json.access_token) {
			return {
				accessToken: json.access_token,
				refreshToken: json.refresh_token ?? null,
				expiresAt: Date.now() + (json.expires_in ?? 3600) * 1000,
				scope: json.scope ?? SCOPE,
			};
		}
		if (json.error === "authorization_pending") continue;
		if (json.error === "slow_down") {
			waitSec += 5;
			continue;
		}
		if (json.error === "access_denied") throw new GoogleAuthError(t("googleDeviceFlowDenied"));
		if (json.error === "expired_token") throw new GoogleAuthError(t("googleDeviceFlowExpired"));
		throw new GoogleAuthError(t("googleDeviceFlowFailed", { error: json.error ?? String(res.status) }));
	}
	throw new GoogleAuthError(t("googleDeviceFlowExpired"));
}

export async function refreshAccessToken(refreshToken: string): Promise<{ accessToken: string; expiresAt: number }> {
	const res = await requestUrl({
		url: TOKEN_URL,
		method: "POST",
		headers: { "Content-Type": "application/x-www-form-urlencoded" },
		body: new URLSearchParams({
			client_id: CLIENT_ID,
			client_secret: CLIENT_SECRET,
			refresh_token: refreshToken,
			grant_type: "refresh_token",
		}).toString(),
		throw: false,
	});
	if (res.status >= 400) throw new GoogleAuthError(t("googleTokenRefreshFailed", { status: res.status }));
	const json = res.json as TokenApiResponse;
	if (!json.access_token) throw new GoogleAuthError(t("googleTokenRefreshFailed", { status: res.status }));
	return { accessToken: json.access_token, expiresAt: Date.now() + (json.expires_in ?? 3600) * 1000 };
}

/** Best-effort lookup of the connected account's email, to show in the settings UI. Returns null rather than throwing on failure. */
export async function fetchAccountEmail(accessToken: string): Promise<string | null> {
	const res = await requestUrl({
		url: USERINFO_URL,
		headers: { Authorization: `Bearer ${accessToken}` },
		throw: false,
	});
	if (res.status >= 400) return null;
	const json = res.json as { email?: string };
	return json.email ?? null;
}
