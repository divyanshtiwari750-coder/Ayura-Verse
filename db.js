const { MongoClient } = require("mongodb");

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

// Everything lives in ONE document in ONE collection — this app's entire
// state (trial, sites, participants, adverseEvents, users, regulatoryDocs)
// is small enough that a single document is simpler than modeling separate
// collections, and it keeps server.js's routes exactly as they were when
// this was a JSON file: they just read/write fields on `db`.
const DOC_ID = "singleton";

let client;
let collection;

async function getCollection() {
  if (collection) return collection;
  const uri = process.env.MONGODB_URI;
  if (!uri) {
    throw new Error(
      "MONGODB_URI environment variable is not set. Add it in Render's Environment settings (see README)."
    );
  }
  client = new MongoClient(uri);
  await client.connect();
  const dbName = process.env.MONGODB_DB || "ayuraverse";
  collection = client.db(dbName).collection("appdata");
  return collection;
}

// Loads the app's data document, creating and seeding it on first run,
// and backfilling any fields that didn't exist yet in an older document
// (e.g. an older deploy that predates accounts won't have a "users" list).
async function load() {
  const col = await getCollection();
  let doc = await col.findOne({ _id: DOC_ID });

  if (!doc) {
    doc = { _id: DOC_ID, ...clone(SEED) };
    await col.insertOne(doc);
    return doc;
  }

  let patched = false;
  for (const key of Object.keys(SEED)) {
    if (!(key in doc)) {
      doc[key] = clone(SEED[key]);
      patched = true;
    }
  }
  if (patched) await save(doc);
  return doc;
}

async function save(data) {
  const col = await getCollection();
  const { _id, ...rest } = data;
  await col.updateOne({ _id: DOC_ID }, { $set: rest }, { upsert: true });
}

module.exports = { load, save, SEED };
