import * as wmill from "windmill-client";

export async function main(
  contradictions: any[],
  allArgs: any[],
  votes: any,
  project: any,
  context: any
) {
  const modelPolicy = await wmill.getResource("f/ic/resources/model_policy");
  const promptCatalog = await wmill.getResource("f/ic/resources/prompt_catalog");
  const defaultConfig = modelPolicy?.default ?? {};
  const dialecticConfig = { ...defaultConfig, ...(modelPolicy?.phaseOverrides?.DIALECTIC ?? {}) };

  if (!contradictions || contradictions.length === 0) {
    return {
      kind: "ventureos.ic.dialectic_synthesis",
      syntheses: [],
      conditions: [],
      message: "Нет противоречий для синтеза.",
      tokensUsed: 0,
    };
  }

  const contradictionsSummary = contradictions
    .map((c: any, i: number) =>
      `${i + 1}. [${c.dimension}] Тезис (${c.thesis?.agentId}): «${c.thesis?.text}» | Антитезис (${c.antithesis?.agentId}): «${c.antithesis?.text}» | Severity: ${c.severity?.toFixed(2)}`
    )
    .join("\n");

  const debateHistory = (allArgs ?? [])
    .slice(-10)
    .map((a: any) => `[${a.agentId}/${a.type}]: ${a.text}`)
    .join("\n");

  const dialecticRole = {
    id: "dialectic",
    name: "Диалектик",
    systemPrompt: "Ты — диалектик инвесткомитета. Находи пары тезис-антитезис и предлагай конкретный синтез через T-схему Переслегина. Каждый синтез должен превращаться в конкретное условие сделки.",
  };

  let userPrompt = promptCatalog?.templates?.DIALECTIC?.user ?? "";
  userPrompt = userPrompt
    .replace("{{contradictions}}", contradictionsSummary)
    .replace("{{debateHistory}}", debateHistory);

  const llmResult = await wmill.runScriptByPath("f/ic/scripts/call_llm", {
    systemPrompt: dialecticRole.systemPrompt,
    userPrompt,
    modelConfig: dialecticConfig,
  });

  let syntheses: any[] = [];
  try {
    const raw = JSON.parse(llmResult.raw.match(/\{[\s\S]*\}/)?.[0] ?? "{}");
    syntheses = raw.syntheses ?? [];
  } catch {
    syntheses = [];
  }

  // Extract conditions from syntheses
  const conditions = syntheses
    .filter((s: any) => s.condition)
    .map((s: any) => ({
      type: s.conditionType ?? "MILESTONE",
      proposedBy: "dialectic",
      priority: s.priority ?? "HIGH",
      text: s.condition?.text ?? s.synthesis ?? "",
      metric: s.condition?.metric ?? s.dimension ?? "",
      threshold: s.condition?.threshold ?? null,
      deadline: s.condition?.deadline ?? null,
    }));

  return {
    kind: "ventureos.ic.dialectic_synthesis",
    syntheses,
    conditions,
    tokensUsed: llmResult.tokensUsed,
  };
}
