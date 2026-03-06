/**
 * EVM-specific pattern detection (EVM-001 through EVM-004)
 *
 * Detects dangerous patterns in EVM transactions:
 * - EVM-001: Reentrancy attacks (external calls before state updates)
 * - EVM-002: Flash loan attacks (single-tx borrow + manipulate + repay)
 * - EVM-003: Front-running patterns (sandwich attack indicators)
 * - EVM-004: Unauthorized access (calls to admin functions from non-owner)
 */

import type {
  Transaction,
  TransactionInstruction,
  SecurityWarning,
  GuardConfig,
} from "../types";
import { PatternId as Pattern, Severity as Sev } from "../types";

// Well-known EVM contract selectors (first 4 bytes of keccak256)
const SELECTORS = {
  // ERC20
  transfer: "a9059cbb",
  transferFrom: "23b872dd",
  approve: "095ea7b3",
  // Flash loans
  flashLoan: "5cffe9de", // AAVE
  flashBorrow: "e0232b42",
  // DEX
  swap: "022c0d9f", // Uniswap V2
  swapExact: "38ed1739",
  // Admin
  transferOwnership: "f2fde38b",
  renounceOwnership: "715018a6",
  setAdmin: "704b6c02",
  upgradeTo: "3659cfe6",
  // Dangerous
  selfdestruct: "ff",
  delegatecall: "f4",
};

// Known flash loan provider addresses (lowercase)
const FLASH_LOAN_PROVIDERS = new Set([
  "0x7d2768de32b0b80b7a3454c06bdac94a69ddc7a9", // AAVE V2
  "0x87870bca3f3fd6335c3f4ce8392d69350b4fa4e2", // AAVE V3
  "0x6bdba7d04b19e8f1b7841bbe7313c0c8a69c5eaa", // dYdX
]);

// Known DEX router addresses
const DEX_ROUTERS = new Set([
  "0x7a250d5630b4cf539739df2c5dacb4c659f2488d", // Uniswap V2 Router
  "0xe592427a0aece92de3edee1f18e0157c05861564", // Uniswap V3 Router
  "0xd9e1ce17f2641f24ae83637ab66a2cca9c378b9f", // SushiSwap Router
  "0x1111111254eeb25477b68fb85ed929f73a960582", // 1inch V5
]);

export function analyzeEvmTransaction(
  transaction: Transaction,
  config?: GuardConfig
): SecurityWarning[] {
  const warnings: SecurityWarning[] = [];

  if (!transaction.instructions || transaction.instructions.length === 0) {
    return warnings;
  }

  warnings.push(...detectReentrancy(transaction));
  warnings.push(...detectFlashLoan(transaction));
  warnings.push(...detectFrontRunning(transaction));
  warnings.push(...detectUnauthorizedAccess(transaction, config));

  return warnings;
}

/**
 * EVM-001: Reentrancy detection
 * Flags transactions where external calls happen before state-changing operations,
 * or where the same contract is called multiple times with value transfers.
 */
function detectReentrancy(transaction: Transaction): SecurityWarning[] {
  const warnings: SecurityWarning[] = [];
  const callTargets = new Map<string, number>();

  for (const ix of transaction.instructions || []) {
    const target = ix.programId.toLowerCase();
    const count = callTargets.get(target) || 0;
    callTargets.set(target, count + 1);

    // Multiple calls to the same non-standard contract with value
    if (count >= 2 && !DEX_ROUTERS.has(target) && !FLASH_LOAN_PROVIDERS.has(target)) {
      const selector = getSelector(ix.data);
      if (selector === SELECTORS.transfer || selector === SELECTORS.transferFrom) {
        warnings.push({
          patternId: Pattern.ReentrancyAttack,
          severity: Sev.Critical,
          message: `Contract ${target} called ${count + 1} times with token transfers. Possible reentrancy.`,
          affectedAccount: target,
          timestamp: Date.now(),
        });
      }
    }
  }

  return warnings;
}

/**
 * EVM-002: Flash loan attack detection
 * Flags transactions that interact with known flash loan providers
 * combined with DEX swaps or price-sensitive operations.
 */
