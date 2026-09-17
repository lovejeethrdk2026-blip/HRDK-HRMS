# HRMS Attendance

MERN app syncing biometric (COSEC / SQL Server) attendance into MongoDB, served through an Express API, shown in a React frontend.

## Structure

```
server/       Express + Mongoose + mssql sync job + REST API
client/       React (Vite) attendance viewer
empdetails/   Employee self-service login page (client/ only, see Notes)
```

## Setup

### Server

```bash
cd server
npm install
cp .env.example .env   # fill SQL_* and MONGO_URI
npm run dev
```

Runs on `http://localhost:3030`. Syncs COSEC attendance into MongoDB on start and every 5 minutes via cron.

### Client

```bash
cd client
npm install
npm run dev
```

Runs on `http://localhost:5173`, proxies `/api` to the server.

## API

- `GET /api/attendance?employeeId=&date=&from=&to=` — list attendance records
- `POST /api/attendance/sync` — trigger manual sync from SQL Server
- `GET /api/health` — health check

## Notes

- One employee can have multiple IN/OUT pairs per day; `pairNo` disambiguates them in MongoDB, unique per (employeeId, date, pairNo).
- If COSEC SQL Server is on office LAN, run `server/` on an office machine with SQL access, pointed at MongoDB Atlas. The public-facing HRMS backend only needs MongoDB, not direct SQL Server access.
- Current IN/OUT pairing assumes punch order (1st=IN, 2nd=OUT, ...). Switch to COSEC's `IOType` column once its IN/OUT values are confirmed, for real punch direction instead of odd/even guessing.
- `empdetails/client/MyAttendance.jsx` is a deliberately separate, self-contained React file (own `fetch`-based API calls, own table renderer -- no imports from `client/src`), living outside `client/` per request. `client/src/App.jsx` imports it directly via a relative path, and `client/vite.config.js` has `server.fs.allow: [".."]` so Vite can serve a file from outside its project root. The backend side (`EmpDetails` model/controller/route, login = employee ID as both username and password) stays in `server/` as normal -- only the frontend piece is split out. If this pattern is repeated for more pages, keep each such file dependency-free (no importing packages that only exist in `client/node_modules`, since Vite can't resolve `node_modules` sideways into a sibling directory -- use native `fetch` instead of `axios`, as done here).
