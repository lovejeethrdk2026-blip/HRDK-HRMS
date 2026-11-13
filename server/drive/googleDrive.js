import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";
import { Readable } from "node:stream";
import DriveSetting from "./models/DriveSetting.js";

// Google Drive storage for employee documents. Talks to Google's REST API with
// fetch (no SDK). Layout in the connected account's Drive:
//
//   hrdk-hrms/
//     10001_RISHIKA_SONI/
//       10001_RISHIKA_SONI_Aadhaar_Card.pdf
//
// Settings in server/.env:
//   GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET  OAuth client (Google Cloud > Credentials)
//   GOOGLE_REDIRECT_URI                     e.g. http://localhost:3030/api/drive/callback
//   GOOGLE_DRIVE_FOLDER_ID                  optional: an "hrdk-hrms" folder this app made
//   GOOGLE_TOKEN_ENCRYPTION_KEY             any long random text; locks the stored token
//
// Scope drive.file: the app sees only files and folders it created itself.

const SCOPES = ["https://www.googleapis.com/auth/drive.file", "openid", "email"];
const ROOT_NAME = "hrdk-hrms";
const FOLDER_MIME = "application/vnd.google-apps.folder";
const API = "https://www.googleapis.com/drive/v3/files";
const UPLOAD_API = "https://www.googleapis.com/upload/drive/v3/files";

const env = (name) => (process.env[name] || "").trim();

// What is missing from .env, if anything.
export function missingSettings() {
  return ["GOOGLE_CLIENT_ID", "GOOGLE_CLIENT_SECRET", "GOOGLE_REDIRECT_URI", "GOOGLE_TOKEN_ENCRYPTION_KEY"].filter(
    (name) => !env(name)
  );
}

// ---- token encryption (AES-256-GCM; key = sha256 of the .env text) ----

const keyOf = () => createHash("sha256").update(env("GOOGLE_TOKEN_ENCRYPTION_KEY")).digest();

function encrypt(text) {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", keyOf(), iv);
  const data = Buffer.concat([cipher.update(text, "utf8"), cipher.final()]);
  return [iv, cipher.getAuthTag(), data].map((part) => part.toString("base64")).join(".");
}

function decrypt(stored) {
  const [iv, tag, data] = stored.split(".").map((part) => Buffer.from(part, "base64"));
  const decipher = createDecipheriv("aes-256-gcm", keyOf(), iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(data), decipher.final()]).toString("utf8");
}

// ---- names ----

// "Rishika soni" -> "RISHIKA_SONI"
const upperWords = (text) =>
  String(text || "")
    .split(/[^A-Za-z0-9]+/)
    .filter(Boolean)
    .map((word) => word.toUpperCase())
    .join("_");

// "Bank passbook / cheque" -> "Bank_Passbook_Cheque"
export const titleWords = (text) =>
  String(text || "")
    .split(/[^A-Za-z0-9]+/)
    .filter(Boolean)
    .map((word) => word[0].toUpperCase() + word.slice(1))
    .join("_");

// The employee's folder, also the start of every file name: "10001_RISHIKA_SONI".
export const folderNameOf = (employee) => [employee.employeeId, upperWords(employee.name) || "NAME"].join("_");

// ---- OAuth ----

export function authUrl(state) {
  const params = new URLSearchParams({
    client_id: env("GOOGLE_CLIENT_ID"),
    redirect_uri: env("GOOGLE_REDIRECT_URI"),
    response_type: "code",
    scope: SCOPES.join(" "),
    access_type: "offline",
    prompt: "consent", // always hand back a refresh token
    include_granted_scopes: "true",
    state
  });
  return `https://accounts.google.com/o/oauth2/v2/auth?${params}`;
}

async function tokenRequest(fields) {
  const response = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: env("GOOGLE_CLIENT_ID"),
      client_secret: env("GOOGLE_CLIENT_SECRET"),
      ...fields
    })
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(`Google sign-in failed: ${data.error_description || data.error || response.status}`);
    error.googleError = data.error;
    throw error;
  }
  return data;
}

let accessToken = null; // { token, expiresAt }

// After "Allow" on Google's page: keep the refresh token (encrypted).
export async function finishConnect(code) {
  const data = await tokenRequest({
    code,
    grant_type: "authorization_code",
    redirect_uri: env("GOOGLE_REDIRECT_URI")
  });
  if (!data.refresh_token) throw new Error("Google did not return a refresh token. Remove the app's access in your Google account and connect again.");
  const scopes = String(data.scope || "").split(" ");
  if (!scopes.includes(SCOPES[0])) throw new Error("Drive permission was not ticked on Google's page. Connect again and allow it.");

  let email = "";
  try {
    email = JSON.parse(Buffer.from(data.id_token.split(".")[1], "base64url").toString()).email || "";
  } catch {
    // email is only shown on screen
  }
  accessToken = { token: data.access_token, expiresAt: Date.now() + (data.expires_in - 60) * 1000 };
  await DriveSetting.findOneAndUpdate(
    { key: "google" },
    { refreshToken: encrypt(data.refresh_token), email, connectedAt: new Date() },
    { upsert: true }
  );
  return email;
}

export async function disconnect() {
  const setting = await DriveSetting.findOne({ key: "google" });
  if (setting?.refreshToken) {
    // Tell Google too; ignore failures (token may already be revoked).
    try {
      await fetch(`https://oauth2.googleapis.com/revoke?token=${encodeURIComponent(decrypt(setting.refreshToken))}`, {
        method: "POST"
      });
    } catch {
      /* ignore */
    }
  }
  accessToken = null;
  await DriveSetting.updateOne({ key: "google" }, { refreshToken: "", email: "", connectedAt: null });
}

