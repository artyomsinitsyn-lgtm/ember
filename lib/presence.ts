// Ephemeral "who's online" tracking — a plain in-memory map, same pattern as the nonce
// store in lib/auth.ts (global.__alloyNonces). No DB table on purpose: presence data is
// meaningless the instant a visitor leaves, so there's nothing here worth persisting
// across a server restart.
declare global {
   
  var __alloyPresence: Map<string, number> | undefined;
}

const PRESENCE_TTL_MS = 90 * 1000;

function store() {
  if (!global.__alloyPresence) global.__alloyPresence = new Map();
  return global.__alloyPresence;
}

/** Marks `clientId` (a random id the browser generates and keeps in localStorage — not a
 * wallet id, so this carries no identity/auth weight) as seen just now. */
export function touchPresence(clientId: string) {
  if (!clientId) return;
  store().set(clientId, Date.now());
}

/** Count of clients heard from in the last PRESENCE_TTL_MS, pruning stale entries as it goes. */
export function countOnline(): number {
  const now = Date.now();
  const s = store();
  for (const [id, lastSeen] of s) {
    if (now - lastSeen > PRESENCE_TTL_MS) s.delete(id);
  }
  return s.size;
}
