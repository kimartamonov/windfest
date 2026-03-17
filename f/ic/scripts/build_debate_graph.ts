interface Argument {
  id: string;
  agentId: string;
  type: string;
  text: string;
  dimension: string;
  confidence: number;
  stance: string;
  targetArgId: string | null;
  timestamp: number;
}

export async function main(allArgs: Argument[]) {
  const args = allArgs ?? [];

  // Build graph nodes
  const nodes = args.map((a) => ({
    id: a.id,
    agentId: a.agentId,
    type: a.type,
    dimension: a.dimension,
    stance: a.stance,
    confidence: a.confidence,
  }));

  // Build edges from targetArgId relations
  const edges: { source: string; target: string; relation: string }[] = [];
  for (const arg of args) {
    if (!arg.targetArgId) continue;

    let relation = "isResponseTo";
    if (arg.type === "CHALLENGE") relation = "challenges";
    else if (arg.type === "COUNTER") relation = "counters";
    else if (arg.type === "SUPPORT") relation = "supports";
    else if (arg.type === "SYNTHESIS") relation = "synthesizes";

    edges.push({ source: arg.id, target: arg.targetArgId, relation });
  }

  // Build IBIS graph: group by dimension as issues
  const issuesByDim: Record<string, any> = {};
  for (const arg of args) {
    if (!issuesByDim[arg.dimension]) {
      issuesByDim[arg.dimension] = { issue: arg.dimension, positions: {} };
    }
    const stanceKey = arg.stance;
    if (!issuesByDim[arg.dimension].positions[stanceKey]) {
      issuesByDim[arg.dimension].positions[stanceKey] = [];
    }
    issuesByDim[arg.dimension].positions[stanceKey].push({
      agentId: arg.agentId,
      text: arg.text,
      confidence: arg.confidence,
    });
  }

  // Calculate belief drift per agent
  const agentTimeline: Record<string, { confidence: number; timestamp: number }[]> = {};
  for (const arg of args) {
    if (!agentTimeline[arg.agentId]) agentTimeline[arg.agentId] = [];
    agentTimeline[arg.agentId].push({ confidence: arg.confidence, timestamp: arg.timestamp });
  }

  const beliefDrift: Record<string, { initial: number; final: number; delta: number; points: number }> = {};
  for (const [agentId, timeline] of Object.entries(agentTimeline)) {
    timeline.sort((a, b) => a.timestamp - b.timestamp);
    const initial = timeline[0].confidence;
    const final = timeline[timeline.length - 1].confidence;
    beliefDrift[agentId] = {
      initial,
      final,
      delta: final - initial,
      points: timeline.length,
    };
  }

  return {
    kind: "ventureos.ic.debate_graph",
    debateGraph: { nodes, edges },
    ibisGraph: Object.values(issuesByDim),
    beliefDrift,
  };
}
