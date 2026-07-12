"use server";

import { askBooks, isConfigured } from "@tote/ai";
import { getServiceContext } from "@/lib/services";

export interface AskState {
  question?: string;
  answer?: string;
  toolsUsed?: string[];
  error?: string;
}

export async function ask(_prev: AskState, formData: FormData): Promise<AskState> {
  const question = String(formData.get("question") ?? "").trim();
  if (!question) return { error: "Ask a question first." };
  if (!isConfigured()) {
    return {
      question,
      error: "The AI copilot needs an ANTHROPIC_API_KEY. Set it in the web app's environment to enable it.",
    };
  }
  try {
    const ctx = await getServiceContext();
    const result = await askBooks(ctx, question);
    return { question, answer: result.answer, toolsUsed: result.toolsUsed };
  } catch (err) {
    return { question, error: err instanceof Error ? err.message : "Something went wrong." };
  }
}
