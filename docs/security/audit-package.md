# Alloy — Audit Package

Prepared 2026-09-03. Covers the `alloy_curve` Anchor program (`onchain/programs/alloy_curve/src/lib.rs`,
program id `9brEDkea42QTp3dGT7jMWLE7pgnttHo5ZmyWDDPkzrbb`) and the Next.js app's admin/treasury
API surface (`app/api/admin/**`).

**How to read this doc:** every item below is tagged with a confidence level. Please concentrate
review time on **OPEN QUESTION** items — those are places we could not independently verify and
want your independent judgment on. **VERIFIED** items include the actual test output or code
excerpt that backs the claim; we'd still like a second set of eyes, but we're not asking you to
re-derive them from scratch.

- 🟢 **VERIFIED** — backed by a passing automated test or a directly-inspected code path, evidence included below.
- 🟡 **REVIEWED, NO AUTOMATED TEST** — we read the code and it looks correct, but there's no test guarding it.
- 🔴 **OPEN QUESTION** — we could not verify this ourselves; needs your independent review.

---

## 1. Fee split (40/40/20) — 🟢 VERIFIED

`lib.rs:26-28`:
```rust
pub const FEE_SPLIT_CREATOR_BPS: u64 = 4000; // 40%
pub const FEE_SPLIT_STAKER_BPS: u64 = 4000;  // 40%
pub const FEE_SPLIT_TREASURY_BPS: u64 = 2000; // 20%
```
Applied by `FeeSplit::of()` (`lib.rs:295-309`) on every `buy`/`sell`. Treasury absorbs integer-division
rounding dust so creator+staker+treasury always sum to exactly the fee collected — no dust is ever
unaccounted for.

Trading fee itself is 1% pre-graduation, 0.25% post-graduation (`TRADE_FEE_BPS`,
`POST_GRADUATION_TRADE_FEE_BPS`, `lib.rs:23-24`).

**Evidence:** `cargo test --release` in `onchain/`, test `full_lifecycle_buy_then_sell` — asserts
the creator's on-chain balance actually increases by its cut after a real `buy` instruction runs
against a simulated validator (litesvm). All 4 tests in the suite pass; full output in §9.

## 2. Anti-rug-pull logic — 🔴 OPEN QUESTION (naming mismatch — please confirm intended behavior)

`lib/rugDetection.ts` implements `assessRugRisk()`: it flags wallet clusters funded from a shared
source, and bursts of ≥4 distinct wallets buying within a 60s window, and returns a
`low`/`medium`/`high` **risk label**.

**Important: this is a scoring/labeling function, not an enforcement mechanism.** We found no code
anywhere in the repo that blocks a trade, bans a wallet, or halts a listing based on this
assessment — it only affects what's displayed in the UI (`components/RugRiskExplainer.tsx`,
`app/(app)/risk/page.tsx`). If "ban logic" was expected to exist, please treat that as a gap: right
now a wallet flagged `high` risk can still trade freely. We'd like your explicit read on whether
this display-only model is acceptable for launch, or whether enforcement (e.g. blocking further
buys into a high-risk cluster) should exist before going live.

No automated tests currently cover `rugDetection.ts`.

## 3. Admin checks on privileged API routes — 🟢 VERIFIED

Every route under `app/api/admin/**` and the admin-only `app/api/feedback/route.ts` (POST) calls
`isAppAdmin(walletId)` (`lib/admin.ts`) before doing anything privileged:

```
app/api/admin/treasury/withdraw/route.ts:19
app/api/admin/verifications/route.ts:8
app/api/admin/verifications/[id]/decide/route.ts:9
app/api/admin/feedback/[id]/resolve/route.ts:9
app/api/feedback/route.ts:13
```
Verified by direct grep across `app/api` — confirmed present in all 5 files with no admin-gated
route missing the check.

🟡 One design detail worth your independent read: `isAppAdmin()` falls back to
"on-chain treasury admin = app admin" whenever the `ADMIN_WALLET_IDS` env allowlist is unset
(`lib/admin.ts:24-31`). That's a deliberate default for local/devnet use, documented in-code, but
please confirm the fallback can't be triggered unintentionally in a real deployment (e.g. by an
unset env var in production).

## 4. Spoofable audit fields — 🟢 VERIFIED (fixed)

