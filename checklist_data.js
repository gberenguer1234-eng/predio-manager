// ─────────────────────────────────────────────────────────────────────────────
// Checklists por tipo de apartamento
// ─────────────────────────────────────────────────────────────────────────────

// ── Tarefas compartilhadas ────────────────────────────────────────────────────

const _COZINHA_AS_TASKS = [
  "Porcelanato", "Soleira", "Rejunte Piso", "Gesso", "Sanca de Gesso",
  "Selante", "Massa Corrida", "1ª Mão de Tinta", "Peitoril", "Bancada",
  "Rodopia", "Cuba", "Tanque Lava-Roupa", "Metais", "Rejunte Bancada",
  "Trilho Esquadria Janela", "Folha Esquadria Janela",
  "Trilho Esquadria Porta", "Folha Esquadria Porta",
  "Aduela Porta Principal", "Folha da Porta", "Alisares", "Fechaduras",
  "Rodapé", "Rejunte do Rodapé / Porta", "Acabamento Elétrica",
];

const _VARANDA_TASKS = [
  "Porcelanato Piso", "Chapim", "Ralo Linear", "Rejunte",
  "Revestimento Parede", "Rejunte Parede", "Mastique",
  "Caixa Elétrica (Varanda)", "Sarrafo / Cantoneira", "Bancada",
  "Rodopia", "Cuba", "Rejunte da Bancada", "Forro de Gesso",
  "Iluminação da Varanda", "Metais", "Pontalete Guarda-Corpo", "Guarda-Corpo",
];

const _BANHEIRO_BASCULANTE_TASKS = [
  "Porcelanato Piso", "Porcelanato Parede", "Soleira / Filete", "Ralos",
  "Rejunte", "Cantoneira Box", "Forro Gesso", "Sarrafo / Cantoneira",
  "Peitoril", "Bancada", "Rodopia", "Cuba", "Rejunte da Bancada", "Vaso",
  "Trilho Esquadria Basculante", "Folha Esquadria Basculante",
  "Aduela Porta", "Folha da Porta", "Alisares", "Fechaduras",
  "Rejunte Camurça", "Metais", "Acabamento Elétrico",
];

const _BANHEIRO_SEM_BASCULANTE_TASKS = [
  "Porcelanato Piso", "Porcelanato Parede", "Soleira / Filete", "Ralos",
  "Rejunte", "Cantoneira Box", "Forro Gesso", "Sarrafo / Cantoneira",
  "Peitoril", "Bancada", "Rodopia", "Cuba", "Rejunte da Bancada", "Vaso",
  "Aduela Porta", "Folha da Porta", "Alisares", "Fechaduras",
  "Rejunte Camurça", "Metais", "Acabamento Elétrico",
];

// ── STANDARD — Apts 03-07, 10-13, 15-22, 24-27 ───────────────────────────────
const ENVIRONMENTS_STANDARD = [
  {
    id: "cozinha_sala_quarto", name: "Cozinha / Sala / Quarto", emoji: "🏠",
    tasks: [
      "Porcelanato", "Soleira", "Rejunte Piso", "Gesso", "Sanca de Gesso",
      "Selante", "Massa Corrida", "1ª Mão de Tinta", "Bancada", "Rodopia",
      "Cuba", "Metais", "Rejunte Bancada", "Trilho Esquadria",
      "Folha Esquadria", "Aduela Porta Principal", "Folha da Porta",
      "Alisares", "Fechaduras", "Rodapé",
      "Rejunte do Rodapé / Porta", "Acabamento Elétrica",
    ],
  },
  {
    id: "banheiro", name: "Banheiro", emoji: "🚿",
    tasks: [
      "Porcelanato Piso", "Porcelanato Parede", "Soleira / Filete", "Ralos",
      "Rejunte", "Cantoneira Box", "Forro Gesso", "Exaustor",
      "Sarrafo / Cantoneira", "Bancada", "Rodopia", "Cuba",
      "Rejunte da Bancada", "Vaso", "Aduela Porta", "Folha da Porta",
      "Alisares", "Fechaduras", "Rejunte Camurça", "Metais",
      "Acabamento Elétrico",
    ],
  },
  { id: "varanda", name: "Varanda", emoji: "🌿", tasks: _VARANDA_TASKS },
];

