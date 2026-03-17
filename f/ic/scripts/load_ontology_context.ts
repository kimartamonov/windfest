import * as wmill from "windmill-client";

interface Project {
  title: string;
  subFund: string;
}

export async function main(project: Project) {
  const kagEndpoint = await wmill.getResource("f/ic/resources/kag_endpoint");

  if (!kagEndpoint?.url) {
    return { kind: "ventureos.ic.ontology_context", concepts: [], relations: [], available: false };
  }

  try {
    const response = await fetch(`${kagEndpoint.url}/ontology`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(kagEndpoint.apiKey ? { Authorization: `Bearer ${kagEndpoint.apiKey}` } : {}),
      },
      body: JSON.stringify({ domain: project.subFund, limit: 50 }),
      signal: AbortSignal.timeout(10000),
    });

    if (!response.ok) {
      return { kind: "ventureos.ic.ontology_context", concepts: [], relations: [], available: false };
    }

    const data = await response.json();
    return {
      kind: "ventureos.ic.ontology_context",
      concepts: data.concepts ?? [],
      relations: data.relations ?? [],
      available: true,
    };
  } catch (err) {
    console.log(`Ontology fetch failed: ${err}`);
    return { kind: "ventureos.ic.ontology_context", concepts: [], relations: [], available: false };
  }
}
