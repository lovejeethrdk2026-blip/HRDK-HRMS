// Sample answers for EXPO_PUBLIC_DEMO=1, so the screens can be tried before
// the server has the /api/me routes. Same shapes as the real server (me.js).
// Any Employee ID works.

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const pad = (n) => String(n).padStart(2, "0");
const iso = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

const employee = {
  employeeId: "10395",
  name: "RAMESH KUMAR",
  department: "CAD",
  section: "SECTION 1",
  designation: "CAD Designer",
  joiningDate: "12-06-2021",
  mobile: "98xxxxxx21",
  email: "",
  shift: { in: "09:30", out: "18:30" },
  reportingManager: "SURESH SONI"
};

const types = [
  { code: "CL", name: "Casual Leave", yearlyDays: 12, paid: true },
  { code: "SL", name: "Sick Leave", yearlyDays: 7, paid: true },
  { code: "PL", name: "Privilege Leave", yearlyDays: 15, paid: true },
  { code: "LWP", name: "Leave Without Pay", yearlyDays: 0, paid: false }
];

let applications = [
  { _id: "a1", type: "CL", fromDate: "2026-10-06", toDate: "2026-10-07", halfDay: false, days: 2, reason: "Family function", status: "Approved", remarks: "", decidedBy: "suresh" },
  { _id: "a2", type: "SL", fromDate: "2026-11-03", toDate: "2026-11-03", halfDay: true, days: 0.5, reason: "Doctor visit", status: "Approved", remarks: "", decidedBy: "suresh" }
];

function balances() {
  const out = {};
  for (const t of types) {
    const used = applications.filter((a) => a.type === t.code && a.status === "Approved").reduce((s, a) => s + a.days, 0);
    const pending = applications.filter((a) => a.type === t.code && a.status === "Pending").reduce((s, a) => s + a.days, 0);
    out[t.code] = { quota: t.yearlyDays, adjust: 0, used, pending, left: t.yearlyDays ? t.yearlyDays - used - pending : null };
  }
  return out;
}

function attendance(month) {
  const [y, m] = month.split("-").map(Number);
  const today = new Date();
  const days = [];
  const last = new Date(y, m, 0).getDate();
  for (let d = 1; d <= last; d++) {
    const date = new Date(y, m - 1, d);
    if (date > today) break;
    const key = iso(date);
    const leave = applications.find((a) => a.status === "Approved" && a.fromDate <= key && a.toDate >= key);
    if (date.getDay() === 0) days.push({ date: key, status: "WO" });
    else if (leave && !leave.halfDay) days.push({ date: key, status: "L", leave: { type: leave.type, half: false } });
    else if (d % 11 === 0) days.push({ date: key, status: "A" });
    else {
      const late = d % 5 === 0;
      days.push({
        date: key,
        status: leave ? "H" : "P",
        in: late ? "09:52" : "09:27",
        out: leave ? "13:30" : d % 7 === 0 ? "17:10" : "18:36",
        worked: leave ? "4:03" : late ? "7:44" : "8:09",
        late: late ? "0:22" : "",
        earlyOut: d % 7 === 0 ? "1:20" : "",
        ...(leave && { leave: { type: leave.type, half: true } })
      });
    }
  }
  return { month, shift: employee.shift, days };
}

const payslips = ["2026-10", "2026-09", "2026-08"].map((month) => ({ month, net: 28450, released: true }));

function payslip(month) {
  return {
    month,
    paidDays: 26,
    earnings: [
      { label: "Basic", amount: 15000 },
      { label: "HRA", amount: 7500 },
      { label: "Conveyance", amount: 1600 },
      { label: "Special Allowance", amount: 6350 }
    ],
    deductions: [
      { label: "PF", amount: 1800 },
      { label: "ESIC", amount: 0 },
      { label: "Professional Tax", amount: 200 }
    ],
    net: 28450
  };
}

const documents = [
  { id: "d1", name: "Offer Letter", category: "Letters", uploadedAt: "2021-06-01" },
  { id: "d2", name: "Appointment Letter", category: "Letters", uploadedAt: "2021-06-12" },
  { id: "d3", name: "Increment Letter 2026", category: "Letters", uploadedAt: "2026-04-01" },
  { id: "d4", name: "Aadhaar Card", category: "ID proof", uploadedAt: "2021-06-12" }
];

function fail(status, message) {
  const error = new Error(message);
  error.status = status;
  throw error;
}

export async function demoRequest(path, { method = "GET", body } = {}) {
  await wait(350);
  const [route, query = ""] = path.split("?");
  const params = Object.fromEntries(new URLSearchParams(query));

  if (route === "/me/auth/login") {
    if (!body?.employeeId) fail(400, "Enter your Employee ID");
    return { accessToken: "demo", refreshToken: "demo", employee: { ...employee, employeeId: body.employeeId } };
  }
  if (route === "/me/auth/logout") return { ok: true };
  if (route === "/me/profile") return employee;
  if (route === "/me/attendance") return attendance(params.month || iso(new Date()).slice(0, 7));
  if (route === "/me/leave" && method === "GET") {
    return { fy: 2026, types, balances: balances(), applications: [...applications].sort((a, b) => b.fromDate.localeCompare(a.fromDate)) };
  }
  if (route === "/me/leave" && method === "POST") {
    const days = body.halfDay ? 0.5 : Math.round((new Date(body.toDate) - new Date(body.fromDate)) / 864e5) + 1;
    const app = { _id: `a${Date.now()}`, ...body, days, status: "Pending", remarks: "" };
    applications = [app, ...applications];
    return app;
  }
  const cancel = route.match(/^\/me\/leave\/(.+)\/cancel$/);
  if (cancel) {
    applications = applications.map((a) => (a._id === cancel[1] ? { ...a, status: "Cancelled" } : a));
    return { ok: true };
  }
  if (route === "/me/payslips") return payslips;
  const slip = route.match(/^\/me\/payslips\/(\d{4}-\d{2})$/);
  if (slip) return payslip(slip[1]);
  if (route === "/me/documents") return documents;
  if (/^\/me\/documents\/.+\/link$/.test(route)) fail(501, "Documents open once the server is connected (demo mode).");
  fail(404, `Demo has no answer for ${method} ${route}`);
}