// { configured, connected, email, missing }
export async function driveStatus() {
  const missing = missingSettings();
  const setting = await DriveSetting.findOne({ key: "google" }).lean();
  return {
    configured: !missing.length,
    missing,
    connected: !missing.length && Boolean(setting?.refreshToken),
    email: setting?.email || "",
    rootFolderId: setting?.rootFolderId || env("GOOGLE_DRIVE_FOLDER_ID") || ""
  };
}

export async function isConnected() {
  return (await driveStatus()).connected;
}

async function getAccessToken() {
  if (accessToken && accessToken.expiresAt > Date.now()) return accessToken.token;
  const setting = await DriveSetting.findOne({ key: "google" });
  if (!setting?.refreshToken) throw new Error("Google Drive is not connected");
  let refreshToken;
  try {
    refreshToken = decrypt(setting.refreshToken);
  } catch {
    throw new Error("Google Drive token cannot be read (GOOGLE_TOKEN_ENCRYPTION_KEY changed?). Connect Google Drive again.");
  }
  try {
    const data = await tokenRequest({ refresh_token: refreshToken, grant_type: "refresh_token" });
    accessToken = { token: data.access_token, expiresAt: Date.now() + (data.expires_in - 60) * 1000 };
    return accessToken.token;
  } catch (error) {
    if (error.googleError === "invalid_grant") {
      throw new Error("Google Drive access was removed or expired. An admin must connect Google Drive again (Users page).");
    }
    throw error;
  }
}

// ---- Drive calls ----

async function drive(url, options = {}) {
  const token = await getAccessToken();
  const response = await fetch(url, {
    ...options,
    headers: { Authorization: `Bearer ${token}`, ...(options.headers || {}) }
  });
  if (!response.ok) {
    const data = await response.json().catch(() => ({}));
    const error = new Error(`Google Drive: ${data.error?.message || response.statusText}`);
    error.status = response.status;
    throw error;
  }
  return response;
}

const json = (body) => ({ headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });

// Is this folder still there (not deleted / in the bin)?
async function folderAlive(id) {
  if (!id) return false;
  try {
    const data = await (await drive(`${API}/${id}?fields=id,trashed`)).json();
    return !data.trashed;
  } catch (error) {
    if (error.status === 404) return false;
    throw error;
  }
}

async function createFolder(name, parentId) {
  const body = { name, mimeType: FOLDER_MIME, ...(parentId ? { parents: [parentId] } : {}) };
  const data = await (await drive(`${API}?fields=id`, { method: "POST", ...json(body) })).json();
  return data.id;
}

// One at a time per key, so two uploads at once do not make two folders.
const locks = new Map();
function once(key, work) {
  const previous = locks.get(key) || Promise.resolve();
  const next = previous.catch(() => {}).then(work);
  locks.set(key, next);
  next.finally(() => locks.get(key) === next && locks.delete(key)).catch(() => {});
  return next;
}

// The "hrdk-hrms" folder: GOOGLE_DRIVE_FOLDER_ID, the one made earlier, or a new one.
function rootFolder() {
  return once("root", async () => {
    const fromEnv = env("GOOGLE_DRIVE_FOLDER_ID");
    if (fromEnv && (await folderAlive(fromEnv))) return fromEnv;
    const setting = await DriveSetting.findOne({ key: "google" });
    if (await folderAlive(setting?.rootFolderId)) return setting.rootFolderId;
    const id = await createFolder(ROOT_NAME);
    await DriveSetting.updateOne({ key: "google" }, { rootFolderId: id });
    return id;
  });
}

// The employee's folder (made on first upload). Saves its id on the employee
// document passed in; the caller saves the employee.
export function employeeFolder(employee) {
  return once(`emp:${employee.employeeId}`, async () => {
    if (await folderAlive(employee.driveFolderId)) return employee.driveFolderId;
    const id = await createFolder(folderNameOf(employee), await rootFolder());
    employee.driveFolderId = id;
    return id;
  });
}

// Uploads bytes; returns the new file's id.
export async function uploadFile({ name, mimeType, buffer, folderId }) {
  const boundary = `hrms${randomBytes(12).toString("hex")}`;
  const meta = JSON.stringify({ name, parents: [folderId], mimeType });
  const body = Buffer.concat([
    Buffer.from(`--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${meta}\r\n`),
    Buffer.from(`--${boundary}\r\nContent-Type: ${mimeType}\r\n\r\n`),
    buffer,
    Buffer.from(`\r\n--${boundary}--`)
  ]);
  const response = await drive(`${UPLOAD_API}?uploadType=multipart&fields=id`, {
    method: "POST",
    headers: { "Content-Type": `multipart/related; boundary=${boundary}` },
    body
  });
  return (await response.json()).id;
}

// The file's bytes as a Node stream (for res.pipe).
export async function downloadFile(fileId) {
  const response = await drive(`${API}/${fileId}?alt=media`);
  return Readable.fromWeb(response.body);
}

// Delete in the app = move to Drive's bin (restorable for 30 days there).
export async function trashFile(fileId) {
  try {
    await drive(`${API}/${fileId}`, { method: "PATCH", ...json({ trashed: true }) });
  } catch (error) {
    if (error.status !== 404) throw error; // already gone
  }
}

export async function renameFile(fileId, name) {
  await drive(`${API}/${fileId}?fields=id`, { method: "PATCH", ...json({ name }) });
}
