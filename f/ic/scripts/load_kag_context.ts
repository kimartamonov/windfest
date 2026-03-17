import * as wmill from "windmill-client";

interface Project {
  title: string;
  subFund: string;
  trl: number;
  stage: string;
}

export async function main(project: Project) {
  const kagEndpoint = await wmill.getResource("f/ic/resources/kag_endpoint");

  if (!kagEndpoint?.url) {
    console.log("KAG endpoint not configured, returning empty context");
    return {
      kind: "ventureos.ic.kag_context",
      priorDecisions: [],
      similarProjects: [],
      available: false,
    };
  }

  try {
    const response = await fetch(`${kagEndpoint.url}/search`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(kagEndpoint.apiKey ? { Authorization: `Bearer ${kagEndpoint.apiKey}` } : {}),
      },
      body: JSON.stringify({
        query: `investment committee decision ${project.subFund} ${project.stage} TRL=${project.trl}`,
        limit: 10,
      }),
      signal: AbortSignal.timeout(10000),
    });

    if (!response.ok) {
      console.log(`KAG returned ${response.status}, using empty context`);
      return { kind: "ventureos.ic.kag_context", priorDecisions: [], similarProjects: [], available: false };
    }

    const data = await response.json();
    return {
      kind: "ventureos.ic.kag_context",
      priorDecisions: data.decisions ?? [],
      similarProjects: data.projects ?? [],
      available: true,
    };
  } catch (err) {
    console.log(`KAG fetch failed: ${err}, using empty context`);
    return { kind: "ventureos.ic.kag_context", priorDecisions: [], similarProjects: [], available: false };
  }
}
