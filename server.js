require("dotenv").config();

const express  = require("express");
const path     = require("path");
const multer   = require("multer");
const fs       = require("fs");

const db           = require("./db");
const data         = require("./checklist_data");
const { readFormPhoto } = require("./vision_reader");

const app  = express();
const PORT = process.env.PORT || 5000;

// ── Setup ─────────────────────────────────────────────────────────────────────
app.set("view engine", "ejs");
app.set("views", path.join(__dirname, "views"));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use("/static", express.static(path.join(__dirname, "static")));

const UPLOAD_DIR = process.env.DB_PATH
  ? path.join(path.dirname(process.env.DB_PATH), "uploads")
  : path.join(__dirname, "uploads");
fs.mkdirSync(UPLOAD_DIR, { recursive: true });

const upload = multer({
  dest: UPLOAD_DIR,
  limits: { fileSize: 20 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const ok = /\.(jpg|jpeg|png|webp|heic)$/i.test(file.originalname);
    cb(null, ok);
  },
});

const pct = (done, total) => (total > 0 ? Math.floor((done / total) * 100) : 0);

function aptDisplayNum(floor, number) {
  return String(floor * 100 + number);
}

// ── Dashboard ─────────────────────────────────────────────────────────────────
app.get("/", async (_req, res) => {
  try {
    const rows = await db.getAllProgress();

    const rowsWithTotal = rows.map((r) => {
      const total = data.getTotalTasks(r.number);
      return { ...r, total, pct: pct(r.completed, total) };
    });

    const byFloor = {};
    for (const r of rowsWithTotal) {
      if (!byFloor[r.floor]) byFloor[r.floor] = [];
      byFloor[r.floor].push(r);
    }
    const floorData = Object.keys(byFloor)
      .map(Number)
      .sort((a, b) => a - b)
      .map((f) => ({ floor: f, apartments: byFloor[f] }));

    const overallDone  = rowsWithTotal.reduce((s, r) => s + r.completed, 0);
    const overallTotal = rowsWithTotal.reduce((s, r) => s + r.total,     0);

    res.render("dashboard", {
      floorData,
      overallDone,
      overallTotal,
      overallPct:   pct(overallDone, overallTotal),
      numFloors:    data.NUM_FLOORS,
      aptsPerFloor: data.APTS_PER_FLOOR,
      allTasks:     data.getAllUniqueTasks(),
    });
  } catch (err) {
    console.error("Dashboard error:", err);
    res.status(500).send("Erro ao carregar dashboard: " + err.message);
  }
});

// ── Apartment detail ──────────────────────────────────────────────────────────
app.get("/apartment/:floor/:number", async (req, res) => {
  try {
    const floor  = parseInt(req.params.floor);
    const number = parseInt(req.params.number);
    const apt    = await db.getApartment(floor, number);
    if (!apt) return res.status(404).send("Apartamento não encontrado");

    const statuses         = await db.getTaskStatuses(apt.id);
    const environments_def = data.getEnvironments(number);
    const total            = data.getTotalTasks(number);
    const completed        = await db.getCompletedCount(apt.id);

    const environments = environments_def.map((env) => {
      let envDone = 0;
      const tasks = env.tasks.map((name, i) => {
        const s = statuses[`${env.id}_${i}`] || "N";
        if (s === "C") envDone++;
        return { index: i, name, status: s };
      });
      return { ...env, tasks, completed: envDone, total: env.tasks.length };
    });

    res.render("apartment", {
      apt, floor, number, environments,
      displayNum: aptDisplayNum(floor, number),
      STATUS:     data.STATUS,
      aptTypes:   data.APARTMENT_TYPES,
      completed, total, pct: pct(completed, total),
    });
  } catch (err) {
    console.error("Apartment detail error:", err);
    res.status(500).send("Erro: " + err.message);
  }
});

// ── Print form ────────────────────────────────────────────────────────────────
app.get("/print/:floor/:number", async (req, res) => {
  try {
    const floor  = parseInt(req.params.floor);
    const number = parseInt(req.params.number);
    const apt    = await db.getApartment(floor, number);
    if (!apt) return res.status(404).send("Apartamento não encontrado");

    const blank    = req.query.blank === "true";
    const statuses = blank ? {} : await db.getTaskStatuses(apt.id);

    res.render("print_form", {
      apt, floor, number,
      displayNum:   aptDisplayNum(floor, number),
      environments: data.getEnvironments(number),
      statusesDb:   statuses,
      STATUS:       data.STATUS,
      blank,
    });
  } catch (err) {
    console.error("Print form error:", err);
    res.status(500).send("Erro: " + err.message);
  }
});

