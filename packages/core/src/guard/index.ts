/**
 * Guard — Chain-agnostic transaction security validation and monitoring
 *
 * Solana patterns (P-101 through P-108):
 * - Mint/freeze authority kills, signer mismatch, dangerous close
 * - Transfer hook attacks (malicious, unexpected, reentrancy, excessive accounts)
 *
 * EVM patterns (EVM-001 through EVM-004):
 * - Reentrancy attacks, flash loan attacks, front-running, unauthorized access
 *
 * Three enforcement modes: "block", "warn"
 * Three risk tolerances: "strict", "moderate", "permissive"
 */

import type {
  GuardConfig,
  Transaction,
  ValidationResult,
  SecurityWarning,
} from "../types";
import { PatternId, Severity } from "../types";
import { analyzeTransaction } from "./detector";

export class Guard {
  private config: GuardConfig;
  private warningHistory: SecurityWarning[] = [];

  constructor(config: GuardConfig = {}) {
    this.config = {
      enablePatternDetection: true,
      riskTolerance: "moderate",
      mode: "block",
      emergencyStop: false,
      ...config,
    };
  }

  async validateTransaction(
    transaction: Transaction
  ): Promise<ValidationResult> {
    const warnings: SecurityWarning[] = [];

    if (this.config.emergencyStop) {
      return {
        isValid: false,
        warnings: [
          {
            patternId: PatternId.MintKill,
            severity: Severity.Critical,
            message: "EMERGENCY STOP: All operations are halted",
            timestamp: Date.now(),
          },
        ],
        blockedBy: [PatternId.MintKill],
      };
    }

    if (this.config.enablePatternDetection !== false) {
      const detectedWarnings = analyzeTransaction(transaction, this.config);
      warnings.push(...detectedWarnings);
    }

    const blockedBy = this.determineBlocking(warnings);
    const isValid = blockedBy.length === 0;

    this.warningHistory.push(...warnings);

    return { isValid, warnings, blockedBy: blockedBy.length > 0 ? blockedBy : undefined };
  }

  async validate(transaction?: Transaction): Promise<boolean> {
    if (!transaction) return !this.config.emergencyStop;
    const result = await this.validateTransaction(transaction);
    return result.isValid;
  }

  getConfig(): GuardConfig {
    return { ...this.config };
  }

  updateConfig(updates: Partial<GuardConfig>): void {
    this.config = { ...this.config, ...updates };
  }

  activateEmergencyStop(): void {
    this.config.emergencyStop = true;
  }

  deactivateEmergencyStop(): void {
    this.config.emergencyStop = false;
  }

  getWarningHistory(): SecurityWarning[] {
    return [...this.warningHistory];
  }

  clearWarningHistory(): void {
    this.warningHistory = [];
  }

  isSlippageAcceptable(actualSlippage: number): boolean {
    if (this.config.maxSlippage === undefined) return true;
    return actualSlippage <= this.config.maxSlippage;
  }

  private determineBlocking(warnings: SecurityWarning[]): PatternId[] {
    const mode = this.config.mode || "block";
    const riskTolerance = this.config.riskTolerance || "moderate";

    if (mode === "warn") return [];

    const blockedPatterns: PatternId[] = [];

    for (const warning of warnings) {
      const shouldBlock =
        (warning.severity === Severity.Critical &&
          (riskTolerance === "strict" || riskTolerance === "moderate")) ||
        (riskTolerance === "permissive" &&
          (warning.patternId === PatternId.MintKill ||
            warning.patternId === PatternId.FreezeKill));

      if (shouldBlock && !blockedPatterns.includes(warning.patternId)) {
        blockedPatterns.push(warning.patternId);
      }
    }

    return blockedPatterns;
  }
}

export { analyzeTransaction } from "./detector";
export { analyzeSolanaTransaction } from "./solana-detector";
export { analyzeEvmTransaction } from "./evm-detector";
