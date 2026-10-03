import { SocialLogin } from "../components/SocialLogin";
import { oauthMessages } from "../../shared/oauth";
import { useState } from "react";
import { ArrowRight, Workflow, ShieldCheck, MessageSquare } from "lucide-react";
import { api } from "../api";
import { Field } from "../components/ui";
export function Auth({ onReady }: { onReady: () => Promise<void> }) {
  const [register, setRegister] = useState(false),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(
      oauthMessages[
        new URLSearchParams(window.location.search).get("oauth") || ""
      ] || "",
    );
  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (busy) return;
    const f = new FormData(e.currentTarget);
    setBusy(true);
    setError("");
    try {
      await api(
        `/auth/${register ? "register" : "login"}`,
        "POST",
        Object.fromEntries(f),
      );
      try {
        await onReady();
      } catch {
        if (register) setRegister(false);
        throw new Error(
          register
            ? "Your account was created, but the session could not open. Please sign in with your new account."
            : "Your session could not open. Check that cookies are enabled and try signing in again.",
        );
      }
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function demo() {
    setBusy(true);
    setError("");
    try {
      await api("/auth/demo", "POST");
      await onReady();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="auth-page">
      <section className="auth-story">
        <div className="brand">
          <span className="brand-mark">r</span>relay
          <span className="brand-label">SOCIAL WORKSPACE</span>
        </div>
        <div>
          <span className="eyebrow">LESS REPETITION. MORE CONVERSATION.</span>
          <h1>
            Your conversations.
            <br />
            One clear view.
          </h1>
          <p>
            Bring your social inbox, resources, and customer relationships
            together. Stay in control of every reply.
          </p>
          <div className="auth-benefits">
            <span>
              <MessageSquare />
              One inbox for your team
            </span>
            <span>
              <Workflow />
              Replies powered by your rules
            </span>
            <span>
              <ShieldCheck />A human whenever it matters
            </span>
          </div>
        </div>
        <small>Built for thoughtful, personal engagement.</small>
      </section>
      <section className="auth-form">
        <div className="auth-card">
          <h2>{register ? "Create your workspace" : "Welcome to Relay"}</h2>
          <p>
            {register
              ? "Start with your business. Add your own details and replies."
              : "Sign in to pick up the conversation."}
          </p>
          <form onSubmit={submit}>
            {register && (
              <>
                <Field label="Your name">
                  <input name="name" required autoComplete="name" />
                </Field>
                <Field label="Workspace name">
                  <input name="workspaceName" required />
                </Field>
              </>
            )}
            <Field label="Email address">
              <input
                name="email"
                type="email"
                required
                autoComplete="email"
                placeholder="you@company.com"
              />
            </Field>
            <Field
              label="Password"
              hint={register ? "Use at least 12 characters." : undefined}
            >
              <input
                name="password"
                type="password"
                minLength={12}
                maxLength={128}
                required
                autoComplete={register ? "new-password" : "current-password"}
              />
            </Field>
            {error && (
              <p role="alert" className="error">
                {error}
              </p>
            )}
            <button className="primary wide" disabled={busy}>
              {busy
                ? "Opening workspace…"
                : register
                  ? "Create workspace"
                  : "Sign in"}
              <ArrowRight size={17} />
            </button>
          </form>
          <button
            className="text-button wide"
            disabled={busy}
            onClick={() => {
              setRegister(!register);
              setError("");
            }}
          >
            {register
              ? "Already have an account? Sign in"
              : "New here? Create a workspace"}
          </button>
          <SocialLogin disabled={busy} />
          <div className="divider">
            <span>or explore first</span>
          </div>
          <button className="secondary wide" disabled={busy} onClick={demo}>
            Explore a demo workspace <ArrowRight size={17} />
          </button>
          <p className="fine-print">
            Simulated accounts and conversations. No social accounts are
            connected and no messages are sent.
          </p>
        </div>
      </section>
    </div>
  );
}
