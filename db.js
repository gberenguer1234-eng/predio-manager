const Database = require("better-sqlite3");
const path     = require("path");
const fs       = require("fs");
const { NUM_FLOORS, APTS_PER_FLOOR } = require("./checklist_data");

// Em produção usa volume persistente (DB_PATH env); localmente usa a pasta do projeto
const DB_PATH = process.env.DB_PATH || path.join(__dirname, "predio.db");

// Garante que a pasta do banco existe (necessário para /data no Glitch/Fly)
fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });

let _db;
function getDb() {
  if (!_db) {
    _db = new Database(DB_PATH);
    _db.pragma("journal_mode = DELETE");
    _db.pragma("synchronous = FULL");
  }
  return _db;
}

function initDb() {
  const db = getDb();

  db.exec(`
    CREATE TABLE IF NOT EXISTS apartments (
      id       INTEGER PRIMARY KEY AUTOINCREMENT,
      floor    INTEGER NOT NULL,
      number   INTEGER NOT NULL,
      apt_type TEXT    NOT NULL DEFAULT 'C',
      notes    TEXT    DEFAULT '',
      UNIQUE(floor, number)
    );

    CREATE TABLE IF NOT EXISTS task_status (
      id             INTEGER PRIMARY KEY AUTOINCREMENT,
      apartment_id   INTEGER NOT NULL REFERENCES apartments(id),
      environment_id TEXT    NOT NULL,
      task_index     INTEGER NOT NULL,
      status         TEXT    NOT NULL DEFAULT 'N',
      updated_at     TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(apartment_id, environment_id, task_index)
    );

    CREATE TABLE IF NOT EXISTS inspection_logs (
      id            INTEGER PRIMARY KEY AUTOINCREMENT,
      apartment_id  INTEGER NOT NULL REFERENCES apartments(id),
      photo_path    TEXT,
      ai_response   TEXT,
      result_status TEXT DEFAULT 'pending',
      created_at    TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );
  `);

  const count = db.prepare("SELECT COUNT(*) AS n FROM apartments").get().n;
  if (count === 0) {
    const typeMap = [[1,5,"C"],[6,10,"D"],[11,16,"E"],[17,22,"F"],[23,27,"G"]];
    const insert = db.prepare(
      "INSERT OR IGNORE INTO apartments (floor, number, apt_type) VALUES (?,?,?)"
    );
    for (let floor = 1; floor <= NUM_FLOORS; floor++) {
      for (let num = 1; num <= APTS_PER_FLOOR; num++) {
        const apt_type = typeMap.find(([lo, hi]) => num >= lo && num <= hi)?.[2] ?? "C";
        insert.run(floor, num, apt_type);
      }
    }
  }
}

// ── Apartment queries ─────────────────────────────────────────────────────────

function getApartment(floor, number) {
  return getDb()
    .prepare("SELECT * FROM apartments WHERE floor=? AND number=?")
    .get(floor, number);
}

function getApartmentById(id) {
  return getDb().prepare("SELECT * FROM apartments WHERE id=?").get(id);
}

function updateApartmentType(floor, number, apt_type) {
  getDb()
    .prepare("UPDATE apartments SET apt_type=? WHERE floor=? AND number=?")
    .run(apt_type, floor, number);
}

function updateApartmentNotes(id, notes) {
  getDb().prepare("UPDATE apartments SET notes=? WHERE id=?").run(notes, id);
}

// ── Task status ───────────────────────────────────────────────────────────────

function getTaskStatuses(apartment_id) {
  const rows = getDb()
    .prepare("SELECT environment_id, task_index, status FROM task_status WHERE apartment_id=?")
    .all(apartment_id);
  const map = {};
  for (const r of rows) map[`${r.environment_id}_${r.task_index}`] = r.status;
  return map;
}

function setTaskStatus(apartment_id, environment_id, task_index, status) {
  getDb()
    .prepare(`
      INSERT INTO task_status (apartment_id, environment_id, task_index, status)
      VALUES (?,?,?,?)
      ON CONFLICT(apartment_id, environment_id, task_index)
      DO UPDATE SET status=excluded.status, updated_at=CURRENT_TIMESTAMP
    `)
    .run(apartment_id, environment_id, task_index, status);
}

// Retorna só o count de C. O total (dependente do tipo de apt) é calculado no server.js
function getCompletedCount(apartment_id) {
  return getDb()
    .prepare("SELECT COUNT(*) AS n FROM task_status WHERE apartment_id=? AND status='C'")
    .get(apartment_id).n;
}

// Mantido para compatibilidade; caller deve passar o total correto
function getApartmentProgress(apartment_id, total) {
  const completed = getCompletedCount(apartment_id);
  return { completed, total: total ?? completed };
}

// ── All apartments (para filtro por tarefa) ───────────────────────────────────

function getAllApartments() {
  return getDb()
    .prepare("SELECT id, floor, number, apt_type FROM apartments ORDER BY floor, number")
    .all();
}

function getStatusByLocation(environment_id, task_index) {
  return getDb()
    .prepare("SELECT apartment_id, status FROM task_status WHERE environment_id=? AND task_index=?")
    .all(environment_id, task_index);
}

// ── Dashboard bulk query ──────────────────────────────────────────────────────

function getAllProgress() {
  return getDb()
    .prepare(`
      SELECT
        a.id, a.floor, a.number, a.apt_type,
        COUNT(CASE WHEN ts.status='C' THEN 1 END) AS completed
      FROM apartments a
      LEFT JOIN task_status ts ON ts.apartment_id = a.id
      GROUP BY a.id, a.floor, a.number, a.apt_type
      ORDER BY a.floor, a.number
    `)
    .all();
}

// ── Logs ──────────────────────────────────────────────────────────────────────

function saveInspectionLog(apartment_id, photo_path, ai_response, result_status = "ok") {
  getDb()
    .prepare(`
      INSERT INTO inspection_logs (apartment_id, photo_path, ai_response, result_status)
      VALUES (?,?,?,?)
    `)
    .run(apartment_id, photo_path, ai_response, result_status);
}

module.exports = {
  initDb, getApartment, getApartmentById,
  updateApartmentType, updateApartmentNotes,
  getTaskStatuses, setTaskStatus, getCompletedCount, getApartmentProgress,
  getAllProgress, getAllApartments, getStatusByLocation, saveInspectionLog,
};
