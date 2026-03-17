interface Argument {
  id: string;
  agentId: string;
  type: string;
  text: string;
  dimension: string;
  confidence: number;
  stance: string;
  strength: number;
}

interface Contradiction {
  thesis: { agentId: string; argId: string; text: string; stance: string };
  antithesis: { agentId: string; argId: string; text: string; stance: string };
  dimension: string;
  severity: number;
}

export async function main(allArgs: Argument[]): Promise<Contradiction[]> {
  const contradictions: Contradiction[] = [];
  const args = allArgs ?? [];

  // Get the latest argument per agent per dimension
  const latestByAgentDim: Record<string, Argument> = {};
  for (const arg of args) {
    const key = `${arg.agentId}:${arg.dimension}`;
    if (!latestByAgentDim[key] || arg.timestamp > (latestByAgentDim[key] as any).timestamp) {
      latestByAgentDim[key] = arg;
    }
  }

  const entries = Object.values(latestByAgentDim);
  const approvers = entries.filter((a) => a.stance === "APPROVE");
  const rejecters = entries.filter((a) => a.stance === "REJECT");

  for (const pro of approvers) {
    for (const con of rejecters) {
      // Same dimension or cross-dimension contradiction
      if (pro.agentId === con.agentId) continue;

      const sameDim = pro.dimension === con.dimension;
      if (!sameDim) continue;

      const severity = (pro.confidence + con.confidence) / 2;

      contradictions.push({
        thesis: { agentId: pro.agentId, argId: pro.id, text: pro.text, stance: pro.stance },
        antithesis: { agentId: con.agentId, argId: con.id, text: con.text, stance: con.stance },
        dimension: pro.dimension,
        severity,
      });
    }
  }

  // Sort by severity descending
  contradictions.sort((a, b) => b.severity - a.severity);

  return contradictions;
}
