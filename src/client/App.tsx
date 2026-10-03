import { oauthMessages } from "../shared/oauth";
import { useCallback, useEffect, useState } from "react";
import {
  Activity as ActivityIcon,
  CalendarDays,
  BarChart3,
  Bell,
  BookOpen,
  ChevronDown,
  Command,
  FlaskConical,
  FolderOpen,
  LayoutDashboard,
  LogOut,
  Menu,
  MessageSquare,
  Search,
  Settings,
  Sun,
  Moon,
  Users,
  Workflow,
  X,
} from "lucide-react";
import type { Dashboard, SessionUser } from "../shared/types";
import { api, setCsrf } from "./api";
import { Publishing } from "./pages/Publishing";
import { Auth } from "./pages/Auth";
import { Overview } from "./pages/Overview";
import { Inbox } from "./pages/Inbox";
import { Automations } from "./pages/Automations";
import { Resources } from "./pages/Resources";
import { Business } from "./pages/Business";
import { Contacts } from "./pages/Contacts";
import {
  Accounts,
  Activity,
  Analytics,
  Notifications,
  Simulator,
} from "./pages/Operations";
import { Avatar, Modal } from "./components/ui";
const nav = [
  { name: "Overview", icon: LayoutDashboard },
  { name: "Inbox", icon: MessageSquare },
  { name: "Posts & scheduling", icon: CalendarDays },
  { name: "Automations", icon: Workflow },
  { name: "Contacts", icon: Users },
  { name: "Resources", icon: FolderOpen },
  { name: "Business & replies", icon: BookOpen },
  { name: "Analytics", icon: BarChart3 },
  { name: "Activity", icon: ActivityIcon },
];
export default function App() {
  const [user, setUser] = useState<SessionUser | null>(null),
    [loading, setLoading] = useState(true),
    [data, setData] = useState<Dashboard>(),
    [page, setPage] = useState(
      new URLSearchParams(window.location.search).get("page") === "accounts"
        ? "Social accounts"
        : new URLSearchParams(window.location.search).get("page") ===
            "publishing"
          ? "Posts & scheduling"
          : "Overview",
    ),
    [tick, setTick] = useState(0),
    [simulator, setSimulator] = useState(false),
    [mobile, setMobile] = useState(false),
    [error, setError] = useState(""),
    [searchOpen, setSearchOpen] = useState(false),
    [query, setQuery] = useState(""),
    [dark, setDark] = useState(localStorage.getItem("relay-theme") === "dark");
  const [oauthNotice, setOauthNotice] = useState(
    oauthMessages[
      new URLSearchParams(window.location.search).get("oauth") || ""
    ] || "",
  );
  const refresh = useCallback(() => setTick((t) => t + 1), []);
  const loadSession = useCallback(async () => {
    try {
      const u = await api<SessionUser>("/session");
      setUser(u);
      setCsrf(u.csrf);
    } catch (error) {
      setUser(null);
      setCsrf("");
      throw error;
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => {
    void loadSession().catch(() => {});
  }, [loadSession]);
  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    api<Dashboard>("/dashboard")
      .then((d) => {
        if (!cancelled) {
          setData(d);
          setError("");
        }
      })
      .catch((e) => setError(e.message));
    return () => {
      cancelled = true;
    };
  }, [user, tick]);
  useEffect(() => {
    if (!user) return;
    const events = new EventSource("/api/events");
    events.addEventListener("refresh", refresh);
    return () => events.close();
  }, [user, refresh]);
  useEffect(() => {
    document.documentElement.dataset.theme = dark ? "dark" : "light";
    localStorage.setItem("relay-theme", dark ? "dark" : "light");
  }, [dark]);
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        setSearchOpen(true);
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);
  function navigate(name: string) {
    setPage(name);
    setMobile(false);
    setSearchOpen(false);
  }
  if (loading)
    return (
      <div className="loading-screen">
        <span className="brand-mark">r</span>
        <p>Opening Relay…</p>
      </div>
    );
  if (!user) return <Auth onReady={loadSession} />;
  return (
    <div className="app-shell">
      <aside className={`sidebar ${mobile ? "open" : ""}`}>
        <div className="brand">
          <span className="brand-mark">r</span>relay
          <button
            className="icon-button mobile-close"
            aria-label="Close navigation"
            onClick={() => setMobile(false)}
          >
            <X size={19} />
          </button>
        </div>
        <div className="workspace-switch">
          <Avatar name={user.workspaceName} small />
          <div>
            <strong>{user.workspaceName}</strong>
            <small>
              {user.demo ? "Demo workspace" : user.role + " workspace"}
            </small>
          </div>
          <ChevronDown size={15} />
        </div>
        <div className="nav-label">WORKSPACE</div>
        <nav>
          {nav.map((n) => (
            <button
              className={page === n.name ? "active" : ""}
              key={n.name}
              onClick={() => navigate(n.name)}
            >
              <n.icon size={19} />
              {n.name}
              {n.name === "Inbox" && !!data?.metrics.attention && (
                <span className="nav-count">{data.metrics.attention}</span>
              )}
            </button>
          ))}
        </nav>
        <div className="nav-label secondary-label">MANAGE</div>
        <nav>
          <button
            className={page === "Social accounts" ? "active" : ""}
            onClick={() => navigate("Social accounts")}
          >
            <Settings size={19} />
            Social accounts
          </button>
          <button
            className={page === "Notifications" ? "active" : ""}
            onClick={() => navigate("Notifications")}
          >
            <Bell size={19} />
            Notifications
            {data?.notifications.some((n) => !n.read) && (
              <i className="unread-dot" />
            )}
          </button>
        </nav>
        <div className="sidebar-bottom">
          <button className="sandbox-card" onClick={() => setSimulator(true)}>
            <span>
              <FlaskConical size={18} />
              <strong>Test your workflow</strong>
            </span>
            <p>A safe space to try your rules.</p>
            <b>
              Open simulator <span>↗</span>
            </b>
          </button>
          <div className="user-menu">
            <Avatar name={user.name} small />
            <div>
              <strong>{user.name}</strong>
              <small className="capitalize">{user.role}</small>
            </div>
            <button
              className="icon-button"
              aria-label="Sign out"
              onClick={async () => {
                try {
                  await api("/auth/logout", "POST");
                  setUser(null);
                  setData(undefined);
                  setCsrf("");
                } catch (e) {
                  setError((e as Error).message);
                }
              }}
            >
              <LogOut size={17} />
            </button>
          </div>
        </div>
      </aside>
      {mobile && (
        <button
          className="nav-scrim"
          aria-label="Close navigation"
          onClick={() => setMobile(false)}
        />
      )}
      <main className="main">
        <header className="topbar">
          <button
            className="icon-button mobile-menu"
            aria-label="Open navigation"
            onClick={() => setMobile(true)}
          >
            <Menu size={20} />
          </button>
          <div className="breadcrumb">
            Workspace <span>/</span>
            <strong>{page}</strong>
          </div>
          <div className="topbar-actions">
            <button
              className="global-search"
              aria-label="Search pages, rules, and resources"
              onClick={() => {
                setSearchOpen(true);
                setQuery("");
              }}
            >
              <Search size={16} />
              <span>Find a page or resource</span>
              <kbd>⌘ K</kbd>
            </button>
            <button
              className="icon-button"
              aria-label={dark ? "Use light theme" : "Use dark theme"}
              onClick={() => setDark(!dark)}
            >
              {dark ? <Sun size={19} /> : <Moon size={19} />}
            </button>
            <button
              className="icon-button"
              aria-label="Notifications"
              onClick={() => navigate("Notifications")}
            >
              <Bell size={19} />
            </button>
            <Avatar name={user.name} small />
          </div>
        </header>
        {user.demo && (
          <div className="demo-banner">
            <FlaskConical size={14} />
            <strong>Demo workspace</strong>
            <span>
              All accounts, interactions, and deliveries are simulated.
            </span>
            <button onClick={() => setSimulator(true)}>
              Try a test event <span>→</span>
            </button>
          </div>
        )}
        {oauthNotice && (
          <div className="notice global-error" role="status">
            {oauthNotice}
            <button
              className="text-button"
              onClick={() => {
                setOauthNotice("");
                window.history.replaceState(null, "", window.location.pathname);
              }}
            >
              Dismiss
            </button>
          </div>
        )}
        {error && (
          <div className="error global-error" role="alert">
            {error}
            <button onClick={refresh}>Retry</button>
          </div>
        )}
        {data ? (
          <div className={page === "Inbox" ? "inbox-container" : "content"}>
            {page === "Overview" && (
              <Overview
                data={data}
                onNavigate={navigate}
                onSimulate={() => setSimulator(true)}
              />
            )}
            {page === "Inbox" && <Inbox tick={tick} onChange={refresh} />}
            {page === "Posts & scheduling" && (
              <Publishing
                tick={tick}
                onAccounts={() => navigate("Social accounts")}
              />
            )}
            {page === "Automations" && (
              <Automations
                data={data}
                onChange={refresh}
                onSimulate={() => setSimulator(true)}
              />
            )}
            {page === "Contacts" && <Contacts tick={tick} onChange={refresh} />}
            {page === "Resources" && (
              <Resources data={data} onChange={refresh} />
            )}
            {page === "Business & replies" && (
              <Business data={data} onChange={refresh} />
            )}
            {page === "Analytics" && <Analytics data={data} />}
            {page === "Activity" && <Activity data={data} />}
            {page === "Social accounts" && <Accounts tick={tick} />}
            {page === "Notifications" && (
              <Notifications data={data} onChange={refresh} />
            )}
          </div>
        ) : (
          <div className="loading-screen">
            <p>Loading your workspace…</p>
          </div>
        )}
      </main>
      {simulator && data && (
        <Simulator
          data={data}
          onClose={() => setSimulator(false)}
          onChange={refresh}
        />
      )}
      {searchOpen && (
        <Modal title="Find your next step" onClose={() => setSearchOpen(false)}>
          <div className="command-search">
            <Search size={20} />
            <input
              autoFocus
              aria-label="Search pages and resources"
              placeholder="Search pages, rules, and resources…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
          </div>
          <div className="command-results">
            {[
              ...nav.map((n) => ({ name: n.name, page: n.name })),
              ...(data?.rules.map((r) => ({
                name: r.name,
                page: "Automations",
              })) || []),
              ...(data?.resources.map((r) => ({
                name: r.name,
                page: "Resources",
              })) || []),
            ]
              .filter((r) => r.name.toLowerCase().includes(query.toLowerCase()))
              .map((r, i) => (
                <button key={i} onClick={() => navigate(r.page)}>
                  <Command size={16} />
                  <span>{r.name}</span>
                  <small>{r.page}</small>
                </button>
              ))}
          </div>
        </Modal>
      )}
    </div>
  );
}
