/**
 * Solana-specific pattern detection (P-101 through P-108)
 *
 * Detects dangerous patterns in Solana SPL Token and Token-2022 instructions:
 * - Mint/freeze authority kills
 * - Signer mismatches
 * - Dangerous account closures
 * - Malicious transfer hooks
 */

import type {
  Transaction,
  TransactionInstruction,
  SecurityWarning,
  GuardConfig,
} from "../types";
import { PatternId as Pattern, Severity as Sev } from "../types";

const TOKEN_PROGRAM_ID = "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA";
const TOKEN_2022_PROGRAM_ID = "TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb";

const SET_AUTHORITY_INSTRUCTION = 6;
const CLOSE_ACCOUNT_INSTRUCTION = 9;
const TRANSFER_CHECKED_INSTRUCTION = 12;

const KNOWN_SAFE_HOOKS = new Set([
  "fragnAis7Bp6FTsMoa6YcH8UffhEw43Ph79qAiK3iF3",
]);

const DEFAULT_MAX_HOOK_ACCOUNTS = 20;

export function analyzeSolanaTransaction(
  transaction: Transaction,
  config?: GuardConfig
): SecurityWarning[] {
  const warnings: SecurityWarning[] = [];

  if (!transaction.instructions || transaction.instructions.length === 0) {
    return warnings;
  }

  const signers = new Set(transaction.signers || []);
  const hookInvocations = new Map<string, number>();

  for (let i = 0; i < transaction.instructions.length; i++) {
    const instruction = transaction.instructions[i];

    if (
      instruction.programId === TOKEN_PROGRAM_ID ||
      instruction.programId === TOKEN_2022_PROGRAM_ID
    ) {
      const instructionType = getInstructionType(instruction.data);

      if (instructionType === SET_AUTHORITY_INSTRUCTION) {
        warnings.push(...analyzeSetAuthority(instruction, signers));
      } else if (instructionType === CLOSE_ACCOUNT_INSTRUCTION) {
        warnings.push(...analyzeCloseAccount(instruction));
      }
    }

    if (config?.validateTransferHooks !== false) {
      const hookWarnings = analyzeTransferHook(
        instruction,
        config,
        transaction.instructions,
        i
      );
      warnings.push(...hookWarnings);

      const count = hookInvocations.get(instruction.programId) || 0;
      hookInvocations.set(instruction.programId, count + 1);
    }
  }

  if (config?.validateTransferHooks !== false) {
    for (const [programId, count] of hookInvocations.entries()) {
      if (count > 6 && !isKnownSafeHook(programId, config)) {
        warnings.push({
          patternId: Pattern.HookReentrancy,
          severity: Sev.Critical,
          message: `Transfer Hook program invoked ${count} times in single transaction. Possible reentrancy attack.`,
          affectedAccount: programId,
          timestamp: Date.now(),
        });
      }
    }
  }

  return warnings;
}

function analyzeSetAuthority(
  instruction: TransactionInstruction,
  signers: Set<string>
): SecurityWarning[] {
  const warnings: SecurityWarning[] = [];

  try {
    const data = Buffer.from(instruction.data, "base64");
    const authorityType = data[1];
    const hasNewAuthority = data[2] === 1;
    const accountPubkey = instruction.keys[0]?.pubkey;

    if (authorityType === 0 && !hasNewAuthority) {
      warnings.push({
        patternId: Pattern.MintKill,
        severity: Sev.Critical,
        message:
          "Permanently disabling mint authority. This action is irreversible.",
        affectedAccount: accountPubkey,
        timestamp: Date.now(),
      });
    }

    if (authorityType === 1 && !hasNewAuthority) {
      warnings.push({
        patternId: Pattern.FreezeKill,
        severity: Sev.Critical,
        message:
          "Permanently disabling freeze authority. You will lose freeze capability.",
        affectedAccount: accountPubkey,
        timestamp: Date.now(),
      });
    }

    if (hasNewAuthority && instruction.keys.length > 1) {
      const newAuthority = instruction.keys[1]?.pubkey;
      if (newAuthority && !signers.has(newAuthority)) {
        warnings.push({
          patternId: Pattern.SignerMismatch,
          severity: Sev.Warning,
          message: `New authority (${newAuthority}) is not a current signer. Risk of lockout.`,
          affectedAccount: accountPubkey,
          timestamp: Date.now(),
        });
      }
    }
  } catch {
    // Skip unparseable instructions
  }

  return warnings;
}