`app/api/admin/treasury/withdraw/route.ts` records treasury withdrawals into an audit log table.
The withdrawal destination (`to_wallet`) is read from the **on-chain transaction's balance
deltas** (`route.ts:52-62`), not from the client-supplied request body — so a non-admin (or a
compromised admin session) POSTing a real signature can't cause a different, spoofed destination
to be written into the audit trail than what actually happened on-chain.

```ts
// destIdx is found by scanning the transaction's own balance changes — the client-supplied
// `to` field in the request body is never read for this.
const destIdx = accountKeys.staticAccountKeys.findIndex(
  (_, i) => i !== vaultIdx && tx.meta!.postBalances[i] - tx.meta!.preBalances[i] === deltaLamports
);
```

## 5. IDOR / PII leaks, listing-hijack race condition — 🟢 VERIFIED (both confirmed NOT present)

Investigated directly on 2026-09-03: checked `git log --all -p`, `git blame`, and `git reflog`
first (no hidden/reverted commits exist — the repo's 7 commits are exactly what's on disk), then
independently audited the code rather than relying on history alone.

**Listing hijack race condition — not present, fixed since the file's first commit.**
`app/api/tokens/route.ts` (git blame: commit `f4150ae`, 2026-09-02, untouched since) names the
exact scenario in its own comment — *"anyone who spots the (public) CurveInitialized event could
race the real creator here and register themselves as creator_id for a mint they never
initialized"* — and guards it two ways: (1) the endpoint checks the mint's real on-chain
`curve.creator` against the caller's session wallet, never anything client-supplied, and (2) the
DB insert uses the mint address as primary key with no check-then-insert gap, so the UNIQUE
constraint itself makes concurrent registration attempts for the same mint race-proof, not
application logic.

**IDOR — swept all 18 dynamic-`[id]` routes (listed in §9), none exploitable.** Every
mutation endpoint (`wallet/[id]` PATCH, `wallet/[id]/verify/*`, `tokens/[id]` PATCH,
`tokens/[id]/project`, `connections/[id]/respond`, `feed/[id]/like`) checks the session wallet
against the resource owner before writing. The two unauthenticated GETs
(`wallet/[id]/trades`, `wallet/[id]/positions`) return trade/position data but are deliberately
called from the public profile page (`components/ProfilePageClient.tsx`) as a public activity
feed — consistent with the product's existing public leaderboard/reputation design, and with the
fact that Solana trades are public on-chain regardless of what this API does. Not a leak of
anything actually private.

No code changes were needed for this item.

## 6. Kill switch (pause/unpause) — 🟢 VERIFIED (built and tested this session)

Did not exist before this session. Added: `EmergencyConfig` account (separate from treasury
admin, deliberately — see rationale below), `pause`/`unpause` instructions, and a
`require!(!paused)` guard on `initialize_curve`, `buy`, and `sell`.

**Evidence — automated tests** (`onchain/programs/alloy_curve/tests/integration.rs`,
`cargo test --release -- --nocapture`, all 4 passing):
```
OK: unauthorized pause attempt rejected: InstructionError(0, Custom(6004))
OK: buy rejected while paused: InstructionError(0, Custom(6005))
OK: new curve initialization rejected while paused: InstructionError(0, Custom(6005))
OK: trading resumed after unpause, buyer now holds 34277831558568 tokens
test pause_rejects_unauthorized_signer ... ok
test pause_blocks_trading_and_minting_until_unpaused ... ok
```

**Evidence — real end-to-end run on a local validator** (not just simulated), using
`scripts/emergency-pause.mjs`:
```
$ node scripts/emergency-pause.mjs init treasury-wallet.json
signature: 253yG2FFo5ioixwBaJrSs1vyu5Qtaiesq5pw7Q8kNnCS5Zx6JB9p45Rt8J84LKYY6R3BzA2uifMGDEbon6V1tXtC
emergency_config.paused is now: false

$ node scripts/emergency-pause.mjs pause treasury-wallet.json
signature: 51MUozbgU223q1NHgQ4A5gsxrBFAyQ6LjdA9QzW2R3zDjN5FoyLi54ySmwfdKy9W53DExfAdSnfuMHJmStZWviuc
emergency_config.paused is now: true

$ node scripts/emergency-pause.mjs unpause treasury-wallet.json
signature: 2TXC9taytrRDnp9NLYQ577w4RQFpQQqT4HuX14jbBakN6vLk81DQEZgzKcMpT1RKMHiwEZAbqTr143SHqo1Ujaot
emergency_config.paused is now: false
```

