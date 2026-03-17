import * as wmill from "windmill-client";

export async function main(session: any, allArgs: any[], decision: any) {
  const kagEndpoint = await wmill.getResource("f/ic/resources/kag_endpoint");

  if (!kagEndpoint?.url) {
    console.log("KAG endpoint not configured, skipping save");
    return { kind: "ventureos.ic.kag_save", saved: false, reason: "no_endpoint" };
  }

  try {
    const response = await fetch(`${kagEndpoint.url}/sessions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(kagEndpoint.apiKey ? { Authorization: `Bearer ${kagEndpoint.apiKey}` } : {}),
      },
      body: JSON.stringify({
        sessionId: session?.session?.id,
        project: session?.project,
        arguments: allArgs,
        decision: {
          verdict: decision?.verdict,
          aggregatedScore: decision?.aggregatedScore,
          conditions: decision?.conditions,
          recommendation: decision?.recommendation,
        },
        timestamp: new Date().toISOString(),
      }),
      signal: AbortSignal.timeout(15000),
    });

    if (!response.ok) {
      return { kind: "ventureos.ic.kag_save", saved: false, reason: `${response.status}` };
    }

    return { kind: "ventureos.ic.kag_save", saved: true };
  } catch (err: any) {
    console.log(`KAG save error: ${err.message}`);
    return { kind: "ventureos.ic.kag_save", saved: false, reason: err.message };
  }
}
