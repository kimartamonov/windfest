interface Project {
  trl: number;
  mrl: number;
  irr: number;
  marketSize: number;
  teamStrength: number;
  riskFactors: number;
  sovereigntyScore: number;
  factorScores?: { T: number; S: number; M: number; G: number; E: number };
}

interface DimensionScores {
  trl: number;
  mrl: number;
  sovereignty: number;
  market: number;
  finance: number;
  risk: number;
  team: number;
}

export async function main(project: Project): Promise<DimensionScores> {
  const p = project;

  let scores: DimensionScores = {
    trl: normalize(p.trl, 1, 9),
    mrl: normalize(p.mrl, 1, 10),
    sovereignty: normalize(p.sovereigntyScore, 0, 9),
    market: normalize(Math.log10(Math.max(1, p.marketSize)), 0, 12),
    finance: normalize(p.irr, 0.10, 0.60),
    risk: 1 - normalize(p.riskFactors, 0, 1),
    team: Math.max(0, Math.min(1, p.teamStrength)),
  };

  // Apply factor scores if available (T·S·M·G·E)
  if (p.factorScores) {
    const F = p.factorScores;
    scores = {
      trl: F.T,
      mrl: scores.mrl,
      sovereignty: F.S,
      market: F.E * 0.4 + scores.market * 0.6,
      finance: F.M * 0.6 + scores.finance * 0.4,
      risk: F.G * 0.5 + (F.S < 0.4 ? 0.3 : 0.7) * 0.5,
      team: scores.team,
    };
  }

  return scores;
}

function normalize(value: number, min: number, max: number): number {
  if (max <= min) return 0.5;
  return Math.max(0, Math.min(1, (value - min) / (max - min)));
}
