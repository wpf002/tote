import Anthropic from "@anthropic-ai/sdk";
import type { ServiceContext } from "@tote/services";
import { TOOL_DEFS, runTool } from "./tools.js";

const MODEL = "claude-opus-4-8";
const MAX_TURNS = 6;

const SYSTEM = `You are Tote's accounting copilot for a horse-racing training barn. You answer questions about the barn's books.

Rules:
- Every dollar figure or balance you state MUST come from a tool call. Never estimate or invent a number.
- Call the tools to gather what you need, then answer in plain language a trainer understands.
- Money is already formatted (e.g. "$1,234.56") by the tools — quote it as returned.
- Net position: positive means the barn owes the partner; negative means the partner owes the barn.
- Be concise and direct. Lead with the answer. If the books don't contain the answer, say so.`;

/** Whether an API credential is configured (env var). */
export function isConfigured(): boolean {
  return Boolean(process.env.ANTHROPIC_API_KEY);
}

export interface AskResult {
  answer: string;
  toolsUsed: string[];
}

/**
 * Answer a natural-language question about the barn's books, grounded in the
 * ledger. The model may only cite numbers it obtained from the read-only tools
 * in {@link TOOL_DEFS} — a correctness guarantee no free-text LLM chat gives.
 */
export async function askBooks(ctx: ServiceContext, question: string): Promise<AskResult> {
  if (!isConfigured()) {
    throw new Error("ANTHROPIC_API_KEY is not set; the AI copilot is unavailable.");
  }
  const client = new Anthropic();
  const tools = TOOL_DEFS as unknown as Anthropic.Tool[];
  const messages: Anthropic.MessageParam[] = [{ role: "user", content: question }];
  const toolsUsed: string[] = [];

  for (let turn = 0; turn < MAX_TURNS; turn++) {
    const response = await client.messages.create({
      model: MODEL,
      max_tokens: 16000,
      thinking: { type: "adaptive" },
      system: SYSTEM,
      tools,
      messages,
    });

    if (response.stop_reason !== "tool_use") {
      const answer = response.content
        .filter((b): b is Anthropic.TextBlock => b.type === "text")
        .map((b) => b.text)
        .join("\n")
        .trim();
      return { answer: answer || "I couldn't find an answer in the books.", toolsUsed };
    }

    messages.push({ role: "assistant", content: response.content });

    const toolUses = response.content.filter(
      (b): b is Anthropic.ToolUseBlock => b.type === "tool_use",
    );
    const results: Anthropic.ToolResultBlockParam[] = [];
    for (const tu of toolUses) {
      toolsUsed.push(tu.name);
      let out: string;
      try {
        out = await runTool(ctx, tu.name, (tu.input ?? {}) as Record<string, unknown>);
      } catch (err) {
        out = JSON.stringify({ error: err instanceof Error ? err.message : "tool failed" });
      }
      results.push({ type: "tool_result", tool_use_id: tu.id, content: out });
    }
    messages.push({ role: "user", content: results });
  }

  return { answer: "I wasn't able to finish answering — try a more specific question.", toolsUsed };
}