// ── TYPE A — Apts 01, 02, 08, 09 (4 seções) ──────────────────────────────────
const ENVIRONMENTS_A = [
  {
    id: "cozinha_as_sala", name: "Cozinha / Área de Serv. / Sala", emoji: "🍳",
    tasks: _COZINHA_AS_TASKS,
  },
  {
    id: "quartos", name: "Quartos", emoji: "🛏️",
    tasks: [
      "Porcelanato", "Gesso", "Sanca de Gesso", "Peitoril",
      "Trilho Esquadria Janela", "Folha Esquadria Janela",
      "Trilho Esquadria Porta", "Folha Esquadria Porta",
      "Aduela Porta Principal", "Folha da Porta", "Alisar", "Fechadura",
      "Rodapé", "Rejunte do Rodapé / Porta", "Acabamento Elétrica",
    ],
  },
  { id: "banheiro_a", name: "Banheiro", emoji: "🚿", tasks: _BANHEIRO_BASCULANTE_TASKS },
  { id: "varanda",    name: "Varanda",  emoji: "🌿", tasks: _VARANDA_TASKS },
];

// ── TYPE B — Apt 14 (3 seções, banheiro com basculante) ──────────────────────
const ENVIRONMENTS_B = [
  {
    id: "cozinha_as_sala_quarto", name: "Cozinha / Área de Serv. / Sala / Quarto", emoji: "🍳",
    tasks: _COZINHA_AS_TASKS,
  },
  { id: "banheiro_b", name: "Banheiro", emoji: "🚿", tasks: _BANHEIRO_BASCULANTE_TASKS },
  { id: "varanda",    name: "Varanda",  emoji: "🌿", tasks: _VARANDA_TASKS },
];

// ── TYPE C — Apt 23 (3 seções, banheiro sem basculante) ──────────────────────
const ENVIRONMENTS_C = [
  {
    id: "cozinha_as_sala_quarto", name: "Cozinha / Área de Serv. / Sala / Quarto", emoji: "🍳",
    tasks: _COZINHA_AS_TASKS,
  },
  { id: "banheiro_c", name: "Banheiro", emoji: "🚿", tasks: _BANHEIRO_SEM_BASCULANTE_TASKS },
  { id: "varanda",    name: "Varanda",  emoji: "🌿", tasks: _VARANDA_TASKS },
];

// ── Roteamento por número de apartamento ──────────────────────────────────────
function getEnvironments(aptNumber) {
  if ([1, 2, 8, 9].includes(aptNumber))  return ENVIRONMENTS_A;
  if (aptNumber === 14)                   return ENVIRONMENTS_B;
  if (aptNumber === 23)                   return ENVIRONMENTS_C;
  return ENVIRONMENTS_STANDARD;
}

function getTotalTasks(aptNumber) {
  return getEnvironments(aptNumber).reduce((s, e) => s + e.tasks.length, 0);
}

// ── Status ────────────────────────────────────────────────────────────────────
const STATUS = {
  N: { label: "Não Iniciado", color: "#374151", bg: "#f3f4f6", border: "#9ca3af" },
  I: { label: "Incompleto",   color: "#1d4ed8", bg: "#dbeafe", border: "#60a5fa" },
  A: { label: "Ajuste",       color: "#92400e", bg: "#fef3c7", border: "#fbbf24" },
  C: { label: "Concluído",    color: "#15803d", bg: "#dcfce7", border: "#4ade80" },
  R: { label: "Reajuste",     color: "#6d28d9", bg: "#ede9fe", border: "#a78bfa" },
};

const APARTMENT_TYPES = ["C", "D", "E", "F", "G"];
const NUM_FLOORS      = 15;
const APTS_PER_FLOOR  = 27;

// TOTAL_TASKS mantido para compatibilidade (usa standard como base)
const TOTAL_TASKS = getTotalTasks(3);

// ── Helpers para o filtro por tarefa ─────────────────────────────────────────

// Retorna lista ordenada de todos os nomes de tarefas únicos em todos os tipos
function getAllUniqueTasks() {
  const allEnvs = [
    ...ENVIRONMENTS_STANDARD,
    ...ENVIRONMENTS_A,
    ...ENVIRONMENTS_B,
    ...ENVIRONMENTS_C,
  ];
  const seen = new Set();
  for (const env of allEnvs) {
    for (const task of env.tasks) seen.add(task);
  }
  return [...seen].sort((a, b) => a.localeCompare(b, "pt"));
}

// Para um nome de tarefa e número de apartamento, retorna onde ela está (env_id + índice)
function findTaskLocations(taskName, aptNumber) {
  const envs = getEnvironments(aptNumber);
  const results = [];
  for (const env of envs) {
    const idx = env.tasks.indexOf(taskName);
    if (idx !== -1) results.push({ environment_id: env.id, task_index: idx });
  }
  return results;
}

module.exports = {
  ENVIRONMENTS: ENVIRONMENTS_STANDARD, // compatibilidade
  getEnvironments, getTotalTasks,
  getAllUniqueTasks, findTaskLocations,
  STATUS, APARTMENT_TYPES, NUM_FLOORS, APTS_PER_FLOOR, TOTAL_TASKS,
};
