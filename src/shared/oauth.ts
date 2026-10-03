import type { Platform } from "./types";
export const oauthProviders = [
  "google",
  "facebook",
  "instagram",
  "tiktok",
  "x",
  "linkedin",
  "threads",
] as const;
export type OAuthProvider = (typeof oauthProviders)[number];
export interface ProviderStatus {
  id: OAuthProvider;
  name: string;
  platform: Platform;
  enabled: boolean;
  reason: string;
  setupIssues?: string[];
  callbackUrl: string;
}
export interface SocialConnection {
  id: string;
  provider: OAuthProvider;
  name: string;
  external_id: string;
  expires_at: string | null;
  connected_at: string;
  status: "connected" | "expired";
}
export const oauthMessages: Record<string, string> = {
  connected:
    "Social profile connected. Open Posts & scheduling for supported publishing options. Live inbox and messaging are not enabled yet.",
  cancelled: "Social login was cancelled. You can try again.",
  expired:
    "This login attempt expired or was already used. Please start again.",
  failed:
    "The provider could not complete login. Please try again or use email sign-in.",
  unavailable: "This provider still needs setup by the Relay administrator.",
  conflict:
    "This identity belongs to an existing account. Sign in to that account first; accounts are never merged automatically.",
  session:
    "Your Relay session changed or expired. Sign in again before connecting a profile.",
  no_channel:
    "This Google account has no accessible YouTube channel. Choose an account with a channel.",
};
