# HRMS Attendance

MERN app syncing biometric (COSEC / SQL Server) attendance into MongoDB, served through an Express API, shown in a React frontend.

## Structure

```
server/       Express + Mongoose REST API, one folder per feature:
  dailyRegister/  /api/attendance: day records, COSEC punch sync, its models
  paySheet/       /api/paysheets: relay to the Pay Sheet app (BC365)
  employee/       /api/employees: Add Employee, its model
  config/ middleware/ utils/   shared by all three
ADMIN/        React (Vite) admin panel: Employees (Add Employee), Daily Register (attendance) and Pay Sheet
```

## Setup

### Server

```bash
cd server
npm install
cp .env.example .env   # fill SQL_* and MONGO_URI
npm run dev
```

Runs on `http://localhost:3030`. On start and every 5 minutes it builds attendance day records from the COSEC punches (see **COSEC data** below).

### Access

There is no sign-in: anyone who can reach the server sees the Daily Register and the Pay Sheet salary data. Run it only on a machine that is not reachable from outside the office.

### Admin app

```bash
cd ADMIN
npm install
npm run dev
```

Runs on `http://localhost:5173`, proxies `/api` to the server.

**Faster for everyday use:** build once, then open the app from the server port.

```bash
cd ADMIN
npm run build
```

The server serves `ADMIN/dist` at `http://localhost:3030` (other office PCs: `http://<this-pc-ip>:3030`): bundled, gzipped, and cached by the browser, so it opens much faster than the dev server. Rebuild after changing ADMIN code. Heavy libraries (Excel, PDF, PowerPoint, charts) load only when a page or download button needs them.

### COSEC data (punches and employee master)

Two databases on the same Atlas cluster, same credentials:

- `MONGO_URI` (`.../hrms`) — this app's own data: `employees` (employee ID, name and department copied from the COSEC master), `attendance_days` (the per-day records the Daily Register shows), `syncstates` (sync progress) and `employee_profiles` (employees added on the Add Employee page, with their joining-sheet details; the sync never touches it).
- `COSEC_DB_NAME` (default `COSEC-ATTENDANCE`) — written by the external COSEC sync, read-only here: `punches` (one row per reader tap: `employeeId`, `employeeName`, `punchTime`, `punchDirection`) and `employees` (the employee master). Its `attendances` collection belongs to a different application and is not used.

`server/dailyRegister/cosecSync.js` turns raw punches into this app's day records: at startup (a full rebuild the first time) and every `COSEC_SYNC_MINUTES` it re-reads every punch row the external puller has written since `COSEC_SYNC_OVERLAP_MINUTES` before its last run (progress is tracked by `syncedAt`, not `punchTime`, because that puller back-fills history out of order) and rebuilds each day those rows touch from all of its punches. It sorts each employee's punches per wall-clock day, drops taps within `PUNCH_DUPLICATE_SECONDS` of the previous kept one (double taps), pairs the rest as IN, OUT, IN, OUT… and upserts `{ ID, NAME, Date: "DD-MM-YYYY", pair1: { IN, OUT }, … }`. `punchDirection` is 0 on virtually every row, so it is ignored. The same run copies employee ID, name and department from the COSEC employee master into this app's own `employees` collection (`server/dailyRegister/models/Employee.js`), which supplies names and departments for the Daily Register; if the external program's database is reset (it was on 2026-09-23), the copy keeps serving until the master reappears.

Time zone: the external sync stores the reader's IST wall-clock time as if it were UTC, so `PUNCH_TIME_ZONE=UTC` (the default) produces the correct local times. Switch it to `Asia/Kolkata` only if that sync is changed to store real UTC instants.

Sync endpoints: `GET /api/attendance/sync` (last run, settings), `POST /api/attendance/sync` (run now — the **Sync from COSEC** button on the Daily Register page).

## API

- `GET /api/attendance?employeeId=&date=&month=&view=register` — attendance records (`view=register`: only ID, name, department, date and punches)
- `GET /api/attendance/latest?view=register` — each employee's most recent day
- `GET /api/attendance/range` — first and last day that has records
- `POST /api/attendance/sync` — build day records from the newest COSEC punches now
- `GET /api/attendance/sync` — last sync run and settings
- `POST /api/employees` — add an employee (Add Employee page)
- `GET /api/paysheets/:sheet?fromDate=&toDate=` — Pay Sheet data from BC365
- `GET /api/health` — health check

## Notes

- One employee can have multiple IN/OUT pairs per day; `pairNo` disambiguates them in MongoDB, unique per (employeeId, date, pairNo).
- If COSEC SQL Server is on office LAN, run `server/` on an office machine with SQL access, pointed at MongoDB Atlas. The public-facing HRMS backend only needs MongoDB, not direct SQL Server access.
- Current IN/OUT pairing assumes punch order (1st=IN, 2nd=OUT, ...). Switch to COSEC's `IOType` column once its IN/OUT values are confirmed, for real punch direction instead of odd/even guessing.
