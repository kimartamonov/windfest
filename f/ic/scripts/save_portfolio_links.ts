import * as wmill from "windmill-client";

export async function main(project: any, decision: any) {
  const integramCreds = await wmill.getResource("f/ic/resources/integram_creds");

  if (!integramCreds?.url) {
    console.log("Integram not configured, skipping portfolio link save");
    return { kind: "ventureos.ic.portfolio_save", saved: false, reason: "no_endpoint" };
  }

  try {
    const response = await fetch(`${integramCreds.url}/api/portfolio/decisions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${integramCreds.token}`,
      },
      body: JSON.stringify({
        project: {
          title: project?.title,
          subFund: project?.subFund,
          stage: project?.stage,
        },
        verdict: decision?.verdict,
        recommendation: decision?.recommendation,
        aggregatedScore: decision?.aggregatedScore,
        conditions: decision?.conditions,
        timestamp: new Date().toISOString(),
      }),
      signal: AbortSignal.timeout(15000),
    });

    if (!response.ok) {
      return { kind: "ventureos.ic.portfolio_save", saved: false, reason: `${response.status}` };
    }

    return { kind: "ventureos.ic.portfolio_save", saved: true };
  } catch (err: any) {
    console.log(`Portfolio save error: ${err.message}`);
    return { kind: "ventureos.ic.portfolio_save", saved: false, reason: err.message };
  }
}
