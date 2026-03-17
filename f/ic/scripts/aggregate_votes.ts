import * as wmill from "windmill-client";

interface DimensionScores {
  trl: number;
  mrl: number;
  sovereignty: number;
  market: number;
  finance: number;
  risk: number;
  team: number;
}

interface Vote {
  agentId: string;
  score: number;
  verdict: string;
  confidence: number;
  weight: number;
}

export async function main(
  dimScores: DimensionScores,
  roleCatalog: any,
  icParams: any,
  synthesisArgs: any[]
) {
  const votingPolicy = await wmill.getResource("f/ic/resources/voting_policy");
  const biasMap: Record<string, number> = votingPolicy?.biasAdjustments ?? {
    pessimist: -0.05,
    optimist: 0.05,
    neutral: 0.0,
    skeptic: -0.03,
  };
  const noiseRange = votingPolicy?.noiseRange ?? 0.03;

  const roles = roleCatalog?.roles ?? [];
  const votes: Vote[] = [];
  let weightedSum = 0;
  let totalWeight = 0;

  for (const role of roles) {
    const weights = role.scoringWeights ?? {};

    // Compute agent score: weighted sum of dimension scores
    let score = 0;
    for (const [dim, w] of Object.entries(weights) as [string, number][]) {
      score += (dimScores[dim as keyof DimensionScores] ?? 0.5) * w;
    }

    // Apply bias
    const biasAdj = biasMap[role.bias] ?? 0;
    score += biasAdj;

    // Apply noise
    score += (Math.random() * 2 - 1) * noiseRange;

    // Clamp
    score = Math.max(0, Math.min(1, score));

    // Determine verdict
    const approveThreshold = (icParams?.approveThreshold ?? 72) / 100;
    const deferThreshold = (icParams?.deferThreshold ?? 50) / 100;
    let verdict: string;
    if (score >= approveThreshold) verdict = "APPROVE";
    else if (score >= deferThreshold) verdict = "DEFER";
    else verdict = "REJECT";

    // Get confidence from latest synthesis argument if available
    const synthArg = (synthesisArgs ?? []).find((a: any) => a?.agentId === role.id);
    const confidence = synthArg?.confidence ?? score;

    votes.push({
      agentId: role.id,
      score,
      verdict,
      confidence,
      weight: role.weight ?? 0.1,
    });

    weightedSum += score * (role.weight ?? 0.1);
    totalWeight += role.weight ?? 0.1;
  }

  const aggregatedScore = totalWeight > 0 ? weightedSum / totalWeight : 0.5;

  const approveThreshold = (icParams?.approveThreshold ?? 72) / 100;
  const deferThreshold = (icParams?.deferThreshold ?? 50) / 100;
  let verdict: string;
  if (aggregatedScore >= approveThreshold) verdict = "APPROVE";
  else if (aggregatedScore >= deferThreshold) verdict = "DEFER";
  else verdict = "REJECT";

  return {
    kind: "ventureos.ic.voting_result",
    votes,
    aggregatedScore,
    verdict,
    thresholds: { approve: approveThreshold, defer: deferThreshold },
  };
}
