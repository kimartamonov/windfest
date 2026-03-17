import * as wmill from "windmill-client";

export async function main(
  role: any,
  project: any,
  context: any,
  priorArgs: any[]
) {
  const modelPolicy = await wmill.getResource("f/ic/resources/model_policy");
  const phaseConfig = modelPolicy?.phaseOverrides?.OPENING ?? {};
  const defaultConfig = modelPolicy?.default ?? {};

  const buildPrompt = await wmill.runScriptByPath("f/ic/scripts/build_role_prompt", {
    role,
    phase: "OPENING",
    project,
    context,
    priorArgs: priorArgs ?? [],
  });

  const llmResult = await wmill.runScriptByPath("f/ic/scripts/call_llm", {
    systemPrompt: buildPrompt.systemPrompt,
    userPrompt: buildPrompt.userPrompt,
    modelConfig: { ...defaultConfig, ...phaseConfig },
  });

  const argument = await wmill.runScriptByPath("f/ic/scripts/parse_role_output", {
    llmResult,
    agentId: role.id,
    argType: "OPENING",
  });

  return argument;
}
