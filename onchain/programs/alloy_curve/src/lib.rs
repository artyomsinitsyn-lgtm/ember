use anchor_lang::prelude::*;
use anchor_lang::system_program;
use anchor_spl::associated_token::AssociatedToken;
use anchor_spl::token::{self, Mint, MintTo, SetAuthority, Token, TokenAccount, Transfer};
use anchor_spl::token::spl_token::instruction::AuthorityType;

declare_id!("9brEDkea42QTp3dGT7jMWLE7pgnttHo5ZmyWDDPkzrbb");

// Mirrors lib/constants.ts exactly. Token amounts are raw units at DECIMALS; SOL amounts are
// lamports. Pump.fun's real numbers (30 virtual SOL, 85 SOL graduation, 1.073B virtual token
// reserves, 793.1M real token reserves out of a 1B total supply) are what this app's "core"
// currency was calibrated against from day one, so porting on-chain is a straight unit swap
// from float-dollars to lamports/raw-token-units — no curve-shape changes.
pub const DECIMALS: u8 = 6;
const UNIT: u64 = 1_000_000; // 10^DECIMALS

pub const TOTAL_SUPPLY: u64 = 1_000_000_000 * UNIT;
pub const INITIAL_VIRTUAL_TOKEN_RESERVES: u64 = 1_073_000_000 * UNIT;
pub const INITIAL_REAL_TOKEN_RESERVES: u64 = 793_100_000 * UNIT;
pub const INITIAL_VIRTUAL_SOL_RESERVES: u64 = 30 * LAMPORTS_PER_SOL;
pub const GRADUATION_SOL_RAISED: u64 = 85 * LAMPORTS_PER_SOL;

pub const TRADE_FEE_BPS: u64 = 100; // 1% pre-graduation, matches pump.fun/letsbonk's headline rate
pub const POST_GRADUATION_TRADE_FEE_BPS: u64 = 25; // 0.25% once liquidity is a protocol-owned pool — same
                                                     // discount pump.fun's PumpSwap applies post-graduation.
pub const FEE_SPLIT_CREATOR_BPS: u64 = 4000; // 40%
pub const FEE_SPLIT_STAKER_BPS: u64 = 4000; // 40%
pub const FEE_SPLIT_TREASURY_BPS: u64 = 2000; // 20%
pub const BPS_DENOM: u64 = 10_000;

// The platform's own wallet — public address only, no key material lives in this repo. Every
// trade's treasury cut already streams automatically into the program-owned `treasury` PDA
// below (see `buy`/`sell`); this constant is who's allowed to claim admin over that PDA and
// direct withdrawals out of it, so fee collection can't be front-run by whoever calls
// `initialize_treasury_config` first.
// PLACEHOLDER — this is a locally-generated dev keypair (treasury-wallet.json, gitignored), not
// a real controlled wallet. Swap this for your hardware wallet's real pubkey before any devnet
// or mainnet deployment; whoever holds this address's private key currently controls nothing
// live, but would become the real treasury admin the moment this program is deployed and
// initialize_treasury_config/initialize_emergency_config are called on a real network.
#[constant]
pub const TREASURY_ADMIN: Pubkey = pubkey!("9EujSJZEKXFWeaAYfRRacq6y9rjkTjLD2P3UcUtvGFqQ");

const LAMPORTS_PER_SOL: u64 = 1_000_000_000;

const CURVE_SEED: &[u8] = b"curve";
const SOL_VAULT_SEED: &[u8] = b"sol_vault";
const TREASURY_SEED: &[u8] = b"treasury";
const TREASURY_CONFIG_SEED: &[u8] = b"treasury_config";
const STAKER_POOL_SEED: &[u8] = b"staker_pool";
const EMERGENCY_CONFIG_SEED: &[u8] = b"emergency_config";

#[program]
pub mod alloy_curve {
    use super::*;

