import * as wmill from "windmill-client";

export async function main(
  roles: any[],
  project: any,
  context: any,
  allArgs: any[],
  roundIndex: number
) {
  const modelPolicy = await wmill.getResource("f/ic/resources/model_policy");
  const defaultConfig = modelPolicy?.default ?? {};
  const challengeConfig = { ...defaultConfig, ...(modelPolicy?.phaseOverrides?.CHALLENGE ?? {}) };
  const counterConfig = { ...defaultConfig, ...(modelPolicy?.phaseOverrides?.COUNTER ?? {}) };

  const newArgs: any[] = [];
  const currentArgs = [...(allArgs ?? [])];

  for (const role of roles) {
    // Find a target argument from another agent with opposing stance
    const opposingArgs = currentArgs.filter(
      (a) => a.agentId !== role.id && a.stance !== getLatestStance(currentArgs, role.id)
    );

    if (opposingArgs.length === 0) continue;

    // Pick strongest opposing argument
    const target = opposingArgs.reduce((best, a) =>
      (a.strength ?? 0) > (best.strength ?? 0) ? a : best
    );

    // Generate CHALLENGE
    const challengePrompt = await wmill.runScriptByPath("f/ic/scripts/build_role_prompt", {
      role,
      phase: "CHALLENGE",
      project,
      context,
      priorArgs: currentArgs.slice(-6),
      targetArg: { agentId: target.agentId, text: target.text },
    });

    const challengeResult = await wmill.runScriptByPath("f/ic/scripts/call_llm", {
      systemPrompt: challengePrompt.systemPrompt,
      userPrompt: challengePrompt.userPrompt,
      modelConfig: challengeConfig,
    });

    const challengeArg = await wmill.runScriptByPath("f/ic/scripts/parse_role_output", {
      llmResult: challengeResult,
      agentId: role.id,
      argType: "CHALLENGE",
      targetArgId: target.id,
    });

    currentArgs.push(challengeArg);
    newArgs.push(challengeArg);

    // Generate COUNTER from the target agent
    const targetRole = roles.find((r) => r.id === target.agentId);
    if (!targetRole) continue;

    const counterPrompt = await wmill.runScriptByPath("f/ic/scripts/build_role_prompt", {
      role: targetRole,
      phase: "COUNTER",
      project,
      context,
      priorArgs: currentArgs.slice(-6),
      targetArg: {
        agentId: target.agentId,
        text: target.text,
        challengerAgent: role.id,
        challengeText: challengeArg.text,
      },
    });

    const counterResult = await wmill.runScriptByPath("f/ic/scripts/call_llm", {
      systemPrompt: counterPrompt.systemPrompt,
      userPrompt: counterPrompt.userPrompt,
      modelConfig: counterConfig,
    });

    const counterArg = await wmill.runScriptByPath("f/ic/scripts/parse_role_output", {
      llmResult: counterResult,
      agentId: targetRole.id,
      argType: "COUNTER",
      targetArgId: challengeArg.id,
    });

    currentArgs.push(counterArg);
    newArgs.push(counterArg);
  }

  return {
    allArgs: currentArgs,
    newArgs,
    roundIndex,
  };
}

function getLatestStance(args: any[], agentId: string): string | null {
  const agentArgs = args.filter((a) => a.agentId === agentId);
  return agentArgs.length > 0 ? agentArgs[agentArgs.length - 1].stance : null;
}
