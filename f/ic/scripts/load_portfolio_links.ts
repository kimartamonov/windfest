import * as wmill from "windmill-client";

interface Project {
  title: string;
  subFund: string;
}

export async function main(project: Project) {
  const integramCreds = await wmill.getResource("f/ic/resources/integram_creds");

  if (!integramCreds?.url) {
    return { kind: "ventureos.ic.portfolio_links", overlappingCompanies: [], synergies: [], available: false };
  }

  try {
    const response = await fetch(`${integramCreds.url}/api/portfolio/links`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${integramCreds.token}`,
      },
      body: JSON.stringify({ subFund: project.subFund, title: project.title }),
      signal: AbortSignal.timeout(10000),
    });

    if (!response.ok) {
      return { kind: "ventureos.ic.portfolio_links", overlappingCompanies: [], synergies: [], available: false };
    }

    const data = await response.json();
    return {
      kind: "ventureos.ic.portfolio_links",
      overlappingCompanies: data.overlapping ?? [],
      synergies: data.synergies ?? [],
      available: true,
    };
  } catch (err) {
    console.log(`Portfolio links fetch failed: ${err}`);
    return { kind: "ventureos.ic.portfolio_links", overlappingCompanies: [], synergies: [], available: false };
  }
}
