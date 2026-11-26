import { useEffect, useMemo, useRef, useState } from "react";
import api from "../api/axios";
import Loader from "../components/Loader";
import { useLive } from "../api/live";

// Messages: chats with employees from the HRDK app. HR / admin see every
// employee; a manager login sees only employees whose Reporting manager is the
// login's "Manager name for chat" (Users page). Left: the list, newest chat
// first; right: the open chat. New messages are fetched every few seconds.
// Server: server/chat/chat.js.

const POLL_MS = 8000;

const time = (at) => {
  const d = new Date(at);
  const today = new Date();
  const sameDay = d.toDateString() === today.toDateString();
  return sameDay
    ? d.toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" })
    : d.toLocaleDateString("en-IN", { day: "2-digit", month: "short" });
};
const whoLabel = (m) => (m.from === "employee" ? "" : m.from === "manager" ? "Manager" : m.senderName || "HR");

export default function Messages() {
  const [data, setData] = useState(null); // { scope, managerName, threads }
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [onlyChats, setOnlyChats] = useState(true);
  const [openId, setOpenId] = useState("");
  const [thread, setThread] = useState(null); // { employee, messages }
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const bottomRef = useRef(null);

  async function loadThreads() {
    try {
      const { data } = await api.get("/chat/threads");
      setData(data);
      setError("");
    } catch (err) {
      setError(err.response?.data?.message || err.message);
    }
  }

  async function loadThread(id) {
    try {
      const { data } = await api.get(`/chat/threads/${encodeURIComponent(id)}/messages`);
      setThread((prev) => {
        const grew = !prev || prev.employee.id !== data.employee.id || prev.messages.length !== data.messages.length;
        if (grew) setTimeout(() => bottomRef.current?.scrollIntoView({ block: "end" }), 0);
        return data;
      });
    } catch (err) {
      setError(err.response?.data?.message || err.message);
    }
  }

  // Live refresh: a new message from the app shows at once.
  useLive(["chat"], () => {
    loadThreads();
    if (openId) loadThread(openId);
  });

  useEffect(() => {
    loadThreads();
    const timer = setInterval(loadThreads, POLL_MS);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    if (!openId) return undefined;
    setThread(null);
    loadThread(openId);
    const timer = setInterval(() => loadThread(openId), POLL_MS);
    return () => clearInterval(timer);
  }, [openId]);

  const threads = useMemo(() => {
    const q = search.trim().toLowerCase();
    return (data?.threads || [])
      .filter((t) => !onlyChats || t.last || q)
      .filter((t) => !q || `${t.name} ${t.employeeId} ${t.department} ${t.manager}`.toLowerCase().includes(q));
  }, [data, search, onlyChats]);
  const unreadTotal = (data?.threads || []).reduce((sum, t) => sum + t.unread, 0);

  async function send(e) {
    e.preventDefault();
    const body = text.trim();
    if (!body || !openId) return;
    setSending(true);
    try {
      await api.post(`/chat/threads/${encodeURIComponent(openId)}/messages`, { text: body });
      setText("");
      await Promise.all([loadThread(openId), loadThreads()]);
    } catch (err) {
      setError(err.response?.data?.message || err.message);
    } finally {
      setSending(false);
    }
  }

  if (!data && !error) return <Loader text="Loading chats…" />;

  const subtitle =
    data?.scope === "all"
      ? "Every employee's chat from the HRDK app. Each manager sees only their own staff's chats; you (HR) see all."
      : data?.managerName
        ? `Chats from your team: employees whose Reporting manager is ${data.managerName}.`
        : "Ask the admin to set your \"Manager name for chat\" on the Users page to see your team.";

  return (
    <div className="msg-page">
      <div className="page-header">
        <div>
          <h1 className="page-title">Messages{unreadTotal ? ` (${unreadTotal} new)` : ""}</h1>
          <p className="page-subtitle">{subtitle}</p>
        </div>
      </div>

      {error && (
        <div className="error-banner" role="alert">
          <span>{error}</span>
        </div>
      )}

      <div className={`msg-layout${openId ? " has-open" : ""}`}>
        <aside className="card msg-list">
          <div className="msg-list-tools">
            <input
              className="msg-search"
              placeholder="Search name, ID, department"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              aria-label="Search chats"
            />
            <label className="msg-toggle">
              <input type="checkbox" checked={onlyChats} onChange={(e) => setOnlyChats(e.target.checked)} /> Only with messages
            </label>
          </div>
          {!threads.length ? (
            <p className="state-panel">
              {onlyChats ? "No chats yet. Untick \"Only with messages\" to start one." : "No employees found."}
            </p>
          ) : (
            <ul className="msg-threads">
              {threads.map((t) => (
                <li key={t.employeeId}>
                  <button
                    type="button"
                    className={`msg-thread${openId === t.employeeId ? " is-open" : ""}${t.unread ? " is-unread" : ""}`}
                    onClick={() => setOpenId(t.employeeId)}
                  >
                    <span className="msg-avatar" aria-hidden="true">
                      {t.name
                        .split(" ")
                        .slice(0, 2)
                        .map((w) => w[0])
                        .join("")}
                    </span>
                    <span className="msg-thread-body">
                      <span className="msg-thread-top">
                        <span className="msg-thread-name">{t.name}</span>
                        {t.last && <span className="msg-thread-time">{time(t.last.at)}</span>}
                      </span>
                      {data.scope === "all" && t.manager && <span className="msg-thread-manager">Manager: {t.manager}</span>}
                      <span className="msg-thread-sub">
                        {t.last
                          ? `${t.last.from === "employee" ? "" : t.last.from === "manager" ? "Manager: " : "HR: "}${t.last.text}`
                          : `${t.employeeId} · ${t.subDepartment || t.department}`}
                      </span>
                    </span>
                    {t.unread > 0 && <span className="msg-unread">{t.unread}</span>}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </aside>

        <section className="card msg-chat">
          {!openId ? (
            <p className="state-panel">Pick a chat on the left.</p>
          ) : !thread ? (
            <Loader text="Loading chat…" />
          ) : (
            <>
              <header className="msg-chat-head">
                <button type="button" className="btn btn-sm msg-back" onClick={() => setOpenId("")}>
                  ← Chats
                </button>
                <div>
                  <h2 className="msg-chat-name">{thread.employee.name}</h2>
                  <p className="msg-chat-sub">
                    ID {thread.employee.id} · {thread.employee.subDepartment || thread.employee.department}
                    {thread.employee.manager ? ` · Manager ${thread.employee.manager}` : ""}
                  </p>
                </div>
              </header>
              <div className="msg-stream">
                {!thread.messages.length && <p className="state-panel">No messages yet. Write the first one below.</p>}
                {thread.messages.map((m) => (
                  <div key={m._id} className={`msg-bubble-row ${m.from === "employee" ? "from-them" : "from-us"}`}>
                    <div className={`msg-bubble msg-${m.from}`}>
                      {whoLabel(m) && <span className="msg-who">{whoLabel(m)}</span>}
                      <span className="msg-text">{m.text}</span>
                      <span className="msg-time">{time(m.createdAt)}</span>
                    </div>
                  </div>
                ))}
                <div ref={bottomRef} />
              </div>
              <form className="msg-compose" onSubmit={send}>
                <textarea
                  className="msg-input"
                  rows={2}
                  placeholder={`Reply to ${thread.employee.name}`}
                  value={text}
                  maxLength={2000}
                  onChange={(e) => setText(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && !e.shiftKey) send(e);
                  }}
                />
                <button type="submit" className="btn btn-primary" disabled={sending || !text.trim()}>
                  {sending ? "Sending…" : "Send"}
                </button>
              </form>
            </>
          )}
        </section>
      </div>
    </div>
  );
}
