import { getTradeEvents, ALL_TRADES_CHANNEL, type TradeEvent } from "@/lib/events";

export async function GET() {
  const events = getTradeEvents();
  const encoder = new TextEncoder();

  let heartbeat: ReturnType<typeof setInterval>;
  let listener: (event: TradeEvent) => void;

  const stream = new ReadableStream({
    start(controller) {
      listener = (event) => {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`));
      };
      events.on(ALL_TRADES_CHANNEL, listener);
      heartbeat = setInterval(() => controller.enqueue(encoder.encode(": ping\n\n")), 15000);
    },
    cancel() {
      events.off(ALL_TRADES_CHANNEL, listener);
      clearInterval(heartbeat);
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
    },
  });
}