function analyzeCloseAccount(
  instruction: TransactionInstruction
): SecurityWarning[] {
  return [
    {
      patternId: Pattern.DangerousClose,
      severity: Sev.Alert,
      message:
        "Closing account. Ensure balance has been transferred or is zero.",
      affectedAccount: instruction.keys[0]?.pubkey,
      timestamp: Date.now(),
    },
  ];
}

function getInstructionType(data: string): number {
  try {
    const buffer = Buffer.from(data, "base64");
    return buffer.length > 0 ? buffer[0] : -1;
  } catch {
    return -1;
  }
}

function analyzeTransferHook(
  instruction: TransactionInstruction,
  config: GuardConfig | undefined,
  allInstructions: TransactionInstruction[],
  currentIndex: number
): SecurityWarning[] {
  const warnings: SecurityWarning[] = [];

  const knownPrograms = [
    TOKEN_PROGRAM_ID,
    TOKEN_2022_PROGRAM_ID,
    "11111111111111111111111111111111",
    "ComputeBudget111111111111111111111111111111",
    "ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL",
  ];

  if (knownPrograms.includes(instruction.programId)) {
    return warnings;
  }

  const accountCount = instruction.keys.length;
  const maxAccounts = config?.maxHookAccounts || DEFAULT_MAX_HOOK_ACCOUNTS;

  if (accountCount > maxAccounts && !isKnownSafeHook(instruction.programId, config)) {
    warnings.push({
      patternId: Pattern.ExcessiveHookAccounts,
      severity: Sev.Warning,
      message: `Transfer Hook accesses ${accountCount} accounts (max: ${maxAccounts}). Verify this is expected behavior.`,
      affectedAccount: instruction.programId,
      timestamp: Date.now(),
    });
  }

  const writableAccounts = instruction.keys.filter((k) => k.isWritable).length;
  if (
    writableAccounts > 10 &&
    !isKnownSafeHook(instruction.programId, config) &&
    accountCount > 15
  ) {
    warnings.push({
      patternId: Pattern.MaliciousTransferHook,
      severity: Sev.Critical,
      message: `Unknown Transfer Hook modifies ${writableAccounts} accounts. Possible malicious hook.`,
      affectedAccount: instruction.programId,
      timestamp: Date.now(),
    });
  }

  const hasTokenTransfer = allInstructions.some((instr) => {
    if (
      instr.programId === TOKEN_PROGRAM_ID ||
      instr.programId === TOKEN_2022_PROGRAM_ID
    ) {
      const type = getInstructionType(instr.data);
      return type === TRANSFER_CHECKED_INSTRUCTION || type === 3;
    }
    return false;
  });

  if (!hasTokenTransfer && accountCount > 10 && !isKnownSafeHook(instruction.programId, config)) {
    warnings.push({
      patternId: Pattern.UnexpectedHookExecution,
      severity: Sev.Alert,
      message: `Transfer Hook invoked without token transfer. Verify transaction legitimacy.`,
      affectedAccount: instruction.programId,
      timestamp: Date.now(),
    });
  }

  if (currentIndex > 0) {
    const previousInstr = allInstructions[currentIndex - 1];
    if (
      previousInstr &&
      (previousInstr.programId === TOKEN_PROGRAM_ID ||
        previousInstr.programId === TOKEN_2022_PROGRAM_ID) &&
      currentIndex < allInstructions.length - 1
    ) {
      const nextInstr = allInstructions[currentIndex + 1];
      if (
        nextInstr &&
        (nextInstr.programId === TOKEN_PROGRAM_ID ||
          nextInstr.programId === TOKEN_2022_PROGRAM_ID)
      ) {
        warnings.push({
          patternId: Pattern.HookReentrancy,
          severity: Sev.Critical,
          message: `Transfer Hook sandwiched between token operations. Possible reentrancy.`,
          affectedAccount: instruction.programId,
          timestamp: Date.now(),
        });
      }
    }
  }

  return warnings;
}

function isKnownSafeHook(programId: string, config?: GuardConfig): boolean {
  if (KNOWN_SAFE_HOOKS.has(programId)) return true;
  if (config?.allowedHookPrograms?.includes(programId)) return true;
  return false;
}
