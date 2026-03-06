/**
 * Jito Bundle Manager — Solana-specific bundle submission via Jito Block Engine
 */

import {
  Connection,
  PublicKey,
  SystemProgram,
  TransactionInstruction,
  VersionedTransaction,
} from "@solana/web3.js";
import type { BundleResult, BundleStatusResponse } from "../types";
import { JitoRegion, TipLevel } from "../types";
import { BaseBundleManager } from "./base";
import type { BaseBundleConfig } from "./base";

export interface JitoBundle {
  transactions: VersionedTransaction[];
  tip?: number;
}

export interface JitoBundleConfig extends BaseBundleConfig {
  jitoBlockEngineUrl?: string;
  jitoRegion?: JitoRegion;
}

/** @deprecated Use JitoBundleConfig instead */
export type BundleConfig = JitoBundleConfig;

export const JITO_TIP_ACCOUNTS: Record<
  JitoRegion,
  { address: string; name: string }[]
> = {
  [JitoRegion.Default]: [
    { address: "96gYZGLnJYVFmbjzopPSU6QiEV5fGqZNyN9nmNhvrZU5", name: "Jito Tip 1" },
    { address: "HFqU5x63VTqvQss8hp11i4wVV8bD44PvwucfZ2bU7gRe", name: "Jito Tip 2" },
    { address: "Cw8CFyM9FkoMi7K7Crf6HNQqf4uEMzpKw6QNghXLvLkY", name: "Jito Tip 3" },
    { address: "ADaUMid9yfUytqMBgopwjb2DTLSokTSzL1zt6iGPaS49", name: "Jito Tip 4" },
    { address: "DfXygSm4jCyNCybVYYK6DwvWqjKee8pbDmJGcLWNDXjh", name: "Jito Tip 5" },
    { address: "ADuUkR4vqLUMWXxW9gh6D6L8pMSawimctcNZ5pGwDcEt", name: "Jito Tip 6" },
    { address: "DttWaMuVvTiduZRnguLF7jNxTgiMBZ1hyAumKUiL2KRL", name: "Jito Tip 7" },
    { address: "3AVi9Tg9Uo68tJfuvoKvqKNWKkC5wPdSSdeBnizKZ6jT", name: "Jito Tip 8" },
  ],
  [JitoRegion.Amsterdam]: [
    { address: "96gYZGLnJYVFmbjzopPSU6QiEV5fGqZNyN9nmNhvrZU5", name: "Amsterdam Tip 1" },
  ],
  [JitoRegion.Frankfurt]: [
    { address: "HFqU5x63VTqvQss8hp11i4wVV8bD44PvwucfZ2bU7gRe", name: "Frankfurt Tip 1" },
  ],
  [JitoRegion.NewYork]: [
    { address: "Cw8CFyM9FkoMi7K7Crf6HNQqf4uEMzpKw6QNghXLvLkY", name: "New York Tip 1" },
  ],
  [JitoRegion.Tokyo]: [
    { address: "ADaUMid9yfUytqMBgopwjb2DTLSokTSzL1zt6iGPaS49", name: "Tokyo Tip 1" },
  ],
};

const JITO_BLOCK_ENGINE_URLS = {
  mainnet: "https://mainnet.block-engine.jito.wtf",
  devnet: "https://dallas.devnet.block-engine.jito.wtf",
};

export class JitoError extends Error {
  constructor(
    message: string,
    public code?: string,
    public details?: unknown
  ) {
    super(message);
    this.name = "JitoError";
  }
}

export class BundleManager extends BaseBundleManager {
  private connection: Connection;
  private jitoUrl: string;
  private jitoRegion: JitoRegion;

  constructor(config: JitoBundleConfig) {
    super(config);
    this.connection = new Connection(config.endpoint);
    this.jitoUrl = config.jitoBlockEngineUrl || JITO_BLOCK_ENGINE_URLS.mainnet;
    this.jitoRegion = config.jitoRegion || JitoRegion.Default;
  }

