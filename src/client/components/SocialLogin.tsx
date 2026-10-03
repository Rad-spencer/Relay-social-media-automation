import { useEffect, useState } from "react";
import type { ProviderStatus } from "../../shared/oauth";
import { api } from "../api";
import { PlatformIcon } from "./ui";
export function SocialLogin({ disabled = false }: { disabled?: boolean }) {
  const [providers, setProviders] = useState<ProviderStatus[]>([]);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState("");
  useEffect(() => {
    let active = true;
    api<{ providers: ProviderStatus[] }>("/auth/providers")
      .then((r) => {
        if (active) setProviders(r.providers);
      })
      .catch((e) => {
        if (active) setError(e.message);
      });
    return () => {
      active = false;
    };
  }, []);
  return (
    <section className="social-login" aria-label="Social sign-in">
      <div className="divider">
        <span>or continue with</span>
      </div>
      <div className="social-login-grid">
        {providers.map((p) => (
          <button
            key={p.id}
            type="button"
            className="secondary social-login-button"
            disabled={disabled || !!busy || !p.enabled}
            title={p.reason || `Continue with ${p.name}`}
            onClick={async () => {
              setError("");
              setBusy(p.id);
              try {
                const result = await api<{ url: string }>(
                  `/auth/social/${p.id}/start`,
                  "POST",
                );
                window.location.assign(result.url);
              } catch (e) {
                setError((e as Error).message);
                setBusy("");
              }
            }}
          >
            {p.id === "google" ? (
              <span className="google-login-mark" aria-hidden="true">
                G
              </span>
            ) : (
              <PlatformIcon platform={p.platform} />
            )}
            <span>
              {busy === p.id ? "Opening…" : p.name}
              <small>
                {p.enabled
                  ? p.id === "instagram"
                    ? "Business / Creator"
                    : "Sign in"
                  : "Setup required"}
              </small>
            </span>
          </button>
        ))}
      </div>
      {!!providers.length && providers.some((p) => !p.enabled) && (
        <p className="fine-print">
          Unavailable providers need administrator setup. Google sign-in is used
          for YouTube.
        </p>
      )}
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
    </section>
  );
}
