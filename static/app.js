/* ── Tab switching ─────────────────────────────────────────────────────────── */
function showTab(envId) {
  document.querySelectorAll(".env-panel").forEach((p) => p.classList.add("hidden"));
  document.querySelectorAll(".tab-btn").forEach((b) => {
    b.classList.remove("border-blue-500", "text-blue-600", "bg-white");
    b.classList.add("border-transparent", "text-slate-500");
  });

  document.getElementById("panel-" + envId).classList.remove("hidden");
  const tab = document.getElementById("tab-" + envId);
  tab.classList.add("border-blue-500", "text-blue-600", "bg-white");
  tab.classList.remove("border-transparent", "text-slate-500");
}

/* ── Status colours ────────────────────────────────────────────────────────── */
const STATUS_STYLE = {
  N: { bg: "#f3f4f6", border: "#9ca3af", color: "#4b5563" },
  I: { bg: "#dbeafe", border: "#60a5fa", color: "#1d4ed8" },
  A: { bg: "#fef3c7", border: "#fbbf24", color: "#92400e" },
  C: { bg: "#dcfce7", border: "#4ade80", color: "#15803d" },
  R: { bg: "#ede9fe", border: "#a78bfa", color: "#6d28d9" },
};

/* ── Set a single task status ──────────────────────────────────────────────── */
function setStatus(aptId, envId, taskIdx, status) {
  // Optimistic UI update
  ["N", "I", "A", "C", "R"].forEach((s) => {
    const btn = document.getElementById(`btn-${envId}-${taskIdx}-${s}`);
    if (!btn) return;
    if (s === status) {
      const st = STATUS_STYLE[s];
      btn.style.background   = st.bg;
      btn.style.borderColor  = st.border;
      btn.style.color        = st.color;
      btn.style.outline      = `2px solid ${st.border}`;
      btn.style.outlineOffset = "1px";
    } else {
      btn.style.background   = "white";
      btn.style.borderColor  = "#e2e8f0";
      btn.style.color        = "#cbd5e1";
      btn.style.outline      = "none";
    }
  });

  fetch("/api/status", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      apartment_id:   aptId,
      environment_id: envId,
      task_index:     taskIdx,
      status:         status,
    }),
  })
    .then((r) => r.json())
    .then((data) => {
      if (data.ok) {
        updateOverallProgress(data.pct, data.completed, data.total);
        refreshEnvCount(envId);
      }
    })
    .catch((err) => console.error("Erro ao salvar status:", err));
}

/* ── Update the overall progress bar ──────────────────────────────────────── */
function updateOverallProgress(pct, completed, total) {
  const bar   = document.getElementById("progress-bar");
  const label = document.getElementById("pct-label");
  const prog  = document.getElementById("progress-label");
  if (!bar) return;

  bar.style.width = pct + "%";
  if (label) label.textContent = pct + "%";
  if (prog)  prog.textContent  = `${completed}/${total} tarefas concluídas (${pct}%)`;

  bar.className = "h-3 rounded-full transition-all duration-500 " +
    (pct === 100 ? "bg-green-500" : pct >= 50 ? "bg-blue-500" : "bg-yellow-400");
}

/* ── Refresh mini progress bar for one environment ─────────────────────────── */
function refreshEnvCount(envId) {
  const panel = document.getElementById("panel-" + envId);
  if (!panel) return;

  const total = typeof ENV_TOTALS !== "undefined" ? ENV_TOTALS[envId] : null;
  if (!total) return;

  // Count "C" buttons that are currently active (selected)
  let done = 0;
  for (let i = 0; i < total; i++) {
    const btn = document.getElementById(`btn-${envId}-${i}-C`);
    if (btn && btn.style.background !== "white" && btn.style.background !== "") {
      done++;
    }
  }

  const miniLabel  = document.getElementById("mini-" + envId);
  const miniBar    = document.getElementById("minibar-" + envId);
  const tabCount   = document.getElementById("tab-count-" + envId);
  const pct        = total > 0 ? Math.round((done / total) * 100) : 0;

  if (miniLabel) miniLabel.textContent = `${done}/${total}`;
  if (miniBar)   miniBar.style.width   = pct + "%";

  if (tabCount) {
    tabCount.textContent = `${done}/${total}`;
    tabCount.className = "text-xs px-1.5 py-0.5 rounded-full " +
      (done === total
        ? "bg-green-100 text-green-700"
        : done > 0
        ? "bg-blue-100 text-blue-700"
        : "bg-slate-200 text-slate-500");
  }
}

/* ── Mark all tasks in an environment ─────────────────────────────────────── */
function markAllEnv(envId, status) {
  const label = status === "C" ? "Concluído" : "Não Iniciado";
  if (!confirm(`Marcar TODAS as tarefas de "${envId}" como "${label}"?`)) return;

  const total = typeof ENV_TOTALS !== "undefined" ? ENV_TOTALS[envId] : 0;
  for (let i = 0; i < total; i++) {
    setStatus(APT_ID, envId, i, status);
  }
}

/* ── Sync R button style on page load ─────────────────────────────────────── */
document.addEventListener("DOMContentLoaded", function () {
  document.querySelectorAll(".status-btn").forEach(function (btn) {
    const id = btn.id; // btn-envId-taskIdx-STATUS
    const parts = id.split("-");
    const s = parts[parts.length - 1];
    if (btn.style.outline && btn.style.outline !== "none" && btn.style.outline !== "") {
      // already active — ensure R is also handled (server-rendered inline styles cover it)
    }
  });
});

/* ── Upload photo for AI reading ──────────────────────────────────────────── */
async function uploadPhoto(input) {
  const file = input.files[0];
  if (!file) return;

  const msgDiv = document.getElementById("upload-msg");
  if (msgDiv) {
    msgDiv.className =
      "mb-4 p-3 rounded-lg text-sm font-medium bg-blue-50 text-blue-700 border border-blue-200";
    msgDiv.textContent = "📷 Enviando foto e processando com IA… Aguarde alguns segundos.";
    msgDiv.classList.remove("hidden");
  }

  const formData = new FormData();
  formData.append("photo", file);

  try {
    const resp = await fetch(`/api/upload-photo/${APT_ID}`, {
      method: "POST",
      body: formData,
    });
    const result = await resp.json();

    if (result.ok) {
      if (msgDiv) {
        msgDiv.className =
          "mb-4 p-3 rounded-lg text-sm font-medium bg-green-50 text-green-700 border border-green-200";
        msgDiv.textContent = `✅ ${result.message}. Atualizando página…`;
      }
      setTimeout(() => window.location.reload(), 1800);
    } else {
      if (msgDiv) {
        msgDiv.className =
          "mb-4 p-3 rounded-lg text-sm font-medium bg-red-50 text-red-700 border border-red-200";
        msgDiv.textContent = `❌ Erro: ${result.error}`;
      }
    }
  } catch (err) {
    if (msgDiv) {
      msgDiv.className =
        "mb-4 p-3 rounded-lg text-sm font-medium bg-red-50 text-red-700 border border-red-200";
      msgDiv.textContent = `❌ Falha na conexão: ${err.message}`;
    }
  }

  input.value = "";
}

/* ── Update apartment type ────────────────────────────────────────────────── */
async function updateType(type) {
  const resp = await fetch("/api/update-type", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ floor: FLOOR, number: NUMBER, type }),
  });
  const data = await resp.json();
  if (!data.ok) alert("Erro ao atualizar tipo do apartamento.");
}

/* ── Save notes ───────────────────────────────────────────────────────────── */
async function saveNotes(notes) {
  await fetch(`/api/notes/${APT_ID}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ notes }),
  });
}
