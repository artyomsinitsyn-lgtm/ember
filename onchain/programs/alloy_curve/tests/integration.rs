use alloy_curve::{Curve, GRADUATION_SOL_RAISED, INITIAL_REAL_TOKEN_RESERVES, INITIAL_VIRTUAL_SOL_RESERVES, TOTAL_SUPPLY};
use anchor_lang::prelude::Pubkey;
use anchor_lang::solana_program::instruction::Instruction;
use anchor_lang::solana_program::system_program;
use anchor_lang::prelude::rent;
use anchor_lang::{AccountDeserialize, InstructionData, ToAccountMetas};
use anchor_spl::associated_token::get_associated_token_address;
use anchor_spl::token::spl_token::state::Account as SplTokenAccount;
use solana_program_pack::Pack;
use litesvm::LiteSVM;
use solana_keypair::Keypair;
use solana_message::Message;
use solana_signer::Signer;
use solana_transaction::Transaction;

fn program_bytes() -> Vec<u8> {
    std::fs::read(concat!(env!("CARGO_MANIFEST_DIR"), "/../../target/deploy/alloy_curve.so"))
        .expect("run `anchor build` first so target/deploy/alloy_curve.so exists")
}

fn curve_pda(mint: &Pubkey) -> (Pubkey, u8) {
    Pubkey::find_program_address(&[b"curve", mint.as_ref()], &alloy_curve::ID)
}

fn sol_vault_pda(mint: &Pubkey) -> (Pubkey, u8) {
    Pubkey::find_program_address(&[b"sol_vault", mint.as_ref()], &alloy_curve::ID)
}

fn treasury_pda() -> (Pubkey, u8) {
    Pubkey::find_program_address(&[b"treasury"], &alloy_curve::ID)
}

fn staker_pool_pda() -> (Pubkey, u8) {
    Pubkey::find_program_address(&[b"staker_pool"], &alloy_curve::ID)
}

#[test]
fn full_lifecycle_buy_then_sell() {
    let mut svm = LiteSVM::new();
    svm.add_program(alloy_curve::ID, &program_bytes()).unwrap();

    let creator = Keypair::new();
    let buyer = Keypair::new();
    svm.airdrop(&creator.pubkey(), 10_000_000_000).unwrap();
    svm.airdrop(&buyer.pubkey(), 10_000_000_000).unwrap();

    let mint = Keypair::new();
    let (curve, _) = curve_pda(&mint.pubkey());
    let (sol_vault, _) = sol_vault_pda(&mint.pubkey());
    let (treasury, _) = treasury_pda();
    let (staker_pool, _) = staker_pool_pda();
    let curve_token_vault = get_associated_token_address(&curve, &mint.pubkey());

    let init_accounts = alloy_curve::accounts::InitializeCurve {
        creator: creator.pubkey(),
        mint: mint.pubkey(),
        curve,
        curve_token_vault,
        sol_vault,
        token_program: anchor_spl::token::ID,
        associated_token_program: anchor_spl::associated_token::ID,
        system_program: system_program::ID,
        rent: rent::ID,
    };
    let init_ix = Instruction {
        program_id: alloy_curve::ID,
        accounts: init_accounts.to_account_metas(None),
        data: alloy_curve::instruction::InitializeCurve {}.data(),
    };
    let msg = Message::new(&[init_ix], Some(&creator.pubkey()));
    let tx = Transaction::new(&[&creator, &mint], msg, svm.latest_blockhash());
    svm.send_transaction(tx).expect("initialize_curve failed");

    let vault_account = svm.get_account(&curve_token_vault).unwrap();
    let token_data = SplTokenAccount::unpack(&vault_account.data).unwrap();
    assert_eq!(token_data.amount, TOTAL_SUPPLY);

    let buyer_ata = get_associated_token_address(&buyer.pubkey(), &mint.pubkey());
    let buy_accounts = alloy_curve::accounts::Trade {
        buyer: buyer.pubkey(),
        curve,
        mint: mint.pubkey(),
        curve_token_vault,
        trader_token_account: buyer_ata,
        sol_vault,
        creator: creator.pubkey(),
        staker_pool,
        treasury,
        token_program: anchor_spl::token::ID,
        associated_token_program: anchor_spl::associated_token::ID,
        system_program: system_program::ID,
    };
    let buy_ix = Instruction {
        program_id: alloy_curve::ID,
        accounts: buy_accounts.to_account_metas(None),
        data: alloy_curve::instruction::Buy { sol_in: 5_000_000_000, min_tokens_out: 1 }.data(),
    };
    let msg = Message::new(&[buy_ix], Some(&buyer.pubkey()));
    let tx = Transaction::new(&[&buyer], msg, svm.latest_blockhash());
    svm.send_transaction(tx).expect("buy failed");

    let buyer_token_account = svm.get_account(&buyer_ata).unwrap();
    let buyer_tokens = SplTokenAccount::unpack(&buyer_token_account.data).unwrap();
    assert!(buyer_tokens.amount > 0, "buyer should hold tokens after buying");
    assert!(buyer_tokens.amount < INITIAL_REAL_TOKEN_RESERVES, "curve shouldn't sell out on a 5 SOL buy");

    let creator_balance_after_buy = svm.get_balance(&creator.pubkey()).unwrap();
    assert!(
        creator_balance_after_buy > 10_000_000_000,
        "creator should have received a real fee cut on-chain: {creator_balance_after_buy}"
    );

    let sell_accounts = alloy_curve::accounts::Trade {
        buyer: buyer.pubkey(),
        curve,
        mint: mint.pubkey(),
        curve_token_vault,
        trader_token_account: buyer_ata,
        sol_vault,
        creator: creator.pubkey(),
        staker_pool,
        treasury,
        token_program: anchor_spl::token::ID,
        associated_token_program: anchor_spl::associated_token::ID,
        system_program: system_program::ID,
    };
    let sell_ix = Instruction {
        program_id: alloy_curve::ID,
        accounts: sell_accounts.to_account_metas(None),
        data: alloy_curve::instruction::Sell { tokens_in: buyer_tokens.amount / 2, min_sol_out: 1 }.data(),
    };
    let msg = Message::new(&[sell_ix], Some(&buyer.pubkey()));
    let tx = Transaction::new(&[&buyer], msg, svm.latest_blockhash());
    svm.send_transaction(tx).expect("sell failed");

    let buyer_token_account = svm.get_account(&buyer_ata).unwrap();
    let buyer_tokens_after_sell = SplTokenAccount::unpack(&buyer_token_account.data).unwrap();
    assert!(buyer_tokens_after_sell.amount < buyer_tokens.amount, "selling should reduce the buyer's token balance");

    println!(
        "OK: buyer holds {} tokens after buy, {} after selling half; graduation target is {} lamports (virtual sol starts at {})",
        buyer_tokens.amount, buyer_tokens_after_sell.amount, GRADUATION_SOL_RAISED, INITIAL_VIRTUAL_SOL_RESERVES
    );
}

