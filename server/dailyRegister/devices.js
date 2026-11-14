// COSEC machines, by their machine number (MID in COSEC's Mx_VEW_DoorDetail;
// the external sync copies it onto each punch as `deviceId`).
//
// The face machines don't record a direction (punchDirection is 0), so the
// machine decides it: a punch at the main gate ENTRY is an IN, at EXIT an OUT.
// Punches at any other machine (section and branch readers) don't say whether
// someone came or went; they are kept as "area punches" and shown, but only
// the gate punches make the IN/OUT pairs on a day that has gate punches.
//
// Override without a code change: PUNCH_IN_DEVICES=2 PUNCH_OUT_DEVICES=1
// (comma-separated machine numbers).

const list = (value, fallback) =>
  new Set(
    String(value ?? fallback)
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean)
  );

export const IN_DEVICES = list(process.env.PUNCH_IN_DEVICES, "2");
export const OUT_DEVICES = list(process.env.PUNCH_OUT_DEVICES, "1");

// Names as COSEC lists them (Devices page), for the register's tooltips.
export const DEVICE_NAMES = {
  1: "EXIT",
  2: "ENTRY",
  3: "OFFICE",
  4: "HRDK hallmarking",
  5: "HRDK SINGOOR BRANCH",
  7: "GHODA CHOWK",
  8: "GPC",
  9: "ELE FOAM",
  10: "G FOAM",
  11: "LIBRARY",
  12: "EF-SILVER",
  13: "SILVER ENTRY",
  14: "SILVER EXIT",
  15: "EF-Filling",
  16: "ELECTRO FORMING - FILLING"
};

// "IN", "OUT", or null (not a gate machine, or no machine recorded).
export function gateDirection(deviceId) {
  if (deviceId === null || deviceId === undefined || deviceId === "") return null;
  const id = String(deviceId);
  if (IN_DEVICES.has(id)) return "IN";
  if (OUT_DEVICES.has(id)) return "OUT";
  return null;
}

export const deviceName = (deviceId) => DEVICE_NAMES[deviceId] || (deviceId ? `Machine ${deviceId}` : "");