// ── API: filtro por tarefa ────────────────────────────────────────────────────
app.get("/api/task-filter", async (req, res) => {
  try {
    const taskName = req.query.task;
    if (!taskName) return res.json({ apartments: [] });

    const apartments = await db.getAllApartments();

    const locationKeys = new Map();
    for (const apt of apartments) {
      for (const loc of data.findTaskLocations(taskName, apt.number)) {
        const key = `${loc.environment_id}:${loc.task_index}`;
        if (!locationKeys.has(key)) locationKeys.set(key, loc);
      }
    }

    const statusMap = new Map();
    for (const loc of locationKeys.values()) {
      const rows = await db.getStatusByLocation(loc.environment_id, loc.task_index);
      for (const row of rows) {
        if (!statusMap.has(row.apartment_id)) statusMap.set(row.apartment_id, row.status);
      }
    }

    const result = apartments.map((apt) => {
      const hasTask = data.findTaskLocations(taskName, apt.number).length > 0;
      return {
        floor:    apt.floor,
        number:   apt.number,
        apt_type: apt.apt_type,
        status:   hasTask ? (statusMap.get(apt.id) || "N") : null,
      };
    });

    const byFloor = {};
    for (const r of result) {
      if (!byFloor[r.floor]) byFloor[r.floor] = [];
      byFloor[r.floor].push(r);
    }
    const floors = Object.keys(byFloor).map(Number).sort((a, b) => a - b)
      .map((f) => ({ floor: f, apartments: byFloor[f] }));

    res.json({ task: taskName, floors });
  } catch (err) {
    console.error("Task filter error:", err);
    res.status(500).json({ error: err.message });
  }
});

// ── API: set task status ──────────────────────────────────────────────────────
app.post("/api/status", async (req, res) => {
  try {
    const { apartment_id, environment_id, task_index, status } = req.body;
    if (!data.STATUS[status]) return res.status(400).json({ error: "Status inválido" });

    await db.setTaskStatus(apartment_id, environment_id, task_index, status);
    const apt2      = await db.getApartmentById(apartment_id);
    const total     = data.getTotalTasks(apt2.number);
    const completed = await db.getCompletedCount(apartment_id);
    res.json({ ok: true, completed, total, pct: pct(completed, total) });
  } catch (err) {
    console.error("Set status error:", err);
    res.status(500).json({ error: err.message });
  }
});

// ── API: update apartment type ────────────────────────────────────────────────
app.post("/api/update-type", async (req, res) => {
  try {
    const { floor, number, type } = req.body;
    if (!data.APARTMENT_TYPES.includes(type)) return res.status(400).json({ error: "Tipo inválido" });
    await db.updateApartmentType(floor, number, type);
    res.json({ ok: true });
  } catch (err) {
    console.error("Update type error:", err);
    res.status(500).json({ error: err.message });
  }
});

// ── API: save notes ───────────────────────────────────────────────────────────
app.post("/api/notes/:id", async (req, res) => {
  try {
    await db.updateApartmentNotes(req.params.id, req.body.notes || "");
    res.json({ ok: true });
  } catch (err) {
    console.error("Notes error:", err);
    res.status(500).json({ error: err.message });
  }
});

// ── API: upload photo for AI reading ─────────────────────────────────────────
app.post("/api/upload-photo/:id", upload.single("photo"), async (req, res) => {
  const aptId = parseInt(req.params.id);
  try {
    const apt = await db.getApartmentById(aptId);
    if (!apt)      return res.status(404).json({ error: "Apartamento não encontrado" });
    if (!req.file) return res.status(400).json({ error: "Nenhuma foto enviada" });

    const ext = req.file.originalname.split(".").pop().toLowerCase();
    const mediaTypes = { jpg: "image/jpeg", jpeg: "image/jpeg", png: "image/png", webp: "image/webp", heic: "image/jpeg" };
    const mediaType  = mediaTypes[ext] || "image/jpeg";

    const imgBuffer = fs.readFileSync(req.file.path);
    const imgBase64 = imgBuffer.toString("base64");

    const result  = await readFormPhoto(imgBase64, mediaType, apt, data.getEnvironments(apt.number));
    let   applied = 0;
    for (const upd of result.updates || []) {
      if (upd.environment_id && upd.task_index != null && data.STATUS[upd.status]) {
        await db.setTaskStatus(aptId, upd.environment_id, upd.task_index, upd.status);
        applied++;
      }
    }
    await db.saveInspectionLog(aptId, req.file.path, JSON.stringify(result));
    res.json({ ok: true, updates_applied: applied, message: result.message || `${applied} tarefas atualizadas` });
  } catch (err) {
    console.error("Upload photo error:", err);
    await db.saveInspectionLog(aptId, req.file?.path, String(err), "error").catch(() => {});
    res.status(500).json({ error: err.message });
  }
});

// ── Start ─────────────────────────────────────────────────────────────────────
(async () => {
  try {
    await db.initDb();
    app.listen(PORT, () => {
      console.log(`\n🏗️  Gestão de Obra — servidor iniciado`);
      console.log(`   Acesse: http://localhost:${PORT}\n`);
    });
  } catch (err) {
    console.error("❌ Falha ao iniciar banco de dados:", err);
    process.exit(1);
  }
})();
