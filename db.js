const { createClient } = require("@libsql/client");
const path = require("path");
const fs   = require("fs");
const { NUM_FLOORS, APTS_PER_FLOOR } = require("./checklist_data");

// ─────────────────────────────────────────────────────────────────────────────
// Conexão
//   Produção  → variável TURSO_DB_URL (ex: libsql://obra-fulano.turso.io)
//   Local     → arquivo SQLite na pasta do projeto
// ─────────────────────────────────────────────────────────────────────────────
const DB_URL = process.env.TURSO_DB_URL
  ? process.env.TURSO_DB_URL
  : `file:${process.env.DB_PATH || path.join(__dirname, "predio.db")}`;

// Garante que a pasta existe ao usar arquivo local
if (DB_URL.startsWith("file:")) {
  const filePath = DB_URL.slice(5); // remove "file:"
  fs.mkdirSync(path.dirname(path.resolve(filePath)), { recursive: true });
}

const client = createClient({
  url:       DB_URL,
  authToken: process.env.TURSO_AUTH_TOKEN || undefined,
});

// ── Init ──────────────────────────────────────────────────────────────────────

async function initDb() {
  // Criar tabelas
  await client.execute(`
    CREATE TABLE IF NOT EXISTS apartments (
      id       INTEGER PRIMARY KEY AUTOINCREMENT,
      floor    INTEGER NOT NULL,
      number   INTEGER NOT NULL,
      apt_type TEXT    NOT NULL DEFAULT 'C',
      notes    TEXT    DEFAULT '',
      UNIQUE(floor, number)
    )
  `);
  await client.execute(`
    CREATE TABLE IF NOT EXISTS task_status (
      id             INTEGER PRIMARY KEY AUTOINCREMENT,
      apartment_id   INTEGER NOT NULL REFERENCES apartments(id),
      environment_id TEXT    NOT NULL,
      task_index     INTEGER NOT NULL,
      status         TEXT    NOT NULL DEFAULT 'N',
      updated_at     TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(apartment_id, environment_id, task_index)
    )
  `);
  await client.execute(`
    CREATE TABLE IF NOT EXISTS inspection_logs (
      id            INTEGER PRIMARY KEY AUTOINCREMENT,
      apartment_id  INTEGER NOT NULL REFERENCES apartments(id),
      photo_path    TEXT,
      ai_response   TEXT,
      result_status TEXT DEFAULT 'pending',
      created_at    TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // Seed: inserir 405 apartamentos se o banco estiver vazio
  const countResult = await client.execute("SELECT COUNT(*) AS n FROM apartments");
  const count = Number(countResult.rows[0].n);

  if (count === 0) {
    const typeMap = [[1,5,"C"],[6,10,"D"],[11,16,"E"],[17,22,"F"],[23,27,"G"]];
    const stmts = [];
    for (let floor = 1; floor <= NUM_FLOORS; floor++) {
      for (let num = 1; num <= APTS_PER_FLOOR; num++) {
        const apt_type = typeMap.find(([lo, hi]) => num >= lo && num <= hi)?.[2] ?? "C";
        stmts.push({
          sql:  "INSERT OR IGNORE INTO apartments (floor, number, apt_type) VALUES (?,?,?)",
          args: [floor, num, apt_type],
        });
      }
    }
    await client.batch(stmts, "write");
  }
}

// ── Apartamentos ──────────────────────────────────────────────────────────────

async function getApartment(floor, number) {
  const r = await client.execute({
    sql:  "SELECT * FROM apartments WHERE floor=? AND number=?",
    args: [floor, number],
  });
  return r.rows[0] || null;
}

async function getApartmentById(id) {
  const r = await client.execute({
    sql:  "SELECT * FROM apartments WHERE id=?",
    args: [id],
  });
  return r.rows[0] || null;
}

async function updateApartmentType(floor, number, apt_type) {
  await client.execute({
    sql:  "UPDATE apartments SET apt_type=? WHERE floor=? AND number=?",
    args: [apt_type, floor, number],
  });
}

async function updateApartmentNotes(id, notes) {
  await client.execute({
    sql:  "UPDATE apartments SET notes=? WHERE id=?",
    args: [notes, id],
  });
}

// ── Task status ───────────────────────────────────────────────────────────────

async function getTaskStatuses(apartment_id) {
  const r = await client.execute({
    sql:  "SELECT environment_id, task_index, status FROM task_status WHERE apartment_id=?",
    args: [apartment_id],
  });
  const map = {};
  for (const row of r.rows) {
    map[`${row.environment_id}_${row.task_index}`] = row.status;
  }
  return map;
}

async function setTaskStatus(apartment_id, environment_id, task_index, status) {
  await client.execute({
    sql: `
      INSERT INTO task_status (apartment_id, environment_id, task_index, status)
      VALUES (?,?,?,?)
      ON CONFLICT(apartment_id, environment_id, task_index)
      DO UPDATE SET status=excluded.status, updated_at=CURRENT_TIMESTAMP
    `,
    args: [apartment_id, environment_id, task_index, status],
  });
}

async function getCompletedCount(apartment_id) {
  const r = await client.execute({
    sql:  "SELECT COUNT(*) AS n FROM task_status WHERE apartment_id=? AND status='C'",
    args: [apartment_id],
  });
  return Number(r.rows[0].n);
}

async function getApartmentProgress(apartment_id, total) {
  const completed = await getCompletedCount(apartment_id);
  return { completed, total: total ?? completed };
}

// ── Dashboard / Filtro ────────────────────────────────────────────────────────

async function getAllProgress() {
  const r = await client.execute(`
    SELECT
      a.id, a.floor, a.number, a.apt_type,
      COUNT(CASE WHEN ts.status='C' THEN 1 END) AS completed
    FROM apartments a
    LEFT JOIN task_status ts ON ts.apartment_id = a.id
    GROUP BY a.id, a.floor, a.number, a.apt_type
    ORDER BY a.floor, a.number
  `);
  return r.rows.map(row => ({
    id:        Number(row.id),
    floor:     Number(row.floor),
    number:    Number(row.number),
    apt_type:  row.apt_type,
    completed: Number(row.completed),
  }));
}

async function getAllApartments() {
  const r = await client.execute(
    "SELECT id, floor, number, apt_type FROM apartments ORDER BY floor, number"
  );
  return r.rows.map(row => ({
    id:       Number(row.id),
    floor:    Number(row.floor),
    number:   Number(row.number),
    apt_type: row.apt_type,
  }));
}

async function getStatusByLocation(environment_id, task_index) {
  const r = await client.execute({
    sql:  "SELECT apartment_id, status FROM task_status WHERE environment_id=? AND task_index=?",
    args: [environment_id, task_index],
  });
  return r.rows.map(row => ({
    apartment_id: Number(row.apartment_id),
    status:       row.status,
  }));
}

// ── Logs ──────────────────────────────────────────────────────────────────────

async function saveInspectionLog(apartment_id, photo_path, ai_response, result_status = "ok") {
  await client.execute({
    sql:  "INSERT INTO inspection_logs (apartment_id, photo_path, ai_response, result_status) VALUES (?,?,?,?)",
    args: [apartment_id, photo_path, ai_response, result_status],
  });
}

module.exports = {
  initDb, getApartment, getApartmentById,
  updateApartmentType, updateApartmentNotes,
  getTaskStatuses, setTaskStatus, getCompletedCount, getApartmentProgress,
  getAllProgress, getAllApartments, getStatusByLocation, saveInspectionLog,
};
