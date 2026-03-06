/**
 * Guard Detector — Chain-agnostic routing dispatcher
 *
 * Routes transaction analysis to the appropriate chain-specific detector:
 * - Solana: P-101 through P-108 (mint/freeze kills, signer mismatch, hooks)
 * - EVM: EVM-001 through EVM-004 (reentrancy, flash loans, front-running, unauthorized access)
 */

import type { Transaction, SecurityWarning, GuardConfig } from "../types";
import { analyzeSolanaTransaction } from "./solana-detector";
import { analyzeEvmTransaction } from "./evm-detector";

export function analyzeTransaction(
  transaction: Transaction,
  config?: GuardConfig
): SecurityWarning[] {
  if (!transaction.instructions || transaction.instructions.length === 0) {
    return [];
  }

  switch (transaction.chain) {
    case "solana":
      return analyzeSolanaTransaction(transaction, config);
    case "evm":
      return analyzeEvmTransaction(transaction, config);
    default:
      return [];
  }
}