    /// Mints the token's full fixed supply into the curve's vault, revokes mint authority
    /// forever (no creator pre-allocation, no future minting — matches the "Lock" promise
    /// already made in the UI), and initializes the bonding curve at pump.fun's real starting
    /// reserves.
    pub fn initialize_curve(ctx: Context<InitializeCurve>) -> Result<()> {
        require!(!ctx.accounts.emergency_config.paused, CurveError::TradingPaused);
        let curve = &mut ctx.accounts.curve;

        token::mint_to(
            CpiContext::new(
                token::ID,
                MintTo {
                    mint: ctx.accounts.mint.to_account_info(),
                    to: ctx.accounts.curve_token_vault.to_account_info(),
                    authority: ctx.accounts.creator.to_account_info(),
                },
            ),
            TOTAL_SUPPLY,
        )?;

        token::set_authority(
            CpiContext::new(
                token::ID,
                SetAuthority {
                    current_authority: ctx.accounts.creator.to_account_info(),
                    account_or_mint: ctx.accounts.mint.to_account_info(),
                },
            ),
            AuthorityType::MintTokens,
            None,
        )?;

        curve.creator = ctx.accounts.creator.key();
        curve.mint = ctx.accounts.mint.key();
        curve.virtual_sol_reserves = INITIAL_VIRTUAL_SOL_RESERVES;
        curve.virtual_token_reserves = INITIAL_VIRTUAL_TOKEN_RESERVES;
        curve.real_sol_reserves = 0;
        curve.real_token_reserves = INITIAL_REAL_TOKEN_RESERVES;
        curve.graduated = false;
        curve.bump = ctx.bumps.curve;
        curve.sol_vault_bump = ctx.bumps.sol_vault;

        emit!(CurveInitialized {
            mint: curve.mint,
            creator: curve.creator,
        });
        Ok(())
    }

    pub fn buy(ctx: Context<Trade>, sol_in: u64, min_tokens_out: u64) -> Result<()> {
        require!(!ctx.accounts.emergency_config.paused, CurveError::TradingPaused);
        require!(sol_in > 0, CurveError::ZeroAmount);
        let curve_account_info = ctx.accounts.curve.to_account_info();
        let curve = &mut ctx.accounts.curve;
        // Captured before any mutation below: the trade that pushes the curve past graduation
        // is still priced at the pre-graduation rate, since that's the regime it was placed in.
        let fee_bps = if curve.graduated { POST_GRADUATION_TRADE_FEE_BPS } else { TRADE_FEE_BPS };

        let fee = sol_in
            .checked_mul(fee_bps)
            .ok_or(CurveError::MathOverflow)?
            / BPS_DENOM;
        let sol_into_reserves = sol_in.checked_sub(fee).ok_or(CurveError::MathOverflow)?;

        let tokens_out = if !curve.graduated {
            let k = (curve.virtual_sol_reserves as u128) * (curve.virtual_token_reserves as u128);
            let new_virtual_sol = curve.virtual_sol_reserves as u128 + sol_into_reserves as u128;
            let new_virtual_token = k / new_virtual_sol;
            let mut out = (curve.virtual_token_reserves as u128).saturating_sub(new_virtual_token) as u64;
            if out > curve.real_token_reserves {
                out = curve.real_token_reserves;
            }
            curve.virtual_sol_reserves = new_virtual_sol as u64;
            curve.virtual_token_reserves = curve.virtual_token_reserves - out;
            curve.real_sol_reserves = curve
                .real_sol_reserves
                .checked_add(sol_into_reserves)
                .ok_or(CurveError::MathOverflow)?;
            curve.real_token_reserves -= out;

            if curve.real_sol_reserves >= GRADUATION_SOL_RAISED || curve.real_token_reserves == 0 {
                curve.graduated = true;
                // Seed the post-graduation pool with the allocation held back from the curve
                // since `initialize_curve` (TOTAL_SUPPLY - INITIAL_REAL_TOKEN_RESERVES =
                // 206.9M) — it was minted into `curve_token_vault` on day one but never counted
                // in `real_token_reserves`, so it's already sitting there unspent. Without this,
                // `real_token_reserves` is ~0 right at the graduation instant (by construction —
                // reaching GRADUATION_SOL_RAISED and draining the real reserves happen together
                // on this curve shape), so the post-graduation constant-product invariant
                // `k = real_sol_reserves * real_token_reserves` collapses to ~0 and the first
                // seller after graduation could withdraw nearly the entire vault instead of a
                // fair share.
                curve.real_token_reserves = TOTAL_SUPPLY - INITIAL_REAL_TOKEN_RESERVES;
            }
            out
        } else {
            let k = (curve.real_sol_reserves as u128) * (curve.real_token_reserves as u128);
            let new_pool_sol = curve.real_sol_reserves as u128 + sol_into_reserves as u128;
            let new_pool_token = k / new_pool_sol;
            let out = (curve.real_token_reserves as u128).saturating_sub(new_pool_token) as u64;
            curve.real_sol_reserves = new_pool_sol as u64;
            curve.real_token_reserves = new_pool_token as u64;
            out
        };

        require!(tokens_out >= min_tokens_out, CurveError::SlippageExceeded);
        require!(tokens_out > 0, CurveError::ZeroOutput);

        let fees = FeeSplit::of(fee);
        transfer_lamports(&ctx.accounts.buyer.to_account_info(), &ctx.accounts.sol_vault.to_account_info(), sol_into_reserves)?;
        transfer_lamports(&ctx.accounts.buyer.to_account_info(), &ctx.accounts.creator.to_account_info(), fees.creator)?;
        transfer_lamports(&ctx.accounts.buyer.to_account_info(), &ctx.accounts.staker_pool.to_account_info(), fees.staker)?;
        transfer_lamports(&ctx.accounts.buyer.to_account_info(), &ctx.accounts.treasury.to_account_info(), fees.treasury)?;

        let mint_key = ctx.accounts.mint.key();
        let seeds: &[&[u8]] = &[CURVE_SEED, mint_key.as_ref(), &[curve.bump]];
        token::transfer(
            CpiContext::new_with_signer(
                token::ID,
                Transfer {
                    from: ctx.accounts.curve_token_vault.to_account_info(),
                    to: ctx.accounts.trader_token_account.to_account_info(),
                    authority: curve_account_info,
                },
                &[seeds],
            ),
            tokens_out,
        )?;

        emit!(TradeEvent {
            mint: mint_key,
            trader: ctx.accounts.buyer.key(),
            is_buy: true,
            sol_amount: sol_in,
            token_amount: tokens_out,
            graduated: curve.graduated,
        });
        Ok(())
    }

