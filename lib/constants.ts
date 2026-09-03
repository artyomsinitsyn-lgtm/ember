// Curve shape mirrors pump.fun's real constants (virtual reserves, ~$69k-equivalent graduation
// target). These numbers are the source of truth for both sides: the guest demo ledger below
// (denominated in a display-only "$" currency, not a real chain) and the real on-chain program
// at onchain/programs/alloy_curve/src/lib.rs (denominated in SOL/lamports) are calibrated to
// match exactly — see that file's own copy of these constants.
export const TOTAL_SUPPLY = 1_000_000_000;
export const INITIAL_VIRTUAL_TOKEN_RESERVES = 1_073_000_000;
export const INITIAL_VIRTUAL_CORE_RESERVES = 30;
export const INITIAL_REAL_TOKEN_RESERVES = 793_100_000;
export const GRADUATION_CORE_RAISED = 85;

export const TRADE_FEE_BPS = 100; // 1% pre-graduation, same headline rate as pump.fun/letsbonk
export const POST_GRADUATION_TRADE_FEE_BPS = 25; // 0.25% once the curve graduates to a pool —
// matches pump.fun's PumpSwap discount; mirrors onchain/programs/alloy_curve/src/lib.rs exactly.

// Where that 1% actually goes is the whole point: pump.fun keeps 100% of it.
// Here it's split so the people holding the platform token capture real yield.
export const FEE_SPLIT = {
  creator: 4000, // 40% -> the Token's creator
  staker: 4000, // 40% -> ALLOY stakers, pro-rata, forever (including post-graduation pool fees)
  treasury: 2000, // 20% -> protocol treasury
};

export const ZEBRA_TOTAL_SUPPLY = 100_000_000;
export const BPS_DENOM = 10_000;

export const YOU_WALLET_ID = "you";

// A wallet is "verified" once its contact (phone or email) is confirmed AND its net
// trade P&L has crossed this bar — profit alone is easy to fake with wash trades against
// yourself, and contact alone doesn't mean much, so both gates have to clear.
export const VERIFIED_PROFIT_THRESHOLD = 500;

// How long a token must exist, with no active high rug-risk flag, before its Challenge
// rank is treated as payout-eligible for ad placement. Client-safe (no DB import) so the
// leaderboard page can compute a live countdown without pulling in server-only code.
export const CHALLENGE_ELIGIBILITY_HOURS = 72;

// Display tickers. Internal fields/vars (core_balance, coreAmount, vCore, embr_balance,
// etc.) stay as-is — these are purely what gets rendered to users, one place to rename.
export const CURRENCY_TICKER = "USD";
export const STAKE_TICKER = "ALLOY";

