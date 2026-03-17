export async function main(
  votes: any,
  chairman: any,
  dialectic: any,
  contradictions: any[],
  project: any
) {
  const verdict = votes?.verdict ?? "DEFER";
  const aggregatedScore = votes?.aggregatedScore ?? 0.5;

  // Merge conditions from chairman and dialectic
  const chairmanConditions = (chairman?.conditions ?? []).map((c: any) =>
    typeof c === "string"
      ? { type: "MILESTONE", proposedBy: "chairman", priority: "HIGH", text: c }
      : { ...c, proposedBy: c.proposedBy ?? "chairman" }
  );

  const dialecticConditions = dialectic?.conditions ?? [];
  const allConditions = [...chairmanConditions, ...dialecticConditions];

  // Deduplicate by text similarity (simple)
  const uniqueConditions = allConditions.filter(
    (c, i, arr) => arr.findIndex((other) => other.text === c.text) === i
  );

  // Mark contradictions as resolved by conditions
  const resolvedContradictions = (contradictions ?? []).map((c: any) => {
    const matchingCondition = uniqueConditions.find(
      (cond: any) => cond.metric === c.dimension || cond.text?.includes(c.dimension)
    );
    return {
      ...c,
      status: matchingCondition ? "RESOLVED_BY_CONDITION" : "UNRESOLVED",
    };
  });

  // Determine recommendation
  let recommendation: string;
  if (verdict === "APPROVE" && uniqueConditions.length > 0) {
    recommendation = "CONDITIONAL_APPROVE";
  } else {
    recommendation = verdict;
  }

  // Build tranche structure from BLOCKER conditions
  const blockerConditions = uniqueConditions.filter((c: any) => c.priority === "BLOCKER");
  const trancheStructure =
    blockerConditions.length > 0
      ? [
          { label: "Tranche A", fraction: 0.3, trigger: "Signing" },
          ...blockerConditions.map((c: any, i: number) => ({
            label: `Tranche ${String.fromCharCode(66 + i)}`,
            fraction: 0.7 / blockerConditions.length,
            trigger: c.text,
          })),
        ]
      : [{ label: "Full Amount", fraction: 1.0, trigger: "Signing" }];

  // Generate scenarios
  const baseIRR = project?.irr ? project.irr * 100 : 25;
  const scenarios = {
    BASE: { probability: 0.50, irr: Math.round(baseIRR), exitYear: 5 },
    OPTIMISTIC: { probability: 0.25, irr: Math.round(baseIRR * 1.3), exitYear: 4 },
    PESSIMISTIC: { probability: 0.25, irr: Math.round(baseIRR * 0.7), exitYear: 7 },
  };

  return {
    kind: "ventureos.ic.conditional_decision",
    recommendation,
    verdict,
    aggregatedScore,
    contradictions: resolvedContradictions,
    conditions: uniqueConditions,
    dealTerms: { trancheStructure },
    scenarios,
    chairman: {
      text: chairman?.text ?? "",
      mainRisk: chairman?.mainRisk ?? "",
      nextSteps: chairman?.nextSteps ?? [],
    },
    dialectic: {
      syntheses: dialectic?.syntheses ?? [],
    },
    votes: votes?.votes ?? [],
    timestamp: new Date().toISOString(),
  };
}
