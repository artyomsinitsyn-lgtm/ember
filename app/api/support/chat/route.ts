import { NextRequest } from "next/server";
import { getAnthropicClient } from "@/lib/anthropic";
import { SUPPORT_SYSTEM_PROMPT } from "@/lib/supportPrompt";

interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

const MAX_MESSAGES = 20;

export async function POST(req: NextRequest) {
  const body = await req.json();
  const rawMessages: ChatMessage[] = Array.isArray(body.messages) ? body.messages : [];
  const messages = rawMessages.slice(-MAX_MESSAGES);

  if (messages.length === 0) {
    return new Response("", { status: 400 });
  }

  if (!process.env.ANTHROPIC_API_KEY) {
    return new Response(
      "Support chat isn't configured yet — the site owner needs to set ANTHROPIC_API_KEY in .env.local and restart the server.",
      { headers: { "Content-Type": "text/plain; charset=utf-8" } }
    );
  }

  const client = getAnthropicClient();
  const encoder = new TextEncoder();
  let sawText = false;

  const readable = new ReadableStream({
    start(controller) {
      const stream = client.messages.stream({
        model: "claude-opus-5",
        max_tokens: 2048,
        system: SUPPORT_SYSTEM_PROMPT,
        thinking: { type: "adaptive" },
        output_config: { effort: "low" },
        messages: messages.map((m) => ({ role: m.role, content: m.content })),
      });

      stream.on("text", (delta) => {
        sawText = true;
        controller.enqueue(encoder.encode(delta));
      });

      stream.on("end", async () => {
        try {
          const final = await stream.finalMessage();
          if (!sawText && final.stop_reason === "refusal") {
            controller.enqueue(
              encoder.encode(
                "I can't help with that one — try asking something about how Alloy works instead."
              )
            );
          }
        } catch {
          // finalMessage is best-effort here; the stream already delivered what it could.
        }
        controller.close();
      });

      stream.on("error", (err) => {
        controller.enqueue(
          encoder.encode(`\n\n[Support chat error: ${err instanceof Error ? err.message : "unknown error"}]`)
        );
        controller.close();
      });
    },
  });

  return new Response(readable, {
    headers: { "Content-Type": "text/plain; charset=utf-8" },
  });
}
