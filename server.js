const express = require("express");
const path = require("path");
const bcrypt = require("bcryptjs");
const { load, save } = require("./db");

const ROLES = ["Principal Investigator", "Site Investigator", "Ethics Committee", "Pharmacovigilance Officer"];

// Anyone signing up as Principal Investigator — the role that can see and
// delete every account — must supply this code. Change it (or set the
// PI_ACCESS_CODE environment variable instead of editing this file) before
// sharing the app with anyone you don't want to have that access.
const PI_ACCESS_CODE = process.env.PI_ACCESS_CODE || "AIIA-PI-2026";

const app = express();
app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));

// The frontend file isn't named index.html, so express.static won't serve
// it automatically at "/" — this route makes http://localhost:4000 work
// directly instead of requiring /Ayura_Verse.html.
app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "Ayura_Verse.html"));
});

// No favicon shipped with the prototype — respond with "no content" instead
// of a 404 so it doesn't show up as a red error in the browser console.
app.get("/favicon.ico", (req, res) => res.status(204).end());

let db = load();

function parseWeeks(durationStr) {
  const m = String(durationStr || "").match(/\d+/);
  return m ? Number(m[0]) : 12;
}

function toFhirPatient(p) {
  return {
    resourceType: "Patient",
    id: p.id,
    identifier: [{ system: "urn:aiia:ctms:participant", value: p.id }],
    gender: (p.gender || "").toLowerCase(),
    extension: [
      { url: "urn:ayush:prakriti", valueString: p.prakriti },
      { url: "urn:ayush:vikriti", valueString: p.vikriti },
      { url: "urn:ayush:dosha", valueString: p.dosha },
      { url: "urn:ayush:agni", valueString: p.agni },
    ],
    managingOrganization: { display: p.site },
    meta: { profile: ["urn:aiia:ctms:fhir-profile-r4"] },
  };
}

function toCSV(rows) {
  return rows
    .map((r) => r.map((v) => `"${String(v).replace(/"/g, '""')}"`).join(","))
    .join("\n");
}

/* ---------------------------------- HEALTH ---------------------------------- */

app.get("/api/health", (req, res) => res.json({ ok: true }));

/* ---------------------------------- AUTH ---------------------------------- */
// Real accounts, stored in db.users. Passwords are hashed with bcrypt —
// never stored or returned in plain text. A user record shown to the
// frontend never includes passwordHash.

function publicUser(u) {
  return { id: u.id, name: u.name, userId: u.userId, role: u.role, site: u.site || null };
}

app.post("/api/auth/signup", (req, res) => {
  const b = req.body || {};
  const name = (b.name || "").trim();
  const userId = (b.userId || "").trim();
  const password = b.password || "";
  const role = b.role || "";

  if (!name || !userId || !password || !role) {
    return res.status(400).json({ error: "Name, user ID, password and role are all required." });
  }
  if (password.length < 6) {
    return res.status(400).json({ error: "Password must be at least 6 characters." });
  }
  if (!ROLES.includes(role)) {
    return res.status(400).json({ error: "That role isn't recognized." });
  }
  if (role === "Principal Investigator" && (b.piCode || "").trim() !== PI_ACCESS_CODE) {
    return res.status(403).json({ error: "Incorrect Principal Investigator access code." });
  }
  const existing = db.users.find((u) => u.userId.toLowerCase() === userId.toLowerCase());
  if (existing) {
    return res.status(409).json({ error: "That user ID is already registered. Try signing in instead." });
  }

  let site = null;
  if (role === "Site Investigator") {
    site = (b.site || "").trim();
    const known = db.sites.some((s) => s.name === site);
    if (!site || !known) {
      return res.status(400).json({ error: "Please choose a valid site for a Site Investigator account." });
    }
  }

  const user = {
    id: `U-${String(db.users.length + 1).padStart(4, "0")}`,
    name,
    userId,
    passwordHash: bcrypt.hashSync(password, 10),
    role,
    site,
  };
  db.users.push(user);
  save(db);
  res.status(201).json(publicUser(user));
});

app.post("/api/auth/login", (req, res) => {
  const b = req.body || {};
  const userId = (b.userId || "").trim();
  const password = b.password || "";
  if (!userId || !password) {
    return res.status(400).json({ error: "Enter your user ID and password." });
  }
  const user = db.users.find((u) => u.userId.toLowerCase() === userId.toLowerCase());
  if (!user) {
    return res.status(401).json({ error: "No account found with that user ID." });
  }
  if (!bcrypt.compareSync(password, user.passwordHash)) {
    return res.status(401).json({ error: "Incorrect password." });
  }
  res.json(publicUser(user));
});

// Demo-only "forgot password": there's no email/SMS to verify identity
// through, so this just resets the password for a known user ID. Fine for
// a hackathon demo where every account is a test account; not something
// you'd ship for a real trial without adding real verification first.
app.post("/api/auth/reset-password", (req, res) => {
  const b = req.body || {};
  const userId = (b.userId || "").trim();
  const newPassword = b.newPassword || "";
  if (!userId || !newPassword) {
    return res.status(400).json({ error: "Enter your user ID and a new password." });
  }
  if (newPassword.length < 6) {
    return res.status(400).json({ error: "Password must be at least 6 characters." });
  }
  const user = db.users.find((u) => u.userId.toLowerCase() === userId.toLowerCase());
  if (!user) {
    return res.status(404).json({ error: "No account found with that user ID." });
  }
  user.passwordHash = bcrypt.hashSync(newPassword, 10);
  save(db);
  res.json({ ok: true });
});

