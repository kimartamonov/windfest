import * as wmill from "windmill-client";

export async function main(
  role: any,
  project: any,
  context: any,
  allArgs: any[],
  contradictions: any[],
  debateGraph: any
) {
  const modelPolicy = await wmill.getResource("f/ic/resources/model_policy");
  const defaultConfig = modelPolicy?.default ?? {};
  const synthConfig = { ...defaultConfig, ...(modelPolicy?.phaseOverrides?.SYNTHESIS ?? {}) };

  const contradictionsSummary = (contradictions ?? [])
    .map((c: any) => `- ${c.dimension}: «${c.thesis?.text}» vs «${c.antithesis?.text}»`)
    .join("\n") || "Нет явных противоречий.";

  const enrichedContext = {
    ...context,
    contradictions,
    contradictionsSummary,
  };

  const buildPrompt = await wmill.runScriptByPath("f/ic/scripts/build_role_prompt", {
    role,
    phase: "SYNTHESIS",
    project,
    context: enrichedContext,
    priorArgs: allArgs ?? [],
  });

  // Inject contradictions into the user prompt
  let userPrompt = buildPrompt.userPrompt;
  if (userPrompt.includes("{{contradictions}}")) {
    userPrompt = userPrompt.replace("{{contradictions}}", contradictionsSummary);
  }

  const llmResult = await wmill.runScriptByPath("f/ic/scripts/call_llm", {
    systemPrompt: buildPrompt.systemPrompt,
    userPrompt,
    modelConfig: synthConfig,
  });

  const argument = await wmill.runScriptByPath("f/ic/scripts/parse_role_output", {
    llmResult,
    agentId: role.id,
    argType: "SYNTHESIS",
  });

  return argument;
}
