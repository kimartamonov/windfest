import * as wmill from "windmill-client";

export async function main(decision: any, approval: any) {
  const fstEndpoint = await wmill.getResource("f/ic/resources/fst_endpoint");

  if (!fstEndpoint?.url) {
    console.log("FST endpoint not configured, skipping save");
    return { kind: "ventureos.ic.fst_save", saved: false, reason: "no_endpoint" };
  }

  try {
    const response = await fetch(`${fstEndpoint.url}/api/fst/decisions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(fstEndpoint.apiKey ? { Authorization: `Bearer ${fstEndpoint.apiKey}` } : {}),
      },
      body: JSON.stringify({
        decision,
        humanApproval: approval,
        savedAt: new Date().toISOString(),
      }),
      signal: AbortSignal.timeout(15000),
    });

    if (!response.ok) {
      const errText = await response.text();
      console.log(`FST save failed: ${response.status} ${errText}`);
      return { kind: "ventureos.ic.fst_save", saved: false, reason: errText };
    }

    const data = await response.json();
    return { kind: "ventureos.ic.fst_save", saved: true, decisionId: data.id ?? null };
  } catch (err: any) {
    console.log(`FST save error: ${err.message}`);
    return { kind: "ventureos.ic.fst_save", saved: false, reason: err.message };
  }
}
