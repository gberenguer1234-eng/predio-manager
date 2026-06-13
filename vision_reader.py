import json
import anthropic

client = anthropic.Anthropic()  # reads ANTHROPIC_API_KEY from env


def read_form_photo(image_data: str, media_type: str, apt: dict, environments: list) -> dict:
    """
    Send a photo of a filled checklist to Claude Vision and return detected statuses.

    Returns:
        {
          "message": "...",
          "updates": [
            {"environment_id": "cozinha", "task_index": 0, "status": "C"},
            ...
          ]
        }
    """
    # Build a compact reference table for Claude
    env_lines = []
    global_num = 1
    for env in environments:
        env_lines.append(f"\n=== {env['name']} (id: {env['id']}) ===")
        for i, task in enumerate(env["tasks"]):
            env_lines.append(f"  #{global_num:03d}  idx={i}  {task}")
            global_num += 1
    task_reference = "\n".join(env_lines)

    prompt = f"""Você está analisando uma FOTO de um formulário de checklist de obra impresso e preenchido à mão.

DADOS DO APARTAMENTO NO CABEÇALHO DO FORMULÁRIO:
- Andar: {apt['floor']}  |  Apartamento: {apt['number']}  |  Tipo: {apt['apt_type']}

REGRA DO FORMULÁRIO:
Cada tarefa tem 4 bolhas/círculos que o encarregado preenche com caneta:
  N = Não Iniciado  (círculo N preenchido/marcado)
  I = Incompleto    (círculo I preenchido/marcado)
  A = Ajuste        (círculo A preenchido/marcado)
  C = Concluído     (círculo C preenchido/marcado)

LISTA DE AMBIENTES E TAREFAS (use environment_id e task_index exatamente como listado):
{task_reference}

INSTRUÇÃO:
Analise cada linha do formulário na foto e identifique qual bolha está preenchida.
Retorne APENAS um JSON válido, sem explicações extras, no formato abaixo.
Inclua SOMENTE as tarefas com marcação claramente visível:

{{
  "message": "resumo do que foi encontrado",
  "updates": [
    {{"environment_id": "cozinha", "task_index": 0, "status": "C"}},
    {{"environment_id": "sala",    "task_index": 2, "status": "A"}}
  ]
}}

Se a imagem não for um checklist reconhecível, retorne:
{{"message": "Formulário não reconhecido", "updates": []}}
"""

    response = client.messages.create(
        model="claude-sonnet-4-6",
        max_tokens=4096,
        messages=[
            {
                "role": "user",
                "content": [
                    {
                        "type": "image",
                        "source": {
                            "type": "base64",
                            "media_type": media_type,
                            "data": image_data,
                        },
                    },
                    {"type": "text", "text": prompt},
                ],
            }
        ],
    )

    raw = response.content[0].text

    # Extract JSON safely
    try:
        start = raw.find("{")
        end = raw.rfind("}") + 1
        if start != -1 and end > start:
            return json.loads(raw[start:end])
    except Exception:
        pass

    return {"message": "Não foi possível interpretar a resposta da IA.", "updates": [], "raw": raw}