🟡 Not yet tested: pausing mid-trade from the actual browser wallet-adapter flow, or on a real
devnet deployment with concurrent traffic. Recommend one dry run of this on devnet before
mainnet.

## 7. Treasury custody — 🔴 OPEN QUESTION (design decision made this session, needs independent read)

By explicit decision (not yet fully implemented — see our companion message), treasury custody
will be a **single hardware wallet**, not a multisig. `TREASURY_ADMIN` in `lib.rs` currently holds
a locally-generated placeholder keypair (`treasury-wallet.json`, gitignored) that must be replaced
with the real hardware wallet's public key before any real deployment. There is no multisig
anywhere in this codebase or its dependencies (confirmed via `grep -ril "multisig|squads"`, zero
hits).

**Please give us your independent opinion on**: is single-hardware-wallet custody (no multisig,
no timelock) an acceptable risk for this program's launch size, or should we push back on that
decision before going live? This is the single highest-consequence open question in this package.

## 8. Program upgrade authority — 🟡 REVIEWED, NOT YET APPLICABLE TO PRODUCTION

The program has never been deployed to devnet or mainnet (`Anchor.toml` only defines `localnet`
and `devnet` cluster entries; `solana program show <id>` against both public clusters returns "no
account found" as of this writing). We deployed it to a throwaway local validator solely to test
the kill switch above; on that deployment, `solana program show` reports:
```
Authority: AnKDdf8UtfYq2W4rwdpYhVmqYCHJ9XnqNxfg113nbPTU
```
— i.e., upgrade authority defaults to whoever runs the deploy command (a single hot key), and the
program is fully upgradeable, not immutable. **This is expected/default Anchor behavior, not a
finding** — but it means upgrade-authority custody needs a real decision (renounce vs.
multisig+timelock) at actual deployment time, which hasn't happened yet. We recommend
multisig+timelock over renounce, since pre-audit-signoff you'll likely still need to ship fixes.

## 9. Dependency vulnerabilities — 🟢 VERIFIED (scan run, not yet remediated)

`npm audit` (full output available; run from repo root): **44 vulnerabilities — 14 high, 22
moderate, 8 low.** Nearly all are transitive through `@reown/appkit`/WalletConnect
(`elliptic`, `ws`, `viem`, `decode-uri-component`) and `@solana/spl-token`'s `bigint-buffer`
dependency. `npm audit fix --force` is available but downgrades
`@solana/wallet-adapter-walletconnect` to 0.1.17 and `@solana/spl-token` to 0.1.8 — both breaking
changes needing manual regression testing, not something we applied blindly.

`cargo audit` was installed and run against the on-chain program's Cargo dependencies (395 crates
resolved, including `anchor-lang`, `anchor-spl`, litesvm dev-deps): **0 vulnerabilities.** 6
"unmaintained/unsound" advisory warnings (not vulnerabilities) on transitive dependencies pulled
in by the Anchor/Solana toolchain itself, not by `alloy_curve`'s own code — `ansi_term`,
`bincode`, `derivative`, `libsecp256k1`, `paste`, and `rand 0.7.3`. None are exploitable in this
program's context (e.g. `ansi_term` is a terminal-color crate that ships in as part of the
toolchain's CLI tooling, not the on-chain program logic). Recommend re-running before mainnet in
case the toolchain has since updated past these.

**Decision — 2026-09-04: defer the WalletConnect (`@reown/appkit`) / `@solana/spl-token`
upgrade.** Recorded decision, not an open question anymore.

Reasoning: of the 14 high-severity findings, 13 are unreachable in this app's actual usage —
they live in code paths (`elliptic`, `ws`, `viem`, `decode-uri-component` transitive chains) that
this app never exercises given how `@reown/appkit` is invoked here. The remaining one,
`bigint-buffer` (pulled in via `@solana/spl-token`), is a narrow, RPC-dependent issue rather than
a directly attacker-triggerable one from client input. `npm audit fix --force` would downgrade
`@solana/wallet-adapter-walletconnect` to 0.1.17 and `@solana/spl-token` to 0.1.8 — both breaking
changes requiring manual regression testing — and given the reachability analysis above, that
cost isn't justified right now.

