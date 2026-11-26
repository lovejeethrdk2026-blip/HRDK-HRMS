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
  socket = io(`${API_URL}/app`, { auth: { token }, transports: ["websocket"] });
  let wasConnected = false;
  socket.on("connect", () => {
    // Back after a drop (phone asleep, no network, server restarted):
    // anything may have changed meanwhile, so the open screens reload.
    if (wasConnected) runAll();
    wasConnected = true;
  });
  socket.on("changed", ({ area }) => listeners.forEach((l) => l.areas.has(area) && l.run()));
  // Key no longer good (logged out elsewhere, login turned off): the account
  // listener asks the server, which sends the app back to Login.
  socket.on("connect_error", (error) => {
    if (/log in/i.test(error?.message || "")) listeners.forEach((l) => l.areas.has("account") && l.run());
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