    pub fn sell(ctx: Context<Trade>, tokens_in: u64, min_sol_out: u64) -> Result<()> {
        require!(!ctx.accounts.emergency_config.paused, CurveError::TradingPaused);
        require!(tokens_in > 0, CurveError::ZeroAmount);
        let curve = &mut ctx.accounts.curve;
        // sell() never flips `graduated`, so reading it once up front is safe either way.
        let fee_bps = if curve.graduated { POST_GRADUATION_TRADE_FEE_BPS } else { TRADE_FEE_BPS };

        let sol_out_gross: u64 = if !curve.graduated {
            let k = (curve.virtual_sol_reserves as u128) * (curve.virtual_token_reserves as u128);
            let new_virtual_token = curve.virtual_token_reserves as u128 + tokens_in as u128;
            let new_virtual_sol = k / new_virtual_token;
            let gross = (curve.virtual_sol_reserves as u128).saturating_sub(new_virtual_sol) as u64;
            curve.virtual_sol_reserves = new_virtual_sol as u64;
            curve.virtual_token_reserves = new_virtual_token as u64;
            curve.real_sol_reserves = curve.real_sol_reserves.saturating_sub(gross);
            curve.real_token_reserves = curve
                .real_token_reserves
                .checked_add(tokens_in)
                .ok_or(CurveError::MathOverflow)?;
            gross
        } else {
            let k = (curve.real_sol_reserves as u128) * (curve.real_token_reserves as u128);
            let new_pool_token = curve.real_token_reserves as u128 + tokens_in as u128;
            let new_pool_sol = k / new_pool_token;
            let gross = (curve.real_sol_reserves as u128).saturating_sub(new_pool_sol) as u64;
            curve.real_sol_reserves = new_pool_sol as u64;
            curve.real_token_reserves = new_pool_token as u64;
            gross
        };

        let fee = sol_out_gross
            .checked_mul(fee_bps)
            .ok_or(CurveError::MathOverflow)?
            / BPS_DENOM;
        let sol_out_net = sol_out_gross.checked_sub(fee).ok_or(CurveError::MathOverflow)?;
        require!(sol_out_net >= min_sol_out, CurveError::SlippageExceeded);
        require!(sol_out_net > 0, CurveError::ZeroOutput);

        let mint_key = ctx.accounts.mint.key();
        token::transfer(
            CpiContext::new(
                token::ID,
                Transfer {
                    from: ctx.accounts.trader_token_account.to_account_info(),
                    to: ctx.accounts.curve_token_vault.to_account_info(),
                    authority: ctx.accounts.buyer.to_account_info(),
                },
            ),
            tokens_in,
        )?;

        let fees = FeeSplit::of(fee);
        let vault_seeds: &[&[u8]] = &[SOL_VAULT_SEED, mint_key.as_ref(), &[curve.sol_vault_bump]];
        transfer_lamports_signed(&ctx.accounts.sol_vault.to_account_info(), &ctx.accounts.buyer.to_account_info(), sol_out_net, vault_seeds)?;
        transfer_lamports_signed(&ctx.accounts.sol_vault.to_account_info(), &ctx.accounts.creator.to_account_info(), fees.creator, vault_seeds)?;
        transfer_lamports_signed(&ctx.accounts.sol_vault.to_account_info(), &ctx.accounts.staker_pool.to_account_info(), fees.staker, vault_seeds)?;
        transfer_lamports_signed(&ctx.accounts.sol_vault.to_account_info(), &ctx.accounts.treasury.to_account_info(), fees.treasury, vault_seeds)?;

        emit!(TradeEvent {
            mint: mint_key,
            trader: ctx.accounts.buyer.key(),
            is_buy: false,
            sol_amount: sol_out_net,
            token_amount: tokens_in,
            graduated: curve.graduated,
        });
        Ok(())
    }