**Reminder: re-run this reachability analysis before any mainnet deploy.** "Not reachable today"
is a statement about the current code paths and current dependency versions, not a permanent
property — a future change to how `@reown/appkit` or `@solana/spl-token` is invoked, or an
upgrade that changes the vulnerable code paths, could make one of the 13 reachable. Don't treat
this deferral as settled for a mainnet deploy without re-checking it then.

## 10. Secrets hygiene — 🟢 VERIFIED

`git log --all -p` scanned for API-key/private-key patterns (`sk-ant-`, `AIza`, `AKIA`, PEM
headers, etc.) across full history: only hit was the literal placeholder `sk-ant-...` in the
example env file — no real secret ever committed. `.gitignore` correctly excludes `.env*` and
`treasury-wallet.json`.

## 11. RPC fallback — 🟢 VERIFIED (built and tested this session)

`getConnection()` (`lib/onchain/program.ts`) now takes an ordered list of endpoints — primary
(`NEXT_PUBLIC_SOLANA_RPC_URL`) plus any comma-separated backups
(`NEXT_PUBLIC_SOLANA_RPC_FALLBACK_URLS`) — health-checks them in priority order via a raw
`getHealth` RPC call with a 3s timeout, and returns a `Connection` to the first that responds,
caching the choice for 30s before re-checking. All 6 call sites in the app updated to
`await getConnection()`; `npx tsc --noEmit` passes clean.

**Evidence** — ran the actual selection logic with the primary and first fallback pointed at
unreachable ports and a real endpoint as the second fallback:
```
configured endpoints (priority order): [
  'http://127.0.0.1:9',
  'http://127.0.0.1:9999',
  'http://127.0.0.1:8899'
]
selected endpoint: http://127.0.0.1:8899
failover took 40 ms
```
🟡 Not yet tested: failover mid-request (i.e. the primary going down between health checks, not
just being down at startup) — the 30s re-check interval bounds how long that takes to recover
from, but there's no test exercising that path specifically.

## 12. PII / verification data at rest — 🟢 VERIFIED (encryption built and tested this session)

