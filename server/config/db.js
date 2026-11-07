import mongoose from "mongoose";
import { COSEC_DB_NAME } from "./cosecDb.js";
// This app must NOT store its data in the external COSEC program's database.
// That program periodically clears the collections it owns there, and it uses
// collection names this app used to use -- pointing MONGO_URI
// at it silently destroys every admin account, portal login, attendance mark
// and day record this app writes, minutes after they are written.
function assertOwnDatabase() {
  const name = mongoose.connection.name;
  if (name && name.toLowerCase() === String(COSEC_DB_NAME).toLowerCase()) {
    throw new Error(
      `MONGO_URI points at "${name}", the external COSEC program's own database ` +
        `(COSEC_DB_NAME). That program wipes those collections, taking this app's ` +
        `data with them. Give MONGO_URI its own database instead, e.g. end it with ` +
        `"/hrms"; COSEC_DB_NAME stays as it is and is read from the same cluster.`
    );
  }
}

async function connectDB() {
  await mongoose.connect(process.env.MONGO_URI);
  assertOwnDatabase();
  console.log(`MongoDB connected (database "${mongoose.connection.name}")`);
}

export default connectDB;
