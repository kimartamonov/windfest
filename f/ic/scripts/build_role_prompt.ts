import * as wmill from "windmill-client";

interface Role {
  id: string;
  name: string;
  systemPrompt: string;
}

interface Project {
  title: string;
  subFund: string;
  trl: number;
  mrl: number;
  irr: number;
  marketSize: number;
  teamStrength: number;
  stage: string;
  riskFactors: number;
  sovereigntyScore: number;
}

export async function main(
  role: Role,
  phase: string,
  project: Project,
  context: any,
  priorArgs: any[],
  targetArg?: any
) {
  const promptCatalog = await wmill.getResource("f/ic/resources/prompt_catalog");
  const template = promptCatalog?.templates?.[phase];

  if (!template) {
    throw new Error(`No prompt template for phase: ${phase}`);
  }

  const debateHistory = (priorArgs ?? [])
    .slice(-6)
    .map((a: any) => `[${a.agentId}/${a.type}]: ${a.text}`)
    .join("\n");

  const kagContext = context?.summaries?.kagSummary ?? "Нет прецедентов.";

  let userPrompt = template.user
    .replace("{{title}}", project.title)
    .replace("{{subFund}}", project.subFund)
    .replace("{{trl}}", String(project.trl))
    .replace("{{mrl}}", String(project.mrl))
    .replace("{{irr}}", String(project.irr))
    .replace("{{marketSize}}", String(project.marketSize))
    .replace("{{teamStrength}}", String(project.teamStrength))
    .replace("{{stage}}", project.stage)
    .replace("{{sovereigntyScore}}", String(project.sovereigntyScore))
    .replace("{{riskFactors}}", String(project.riskFactors))
    .replace("{{kagContext}}", kagContext)
    .replace("{{debateHistory}}", debateHistory);

  if (targetArg) {
    userPrompt = userPrompt
      .replace("{{targetAgent}}", targetArg.agentId ?? "unknown")
      .replace("{{targetText}}", targetArg.text ?? "")
      .replace("{{originalText}}", targetArg.text ?? "")
      .replace("{{challengerAgent}}", targetArg.challengerAgent ?? "unknown")
      .replace("{{challengeText}}", targetArg.challengeText ?? "");
  }

  if (phase === "CHAIRMAN" || phase === "DIALECTIC") {
    const contradictionsSummary = (context?.contradictions ?? [])
      .map((c: any) => `- ${c.dimension}: «${c.thesis?.text}» vs «${c.antithesis?.text}» (severity: ${c.severity})`)
      .join("\n") || "Нет противоречий.";
    userPrompt = userPrompt
      .replace("{{contradictions}}", contradictionsSummary)
      .replace("{{votingSummary}}", context?.votingSummary ?? "");
  }

  return {
    systemPrompt: role.systemPrompt,
    userPrompt,
  };
}