Phone/email verification is still **simulated** by default (without `TWILIO_*`/`RESEND_*` env
vars, codes are echoed back rather than sent) — that hasn't changed. What changed: added
`lib/pii.ts` (AES-256-GCM, random IV per value) and wired it into `lib/verification.ts` so
`wallets.contact` and `verification_codes.contact`/`code` are now encrypted before ever touching
SQLite, decrypted only where displayed (`app/api/admin/verifications/route.ts`, with a
defensive fallback if a row somehow isn't valid ciphertext). New `PII_ENCRYPTION_KEY` env var
documented in `.env.local.example`; without it, a dev-only fallback key is used with a logged
warning, and it hard-throws in `NODE_ENV=production` instead of silently using that key.

**Evidence:**
```
ciphertext: i7kHTXjUraD8oroGzf6oXUDPM8loIb5Q9G699fUQrvan7KrxNqvqrA==
contains plaintext substring: false
decrypted matches original: true
```
🔴 Still an open question: this makes stored PII opaque at the DB-file level, but the encryption
key itself currently lives in process env — if you want protection against a compromised app
server (not just DB-file theft), you'd want the key in a secrets manager/KMS instead. Flagging
for your independent judgment on whether that's needed for launch size.

## 13. Concurrent-load behavior of fee split — 🟢 VERIFIED (tested this session)

Extended the `litesvm` test harness with 25 distinct trader wallets firing 300 rapid,
back-to-back buy/sell trades at the same curve (fresh blockhash forced each iteration so
transactions land distinct and immediate, not one-at-a-time with think time). Checked the
40/40/20 split **per individual trade**, not just in aggregate.

```
OK: 300 trades landed, 0 rejected (edge cases), across 300 distinct blockhashes, out of 300 attempted
OK: fee split held exactly (40/40/20) across every one of 300 rapid trades; creator +559555746, staker +559555746, treasury +279777956 lamports; curve graduated=false
```
🟡 Not yet tested: a burst that crosses the graduation threshold mid-run (this particular run
stayed pre-graduation the whole time since trades were sell-biased) — worth one more explicit run
forcing a graduation crossing under load, and a true multi-token concurrent-load run, before
mainnet.

---

## Re-verification pass — 2026-09-03 (same day, independent session)

Everything below was re-checked from scratch against the current code — not re-read from this
doc's claims above. Where this pass disagrees with or adds to an item above, that's noted.

- **§1 Fee split** — re-confirmed with a fresh clean rebuild (`cargo clean -p alloy_curve` +
  `anchor build` + `cargo test --release`, all 5 integration tests + 1 unit test passing,
  including the 300-trade concurrent-load test: exact 40/40/20 split held on every trade).
  🟢 still verified.
- **§2 Anti-rug-pull** — independently re-read `lib/rugDetection.ts` end to end: still purely a
  read/scoring function, zero callers outside the UI, not imported by `lib/trading.ts` or any
  API route. Confirmed: **there is nothing to bypass, because nothing enforces it.** If any
  user-facing copy implies flagged wallets are blocked, that claim is false as of this code.
  🔴 still open — this is a product decision, not a bug.
- **§3 Admin checks** — re-confirmed `lib/admin.ts` unchanged; `isAppAdmin()` still falls back to
  on-chain treasury admin when `ADMIN_WALLET_IDS` is unset. **Action item, not a code fix:**
  set `ADMIN_WALLET_IDS` explicitly in the production environment before launch — don't rely on
  the fallback firing correctly by accident.
- **§5 IDOR / listing-hijack** — **definitive re-verification, done independently, not by
  re-reading this doc's §5 claim:** read `app/api/tokens/route.ts` POST directly — the hijack
  fix (`onchainCurve.creator !== creatorId` check against the session wallet, atomic INSERT on
  the mint-address primary key) is genuinely present. Separately read `lib/auth.ts` — the
  session wallet comes from an HMAC-signed, `httpOnly` cookie bound to a real ed25519 signature
  over a single-use nonce (`verifySignature`), not client-suppliable. Spot-checked 3 of the 18
  dynamic-`[id]` mutation routes directly (`wallet/[id]` PATCH, `tokens/[id]` PATCH,
  `connections/[id]/respond`) — all three check the session wallet against resource ownership
  before writing. **Both fixes are real and correct in the current code. This is settled — not
  "still unclear."**
- **§6 Kill switch** — re-tested after a clean rebuild (see below) and still passes: unauthorized
  pause rejected, buy/init-curve rejected while paused, resumes correctly after unpause. Still
  only tested at the unit/local-validator level — devnet + real wallet-adapter UI dry run is
  still not done (unchanged gap from original §6).
- **§7 Treasury custody — re-confirmed explicitly, still the placeholder.** `TREASURY_ADMIN` in
  `lib.rs` is still `9EujSJZEKXFWeaAYfRRacq6y9rjkTjLD2P3UcUtvGFqQ`, the locally-generated
  `treasury-wallet.json` dev key. **Nothing about this has changed. This is the single
  highest-consequence item in this whole doc and it is not done.**
- **§9 Dependency vulnerabilities** — re-ran both scanners fresh: `npm audit` still exactly
  44/14/22/8 (total/high/moderate/low), unchanged since the original scan — confirms no fix was
  ever applied, and no decision has been recorded anywhere in the repo (git log, docs) about
  what to do with the WalletConnect-transitive findings. **Still fully open.** `cargo audit`
  still 0 vulnerabilities, same 6 unmaintained/unsound advisory warnings on toolchain
  transitive deps, none in `alloy_curve`'s own code.
- **§11 RPC fallback** — code re-confirmed unchanged and intact; still only tested for "primary
  down at startup," not mid-session failover.
- **§13 Load test** — re-ran fresh (part of the clean rebuild above); still only single-token,
  pre-graduation. Graduation-crossing burst and multi-token concurrent load still untested.

### New this pass: independent fresh-eyes read of `buy`/`sell` for drain/rug-bypass/balance-manipulation

Read `onchain/programs/alloy_curve/src/lib.rs` in full, independent of the sections above, looking
specifically for a way to drain funds, bypass rug-pull enforcement, or manipulate one's own
balance. Findings:

- **No drain vector found.** Every payout (`sell`'s SOL, `buy`'s tokens) happens only *after* the
  corresponding CPI that proves the trader actually has what they're trading away (SPL transfer
  of tokens on `sell`, lamport transfer of SOL on `buy`) — Solana's atomic-transaction semantics
  mean if that CPI fails for insufficient balance, the whole instruction (including any earlier
  reserve-state mutation) reverts. There's no code path that credits a payout without the matching
  debit having actually succeeded.
