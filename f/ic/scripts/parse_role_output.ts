interface LLMResult {
  raw: string;
  parsed: { text: string; dimension: string; confidence: number; stance: string } | null;
  tokensUsed: number;
  success: boolean;
}

interface Argument {
  id: string;
  agentId: string;
  type: string;
  text: string;
  dimension: string;
  confidence: number;
  stance: string;
  targetArgId: string | null;
  timestamp: number;
  strength: number;
  tokensUsed: number;
}

export async function main(
  llmResult: LLMResult,
  agentId: string,
  argType: string,
  targetArgId?: string
): Promise<Argument> {
  const parsed = llmResult.parsed;
  const fallbackText = llmResult.raw?.slice(0, 500) ?? "Агент не смог сформулировать позицию.";

  return {
    id: `arg_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    agentId,
    type: argType,
    text: parsed?.text || fallbackText,
    dimension: parsed?.dimension || "finance",
    confidence: parsed?.confidence ?? 0.5,
    stance: parsed?.stance || "DEFER",
    targetArgId: targetArgId ?? null,
    timestamp: Date.now(),
    strength: 0.5 + Math.random() * 0.5,
    tokensUsed: llmResult.tokensUsed,
  };
}
