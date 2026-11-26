import { Platform } from "react-native";
import Constants from "expo-constants";
import { api, apiUpload, tokens } from "./client";

// Every call the app makes. The server takes the employee from the login key,
// so no call ever sends an employee ID except the login itself.
//
// Server: HRMS server/portal/me.route.js (/api/me).
//   POST /me/auth/login       { employeeId, password, device } -> { accessToken, refreshToken, employee }
//                             (employee.mustChangePassword: still on HR's first password)
//   POST /me/password         { current, next }
//   POST /me/auth/refresh     { refreshToken } -> { accessToken, refreshToken }  (client.js, on 401)
//   POST /me/auth/logout
//   GET  /me/profile                                         -> employee
//   GET  /me/attendance?month=YYYY-MM                        -> { month, shift, days: [...] }
//   GET  /me/leave                                           -> { fy, types, balances, applications }
//   POST /me/leave            { type, fromDate, toDate, halfDay, reason }
//   POST /me/leave/:id/cancel
//   GET  /me/payslips                                        -> [{ month, net, released }]
//   GET  /me/payslips/:month                                 -> { month, earnings, deductions, net }
//   GET  /me/documents                                       -> [{ id, name, category, uploadedAt }]
//   GET  /me/documents/:id/link                              -> { url } (valid a few minutes)

const device = () => ({
  platform: Platform.OS,
  model: Constants.deviceName || "",
  appVersion: Constants.expoConfig?.version || ""
});

// password: HR's first password or the employee's own ("" while they have none).
export async function login(employeeId, password = "") {
  const data = await api("/me/auth/login", { method: "POST", body: { employeeId, password, device: device() } });
  await tokens.set(data);
  return data.employee;
}

export async function logout() {
  await api("/me/auth/logout", { method: "POST", noRetry: true }).catch(() => {});
  await tokens.clear();
}

export const getProfile = () => api("/me/profile");
// My own app password: current ("" when I have none yet) -> next.
export const changePassword = (current, next) => api("/me/password", { method: "POST", body: { current, next } });
// Chat with my manager (HR can read and answer too).
export const getChat = () => api("/me/chat");
export const sendChat = (text) => api("/me/chat", { method: "POST", body: { text } });
export const getChatUnread = () => api("/me/chat/unread");
// Full profile as on Add Employee, with what is missing; one-time correction.
export const getProfileDetails = () => api("/me/profile/details");
export const correctProfile = (values) => api("/me/profile/details", { method: "PUT", body: { values } });
export const uploadMyDocument = (title, asset) =>
  apiUpload(`/me/documents?title=${encodeURIComponent(title)}&fileName=${encodeURIComponent(asset.name || "file")}`, asset);
export const getAttendance = (month) => api(`/me/attendance?month=${month}`);
export const getLeave = () => api("/me/leave");
export const applyLeave = (form) => api("/me/leave", { method: "POST", body: form });
export const cancelLeave = (id) => api(`/me/leave/${id}/cancel`, { method: "POST" });
export const getPayslips = () => api("/me/payslips");
export const getPayslip = (month) => api(`/me/payslips/${month}`);
// { path: "/api/me/payslip-pdf/..." }: a 10-minute link to the slip PDF, opened in the browser.
export const getPayslipPdfLink = (month) => api(`/me/payslips/${month}/pdf-link`);
export const getDocuments = () => api("/me/documents");
export const getDocumentLink = (id) => api(`/me/documents/${id}/link`);