    /// One-time bootstrap: only `TREASURY_ADMIN` (the platform's own wallet) can call this, and
    /// doing so makes it the treasury admin — the only wallet allowed to withdraw the
    /// protocol's accumulated fee cut or hand admin off to someone else.
    ///
    /// Also tops up the `treasury` and `staker_pool` vaults to the rent-exemption minimum. Both
    /// are bare system-owned PDAs (never `init`'d) that otherwise sit at 0 lamports until the
    /// first trade's fee cut lands in them — and that first cut is normally far smaller than the
    /// rent-exempt minimum for a fresh account, which the runtime rejects. Doing the top-up here,
    /// as part of the same one-time call that must happen before real trading opens, means no
    /// deploy can ever go live without it (see `docs/security/audit-package.md` §7).
    pub fn initialize_treasury_config(ctx: Context<InitializeTreasuryConfig>) -> Result<()> {
        let config = &mut ctx.accounts.treasury_config;
        config.admin = ctx.accounts.admin.key();
        config.bump = ctx.bumps.treasury_config;

        let min_balance = Rent::get()?.minimum_balance(0);
        for vault in [&ctx.accounts.treasury, &ctx.accounts.staker_pool] {
            let shortfall = min_balance.saturating_sub(vault.lamports());
            transfer_lamports(&ctx.accounts.admin.to_account_info(), &vault.to_account_info(), shortfall)?;
        }

        emit!(TreasuryAdminChanged { new_admin: config.admin });
        Ok(())
    }

    /// Hands treasury admin off to a different wallet — lets the payout destination change
    /// (e.g. from a dev keypair to a real cold wallet) without redeploying the program.
    ///
    /// Checked manually (rather than an accounts-level `has_one = admin`) so the IDL never
    /// records a `relations` hint on a signer account — the current anchor-ts client's
    /// generated types can't resolve that combination.
    pub fn set_treasury_admin(ctx: Context<SetTreasuryAdmin>, new_admin: Pubkey) -> Result<()> {
        require_keys_eq!(ctx.accounts.treasury_config.admin, ctx.accounts.admin.key(), CurveError::Unauthorized);
        ctx.accounts.treasury_config.admin = new_admin;
        emit!(TreasuryAdminChanged { new_admin });
        Ok(())
    }

    /// Pays `amount` lamports out of the protocol treasury vault to any destination the admin
    /// names. The vault (`treasury`) is never `init`'d as a data account — it stays a bare
    /// system-owned PDA that only ever receives lamports — so this moves funds out of it with
    /// the same signed system-program transfer pattern the `sell` payouts above use.
    pub fn withdraw_treasury(ctx: Context<WithdrawTreasury>, amount: u64) -> Result<()> {
        require_keys_eq!(ctx.accounts.treasury_config.admin, ctx.accounts.admin.key(), CurveError::Unauthorized);
        require!(amount > 0, CurveError::ZeroAmount);
        let seeds: &[&[u8]] = &[TREASURY_SEED, &[ctx.bumps.treasury]];
        transfer_lamports_signed(&ctx.accounts.treasury.to_account_info(), &ctx.accounts.to.to_account_info(), amount, seeds)?;
        emit!(TreasuryWithdrawn { to: ctx.accounts.to.key(), amount });
        Ok(())
    }

