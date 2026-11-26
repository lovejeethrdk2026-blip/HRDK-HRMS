import { useEffect, useRef, useState } from "react";
import { io } from "socket.io-client";
import { API_URL, clearApiCache, setLiveSocketId } from "./axios";

// Live refresh (Socket.IO, server/live/live.js). The server says which kind of
// data changed -- "attendance", "employees", "leave", "chat", "holidays",
// "departments", "users", "payroll", "settings" -- and every open page that
// shows that kind reloads it with useLive(). No data comes over the socket.

let socket = null;
const listeners = new Set(); // { areas: Set, run }
const statusWatchers = new Set();
let connected = false;

function setConnected(value) {
  connected = value;
  statusWatchers.forEach((fn) => fn(value));
}

// "/api" -> same site (Vite proxy or the server itself);
// "https://host/api" -> that host.
const serverOrigin = () => (/^https?:\/\//.test(API_URL) ? new URL(API_URL).origin : undefined);

// Opened once the user is logged in (App.jsx); closed on logout.
export function connectLive() {
  if (socket) return;
  socket = io(serverOrigin(), { withCredentials: true, transports: ["websocket", "polling"] });
  let wasConnected = false;
  socket.on("connect", () => {
    setConnected(true);
    // Back after a drop (server restart, Render waking up, laptop sleep):
    // anything may have changed meanwhile, so every open page reloads.
    if (wasConnected) listeners.forEach((l) => l.run());
    wasConnected = true;
  });
  socket.on("disconnect", () => setConnected(false));
  socket.on("changed", ({ area }) => {
    clearApiCache();
    listeners.forEach((l) => l.areas.has(area) && l.run());
  });
}

export function disconnectLive() {
  socket?.disconnect();
  socket = null;
  setConnected(false);
}

// Sent with every API call (axios.js), so the server does not tell this tab
// about its own saves (the page already reloads after saving).
setLiveSocketId(() => socket?.id);

// Reload when one of these kinds of data changes elsewhere:
//   useLive(["attendance"], () => load());
// Several changes close together run reload once. While the browser tab is
// hidden the reload waits until it is shown again.
export function useLive(areas, reload) {
  const latest = useRef(reload);
  latest.current = reload;
  const key = [].concat(areas).join(",");

  useEffect(() => {
    let timer = null;
    let waiting = false;
    const fire = () => {
      clearTimeout(timer);
      timer = setTimeout(() => latest.current?.(), 300);
    };
    const run = () => {
      if (document.hidden) waiting = true;
      else fire();
    };
    const onVisible = () => {
      if (!document.hidden && waiting) {
        waiting = false;
        fire();
      }
    };
    const entry = { areas: new Set(key.split(",")), run };
    listeners.add(entry);
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      clearTimeout(timer);
      listeners.delete(entry);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [key]);
}

// true while the live connection is up (status dot in the top bar).
export function useLiveStatus() {
  const [up, setUp] = useState(connected);
  useEffect(() => {
    statusWatchers.add(setUp);
    return () => statusWatchers.delete(setUp);
  }, []);
  return up;
}
