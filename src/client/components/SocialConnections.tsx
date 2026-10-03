import { useEffect, useState } from "react";
import { api } from "../api";
import { Badge, External, Field, Modal, PlatformIcon } from "./ui";
import { integrationDocs } from "../../platforms/registry";
import type { ProviderStatus, SocialConnection } from "../../shared/oauth";
export function SocialConnections({ tick }: { tick: number }) {
  const [data, setData] = useState<{
    providers: ProviderStatus[];
    connections: SocialConnection[];
    canConnect: boolean;
  }>();
  const [error, setError] = useState("");
  const [busy, setBusy] = useState("");
  const [revision, setRevision] = useState(0);
  const [setup, setSetup] = useState<ProviderStatus>();
  const [setupMessage, setSetupMessage] = useState("");
  useEffect(() => {
    api<NonNullable<typeof data>>("/social/connections")
      .then(setData)
      .catch((e) => setError(e.message));
  }, [tick, revision]);
  return (
    <section aria-label="Connect social profiles">
      <div className="notice horizontal">
        Connect a profile to this workspace and add it as a sign-in method for
        your Relay account. X, LinkedIn and Threads connections also request
        publishing permission. Live inbox sync and messaging remain unavailable.
      </div>
      {data?.providers.some((p) => !p.enabled) && (
        <p className="notice">
          First-time setup is needed before these services can accept a
          connection. Choose “Set up” below for the provider-specific steps.
          Your social media password is entered only on the provider’s own login
          page.
        </p>
      )}
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      {data && !data.canConnect && (
        <p className="notice">
          Connections require an owner or administrator in a real workspace.
        </p>
      )}
      <div className="account-grid">
        {data?.providers.map((p) => (
          <section key={p.id} className="panel account-card">
            <div className="row-between">
              <PlatformIcon platform={p.platform} />
              <Badge tone={p.enabled ? "green" : "neutral"}>
                {p.enabled ? "Ready to connect" : "Setup required"}
              </Badge>
            </div>
            <h2>{p.id === "google" ? "YouTube · Google" : p.name}</h2>
            <p>
              {p.id === "instagram"
                ? "Business and Creator profiles"
                : p.id === "facebook"
                  ? "Personal identity only; Pages are not connected"
                  : p.id === "linkedin"
                    ? "Member profile; company Pages are not connected"
                    : "Connect your profile securely"}
            </p>
            {data.connections
              .filter((c) => c.provider === p.id)
              .map((c) => (
                <div className="social-connection" key={c.id}>
                  <strong>{c.name}</strong>
                  <Badge tone={c.status === "expired" ? "amber" : "green"}>
                    {c.status === "expired"
                      ? "Reconnect required"
                      : "Profile connected"}
                  </Badge>
                  <small>
                    {c.expires_at
                      ? `Authorization expires ${new Date(c.expires_at).toLocaleString()}`
                      : "Expiry not supplied by provider"}
                  </small>
                  <button
                    type="button"
                    className="text-button"
                    disabled={!data.canConnect || !!busy}
                    onClick={async () => {
                      setBusy(c.id);
                      setError("");
                      try {
                        await api(`/social/connections/${c.id}`, "DELETE");
                        setRevision((v) => v + 1);
                      } catch (e) {
                        setError((e as Error).message);
                      } finally {
                        setBusy("");
                      }
                    }}
                  >
                    Disconnect from workspace
                  </button>
                </div>
              ))}
            <button
              type="button"
              className="secondary wide"
              disabled={!!busy || (p.enabled && !data.canConnect)}
              onClick={async () => {
                if (!p.enabled) {
                  setSetupMessage("");
                  setSetup(p);
                  return;
                }
                setBusy(p.id);
                setError("");
                try {
                  const r = await api<{ url: string }>(
                    `/social/${p.id}/connect`,
                    "POST",
                  );
                  window.location.assign(r.url);
                } catch (e) {
                  setError((e as Error).message);
                  setBusy("");
                }
              }}
            >
              {busy === p.id
                ? "Opening…"
                : !p.enabled
                  ? `Set up ${p.name}`
                  : data.connections.some((c) => c.provider === p.id)
                    ? "Reconnect / add profile"
                    : `Connect ${p.name}`}
            </button>
            {!p.enabled && <small>{p.reason}</small>}
          </section>
        ))}
      </div>
      {setup && (
        <Modal
          title={`Set up ${setup.name}`}
          onClose={() => setSetup(undefined)}
        >
          <div className="modal-form">
            <p>
              This is a one-time setup for the person hosting Relay. After it is
              complete, users can connect through the provider’s login page.
            </p>
            {!!setup.setupIssues?.length && (
              <div className="notice" role="status">
                <strong>Connection is blocked by these settings</strong>
                <ul>
                  {setup.setupIssues.map((issue) => (
                    <li key={issue}>{issue}</li>
                  ))}
                </ul>
                <p>
                  These are Relay’s developer-app settings, not your social
                  account password. Once configured, Connect opens the official
                  login page.
                </p>
              </div>
            )}
            <ol className="provider-setup-steps">
              <li>
                Register a web app with {setup.name} and enable its login
                product.
                {setup.id === "google" &&
                  " Enable YouTube Data API to connect a channel."}
                {setup.id === "instagram" &&
                  " Use Instagram Login with a Business or Creator account."}
                {setup.id === "linkedin" &&
                  " Enable Sign In with LinkedIn using OpenID Connect."}
                {setup.id === "tiktok" && " Enable TikTok Login Kit."}
                {setup.id === "threads" &&
                  " Use the Threads-specific app ID and secret."}
              </li>
              <li>
                Set Relay’s APP_URL to its HTTPS address and register the
                matching callback URL shown below.
              </li>
              <li>
                Add <code>{setup.id.toUpperCase()}_CLIENT_ID</code> and{" "}
                <code>{setup.id.toUpperCase()}_CLIENT_SECRET</code> to the
                server’s <code>.env</code> file.
                {setup.id === "tiktok" &&
                  " Use the Client Key as the client ID."}
                {setup.id === "facebook" &&
                  " Also set META_GRAPH_VERSION to the API version supported by your app."}
              </li>
              <li>
                Set <code>OAUTH_ENCRYPTION_KEY</code> to a persistent
                64-character hex key, restart Relay, then check setup below.
                Keep secrets on the server; never enter a social media password
                here.
              </li>
            </ol>
            <p className="fine-print">
              Server setup check: run <code>npm run social:check</code> in the
              Relay project folder. It reports missing settings without showing
              secrets.
            </p>
            <Field
              label="Current callback URL"
              hint="This updates when the server’s APP_URL changes. Register the exact URL with the provider."
            >
              <input
                readOnly
                value={setup.callbackUrl}
                onFocus={(e) => e.currentTarget.select()}
              />
            </Field>
            {setup.callbackUrl.startsWith("http:") && (
              <p className="notice">
                Relay currently uses a local HTTP address. Configure an HTTPS
                address for providers that require it.
              </p>
            )}
            <External href={integrationDocs[setup.platform]}>
              Open official {setup.name} documentation
            </External>
            <p className="fine-print">
              Developer app approval and test-user access are managed by the
              provider. Publishing support depends on the platform. Connecting a
              profile does not activate live messages.
            </p>
            {setupMessage && (
              <p role="status" className="notice">
                {setupMessage}
              </p>
            )}
            <div className="modal-actions">
              <button
                type="button"
                className="secondary"
                onClick={() => setSetup(undefined)}
              >
                Close
              </button>
              <button
                type="button"
                className="primary"
                disabled={!!busy}
                onClick={async () => {
                  setBusy("setup");
                  try {
                    const result = await api<NonNullable<typeof data>>(
                      "/social/connections",
                    );
                    setData(result);
                    const current = result.providers.find(
                      (p) => p.id === setup.id,
                    );
                    if (current?.enabled) {
                      setSetup(undefined);
                      setError("");
                    } else {
                      if (current) setSetup(current);
                      setSetupMessage(
                        current?.reason ||
                          "Provider configuration is still unavailable.",
                      );
                    }
                  } catch (e) {
                    setSetupMessage((e as Error).message);
                  } finally {
                    setBusy("");
                  }
                }}
              >
                {busy === "setup" ? "Checking…" : "Check setup"}
              </button>
            </div>
          </div>
        </Modal>
      )}
      <p className="fine-print">
        Disconnect removes Relay’s stored access tokens for this workspace. It
        keeps your sign-in method; you can revoke the app’s authorization in the
        provider’s settings. Expired connections require reconnecting.
      </p>
    </section>
  );
}
