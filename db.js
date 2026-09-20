const fs = require("fs");
const path = require("path");

const DATA_FILE = path.join(__dirname, "data.json");

// Seed data mirrors what used to be hard-coded in the frontend.
// recruited/completeness are intentionally left out of the seed sites —
// the frontend derives them live from the participants list, so the
// backend doesn't need to duplicate that logic.
const SEED = {
  trial: {
    name: "Clinical Trial Management Dashboard",
    medicine: "Ashwagandha Compound AX-7",
    target: 500,
    monthsElapsed: 0,
    plannedMonths: 18,
    ctriNumber: "CTRI/2025/06/071842",
  },
  sites: [
    { id: "S1", name: "AIIA, New Delhi", target: 60 },
    { id: "S2", name: "NIA, Jaipur", target: 55 },
    { id: "S3", name: "IPGT&RA, Jamnagar", target: 50 },
    { id: "S4", name: "Govt. Ayurved College, Nagpur", target: 45 },
    { id: "S5", name: "SDM College, Udupi", target: 50 },
    { id: "S6", name: "BHU Ayurveda Dept., Varanasi", target: 45 },
    { id: "S7", name: "Patanjali Research Institute, Haridwar", target: 50 },
    { id: "S8", name: "Govt. Ayurved College, Pune", target: 45 },
    { id: "S9", name: "Kerala Ayurveda, Sahyadri", target: 50 },
    { id: "S10", name: "Amrita Institute, Kochi", target: 50 },
  ],
  participants: [],
  adverseEvents: [],
  users: [],
  regulatoryDocs: [
    { name: "Protocol", status: "Pending" },
    { name: "Ethics Approval", status: "Pending" },
    { name: "CTRI Registration", status: "Pending" },
    { name: "Protocol Amendment v2", status: "Pending" },
  ],
};

function clone(obj) {
  return JSON.parse(JSON.stringify(obj));
}

function load() {
  if (!fs.existsSync(DATA_FILE)) {
    save(SEED);
    return clone(SEED);
  }
  try {
    const data = JSON.parse(fs.readFileSync(DATA_FILE, "utf8"));
    // Backfill any top-level fields that didn't exist yet when this
    // data.json was first created (e.g. an older version of the app
    // that predates accounts won't have a "users" list).
    let patched = false;
    for (const key of Object.keys(SEED)) {
      if (!(key in data)) {
        data[key] = clone(SEED[key]);
        patched = true;
      }
    }
    if (patched) save(data);
    return data;
  } catch (err) {
    console.error("data.json was unreadable, reseeding:", err.message);
    save(SEED);
    return clone(SEED);
  }
}

function save(data) {
  fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2));
}

module.exports = { load, save, SEED };