/// Regression test for a real bug found while verifying the post-graduation fee tier: the
/// curve is calibrated so that crossing GRADUATION_SOL_RAISED and draining real_token_reserves
/// to ~0 happen together — so without re-seeding, the post-graduation pool's constant-product
/// invariant `k = real_sol_reserves * real_token_reserves` collapses to ~0 the instant it goes
/// live, and the first seller can walk away with nearly the entire vault instead of a fair
/// share. The fix re-seeds real_token_reserves from the TOTAL_SUPPLY - INITIAL_REAL_TOKEN_RESERVES
/// allocation that's been sitting untouched in curve_token_vault since `initialize_curve`. This
/// test proves a small post-graduation buy-then-sell round trip only costs its own fee, not the
/// whole pool.
#[test]
fn graduation_seeds_pool_so_first_seller_cannot_drain_it() {
    let mut svm = LiteSVM::new();
    svm.add_program(alloy_curve::ID, &program_bytes()).unwrap();

    let creator = Keypair::new();
    let whale = Keypair::new();
    let seller = Keypair::new();
    svm.airdrop(&creator.pubkey(), 10_000_000_000).unwrap();
    svm.airdrop(&whale.pubkey(), 200_000_000_000).unwrap();
    svm.airdrop(&seller.pubkey(), 10_000_000_000).unwrap();

    let mint = Keypair::new();
    let (curve, _) = curve_pda(&mint.pubkey());
    let (sol_vault, _) = sol_vault_pda(&mint.pubkey());
    let (treasury, _) = treasury_pda();
    let (staker_pool, _) = staker_pool_pda();
    let curve_token_vault = get_associated_token_address(&curve, &mint.pubkey());

    let init_accounts = alloy_curve::accounts::InitializeCurve {
        creator: creator.pubkey(),
        mint: mint.pubkey(),
        curve,
        curve_token_vault,
        sol_vault,
        token_program: anchor_spl::token::ID,
        associated_token_program: anchor_spl::associated_token::ID,
        system_program: system_program::ID,
        rent: rent::ID,
    };
    let init_ix = Instruction {
        program_id: alloy_curve::ID,
        accounts: init_accounts.to_account_metas(None),
        data: alloy_curve::instruction::InitializeCurve {}.data(),
    };
    let msg = Message::new(&[init_ix], Some(&creator.pubkey()));
    let tx = Transaction::new(&[&creator, &mint], msg, svm.latest_blockhash());
    svm.send_transaction(tx).expect("initialize_curve failed");

    let trade_accounts = |trader: &Keypair| alloy_curve::accounts::Trade {
        buyer: trader.pubkey(),
        curve,
        mint: mint.pubkey(),
        curve_token_vault,
        trader_token_account: get_associated_token_address(&trader.pubkey(), &mint.pubkey()),
        sol_vault,
        creator: creator.pubkey(),
        staker_pool,
        treasury,
        token_program: anchor_spl::token::ID,
        associated_token_program: anchor_spl::associated_token::ID,
        system_program: system_program::ID,
    };

    // Push well past GRADUATION_SOL_RAISED (85 SOL) in one buy — this is the trade that flips
    // `graduated`.
    let whale_buy_ix = Instruction {
        program_id: alloy_curve::ID,
        accounts: trade_accounts(&whale).to_account_metas(None),
        data: alloy_curve::instruction::Buy { sol_in: 90_000_000_000, min_tokens_out: 1 }.data(),
    };
    let msg = Message::new(&[whale_buy_ix], Some(&whale.pubkey()));
    let tx = Transaction::new(&[&whale], msg, svm.latest_blockhash());
    svm.send_transaction(tx).expect("whale buy failed");

    let curve_account = svm.get_account(&curve).unwrap();
    let curve_state = Curve::try_deserialize(&mut curve_account.data.as_slice()).unwrap();
    assert!(curve_state.graduated, "curve should have graduated after a 90 SOL buy");
    assert_eq!(
        curve_state.real_token_reserves,
        TOTAL_SUPPLY - INITIAL_REAL_TOKEN_RESERVES,
        "post-graduation pool should be re-seeded with the held-back allocation, not left at ~0"
    );

    let vault_before_round_trip = svm.get_balance(&sol_vault).unwrap();

    // A small post-graduation buy should now actually succeed (pre-fix this always reverted
    // with SlippageExceeded/ZeroOutput since k was 0).
    let seller_buy_ix = Instruction {
        program_id: alloy_curve::ID,
        accounts: trade_accounts(&seller).to_account_metas(None),
        data: alloy_curve::instruction::Buy { sol_in: 1_000_000_000, min_tokens_out: 1 }.data(),
    };
    let msg = Message::new(&[seller_buy_ix], Some(&seller.pubkey()));
    let tx = Transaction::new(&[&seller], msg, svm.latest_blockhash());
    svm.send_transaction(tx).expect("post-graduation buy failed — pool not properly re-seeded");

    let seller_ata = get_associated_token_address(&seller.pubkey(), &mint.pubkey());
    let seller_token_account = svm.get_account(&seller_ata).unwrap();
    let seller_tokens = SplTokenAccount::unpack(&seller_token_account.data).unwrap();
    assert!(seller_tokens.amount > 0, "post-graduation buy should yield real tokens, not zero");

    // Now sell them straight back. If the pool were still degenerate, this single sell would
    // walk off with close to the entire vault instead of ~1 SOL.
    let seller_sell_ix = Instruction {
        program_id: alloy_curve::ID,
        accounts: trade_accounts(&seller).to_account_metas(None),
        data: alloy_curve::instruction::Sell { tokens_in: seller_tokens.amount, min_sol_out: 1 }.data(),
    };
    let msg = Message::new(&[seller_sell_ix], Some(&seller.pubkey()));
    let tx = Transaction::new(&[&seller], msg, svm.latest_blockhash());
    svm.send_transaction(tx).expect("post-graduation sell failed");

    let vault_after_round_trip = svm.get_balance(&sol_vault).unwrap();
    let lost = vault_before_round_trip.saturating_sub(vault_after_round_trip);

    println!(
        "OK: post-graduation pool re-seeded to {} tokens; a 1 SOL buy+sell round trip cost the vault {} lamports out of {} ({:.4}%)",
        curve_state.real_token_reserves,
        lost,
        vault_before_round_trip,
        100.0 * lost as f64 / vault_before_round_trip as f64
    );

    // A fair round trip should cost roughly two small trading fees (~0.5% of 1 SOL), nowhere
    // close to the ~89 SOL sitting in the vault. Assert it lost less than 5% of the vault as a
    // generous bound — the old bug would have lost essentially 100%.
    assert!(
        (lost as f64) < 0.05 * (vault_before_round_trip as f64),
        "sell drained a disproportionate share of the vault: lost {lost} of {vault_before_round_trip} lamports"
    );
}
