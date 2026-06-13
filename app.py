import os
import json
import base64

from flask import Flask, render_template, request, jsonify, redirect, url_for
from werkzeug.utils import secure_filename

import db
import checklist_data as data
from vision_reader import read_form_photo

# ── Load .env if present ──────────────────────────────────────────────────────
try:
    from dotenv import load_dotenv
    load_dotenv()
except ImportError:
    pass

UPLOAD_FOLDER = os.path.join(os.path.dirname(__file__), "uploads")
ALLOWED_EXT = {"jpg", "jpeg", "png", "webp", "heic"}
MEDIA_TYPES = {
    "jpg": "image/jpeg", "jpeg": "image/jpeg",
    "png": "image/png", "webp": "image/webp", "heic": "image/jpeg",
}

app = Flask(__name__)
app.config["MAX_CONTENT_LENGTH"] = 20 * 1024 * 1024  # 20 MB

os.makedirs(UPLOAD_FOLDER, exist_ok=True)
db.init_db()


# ── Helpers ───────────────────────────────────────────────────────────────────

def _pct(completed, total):
    return int(completed / total * 100) if total > 0 else 0


def _allowed(filename):
    return "." in filename and filename.rsplit(".", 1)[-1].lower() in ALLOWED_EXT


# ── Routes ────────────────────────────────────────────────────────────────────

@app.route("/")
def dashboard():
    raw = db.get_all_progress()
    total = data.TOTAL_TASKS

    # Group by floor
    floors_map = {}
    for row in raw:
        f = row["floor"]
        if f not in floors_map:
            floors_map[f] = []
        floors_map[f].append({
            "id":        row["id"],
            "number":    row["number"],
            "apt_type":  row["apt_type"],
            "completed": row["completed"],
            "total":     total,
            "pct":       _pct(row["completed"], total),
        })

    floor_data = [
        {"floor": f, "apartments": floors_map[f]}
        for f in sorted(floors_map.keys(), reverse=True)
    ]

    overall_done  = sum(r["completed"] for r in raw)
    overall_total = total * len(raw)

    return render_template(
        "dashboard.html",
        floor_data=floor_data,
        overall_done=overall_done,
        overall_total=overall_total,
        overall_pct=_pct(overall_done, overall_total),
        num_floors=data.NUM_FLOORS,
        apts_per_floor=data.APTS_PER_FLOOR,
    )


@app.route("/apartment/<int:floor>/<int:number>")
def apartment(floor, number):
    apt = db.get_apartment(floor, number)
    if not apt:
        return "Apartamento não encontrado", 404

    statuses = db.get_task_statuses(apt["id"])
    completed, total = db.get_apartment_progress(apt["id"])

    envs = []
    for env in data.ENVIRONMENTS:
        tasks = []
        env_done = 0
        for i, task_name in enumerate(env["tasks"]):
            key = f"{env['id']}_{i}"
            s = statuses.get(key, "N")
            if s == "C":
                env_done += 1
            tasks.append({"index": i, "name": task_name, "status": s})
        envs.append({**env, "tasks": tasks, "completed": env_done, "total": len(env["tasks"])})

    return render_template(
        "apartment.html",
        apt=dict(apt),
        floor=floor,
        number=number,
        environments=envs,
        STATUS=data.STATUS,
        completed=completed,
        total=total,
        pct=_pct(completed, total),
        apt_types=data.APARTMENT_TYPES,
    )


@app.route("/api/status", methods=["POST"])
def api_set_status():
    body = request.get_json(force=True)
    apt_id = body.get("apartment_id")
    env_id = body.get("environment_id")
    idx    = body.get("task_index")
    status = body.get("status")

    if status not in data.STATUS:
        return jsonify({"error": "Status inválido"}), 400

    db.set_task_status(apt_id, env_id, idx, status)
    done, total = db.get_apartment_progress(apt_id)
    return jsonify({"ok": True, "completed": done, "total": total, "pct": _pct(done, total)})


@app.route("/api/update-type", methods=["POST"])
def api_update_type():
    body = request.get_json(force=True)
    floor    = body.get("floor")
    number   = body.get("number")
    apt_type = body.get("type")
    if apt_type not in data.APARTMENT_TYPES:
        return jsonify({"error": "Tipo inválido"}), 400
    db.update_apartment_type(floor, number, apt_type)
    return jsonify({"ok": True})


@app.route("/api/notes/<int:apt_id>", methods=["POST"])
def api_notes(apt_id):
    body = request.get_json(force=True)
    db.update_apartment_notes(apt_id, body.get("notes", ""))
    return jsonify({"ok": True})


@app.route("/api/upload-photo/<int:apt_id>", methods=["POST"])
def api_upload_photo(apt_id):
    if "photo" not in request.files:
        return jsonify({"error": "Nenhuma foto enviada"}), 400
    file = request.files["photo"]
    if not file or not _allowed(file.filename):
        return jsonify({"error": "Tipo de arquivo inválido (use jpg, png ou webp)"}), 400

    filename = secure_filename(f"apt{apt_id}_{file.filename}")
    filepath = os.path.join(UPLOAD_FOLDER, filename)
    file.save(filepath)

    ext = filename.rsplit(".", 1)[-1].lower()
    media_type = MEDIA_TYPES.get(ext, "image/jpeg")

    with open(filepath, "rb") as f:
        img_b64 = base64.standard_b64encode(f.read()).decode("utf-8")

    apt = db.get_apartment_by_id(apt_id)
    if not apt:
        return jsonify({"error": "Apartamento não encontrado"}), 404

    try:
        result = read_form_photo(img_b64, media_type, dict(apt), data.ENVIRONMENTS)

        applied = 0
        for upd in result.get("updates", []):
            env_id = upd.get("environment_id")
            idx    = upd.get("task_index")
            status = upd.get("status")
            if env_id and idx is not None and status in data.STATUS:
                db.set_task_status(apt_id, env_id, idx, status)
                applied += 1

        db.save_inspection_log(apt_id, filepath, json.dumps(result, ensure_ascii=False))
        msg = result.get("message", f"{applied} tarefas atualizadas")
        return jsonify({"ok": True, "updates_applied": applied, "message": msg})

    except Exception as exc:
        db.save_inspection_log(apt_id, filepath, str(exc), result_status="error")
        return jsonify({"error": str(exc)}), 500


@app.route("/print/<int:floor>/<int:number>")
def print_form(floor, number):
    apt = db.get_apartment(floor, number)
    if not apt:
        return "Apartamento não encontrado", 404
    statuses = db.get_task_statuses(apt["id"])
    return render_template(
        "print_form.html",
        apt=dict(apt),
        floor=floor,
        number=number,
        environments=data.ENVIRONMENTS,
        statuses_db=statuses,
        STATUS=data.STATUS,
    )


if __name__ == "__main__":
    print("\n🏗️  Gestão de Obra — iniciando servidor...")
    print("   Acesse: http://localhost:5000\n")
    app.run(debug=True, port=5000)