    /// One-time bootstrap, same pattern as `initialize_treasury_config`: only `TREASURY_ADMIN`
    /// can call this, and doing so makes it the emergency-pause authority. Deliberately a
    /// separate config/authority from `treasury_config` — the whole point of a kill switch is
    /// that whoever can trigger it doesn't need to go through multisig/treasury quorum to react
    /// in an emergency, so its authority has to be independently held and independently
    /// rotatable via `set_emergency_admin` (e.g. to a faster-reacting hot key) without that
    /// change ever touching treasury custody.
    pub fn initialize_emergency_config(ctx: Context<InitializeEmergencyConfig>) -> Result<()> {
        let config = &mut ctx.accounts.emergency_config;
        config.authority = ctx.accounts.admin.key();
        config.paused = false;
        config.bump = ctx.bumps.emergency_config;
        emit!(EmergencyAdminChanged { new_authority: config.authority });
        Ok(())
    }

    /// Hands the pause authority to a different wallet (e.g. a hot ops key instead of the
    /// treasury's hardware wallet, so pausing doesn't require digging out cold storage during
    /// an incident). Only the current emergency authority can do this.
    pub fn set_emergency_admin(ctx: Context<SetEmergencyAdmin>, new_authority: Pubkey) -> Result<()> {
        require_keys_eq!(ctx.accounts.emergency_config.authority, ctx.accounts.authority.key(), CurveError::Unauthorized);
        ctx.accounts.emergency_config.authority = new_authority;
        emit!(EmergencyAdminChanged { new_authority });
        Ok(())
    }

    /// Halts `initialize_curve`, `buy`, and `sell` platform-wide. Callable by the emergency
    /// authority alone — no treasury/multisig quorum needed, so it can fire the moment an
    /// exploit or drain is spotted.
    pub fn pause(ctx: Context<SetPaused>) -> Result<()> {
        require_keys_eq!(ctx.accounts.emergency_config.authority, ctx.accounts.authority.key(), CurveError::Unauthorized);
        ctx.accounts.emergency_config.paused = true;
        emit!(EmergencyPauseToggled { paused: true });
        Ok(())
    }

    /// Resumes trading/minting after a pause. Same authority as `pause`.
    pub fn unpause(ctx: Context<SetPaused>) -> Result<()> {
        require_keys_eq!(ctx.accounts.emergency_config.authority, ctx.accounts.authority.key(), CurveError::Unauthorized);
        ctx.accounts.emergency_config.paused = false;
        emit!(EmergencyPauseToggled { paused: false });
        Ok(())
    }
}

struct FeeSplit {
    creator: u64,
    staker: u64,
    treasury: u64,
}

impl FeeSplit {
    fn of(total: u64) -> Self {
        let creator = total * FEE_SPLIT_CREATOR_BPS / BPS_DENOM;
        let staker = total * FEE_SPLIT_STAKER_BPS / BPS_DENOM;
        // Treasury absorbs any rounding remainder so the three cuts always sum to `total`
        // exactly — never leaves fee dust unaccounted for.
        let treasury = total - creator - staker;
        Self { creator, staker, treasury }
    }
}

fn transfer_lamports<'info>(from: &AccountInfo<'info>, to: &AccountInfo<'info>, amount: u64) -> Result<()> {
    if amount == 0 {
        return Ok(());
    }
    system_program::transfer(
        CpiContext::new(system_program::ID, system_program::Transfer { from: from.clone(), to: to.clone() }),
        amount,
    )?;
    Ok(())
}

fn transfer_lamports_signed<'info>(
    from: &AccountInfo<'info>,
    to: &AccountInfo<'info>,
    amount: u64,
    seeds: &[&[u8]],
) -> Result<()> {
    if amount == 0 {
        return Ok(());
    }
    system_program::transfer(
        CpiContext::new_with_signer(
            system_program::ID,
            system_program::Transfer { from: from.clone(), to: to.clone() },
            &[seeds],
        ),
        amount,
    )?;
    Ok(())
}

