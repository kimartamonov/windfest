export async function main(
  allArgs: any[],
  round: number,
  maxRounds: number
) {
  if (round >= maxRounds) {
    return { shouldStop: true, reason: `Max rounds reached (${maxRounds})` };
  }

  // Group arguments by agent and check confidence stability
  const agentArgs: Record<string, any[]> = {};
  for (const arg of allArgs ?? []) {
    if (!agentArgs[arg.agentId]) agentArgs[arg.agentId] = [];
    agentArgs[arg.agentId].push(arg);
  }

  const CONVERGENCE_THRESHOLD = 0.05;
  const CONVERGENCE_ROUNDS = 2;

  let stableAgents = 0;
  let totalAgents = 0;

  for (const [agentId, args] of Object.entries(agentArgs)) {
    totalAgents++;
    if (args.length < CONVERGENCE_ROUNDS + 1) continue;

    const recentConfidences = args.slice(-CONVERGENCE_ROUNDS - 1).map((a) => a.confidence);
    const maxDelta = Math.max(
      ...recentConfidences.slice(1).map((c, i) => Math.abs(c - recentConfidences[i]))
    );

    if (maxDelta < CONVERGENCE_THRESHOLD) {
      stableAgents++;
    }
  }

  if (totalAgents > 0 && stableAgents === totalAgents) {
    return { shouldStop: true, reason: `All ${totalAgents} agents converged (delta < ${CONVERGENCE_THRESHOLD})` };
  }

  return {
    shouldStop: false,
    reason: `Round ${round}/${maxRounds}: ${stableAgents}/${totalAgents} agents stable`,
  };
}