  getRandomTipAccount(): PublicKey {
    const accounts = JITO_TIP_ACCOUNTS[this.jitoRegion];
    const randomAccount = accounts[Math.floor(Math.random() * accounts.length)];
    return new PublicKey(randomAccount.address);
  }

  createTipInstruction(
    payer: PublicKey,
    tipAmount: number = TipLevel.Medium
  ): TransactionInstruction {
    return SystemProgram.transfer({
      fromPubkey: payer,
      toPubkey: this.getRandomTipAccount(),
      lamports: tipAmount,
    });
  }

  calculateDynamicTip(priority: TipLevel, multiplier: number = 1): number {
    return Math.floor(priority * multiplier);
  }

  async simulateBundle(bundle: JitoBundle): Promise<void> {
    for (const tx of bundle.transactions) {
      const result = await this.connection.simulateTransaction(tx);
      if (result.value.err) {
        throw new JitoError("Transaction simulation failed", "SIMULATION_FAILED", {
          error: result.value.err,
          logs: result.value.logs,
        });
      }
    }
  }

  async sendBundle(bundle: JitoBundle, retryCount: number = 0): Promise<BundleResult> {
    const serializedTxs = bundle.transactions.map((tx) =>
      Buffer.from(tx.serialize()).toString("base64")
    );

    const payload = {
      jsonrpc: "2.0",
      id: 1,
      method: "sendBundle",
      params: [serializedTxs],
    };

    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), this.timeout);

      const response = await fetch(`${this.jitoUrl}/api/v1/bundles`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        const errorText = await response.text();
        throw new JitoError(
          `Jito HTTP Error: ${response.status} ${response.statusText}`,
          `HTTP_${response.status}`,
          { body: errorText }
        );
      }

      const data = await response.json();

      if (data.error) {
        if (this.isRetriableError(data.error) && retryCount < this.maxRetries) {
          await this.sleep(this.getBackoffDelay(retryCount));
          return this.sendBundle(bundle, retryCount + 1);
        }
        throw new JitoError(
          `Jito API Error: ${data.error.message}`,
          data.error.code?.toString(),
          data.error.data
        );
      }

      return { bundleId: data.result, accepted: true };
    } catch (error: unknown) {
      const err = error as Error & { name?: string; code?: string };

      if (err.name === "AbortError") {
        if (retryCount < this.maxRetries) {
          await this.sleep(this.getBackoffDelay(retryCount));
          return this.sendBundle(bundle, retryCount + 1);
        }
        throw new JitoError("Request timed out", "TIMEOUT", { attempts: retryCount + 1 });
      }

      if (this.isNetworkError(err) && retryCount < this.maxRetries) {
        await this.sleep(this.getBackoffDelay(retryCount));
        return this.sendBundle(bundle, retryCount + 1);
      }

      if (err instanceof JitoError) throw err;

      throw new JitoError(
        `Bundle Error: ${err.message}`,
        "UNKNOWN_ERROR",
        { originalError: err, attempts: retryCount + 1 }
      );
    }
  }

  async getBundleStatus(bundleId: string): Promise<BundleStatusResponse> {
    const payload = {
      jsonrpc: "2.0",
      id: 1,
      method: "getBundleStatuses",
      params: [[bundleId]],
    };

    const response = await fetch(`${this.jitoUrl}/api/v1/bundles`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      throw new JitoError(`Failed to get bundle status: ${response.status}`, `HTTP_${response.status}`);
    }

    const data = await response.json();
    if (data.error) {
      throw new JitoError(`Bundle status error: ${data.error.message}`, data.error.code?.toString());
    }

    const bundleStatus = data.result?.value?.[0];
    if (!bundleStatus) return { status: "pending" };

    let status: BundleStatusResponse["status"] = "pending";
    if (bundleStatus.confirmation_status === "confirmed") status = "landed";
    else if (bundleStatus.err) status = "failed";

    return {
      status,
      landedSlot: bundleStatus.slot,
      transactions: bundleStatus.transactions,
      error: bundleStatus.err,
    };
  }

  private isRetriableError(error: { code?: number }): boolean {
    return [-32005, -32603, 429].includes(error.code ?? 0);
  }
}
