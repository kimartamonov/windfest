export async function main(
  session: any,
  kag: any,
  ontology: any,
  portfolio: any
) {
  const availableBlocks: string[] = [];
  if (kag?.available) availableBlocks.push("kag");
  if (ontology?.available) availableBlocks.push("ontology");
  if (portfolio?.available) availableBlocks.push("portfolio");

  const kagSummary = kag?.priorDecisions?.length
    ? kag.priorDecisions
        .slice(0, 5)
        .map((d: any) => `- ${d.project ?? "?"}: ${d.verdict ?? "?"} (score: ${d.score ?? "?"})`)
        .join("\n")
    : "Нет прецедентов.";

  const portfolioSummary = portfolio?.overlappingCompanies?.length
    ? portfolio.overlappingCompanies
        .map((c: any) => `- ${c.name ?? c}: потенциальная синергия`)
        .join("\n")
    : "Нет пересечений с портфелем.";

  return {
    kind: "ventureos.ic.shared_context",
    blocks: { kag, ontology, portfolio },
    availability: { available: availableBlocks, total: 3 },
    summaries: { kagSummary, portfolioSummary },
  };
}
