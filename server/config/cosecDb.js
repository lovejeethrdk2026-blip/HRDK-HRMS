import mongoose from "mongoose";

// The external COSEC sync writes raw punch rows and the employee master into
// this database on the same cluster as MONGO_URI (so the same credentials
// work). This app only ever READS from it; its own data stays in MONGO_URI's
// database. useDb() shares the main connection pool, so there is nothing
// extra to connect or close.
const COSEC_DB_NAME = process.env.COSEC_DB_NAME || "COSEC-ATTENDANCE";

const cosecDb = mongoose.connection.useDb(COSEC_DB_NAME, { useCache: true });

export { cosecDb, COSEC_DB_NAME };