// Account management — no password/admin gate on these (same as the rest
// of this prototype's login), so treat this as a local dev/demo tool, not
// something to expose on a shared or public deployment.
app.get("/api/auth/users", (req, res) => {
  res.json(db.users.map(publicUser));
});

app.delete("/api/auth/users/:id", (req, res) => {
  const idx = db.users.findIndex((u) => u.id === req.params.id);
  if (idx === -1) return res.status(404).json({ error: "Account not found." });
  db.users.splice(idx, 1);
  save(db);
  res.json({ ok: true });
});

app.delete("/api/auth/users", (req, res) => {
  db.users = [];
  save(db);
  res.json({ ok: true });
});

/* ---------------------------------- BOOTSTRAP ---------------------------------- */
// One call the frontend uses on load to fetch everything it needs.

app.get("/api/bootstrap", (req, res) => {
  res.json(db);
});

/* ---------------------------------- TRIAL ---------------------------------- */

app.get("/api/trial", (req, res) => res.json(db.trial));

/* ---------------------------------- SITES ---------------------------------- */

app.get("/api/sites", (req, res) => res.json(db.sites));

/* ---------------------------------- PARTICIPANTS ---------------------------------- */

app.get("/api/participants", (req, res) => {
  const { site } = req.query;
  const list = site ? db.participants.filter((p) => p.site === site) : db.participants;
  res.json(list);
});

app.post("/api/participants", (req, res) => {
  const b = req.body || {};
  if (!b.site || !b.age || !b.prakriti) {
    return res.status(400).json({ error: "site, age and prakriti are required" });
  }
  const id = `P-${String(db.participants.length + 1).padStart(4, "0")}`;
  const participant = {
    id,
    status: "Active",
    site: b.site,
    age: Number(b.age),
    gender: b.gender || "",
    prakriti: b.prakriti,
    vikriti: b.vikriti || "",
    dosha: b.dosha || "",
    agni: b.agni || "",
    ahara: b.ahara || "",
    nidra: b.nidra || "",
    dose: b.dose || "",
    anupana: b.anupana || "",
    duration: b.duration || "",
    weeksCompleted: 0,
  };
  db.participants.push(participant);
  save(db);
  res.status(201).json(participant);
});

// Advance a participant's treatment by one week (mirrors the old
// client-side "+1 week" button logic, now persisted server-side).
app.patch("/api/participants/:id/progress", (req, res) => {
  const p = db.participants.find((x) => x.id === req.params.id);
  if (!p) return res.status(404).json({ error: "participant not found" });
  const total = parseWeeks(p.duration);
  p.weeksCompleted = Math.min((p.weeksCompleted || 0) + 1, total);
  if (p.weeksCompleted >= total) p.status = "Completed";
  save(db);
  res.json(p);
});

/* ---------------------------------- ADVERSE EVENTS (PHARMACOVIGILANCE) ---------------------------------- */

app.get("/api/adverse-events", (req, res) => res.json(db.adverseEvents));

app.post("/api/adverse-events", (req, res) => {
  const b = req.body || {};
  if (!b.event || !b.date) {
    return res.status(400).json({ error: "event and date are required" });
  }
  const serious = b.serious === true || b.serious === "yes";
  const id = `AE-${String(db.adverseEvents.length + 1).padStart(3, "0")}`;
  const ae = {
    id,
    participant: b.participant || "",
    event: b.event,
    date: b.date,
    severity: b.severity || "",
    causality: b.causality || "",
    serious,
    status: serious ? "Escalated" : "Under review",
  };
  db.adverseEvents.push(ae);
  save(db);
  res.status(201).json(ae);
});

/* ---------------------------------- REGULATORY DOCS ---------------------------------- */

app.get("/api/regulatory-docs", (req, res) => res.json(db.regulatoryDocs));

/* ---------------------------------- INTEROPERABILITY ---------------------------------- */

app.get("/api/interop/fhir/:id", (req, res) => {
  const p = db.participants.find((x) => x.id === req.params.id);
  if (!p) return res.status(404).json({ error: "participant not found" });
  res.json(toFhirPatient(p));
});

app.get("/api/interop/export/dm", (req, res) => {
  const rows = [
    ["USUBJID", "SITE", "AGE", "SEX", "ARM"],
    ...db.participants.map((x) => [x.id, x.site, x.age, (x.gender || "")[0] || "", db.trial.medicine]),
  ];
  res.setHeader("Content-Type", "text/csv");
  res.setHeader("Content-Disposition", 'attachment; filename="DM_domain.csv"');
  res.send(toCSV(rows));
});

app.get("/api/interop/export/ae", (req, res) => {
  const rows = [
    ["USUBJID", "AETERM", "AESEV", "AEREL", "AESER"],
    ...db.adverseEvents.map((a) => [a.participant, a.event, a.severity, a.causality, a.serious ? "Y" : "N"]),
  ];
  res.setHeader("Content-Type", "text/csv");
  res.setHeader("Content-Disposition", 'attachment; filename="AE_domain.csv"');
  res.send(toCSV(rows));
});

/* ---------------------------------- START ---------------------------------- */

const PORT = process.env.PORT || 4000;
app.listen(PORT, () => {
  console.log(`Ayura Verse backend running at http://localhost:${PORT}`);
});