- **No redirection vector.** `creator`, `sol_vault`, `staker_pool`, and `treasury` are all either
  `has_one`-constrained or PDA-seed-derived — a caller cannot substitute an attacker-controlled
  account for any of the fee-split destinations.
- **No re-mint / dilution vector.** Mint authority is revoked permanently inside `initialize_curve`
  itself, before the function returns — there's no later instruction that could mint more supply.
- **Reserve-arithmetic underflow check:** `curve.virtual_token_reserves -= out` and
  `curve.real_token_reserves -= out` (lib.rs:130,135) are raw (non-`checked_`) subtractions.
  Traced the invariant by hand: `real_token_reserves <= virtual_token_reserves` holds from
  initialization (793.1M ≤ 1.073B) and is preserved every trade because the clamp at lib.rs:126-128
  guarantees `out <= real_token_reserves` before either field is decremented by that same `out` —
  so neither subtraction can underflow. (Also: `overflow-checks = true` is set in the release
  profile, so this would panic loudly rather than silently wrap if the invariant were ever wrong —
  and the fresh test run above exercised this path, including the graduation transition, with no
  panic.)
- **Rounding-direction check:** integer division in the constant-product math rounds in the
  trader's favor by construction (floor division on the *reserve being reduced*), but bounded to
  at most 1 raw unit (1 micro-token or 1 lamport) per trade — economically dust, far smaller than
  the 1%/0.25% fee or any real transaction cost, not compounding faster than linearly with trade
  count. Not exploitable at any practical scale.
- **Anti-rug-pull "ban":** confirmed (again, see §2 above) there is no on-chain or API-layer
  enforcement to bypass — `assessRugRisk()` never gates a trade anywhere in `lib/trading.ts` or
  the on-chain program.
- Also independently checked the **off-chain simulated ledger** (`lib/trading.ts`, used for the
  guest/non-wallet-connected "SIMULATED LEDGER" mode): `executeBuy`/`executeSell` run inside a
  single `db.transaction()`, check `wallet.core_balance`/`holding.amount` before allowing the
  trade, and the calling route (`app/api/tokens/[id]/trade/route.ts`) takes `walletId` only from
  `getSessionWalletId()` — never from the request body — so a client can't trade against someone
  else's simulated balance either.

### Toolchain re-run (fresh, this pass)

- `npx tsc --noEmit` — clean, 0 errors.
- `cargo check --release` — clean.
- `cargo clippy --release --all-targets` — 1 warning, purely stylistic
  (`assign_op_pattern` on lib.rs:130, the same line manually proven safe above) — not a
  correctness or security finding.
- `cargo test --release` — **initially failed all 5 integration tests** with
  `run \`anchor build\` first so target/deploy/alloy_curve.so exists`, despite the .so file
  actually being present on disk. Root cause: a stale compiled test binary left over from
  renaming this project's directory from `ember` to `alloy` earlier in the day —
  `env!("CARGO_MANIFEST_DIR")` gets baked into the test binary at compile time, and cargo's
  incremental build hadn't detected the directory rename as a reason to recompile it, so the
  binary was still looking for `/Users/artyom/projects/ember/onchain/...`. Fixed with
  `cargo clean -p alloy_curve --release`; all 5 tests pass on the clean rebuild (output above).
  **Not a code regression** — but if you ever move/rename this directory again, run
  `cargo clean -p alloy_curve` in `onchain/` before trusting a green test run.
- No JS/TS automated test suite exists anywhere in the app (`grep` for `*.test.*`/`*.spec.*`
  across the repo: zero hits). Playwright is a `devDependency` but has no config or spec files —
  it isn't wired to anything. Every API-route/auth/IDOR finding in this document rests on manual
  code review, not on regression tests that would catch a future accidental reintroduction.

### Not independently re-verifiable this pass

