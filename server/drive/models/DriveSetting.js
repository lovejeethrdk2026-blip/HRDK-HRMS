import mongoose from "mongoose";

// The one Google Drive connection (drive/googleDrive.js). The refresh token is
// stored encrypted with GOOGLE_TOKEN_ENCRYPTION_KEY from .env.
const driveSettingSchema = new mongoose.Schema(
  {
    key: { type: String, unique: true, default: "google" },
    refreshToken: { type: String, default: "" }, // encrypted: iv.tag.data (base64)
    email: { type: String, default: "" }, // the Google account the files go to
    rootFolderId: { type: String, default: "" }, // the "hrdk-hrms" folder
    connectedAt: Date
  },
  { timestamps: true, collection: "drive_settings" }
);

export default mongoose.model("DriveSetting", driveSettingSchema);
