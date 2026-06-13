import sqlite3
from checklist_data import ENVIRONMENTS, NUM_FLOORS, APTS_PER_FLOOR, TOTAL_TASKS

DB_PATH = "predio.db"


def get_db():
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA journal_mode=WAL")
    return conn


def init_db():
    conn = get_db()
    c = conn.cursor()

    c.execute("""
        CREATE TABLE IF NOT EXISTS apartments (
            id       INTEGER PRIMARY KEY AUTOINCREMENT,
            floor    INTEGER NOT NULL,
            number   INTEGER NOT NULL,
            apt_type TEXT    NOT NULL DEFAULT 'C',
            notes    TEXT    DEFAULT '',
            UNIQUE(floor, number)
        )
    """)

    c.execute("""
        CREATE TABLE IF NOT EXISTS task_status (
            id           INTEGER PRIMARY KEY AUTOINCREMENT,
            apartment_id INTEGER NOT NULL REFERENCES apartments(id),
            environment_id TEXT  NOT NULL,
            task_index   INTEGER NOT NULL,
            status       TEXT    NOT NULL DEFAULT 'N',
            updated_at   TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            UNIQUE(apartment_id, environment_id, task_index)
        )
    """)

    c.execute("""
        CREATE TABLE IF NOT EXISTS inspection_logs (
            id           INTEGER PRIMARY KEY AUTOINCREMENT,
            apartment_id INTEGER NOT NULL REFERENCES apartments(id),
            photo_path   TEXT,
            ai_response  TEXT,
            result_status TEXT DEFAULT 'pending',
            created_at   TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
    """)

    # Seed apartments if empty
    c.execute("SELECT COUNT(*) FROM apartments")
    if c.fetchone()[0] == 0:
        _default_type = {
            range(1, 6):   "C",
            range(6, 11):  "D",
            range(11, 17): "E",
            range(17, 23): "F",
            range(23, 28): "G",
        }
        rows = []
        for floor in range(1, NUM_FLOORS + 1):
            for num in range(1, APTS_PER_FLOOR + 1):
                apt_type = "C"
                for r, t in _default_type.items():
                    if num in r:
                        apt_type = t
                        break
                rows.append((floor, num, apt_type))
        c.executemany(
            "INSERT OR IGNORE INTO apartments (floor, number, apt_type) VALUES (?,?,?)",
            rows,
        )

    conn.commit()
    conn.close()


# ── Apartment queries ─────────────────────────────────────────────────────────

def get_apartment(floor, number):
    conn = get_db()
    row = conn.execute(
        "SELECT * FROM apartments WHERE floor=? AND number=?", (floor, number)
    ).fetchone()
    conn.close()
    return row


def get_apartment_by_id(apt_id):
    conn = get_db()
    row = conn.execute("SELECT * FROM apartments WHERE id=?", (apt_id,)).fetchone()
    conn.close()
    return row


def update_apartment_type(floor, number, apt_type):
    conn = get_db()
    conn.execute(
        "UPDATE apartments SET apt_type=? WHERE floor=? AND number=?",
        (apt_type, floor, number),
    )
    conn.commit()
    conn.close()


def update_apartment_notes(apt_id, notes):
    conn = get_db()
    conn.execute("UPDATE apartments SET notes=? WHERE id=?", (notes, apt_id))
    conn.commit()
    conn.close()


# ── Task-status queries ───────────────────────────────────────────────────────

def get_task_statuses(apartment_id):
    """Returns dict: 'env_id_taskidx' → status letter."""
    conn = get_db()
    rows = conn.execute(
        "SELECT environment_id, task_index, status FROM task_status WHERE apartment_id=?",
        (apartment_id,),
    ).fetchall()
    conn.close()
    return {f"{r['environment_id']}_{r['task_index']}": r["status"] for r in rows}


def set_task_status(apartment_id, environment_id, task_index, status):
    conn = get_db()
    conn.execute(
        """
        INSERT INTO task_status (apartment_id, environment_id, task_index, status)
        VALUES (?,?,?,?)
        ON CONFLICT(apartment_id, environment_id, task_index)
        DO UPDATE SET status=excluded.status, updated_at=CURRENT_TIMESTAMP
        """,
        (apartment_id, environment_id, task_index, status),
    )
    conn.commit()
    conn.close()


def get_apartment_progress(apartment_id):
    """Returns (completed, total)."""
    conn = get_db()
    completed = conn.execute(
        "SELECT COUNT(*) FROM task_status WHERE apartment_id=? AND status='C'",
        (apartment_id,),
    ).fetchone()[0]
    conn.close()
    return completed, TOTAL_TASKS


# ── Dashboard bulk query ──────────────────────────────────────────────────────

def get_all_progress():
    """
    Returns list of dicts with id, floor, number, apt_type, completed.
    Uses a single SQL query for performance.
    """
    conn = get_db()
    rows = conn.execute(
        """
        SELECT
            a.id, a.floor, a.number, a.apt_type,
            COUNT(CASE WHEN ts.status='C' THEN 1 END) AS completed
        FROM apartments a
        LEFT JOIN task_status ts ON ts.apartment_id = a.id
        GROUP BY a.id, a.floor, a.number, a.apt_type
        ORDER BY a.floor, a.number
        """
    ).fetchall()
    conn.close()
    return [dict(r) for r in rows]


# ── Inspection logs ───────────────────────────────────────────────────────────

def save_inspection_log(apartment_id, photo_path, ai_response, result_status="ok"):
    conn = get_db()
    conn.execute(
        """INSERT INTO inspection_logs
           (apartment_id, photo_path, ai_response, result_status)
           VALUES (?,?,?,?)""",
        (apartment_id, photo_path, ai_response, result_status),
    )
    conn.commit()
    conn.close()