#[account]
pub struct Curve {
    pub creator: Pubkey,
    pub mint: Pubkey,
    pub virtual_sol_reserves: u64,
    pub virtual_token_reserves: u64,
    pub real_sol_reserves: u64,
    pub real_token_reserves: u64,
    pub graduated: bool,
    pub bump: u8,
    pub sol_vault_bump: u8,
}

impl Curve {
    pub const SPACE: usize = 8 + 32 + 32 + 8 + 8 + 8 + 8 + 1 + 1 + 1;
}

#[account]
pub struct TreasuryConfig {
    pub admin: Pubkey,
    pub bump: u8,
}

impl TreasuryConfig {
    pub const SPACE: usize = 8 + 32 + 1;
}

#[account]
pub struct EmergencyConfig {
    pub authority: Pubkey,
    pub paused: bool,
    pub bump: u8,
}

impl EmergencyConfig {
    pub const SPACE: usize = 8 + 32 + 1 + 1;
}

#[derive(Accounts)]
pub struct InitializeCurve<'info> {
    #[account(mut)]
    pub creator: Signer<'info>,

    #[account(
        init,
        payer = creator,
        mint::decimals = DECIMALS,
        mint::authority = creator,
    )]
    pub mint: Account<'info, Mint>,

    #[account(
        init,
        payer = creator,
        space = Curve::SPACE,
        seeds = [CURVE_SEED, mint.key().as_ref()],
        bump,
    )]
    pub curve: Account<'info, Curve>,

    #[account(
        init,
        payer = creator,
        associated_token::mint = mint,
        associated_token::authority = curve,
    )]
    pub curve_token_vault: Account<'info, TokenAccount>,

    /// CHECK: PDA with no data, used purely as a lamport vault; ownership is enforced by seeds.
    #[account(mut, seeds = [SOL_VAULT_SEED, mint.key().as_ref()], bump)]
    pub sol_vault: UncheckedAccount<'info>,

    #[account(seeds = [EMERGENCY_CONFIG_SEED], bump = emergency_config.bump)]
    pub emergency_config: Account<'info, EmergencyConfig>,

    pub token_program: Program<'info, Token>,
    pub associated_token_program: Program<'info, AssociatedToken>,
    pub system_program: Program<'info, System>,
    pub rent: Sysvar<'info, Rent>,
}

#[derive(Accounts)]
pub struct Trade<'info> {
    #[account(mut)]
    pub buyer: Signer<'info>,

    #[account(
        mut,
        seeds = [CURVE_SEED, mint.key().as_ref()],
        bump = curve.bump,
        has_one = mint,
        has_one = creator,
    )]
    pub curve: Account<'info, Curve>,

    pub mint: Account<'info, Mint>,

    #[account(mut, associated_token::mint = mint, associated_token::authority = curve)]
    pub curve_token_vault: Account<'info, TokenAccount>,

    #[account(
        init_if_needed,
        payer = buyer,
        associated_token::mint = mint,
        associated_token::authority = buyer,
    )]
    pub trader_token_account: Account<'info, TokenAccount>,

    /// CHECK: lamport vault PDA, seeds enforced.
    #[account(mut, seeds = [SOL_VAULT_SEED, mint.key().as_ref()], bump = curve.sol_vault_bump)]
    pub sol_vault: UncheckedAccount<'info>,

    /// CHECK: must match curve.creator (has_one above); receives the creator's fee cut.
    #[account(mut)]
    pub creator: UncheckedAccount<'info>,

    /// CHECK: protocol-owned lamport pool, seeds enforced — accumulates the staker fee cut
    /// pending a future on-chain staking/claim instruction.
    #[account(mut, seeds = [STAKER_POOL_SEED], bump)]
    pub staker_pool: UncheckedAccount<'info>,

    /// CHECK: protocol treasury lamport vault, seeds enforced.
    #[account(mut, seeds = [TREASURY_SEED], bump)]
    pub treasury: UncheckedAccount<'info>,

    #[account(seeds = [EMERGENCY_CONFIG_SEED], bump = emergency_config.bump)]
    pub emergency_config: Account<'info, EmergencyConfig>,

    pub token_program: Program<'info, Token>,
    pub associated_token_program: Program<'info, AssociatedToken>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct InitializeEmergencyConfig<'info> {
    #[account(mut, address = TREASURY_ADMIN @ CurveError::Unauthorized)]
    pub admin: Signer<'info>,

    #[account(
        init,
        payer = admin,
        space = EmergencyConfig::SPACE,
        seeds = [EMERGENCY_CONFIG_SEED],
        bump,
    )]
    pub emergency_config: Account<'info, EmergencyConfig>,

    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct SetEmergencyAdmin<'info> {
    pub authority: Signer<'info>,

    #[account(mut, seeds = [EMERGENCY_CONFIG_SEED], bump = emergency_config.bump)]
    pub emergency_config: Account<'info, EmergencyConfig>,
}

