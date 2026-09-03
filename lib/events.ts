import { EventEmitter } from "events";

declare global {
   
  var __tradeEvents: EventEmitter | undefined;
}

export const ALL_TRADES_CHANNEL = "__all__";

export function getTradeEvents(): EventEmitter {
  if (!global.__tradeEvents) {
    const emitter = new EventEmitter();
    emitter.setMaxListeners(0); // unbounded SSE subscribers
    global.__tradeEvents = emitter;
  }
  return global.__tradeEvents;
}

export interface TradeEvent {
  tokenId: string;
  walletId: string;
  side: "buy" | "sell";
  price: number;
  tokenAmount: number;
  coreAmount: number;
  graduated: boolean;
  createdAt: number;
}

export function emitTrade(event: TradeEvent) {
  const events = getTradeEvents();
  events.emit(event.tokenId, event);
  events.emit(ALL_TRADES_CHANNEL, event);
}
