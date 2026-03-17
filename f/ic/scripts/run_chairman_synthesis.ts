import * as wmill from "windmill-client";

export async function main(
  allArgs: any[],
  votes: any,
  contradictions: any[],
  project: any,
  context: any
) {
  const modelPolicy = await wmill.getResource("f/ic/resources/model_policy");
  const promptCatalog = await wmill.getResource("f/ic/resources/prompt_catalog");
  const defaultConfig = modelPolicy?.default ?? {};
  const chairConfig = { ...defaultConfig, ...(modelPolicy?.phaseOverrides?.CHAIRMAN ?? {}) };

  const debateHistory = (allArgs ?? [])
    .slice(-12)
    .map((a: any) => `[${a.agentId}/${a.type}]: ${a.text} (stance: ${a.stance}, confidence: ${a.confidence})`)
    .join("\n");

  const contradictionsSummary = (contradictions ?? [])
    .map((c: any) => `- ${c.dimension}: «${c.thesis?.text}» vs «${c.antithesis?.text}» (severity: ${c.severity})`)
    .join("\n") || "Нет противоречий.";

  const votingSummary = `Агрегированный скор: ${votes?.aggregatedScore?.toFixed(3)}, Вердикт: ${votes?.verdict}\n` +
    (votes?.votes ?? [])
      .map((v: any) => `  - ${v.agentId}: score=${v.score?.toFixed(3)}, verdict=${v.verdict}`)
      .join("\n");

  const chairmanRole = {
    id: "chairman",
    name: "Председатель комитета",
    systemPrompt: "Ты — председатель инвесткомитета. Твоя задача — сформулировать финальный вердикт, обобщить все позиции, выделить ключевые условия и риски, определить следующие шаги.",
  };

  let userPrompt = promptCatalog?.templates?.CHAIRMAN?.user ?? "";
  userPrompt = userPrompt
    .replace("{{title}}", project.title ?? "")
    .replace("{{votingSummary}}", votingSummary)
    .replace("{{contradictions}}", contradictionsSummary)
    .replace("{{debateHistory}}", debateHistory);

  const llmResult = await wmill.runScriptByPath("f/ic/scripts/call_llm", {
    systemPrompt: chairmanRole.systemPrompt,
    userPrompt,
    modelConfig: chairConfig,
  });

  let chairmanOutput = llmResult.parsed ?? { text: llmResult.raw };

  // Try to extract structured chairman response
  try {
    const raw = JSON.parse(llmResult.raw.match(/\{[\s\S]*\}/)?.[0] ?? "{}");
    chairmanOutput = {
      text: raw.text ?? llmResult.raw,
      verdict: raw.verdict ?? votes?.verdict,
      conditions: raw.conditions ?? [],
      mainRisk: raw.mainRisk ?? "",
      nextSteps: raw.nextSteps ?? [],
    };
  } catch {
    // Use default parsed
  }

  return {
    kind: "ventureos.ic.chairman_synthesis",
    ...chairmanOutput,
    tokensUsed: llmResult.tokensUsed,
  };
}
