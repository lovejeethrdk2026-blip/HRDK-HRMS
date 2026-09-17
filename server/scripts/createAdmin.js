// Creates an admin panel account, or resets the password of an existing one
// (which also logs that admin out everywhere). Run from server/:
//   npm run create-admin -- <username> ["Full Name"]
// The password is prompted for (hidden) so it never lands in shell history.
require("dotenv").config();

const readline = require("readline");
const mongoose = require("mongoose");
const bcrypt = require("bcryptjs");
const Admin = require("../models/Admin");
const AdminRefreshToken = require("../models/AdminRefreshToken");

const MIN_PASSWORD_LENGTH = 8;

function promptHidden(question) {
  return new Promise((resolve) => {
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
      terminal: true
    });

    process.stdout.write(question);
    let muted = true;
    rl._writeToOutput = (text) => {
      if (!muted) rl.output.write(text);
    };

    rl.question("", (answer) => {
      muted = false;
      rl.close();
      process.stdout.write("\n");
      resolve(answer);
    });
  });
}

async function main() {
  const [username, ...nameParts] = process.argv.slice(2);
  const name = nameParts.join(" ").trim();

  if (!username) {
    console.error('Usage: npm run create-admin -- <username> ["Full Name"]');
    process.exit(1);
  }

  const password = await promptHidden("Password: ");
  if (password.length < MIN_PASSWORD_LENGTH) {
    console.error(`Password must be at least ${MIN_PASSWORD_LENGTH} characters.`);
    process.exit(1);
  }

  const confirm = await promptHidden("Confirm password: ");
  if (confirm !== password) {
    console.error("Passwords do not match.");
    process.exit(1);
  }

  await mongoose.connect(process.env.MONGO_URI);

  const normalized = username.trim().toLowerCase();
  const passwordHash = await bcrypt.hash(password, 12);
  const existing = await Admin.findOne({ username: normalized });

  if (existing) {
    existing.passwordHash = passwordHash;
    existing.failedLoginAttempts = 0;
    existing.lockUntil = null;
    existing.isActive = true;
    if (name) existing.name = name;
    await existing.save();

    await AdminRefreshToken.updateMany(
      { admin: existing._id, revokedAt: null },
      { $set: { revokedAt: new Date() } }
    );

    console.log(`Password reset for admin "${normalized}". Existing sessions were logged out.`);
  } else {
    await Admin.create({ username: normalized, name, passwordHash });
    console.log(`Admin "${normalized}" created.`);
  }

  await mongoose.disconnect();
}

main().catch(async (error) => {
  console.error(error);
  await mongoose.disconnect();
  process.exit(1);
});
