// ─────────────────────────────────────────────────────────────────────────────
// db.js — funciona em dois modos:
//   Produção  → DATABASE_URL (PostgreSQL no Neon)
//   Local     → arquivo SQLite via @libsql/client (file:predio.db)
// ─────────────────────────────────────────────────────────────────────────────

const path = require("path");
const fs   = require("fs");
const { NUM_FLOORS, APTS_PER_FLOOR } = require("./checklist_data");

// ── Detecta modo de operação ──────────────────────────────────────────────────
const USE_PG = !!process.env.DATABASE_URL;

// ── Modo PostgreSQL (Neon / Render produção) ──────────────────────────────────
let pgPool = null;
if (USE_PG) {
  const { Pool } = require("pg");
  pgPool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false },
  });
}

// Helper: converte ? para $1 $2 ... (padrão PostgreSQL)
function toQuery(sql, args) {
  if (!USE_PG) return { sql, args };
  let i = 0;
  const pgSql = sql.replace(/\?/g, () => `$${++i}`);
  return { sql: pgSql, args };
}

// ── Modo SQLite local (@libsql/client) ────────────────────────────────────────
let libClient = null;
if (!USE_PG) {
  const { createClient } = require("@libsql/client");
  const DB_URL = `file:${process.env.DB_PATH || path.join(__dirname, "predio.db")}`;
  const filePath = DB_URL.slice(5);
  fs.mkdirSync(path.dirname(path.resolve(filePath)), { recursive: true });
  libClient = createClient({ url: DB_URL });
}

// ── Função unificada de query ─────────────────────────────────────────────────
async function run(sql, args = []) {
  const q = toQuery(sql, args);
  if (USE_PG) {
    const r = await pgPool.query(q.sql, q.args);
    return { rows: r.rows, rowCount: r.rowCount };
  } else {
    const r = await libClient.execute({ sql: q.sql, args: q.args });
    return {
      rows: r.rows.map(row => {
        // libsql retorna Row objects — converter para plain objects
        const obj = {};
        for (const key of Object.keys(row)) obj[key] = row[key];
        return obj;
      }),
      rowCount: r.rowsAffected,
    };
  }
}

