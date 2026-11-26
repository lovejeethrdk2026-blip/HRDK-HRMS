import { useEffect, useRef } from "react";
import { AppState } from "react-native";
import { io } from "socket.io-client";
import { API_URL, DEMO, tokens } from "./client";

// Live refresh (Socket.IO, server/live/appLive.js). While logged in the app
// keeps one connection to the server's "/app" channel with its login key. The
// server only says what kind of data changed for this employee -- attendance,
// leave, chat, profile, payslip, settings, account -- and every open screen
// that shows it reloads with useLive(). No data comes over the socket.

let socket = null;
const listeners = new Set(); // { areas: Set, run }

function runAll() {
  listeners.forEach((l) => l.run());
}

// Opened after login (AuthContext), closed on logout.
export async function connectLive() {
  if (socket || DEMO || !API_URL) return;
  const token = await tokens.get();
  if (!token) return;
  // auth as a function: every (re)connect sends the newest login key, which
  // changes each day when the app swaps its keys (client.js renew).
  let sentToken = token;
  socket = io(`${API_URL}/app`, {
    auth: (cb) => tokens.get().then((t) => cb({ token: (sentToken = t || "") })),
    transports: ["websocket"]
  });
  let wasConnected = false;
  socket.on("connect", () => {
    // Back after a drop (phone asleep, no network, server restarted):
    // anything may have changed meanwhile, so the open screens reload.
    if (wasConnected) runAll();
    wasConnected = true;
  });
  socket.on("changed", ({ area }) => listeners.forEach((l) => l.areas.has(area) && l.run()));
  // Key no longer good: the account listener asks the server. An old access
  // key gets swapped for a new pair there (then we connect again with it); a
  // login that is over (logged out, turned off) sends the app back to Login.
  socket.on("connect_error", (error) => {
    if (!/log in/i.test(error?.message || "")) return;
    const failed = sentToken;
    listeners.forEach((l) => l.areas.has("account") && l.run());
    setTimeout(async () => {
      const now = await tokens.get();
      if (socket && !socket.connected && now && now !== failed) socket.connect();
    }, 3000);
  });
}

export function disconnectLive() {
  socket?.disconnect();
  socket = null;
}

// Back in the foreground: reconnect at once instead of waiting for the retry.
AppState.addEventListener("change", (state) => {
  if (state === "active" && socket && !socket.connected) socket.connect();
});

// Reload when one of these kinds of data changes:
//   useLive(["leave"], () => reload(true));
// Several changes close together run it once.
export function useLive(areas, reload) {
  const latest = useRef(reload);
  latest.current = reload;
  const key = [].concat(areas).join(",");

  useEffect(() => {
    if (!key) return undefined;
    let timer = null;
    const entry = {
      areas: new Set(key.split(",")),
      run: () => {
        clearTimeout(timer);
        timer = setTimeout(() => latest.current?.(), 300);
      }
    };
    listeners.add(entry);
    return () => {
      clearTimeout(timer);
      listeners.delete(entry);
    };
  }, [key]);
}
