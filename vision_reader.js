const Anthropic = require("@anthropic-ai/sdk");

const client = new Anthropic(); // reads ANTHROPIC_API_KEY from env

async function readFormPhoto(imageBase64, mediaType, apt, environments) {
  // Build compact task reference
  const lines = [];
  let globalNum = 1;
  for (const env of environments) {
    lines.push(`\n=== ${env.name} (id: ${env.id}) ===`);
    env.tasks.forEach((task, i) => {
      lines.push(`  #${String(globalNum).padStart(3, "0")}  idx=${i}  ${task}`);
      globalNum++;
    });
  }
  const taskReference = lines.join("\n");

  const prompt = `Você está analisando uma FOTO de um formulário de checklist de obra impresso e preenchido à mão.

DADOS DO APARTAMENTO NO CABEÇALHO DO FORMULÁRIO:
- Andar: ${apt.floor}  |  Apartamento: ${apt.number}  |  Tipo: ${apt.apt_type}

REGRA DO FORMULÁRIO:
Cada tarefa tem 4 bolhas/círculos que o encarregado preenche com caneta:
  N = Não Iniciado  (círculo N preenchido/marcado)
  I = Incompleto    (círculo I preenchido/marcado)
  A = Ajuste        (círculo A preenchido/marcado)
  C = Concluído     (círculo C preenchido/marcado)

LISTA DE AMBIENTES E TAREFAS (use environment_id e task_index exatamente como listado):
${taskReference}

INSTRUÇÃO:
Analise cada linha do formulário na foto e identifique qual bolha está preenchida.
Retorne APENAS um JSON válido, sem explicações extras, no formato abaixo.
Inclua SOMENTE as tarefas com marcação claramente visível:

{
  "message": "resumo do que foi encontrado",
  "updates": [
    {"environment_id": "cozinha", "task_index": 0, "status": "C"},
    {"environment_id": "sala",    "task_index": 2, "status": "A"}
  ]
}

Se a imagem não for um checklist reconhecível, retorne:
{"message": "Formulário não reconhecido", "updates": []}`;

  const response = await client.messages.create({
    model: "claude-sonnet-4-6",
    max_tokens: 4096,
    messages: [
      {
        role: "user",
        content: [
          {
            type: "image",
            source: { type: "base64", media_type: mediaType, data: imageBase64 },
          },
          { type: "text", text: prompt },
        ],
      },
    ],
  });

  const raw = response.content[0].text;

  try {
    const start = raw.indexOf("{");
    const end   = raw.lastIndexOf("}") + 1;
    if (start !== -1 && end > start) {
      return JSON.parse(raw.slice(start, end));
    }
  } catch (_) {}

  return { message: "Não foi possível interpretar a resposta da IA.", updates: [], raw };
}

module.exports = { readFormPhoto };
