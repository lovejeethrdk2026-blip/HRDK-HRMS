// Keeps the separate Pay Sheet app's backend (paysheet-app/backend) running
// alongside this server, so the admin panel's Pay Sheet 1/2/3 pages (relayed
// through /api/paysheets) work without starting it by hand.
//
// Only active when PAYSHEET_APP_DIR points at that backend's folder. Every
// minute it checks PAYSHEET_API_URL; if nothing answers there and it has no
// copy running already, it starts `node server.js` in that folder (so that
// app's own .env is used). If the backend is already running -- started by
// hand or by something else -- it is left alone. The copy started here is
// stopped when this server exits.
import { spawn } from "child_process";
import dotenv from "dotenv";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const PAYSHEET_API_URL = (process.env.PAYSHEET_API_URL || "http://localhost:4050").replace(/\/+$/, "");
const CHECK_INTERVAL_MS = 60 * 1000;

let child = null;

async function isReachable() {
  try {
    // Any HTTP answer (even a 404 for "/") means the backend is up.
    await fetch(PAYSHEET_API_URL, { signal: AbortSignal.timeout(5000) });
    return true;
  } catch {
    return false;
  }
}

function pipeWithPrefix(stream, write) {
  let buffered = "";
  stream.on("data", (chunk) => {
    buffered += chunk;
    const lines = buffered.split(/\r?\n/);
    buffered = lines.pop();
    for (const line of lines) write(`[paysheet] ${line}`);
  });
}

// The Pay Sheet app reads its own .env, but dotenv never overrides variables
// that are already set -- so drop everything this server's .env added (PORT,
// MONGO_URI, ...) before handing the environment over.
function childEnv() {
  const env = { ...process.env };
  try {
    const ownKeys = Object.keys(dotenv.parse(fs.readFileSync(path.join(__dirname, "..", ".env"))));
    for (const key of ownKeys) delete env[key];
  } catch {
    // No .env file: nothing of ours to strip.
  }
  return env;
}

function startChild(dir) {
  console.log(`Starting the Pay Sheet app from ${dir}`);
  child = spawn(process.execPath, ["server.js"], {
    cwd: dir,
    env: childEnv(),
    stdio: ["ignore", "pipe", "pipe"]
  });
  child.stdout.setEncoding("utf8");
  child.stderr.setEncoding("utf8");
  pipeWithPrefix(child.stdout, console.log);
  pipeWithPrefix(child.stderr, console.error);
  child.on("error", (error) => {
    console.error("Could not start the Pay Sheet app:", error.message);
    child = null;
  });
  child.on("exit", (code, signal) => {
    console.warn(`Pay Sheet app stopped (${signal || `exit code ${code}`}); will retry within a minute.`);
    child = null;
  });
}

async function check(dir) {
  if (child || (await isReachable())) return;
  startChild(dir);
}

function stopChild() {
  if (child) child.kill();
}

function startPaySheetApp() {
  const dir = process.env.PAYSHEET_APP_DIR;
  if (!dir) return;

  const resolved = path.resolve(dir);
  if (!fs.existsSync(path.join(resolved, "server.js"))) {
    console.error(`PAYSHEET_APP_DIR has no server.js: ${resolved} -- not starting the Pay Sheet app.`);
    return;
  }

  process.on("exit", stopChild);
  for (const signal of ["SIGINT", "SIGTERM"]) {
    process.once(signal, () => process.exit(0));
  }

  check(resolved);
  setInterval(() => check(resolved), CHECK_INTERVAL_MS).unref();
}

export { startPaySheetApp };
