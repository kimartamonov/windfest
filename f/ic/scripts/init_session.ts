import * as wmill from "windmill-client";

interface Project {
  title: string;
  subFund: string;
  trl: number;
  mrl: number;
  irr: number;
  marketSize: number;
  teamStrength: number;
  stage: string;
  riskFactors: number;
  sovereigntyScore: number;
  factorScores?: { T: number; S: number; M: number; G: number; E: number };
}

interface ICParams {
  approveThreshold: number;
  deferThreshold: number;
  maxRounds: number;
  votingMode: string;
}

export async function main(project: Project, icParams?: Partial<ICParams>) {
  const roleCatalog = await wmill.getResource("f/ic/resources/role_catalog");
  const votingPolicy = await wmill.getResource("f/ic/resources/voting_policy");
  const modelPolicy = await wmill.getResource("f/ic/resources/model_policy");

  const normalizedProject: Project = {
    title: project.title || "Untitled Project",
    subFund: project.subFund || "БАС",
    trl: Math.max(1, Math.min(9, project.trl ?? 1)),
    mrl: Math.max(1, Math.min(10, project.mrl ?? 1)),
    irr: Math.max(0, Math.min(1, project.irr ?? 0)),
    marketSize: Math.max(0, project.marketSize ?? 0),
    teamStrength: Math.max(0, Math.min(1, project.teamStrength ?? 0.5)),
    stage: project.stage || "seed",
    riskFactors: Math.max(0, Math.min(1, project.riskFactors ?? 0.5)),
    sovereigntyScore: Math.max(0, Math.min(9, project.sovereigntyScore ?? 0)),
    factorScores: project.factorScores,
  };

  const mergedICParams: ICParams = {
    approveThreshold: icParams?.approveThreshold ?? votingPolicy?.approveThreshold ?? 72,
    deferThreshold: icParams?.deferThreshold ?? votingPolicy?.deferThreshold ?? 50,
    maxRounds: icParams?.maxRounds ?? votingPolicy?.maxRounds ?? 5,
    votingMode: icParams?.votingMode ?? votingPolicy?.votingMode ?? "formula",
  };

  const sessionId = `ic_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

  return {
    session: { id: sessionId, timestamp: new Date().toISOString(), phase: "LOADING" },
    project: normalizedProject,
    roleCatalog: roleCatalog ?? { roles: [] },
    modelPolicy: modelPolicy ?? { default: {} },
    icParams: mergedICParams,
  };
}