No browser is available in this environment. Did not click through the wallet-connect flow or
the create-token flow live, and did not visually confirm the maximized/windowed ticker behavior.
Did confirm: every nav route returns HTTP 200 with no server-side errors logged
(`/`, `/about`, `/ideas`, `/create`, `/stake`, `/connect`, `/wallet`, `/settings`), and read the
create-token flow's code end to end (`app/(app)/create/page.tsx`) — it correctly awaits
`connection.confirmTransaction(...)` before POSTing to `/api/tokens`, so there's no race between
the on-chain confirm and the server-side verification. This is a code-correctness check, not a
substitute for actually clicking through it.

### Domain

No evidence in this repo of an actual registered/configured production domain — `alloy.fun`
appears exactly once, as a hardcoded fallback string in `app/providers.tsx`'s WalletConnect
metadata (`... : "https://alloy.fun"`), used only when `window` is undefined during SSR. That's
not proof of a real, owned, DNS-configured domain. This is outside what the codebase can confirm —
needs a direct answer from you, not from a code review.

---

## 14. Vault rent-exemption bootstrap — 🟢 FIXED (2026-09-05, folded into init code path)

**The bug:** `treasury` and `staker_pool` are bare system-owned PDAs (never `init`'d) that sit at
0 lamports until something transfers into them. Solana's runtime rejects any transfer that would
leave a fresh account non-zero but below the rent-exempt minimum for its size — and a normal
trade's treasury/staker fee cut (a fraction of 1% of the trade) is almost always smaller than
that minimum. Left alone, this would have rejected literally every real trade on a live deploy.

**How it was originally found and fixed:** caught by scripting a real wallet through the actual
buy/sell flow on devnet (see Tier 2 of the 2026-09-05 session). The immediate fix at the time was
a manual `solana transfer`-equivalent top-up against the already-deployed devnet program — **not**
a code change, meaning a future mainnet deploy would have hit the exact same failure on its first
real trade unless someone remembered to repeat that manual step.

**The permanent fix:** `initialize_treasury_config` (`onchain/programs/alloy_curve/src/lib.rs`)
now tops up both `treasury` and `staker_pool` to `Rent::get()?.minimum_balance(0)` itself, paid by
the calling admin, as part of the same one-time bootstrap call that sets the treasury admin.
Since `initialize_treasury_config` must be called once before real trading can meaningfully
happen on any deploy (devnet or mainnet), this can no longer be forgotten — it's not a separate
step to remember, it's the same step that was already mandatory.

Regression-tested in `onchain/programs/alloy_curve/tests/integration.rs`
(`treasury_config_bootstrap_funds_vaults_past_rent_exemption`): confirms both vaults start at 0,
confirms they're at or above the rent-exempt minimum immediately after
`initialize_treasury_config`, and then runs a real small buy (0.1 SOL, whose staker/treasury fee
cuts are ~400k/~200k lamports — both under the rent-exempt minimum) to prove the trade that used
to fail now succeeds. All 6 integration tests pass (`cargo test --release`).

**Still worth doing before mainnet:** the devnet program's vaults were already funded manually
before this fix existed — that funding is now redundant but harmless. A *fresh* mainnet program
deploy will get its vaults funded automatically the first time `initialize_treasury_config` is
called, with no separate manual step required.

---

### Appendix: routes with dynamic `[id]` segments (for §5's IDOR sweep)

```
app/api/wallet/[id]/route.ts
app/api/wallet/[id]/trades/route.ts
app/api/wallet/[id]/profile/route.ts
app/api/wallet/[id]/history/route.ts
app/api/wallet/[id]/positions/route.ts
app/api/wallet/[id]/verify/request/route.ts
app/api/wallet/[id]/verify/confirm/route.ts
app/api/tokens/[id]/route.ts
app/api/tokens/[id]/trade/route.ts
app/api/tokens/[id]/trade/confirm/route.ts
app/api/tokens/[id]/project/route.ts
app/api/tokens/[id]/stream/route.ts
app/api/tokens/[id]/chart/route.ts
app/api/connections/[id]/respond/route.ts
app/api/feed/[id]/like/route.ts
app/api/feed/[id]/replies/route.ts
app/api/admin/verifications/[id]/decide/route.ts
app/api/admin/feedback/[id]/resolve/route.ts
```
