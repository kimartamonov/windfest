import * as wmill from "windmill-client";

interface ModelConfig {
  model: string;
  temperature: number;
  maxTokens: number;
  timeoutMs: number;
  maxRetries: number;
}

interface LLMResult {
  raw: string;
  parsed: { text: string; dimension: string; confidence: number; stance: string } | null;
  tokensUsed: number;
  success: boolean;
}

export async function main(
  systemPrompt: string,
  userPrompt: string,
  modelConfig: Partial<ModelConfig>
): Promise<LLMResult> {
  const llmProvider = await wmill.getResource("f/ic/resources/llm_provider");

  const config: ModelConfig = {
    model: modelConfig.model ?? llmProvider?.model ?? "gpt-4o-mini",
    temperature: modelConfig.temperature ?? 0.7,
    maxTokens: modelConfig.maxTokens ?? 1024,
    timeoutMs: modelConfig.timeoutMs ?? 30000,
    maxRetries: modelConfig.maxRetries ?? 1,
  };

  const apiBase = llmProvider?.apiBase ?? "https://api.openai.com/v1";
  const apiKey = llmProvider?.apiKey ?? "";

  let lastError: string = "";

  for (let attempt = 0; attempt <= config.maxRetries; attempt++) {
    try {
      const response = await fetch(`${apiBase}/chat/completions`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model: config.model,
          messages: [
            { role: "system", content: systemPrompt },
            { role: "user", content: userPrompt },
          ],
          temperature: config.temperature,
          max_tokens: config.maxTokens,
          response_format: { type: "json_object" },
        }),
        signal: AbortSignal.timeout(config.timeoutMs),
      });

      if (!response.ok) {
        lastError = `LLM API returned ${response.status}: ${await response.text()}`;
        console.log(`Attempt ${attempt + 1} failed: ${lastError}`);
        continue;
      }

      const data = await response.json();
      const raw = data.choices?.[0]?.message?.content ?? "";
      const tokensUsed =
        (data.usage?.prompt_tokens ?? 0) + (data.usage?.completion_tokens ?? 0);

      const parsed = parseJsonResponse(raw);

      return { raw, parsed, tokensUsed, success: true };
    } catch (err: any) {
      lastError = err.message ?? String(err);
      console.log(`Attempt ${attempt + 1} error: ${lastError}`);
    }
  }

  return {
    raw: "",
    parsed: null,
    tokensUsed: 0,
    success: false,
  };
}

function parseJsonResponse(
  raw: string
): { text: string; dimension: string; confidence: number; stance: string } | null {
  try {
    const jsonMatch = raw.match(/\{[\s\S]*\}/);
    if (!jsonMatch) return null;

    const obj = JSON.parse(jsonMatch[0]);
    return {
      text: String(obj.text ?? obj.argument ?? ""),
      dimension: String(obj.dimension ?? obj.dim ?? "finance"),
      confidence: Math.max(0, Math.min(1, Number(obj.confidence ?? 0.7))),
      stance: validateStance(obj.stance ?? obj.vote ?? "DEFER"),
    };
  } catch {
    return {
      text: raw.slice(0, 500),
      dimension: "finance",
      confidence: 0.7,
      stance: "DEFER",
    };
  }
}

function validateStance(s: string): string {
  const upper = String(s).toUpperCase();
  if (["APPROVE", "DEFER", "REJECT"].includes(upper)) return upper;
  return "DEFER";
}