#[derive(Accounts)]
pub struct SetPaused<'info> {
    pub authority: Signer<'info>,

    #[account(mut, seeds = [EMERGENCY_CONFIG_SEED], bump = emergency_config.bump)]
    pub emergency_config: Account<'info, EmergencyConfig>,
}

#[derive(Accounts)]
pub struct InitializeTreasuryConfig<'info> {
    #[account(mut, address = TREASURY_ADMIN @ CurveError::Unauthorized)]
    pub admin: Signer<'info>,

    #[account(
        init,
        payer = admin,
        space = TreasuryConfig::SPACE,
        seeds = [TREASURY_CONFIG_SEED],
        bump,
    )]
    pub treasury_config: Account<'info, TreasuryConfig>,

    /// CHECK: protocol treasury lamport vault, seeds enforced — topped up to the rent-exempt
    /// minimum here so the first (tiny) trade fee cut into it doesn't get rejected.
    #[account(mut, seeds = [TREASURY_SEED], bump)]
    pub treasury: UncheckedAccount<'info>,

    /// CHECK: staker fee-pool lamport vault, seeds enforced — same rent-exemption top-up as
    /// `treasury` above.
    #[account(mut, seeds = [STAKER_POOL_SEED], bump)]
    pub staker_pool: UncheckedAccount<'info>,

    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct SetTreasuryAdmin<'info> {
    pub admin: Signer<'info>,

    #[account(mut, seeds = [TREASURY_CONFIG_SEED], bump = treasury_config.bump)]
    pub treasury_config: Account<'info, TreasuryConfig>,
}

#[derive(Accounts)]
pub struct WithdrawTreasury<'info> {
    pub admin: Signer<'info>,

    #[account(seeds = [TREASURY_CONFIG_SEED], bump = treasury_config.bump)]
    pub treasury_config: Account<'info, TreasuryConfig>,

    /// CHECK: protocol treasury lamport vault, seeds enforced — the same PDA the trade fee
    /// cuts accumulate into.
    #[account(mut, seeds = [TREASURY_SEED], bump)]
    pub treasury: UncheckedAccount<'info>,

    /// CHECK: arbitrary payout destination the admin names — no constraints beyond `mut` so
    /// the admin can route funds anywhere (an exchange deposit address, cold storage, etc.).
    #[account(mut)]
    pub to: UncheckedAccount<'info>,

    pub system_program: Program<'info, System>,
}

#[event]
pub struct CurveInitialized {
    pub mint: Pubkey,
    pub creator: Pubkey,
}

#[event]
pub struct TradeEvent {
    pub mint: Pubkey,
    pub trader: Pubkey,
    pub is_buy: bool,
    pub sol_amount: u64,
    pub token_amount: u64,
    pub graduated: bool,
}

#[event]
pub struct TreasuryAdminChanged {
    pub new_admin: Pubkey,
}

#[event]
pub struct TreasuryWithdrawn {
    pub to: Pubkey,
    pub amount: u64,
}

#[event]
pub struct EmergencyAdminChanged {
    pub new_authority: Pubkey,
}

#[event]
pub struct EmergencyPauseToggled {
    pub paused: bool,
}

#[error_code]
pub enum CurveError {
    #[msg("Amount must be greater than zero")]
    ZeroAmount,
    #[msg("Trade would produce zero output")]
    ZeroOutput,
    #[msg("Slippage tolerance exceeded")]
    SlippageExceeded,
    #[msg("Math overflow")]
    MathOverflow,
    #[msg("Signer is not the treasury admin")]
    Unauthorized,
    #[msg("Trading and minting are currently paused")]
    TradingPaused,
}
