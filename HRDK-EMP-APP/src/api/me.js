import { Platform } from "react-native";
import Constants from "expo-constants";
import { api, tokens } from "./client";

// Every call the app makes. The server takes the employee from the login key,
// so no call ever sends an employee ID except the login itself.
//
// Server contract (server/, still to be built under /api/me):
//   POST /me/auth/send-otp    { employeeId }                 -> { sentTo: "98xxxxxx21" }
//   POST /me/auth/verify-otp  { employeeId, otp, device }    -> { accessToken, refreshToken, employee }
//   POST /me/auth/refresh     { refreshToken }               -> { accessToken, refreshToken }
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

export const sendOtp = (employeeId) => api("/me/auth/send-otp", { method: "POST", body: { employeeId } });

export async function verifyOtp(employeeId, otp) {
  const data = await api("/me/auth/verify-otp", { method: "POST", body: { employeeId, otp, device: device() } });
  await tokens.set(data);
  return data.employee;
}

export async function logout() {
  await api("/me/auth/logout", { method: "POST", noRetry: true }).catch(() => {});
  await tokens.clear();
}

export const getProfile = () => api("/me/profile");
export const getAttendance = (month) => api(`/me/attendance?month=${month}`);
export const getLeave = () => api("/me/leave");
export const applyLeave = (form) => api("/me/leave", { method: "POST", body: form });
export const cancelLeave = (id) => api(`/me/leave/${id}/cancel`, { method: "POST" });
export const getPayslips = () => api("/me/payslips");
export const getPayslip = (month) => api(`/me/payslips/${month}`);
export const getDocuments = () => api("/me/documents");
export const getDocumentLink = (id) => api(`/me/documents/${id}/link`);