// ── Init (cria tabelas + seed) ────────────────────────────────────────────────
async function initDb() {
  if (USE_PG) {
    await pgPool.query(`
      CREATE TABLE IF NOT EXISTS apartments (
        id       SERIAL PRIMARY KEY,
        floor    INTEGER NOT NULL,
        number   INTEGER NOT NULL,
        apt_type TEXT    NOT NULL DEFAULT 'C',
        notes    TEXT    DEFAULT '',
        UNIQUE(floor, number)
      )
    `);
    await pgPool.query(`
      CREATE TABLE IF NOT EXISTS task_status (
        id             SERIAL PRIMARY KEY,
        apartment_id   INTEGER NOT NULL REFERENCES apartments(id),
        environment_id TEXT    NOT NULL,
        task_index     INTEGER NOT NULL,
        status         TEXT    NOT NULL DEFAULT 'N',
        updated_at     TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(apartment_id, environment_id, task_index)
      )
    `);
    await pgPool.query(`
      CREATE TABLE IF NOT EXISTS inspection_logs (
        id            SERIAL PRIMARY KEY,
        apartment_id  INTEGER NOT NULL REFERENCES apartments(id),
        photo_path    TEXT,
        ai_response   TEXT,
        result_status TEXT DEFAULT 'pending',
        created_at    TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);
  } else {
    await libClient.execute(`
      CREATE TABLE IF NOT EXISTS apartments (
        id       INTEGER PRIMARY KEY AUTOINCREMENT,
        floor    INTEGER NOT NULL,
        number   INTEGER NOT NULL,
        apt_type TEXT    NOT NULL DEFAULT 'C',
        notes    TEXT    DEFAULT '',
        UNIQUE(floor, number)
      )
    `);
    await libClient.execute(`
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
    await libClient.execute(`
      CREATE TABLE IF NOT EXISTS inspection_logs (
        id            INTEGER PRIMARY KEY AUTOINCREMENT,
        apartment_id  INTEGER NOT NULL REFERENCES apartments(id),
        photo_path    TEXT,
        ai_response   TEXT,
        result_status TEXT DEFAULT 'pending',
        created_at    TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);
  }

  // Seed: 405 apartamentos
  const countRes = await run("SELECT COUNT(*) AS n FROM apartments");
  const count = Number(countRes.rows[0].n);

  if (count === 0) {
    const typeMap = [[1,5,"C"],[6,10,"D"],[11,16,"E"],[17,22,"F"],[23,27,"G"]];
    for (let floor = 1; floor <= NUM_FLOORS; floor++) {
      for (let num = 1; num <= APTS_PER_FLOOR; num++) {
        const apt_type = typeMap.find(([lo, hi]) => num >= lo && num <= hi)?.[2] ?? "C";
        if (USE_PG) {
          await pgPool.query(
            "INSERT INTO apartments (floor, number, apt_type) VALUES ($1,$2,$3) ON CONFLICT DO NOTHING",
            [floor, num, apt_type]
          );
        } else {
          await libClient.execute({
            sql:  "INSERT OR IGNORE INTO apartments (floor, number, apt_type) VALUES (?,?,?)",
            args: [floor, num, apt_type],
          });
        }
      }
    }
  }
}

// ── Apartamentos ──────────────────────────────────────────────────────────────

async function getApartment(floor, number) {
  const r = await run("SELECT * FROM apartments WHERE floor=? AND number=?", [floor, number]);
  return r.rows[0] || null;
}

async function getApartmentById(id) {
  const r = await run("SELECT * FROM apartments WHERE id=?", [id]);
  return r.rows[0] || null;
}

async function updateApartmentType(floor, number, apt_type) {
  await run("UPDATE apartments SET apt_type=? WHERE floor=? AND number=?", [apt_type, floor, number]);
}

async function updateApartmentNotes(id, notes) {
  await run("UPDATE apartments SET notes=? WHERE id=?", [notes, id]);
}

// ── Task status ───────────────────────────────────────────────────────────────

async function getTaskStatuses(apartment_id) {
  const r = await run(
    "SELECT environment_id, task_index, status FROM task_status WHERE apartment_id=?",
    [apartment_id]
  );
  const map = {};
  for (const row of r.rows) map[`${row.environment_id}_${row.task_index}`] = row.status;
  return map;
}

async function setTaskStatus(apartment_id, environment_id, task_index, status) {
  if (USE_PG) {
    await pgPool.query(`
      INSERT INTO task_status (apartment_id, environment_id, task_index, status)
      VALUES ($1,$2,$3,$4)
      ON CONFLICT(apartment_id, environment_id, task_index)
      DO UPDATE SET status=EXCLUDED.status, updated_at=CURRENT_TIMESTAMP
    `, [apartment_id, environment_id, task_index, status]);
  } else {
    await libClient.execute({
      sql: `
        INSERT INTO task_status (apartment_id, environment_id, task_index, status)
        VALUES (?,?,?,?)
        ON CONFLICT(apartment_id, environment_id, task_index)
        DO UPDATE SET status=excluded.status, updated_at=CURRENT_TIMESTAMP
      `,
      args: [apartment_id, environment_id, task_index, status],
    });
  }
}

async function getCompletedCount(apartment_id) {
  const r = await run(
    "SELECT COUNT(*) AS n FROM task_status WHERE apartment_id=? AND status='C'",
    [apartment_id]
  );
  return Number(r.rows[0].n);
}

async function getApartmentProgress(apartment_id, total) {
  const completed = await getCompletedCount(apartment_id);
  return { completed, total: total ?? completed };
}

// ── Dashboard / Filtro ────────────────────────────────────────────────────────

async function getAllProgress() {
  const r = await run(`
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
  const r = await run(
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
  const r = await run(
    "SELECT apartment_id, status FROM task_status WHERE environment_id=? AND task_index=?",
    [environment_id, task_index]
  );
  return r.rows.map(row => ({
    apartment_id: Number(row.apartment_id),
    status:       row.status,
  }));
}

// ── Logs ──────────────────────────────────────────────────────────────────────

async function saveInspectionLog(apartment_id, photo_path, ai_response, result_status = "ok") {
  await run(
    "INSERT INTO inspection_logs (apartment_id, photo_path, ai_response, result_status) VALUES (?,?,?,?)",
    [apartment_id, photo_path, ai_response, result_status]
  );
}

module.exports = {
  initDb, getApartment, getApartmentById,
  updateApartmentType, updateApartmentNotes,
  getTaskStatuses, setTaskStatus, getCompletedCount, getApartmentProgress,
  getAllProgress, getAllApartments, getStatusByLocation, saveInspectionLog,
};
