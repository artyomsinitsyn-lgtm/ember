# Alloy — Incident Runbook (Exploit / Wallet Drain)

One page. If something's wrong, start here.

## 1. How you'll know

Right now there's no automated alert — nothing pages you. You'll likely find out from: a sudden
drop in the treasury balance, a user report, or unusual trading activity you notice yourself.
**Gap to close before launch:** set up a balance-change alert on the treasury wallet (even a free
tool like a Solana balance-watcher bot) so you don't rely on noticing manually.

## 2. Stop it — hit the kill switch

You (and only you, right now) can do this. It does not need anyone else's signature.

```
NEXT_PUBLIC_SOLANA_RPC_URL=<your RPC url> npm run pause -- <path-to-your-wallet-keypair.json>
```

This immediately blocks all buying, selling, and new token launches platform-wide. It does **not**
touch the treasury funds themselves — it only stops new activity.

Confirm it worked:
```
NEXT_PUBLIC_SOLANA_RPC_URL=<your RPC url> npm run pause:status
```
Should print `paused: true`.

## 3. Figure out what happened

- Check the treasury balance and recent transaction signatures for the treasury vault PDA on a
  Solana explorer.
- Check recent `TradeEvent`/`TreasuryWithdrawn` program logs for anything abnormal (sizes, a
  wallet you don't recognize, repeated rapid transactions).
- Do **not** move remaining treasury funds yet unless you're certain where they're going —
  panic-moving funds has caused people to send money into a compromised destination. If in doubt,
  leave funds in place behind the pause and get a second opinion first.

## 4. Tell people

- **Users:** post a status update as soon as you know *something* is wrong, even before you know
  the full cause — "we've paused trading while we investigate, funds are not at immediate risk of
  further loss" is enough for a first message. **Gap to close before launch:** there's no status
  page yet; for now this means a pinned post on whatever channel your users actually watch
  (Twitter/X, Discord, etc.) — decide that channel now, not during an incident.
- **Nobody else needs to approve the pause** — you can and should act before you've lined up who to
  tell.

## 5. Fix and resume

- Don't unpause until you understand root cause and have either fixed it or confirmed it can't
  recur immediately.
- Resume with:
  ```
  NEXT_PUBLIC_SOLANA_RPC_URL=<your RPC url> npm run unpause -- <path-to-your-wallet-keypair.json>
  ```
- Post a follow-up telling users what happened and what changed.

## 6. Afterward

- Save the transaction signatures involved (explorer links) somewhere durable — you'll want them
  if you ever bring in outside help or a paying auditor to review the incident.
- Write down what you'd do differently — five minutes, not a full postmortem, but capture it while
  it's fresh.

---
*Authority note: the wallet that can currently trigger pause/unpause is whichever keypair is
passed to the script above — initially a placeholder dev key (`treasury-wallet.json`) that must be
swapped for your real wallet before this runbook is trustworthy for a real launch. See
`docs/security/audit-package.md` §6-7.*