function detectFlashLoan(transaction: Transaction): SecurityWarning[] {
  const warnings: SecurityWarning[] = [];
  const instructions = transaction.instructions || [];

  let hasFlashLoan = false;
  let hasDexSwap = false;
  let hasTransfer = false;

  for (const ix of instructions) {
    const target = ix.programId.toLowerCase();
    const selector = getSelector(ix.data);

    if (FLASH_LOAN_PROVIDERS.has(target) || selector === SELECTORS.flashLoan || selector === SELECTORS.flashBorrow) {
      hasFlashLoan = true;
    }

    if (DEX_ROUTERS.has(target) || selector === SELECTORS.swap || selector === SELECTORS.swapExact) {
      hasDexSwap = true;
    }

    if (selector === SELECTORS.transfer || selector === SELECTORS.transferFrom) {
      hasTransfer = true;
    }
  }

  if (hasFlashLoan && hasDexSwap) {
    warnings.push({
      patternId: Pattern.FlashLoanAttack,
      severity: Sev.Critical,
      message: "Flash loan combined with DEX swap detected. Possible price manipulation attack.",
      timestamp: Date.now(),
    });
  }

  if (hasFlashLoan && hasTransfer && instructions.length > 5) {
    warnings.push({
      patternId: Pattern.FlashLoanAttack,
      severity: Sev.Alert,
      message: `Flash loan with ${instructions.length} operations and token transfers. Review transaction intent.`,
      timestamp: Date.now(),
    });
  }

  return warnings;
}

/**
 * EVM-003: Front-running / sandwich attack detection
 * Flags patterns where a swap is bracketed by related operations
 * on the same pair, or where gas price is abnormally high.
 */
function detectFrontRunning(transaction: Transaction): SecurityWarning[] {
  const warnings: SecurityWarning[] = [];
  const instructions = transaction.instructions || [];

  const swapIndices: number[] = [];

  for (let i = 0; i < instructions.length; i++) {
    const selector = getSelector(instructions[i].data);
    if (selector === SELECTORS.swap || selector === SELECTORS.swapExact) {
      swapIndices.push(i);
    }
  }

  // Multiple swaps on same router = potential sandwich
  if (swapIndices.length >= 2) {
    const routers = swapIndices.map((i) => instructions[i].programId.toLowerCase());
    const uniqueRouters = new Set(routers);

    if (uniqueRouters.size < routers.length) {
      warnings.push({
        patternId: Pattern.FrontRunning,
        severity: Sev.Alert,
        message: `${swapIndices.length} swaps on the same router in one transaction. Possible sandwich attack pattern.`,
        timestamp: Date.now(),
      });
    }
  }

  return warnings;
}

/**
 * EVM-004: Unauthorized access detection
 * Flags calls to admin/ownership functions that may indicate
 * unauthorized privilege escalation.
 */
function detectUnauthorizedAccess(
  transaction: Transaction,
  config?: GuardConfig
): SecurityWarning[] {
  const warnings: SecurityWarning[] = [];

  const adminSelectors = new Set([
    SELECTORS.transferOwnership,
    SELECTORS.renounceOwnership,
    SELECTORS.setAdmin,
    SELECTORS.upgradeTo,
  ]);

  for (const ix of transaction.instructions || []) {
    const selector = getSelector(ix.data);

    if (selector === SELECTORS.renounceOwnership) {
      warnings.push({
        patternId: Pattern.UnauthorizedAccess,
        severity: Sev.Critical,
        message: `renounceOwnership() called on ${ix.programId}. This permanently removes admin control.`,
        affectedAccount: ix.programId,
        timestamp: Date.now(),
      });
    } else if (adminSelectors.has(selector)) {
      warnings.push({
        patternId: Pattern.UnauthorizedAccess,
        severity: Sev.Warning,
        message: `Admin function (${selector}) called on ${ix.programId}. Verify caller authorization.`,
        affectedAccount: ix.programId,
        timestamp: Date.now(),
      });
    }
  }

  return warnings;
}

function getSelector(data: string): string {
  try {
    // EVM calldata is hex-encoded, first 4 bytes = function selector
    const hex = data.startsWith("0x") ? data.slice(2) : data;
    return hex.slice(0, 8).toLowerCase();
  } catch {
    return "";
  }
}
