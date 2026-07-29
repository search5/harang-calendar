export interface GoogleAccount {
	accessToken: string;
	refreshToken: string;
	/** Epoch ms. */
	expiresAt: number;
	scope: string;
	email: string | null;
}
