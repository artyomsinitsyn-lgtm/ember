import { TRADE_FEE_BPS, POST_GRADUATION_TRADE_FEE_BPS, FEE_SPLIT, BPS_DENOM, GRADUATION_CORE_RAISED } from "./constants";

export interface CurveState {
  vCore: number;
  vToken: number;
  realCore: number;
  realToken: number;
}

export interface PoolState {
  poolCore: number;
  poolToken: number;
}

export interface FeeBreakdown {
  total: number;
  creator: number;
  staker: number;
  treasury: number;
}

export function splitFee(feeTotal: number): FeeBreakdown {
  return {
    total: feeTotal,
    creator: (feeTotal * FEE_SPLIT.creator) / BPS_DENOM,
    staker: (feeTotal * FEE_SPLIT.staker) / BPS_DENOM,
    treasury: (feeTotal * FEE_SPLIT.treasury) / BPS_DENOM,
  };
}

export function currentPrice(vCore: number, vToken: number): number {
  return vCore / vToken;
}

export function marketCap(vCore: number, vToken: number, totalSupply: number): number {
  return currentPrice(vCore, vToken) * totalSupply;
}

export function graduationProgress(realCore: number): number {
  return Math.min(1, realCore / GRADUATION_CORE_RAISED);
}

/** Buy `coreIn` worth of a Token still on its bonding curve (pre-graduation). */
export function quoteBuyOnCurve(state: CurveState, coreIn: number) {
  const fee = (coreIn * TRADE_FEE_BPS) / BPS_DENOM;
  const coreIntoCurve = coreIn - fee;
  const k = state.vCore * state.vToken;
  const newVCore = state.vCore + coreIntoCurve;
  const newVToken = k / newVCore;
  let tokensOut = state.vToken - newVToken;

  // Can't buy more than what's actually left for sale.
  if (tokensOut > state.realToken) {
    tokensOut = state.realToken;
  }

  return {
    tokensOut,
    fee: splitFee(fee),
    newVCore,
    newVToken,
    newRealCore: state.realCore + coreIntoCurve,
    newRealToken: state.realToken - tokensOut,
  };
}

/** Sell `tokensIn` back into the bonding curve (pre-graduation). */
export function quoteSellOnCurve(state: CurveState, tokensIn: number) {
  const k = state.vCore * state.vToken;
  const newVToken = state.vToken + tokensIn;
  const newVCore = k / newVToken;
  const coreOutGross = state.vCore - newVCore;
  const fee = (coreOutGross * TRADE_FEE_BPS) / BPS_DENOM;
  const coreOutNet = coreOutGross - fee;

  return {
    coreOutNet,
    fee: splitFee(fee),
    newVCore,
    newVToken,
    newRealCore: state.realCore - coreOutGross,
    newRealToken: state.realToken + tokensIn,
  };
}

/** Buy against the post-graduation constant-product pool (protocol-owned liquidity). */
export function quoteBuyOnPool(pool: PoolState, coreIn: number) {
  const fee = (coreIn * POST_GRADUATION_TRADE_FEE_BPS) / BPS_DENOM;
  const coreIntoPool = coreIn - fee;
  const k = pool.poolCore * pool.poolToken;
  const newPoolCore = pool.poolCore + coreIntoPool;
  const newPoolToken = k / newPoolCore;
  const tokensOut = pool.poolToken - newPoolToken;

  return { tokensOut, fee: splitFee(fee), newPoolCore, newPoolToken };
}

export function quoteSellOnPool(pool: PoolState, tokensIn: number) {
  const k = pool.poolCore * pool.poolToken;
  const newPoolToken = pool.poolToken + tokensIn;
  const newPoolCore = k / newPoolToken;
  const coreOutGross = pool.poolCore - newPoolCore;
  const fee = (coreOutGross * POST_GRADUATION_TRADE_FEE_BPS) / BPS_DENOM;
  const coreOutNet = coreOutGross - fee;

  return { coreOutNet, fee: splitFee(fee), newPoolCore, newPoolToken };
}
