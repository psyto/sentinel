/**
 * Abstract bundle manager — chain-agnostic base for atomic transaction bundles
 */

import type { BundleResult, BundleStatusResponse } from "../types";

export interface BaseBundleConfig {
  endpoint: string;
  maxRetries?: number;
  timeout?: number;
}

export abstract class BaseBundleManager {
  protected maxRetries: number;
  protected timeout: number;

  constructor(config: BaseBundleConfig) {
    this.maxRetries = config.maxRetries ?? 3;
    this.timeout = config.timeout ?? 30000;
  }

  abstract sendBundle(bundle: unknown, retryCount?: number): Promise<BundleResult>;
  abstract getBundleStatus(bundleId: string): Promise<BundleStatusResponse>;

  async confirmBundle(
    bundleId: string,
    timeoutMs: number = 60000,
    pollIntervalMs: number = 2000
  ): Promise<BundleStatusResponse> {
    const startTime = Date.now();

    while (Date.now() - startTime < timeoutMs) {
      const status = await this.getBundleStatus(bundleId);

      if (status.status === "landed") return status;
      if (status.status === "failed" || status.status === "invalid") {
        throw new Error(`Bundle ${status.status}: ${status.error || "unknown error"}`);
      }

      await this.sleep(pollIntervalMs);
    }

    throw new Error(`Bundle confirmation timeout after ${timeoutMs}ms`);
  }

  protected getBackoffDelay(retryCount: number): number {
    return Math.min(1000 * Math.pow(2, retryCount), 8000);
  }

  protected sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  protected isNetworkError(error: { code?: string; message?: string }): boolean {
    return (
      error.code === "ECONNREFUSED" ||
      error.code === "ENOTFOUND" ||
      error.code === "ETIMEDOUT" ||
      (error.message?.includes("fetch failed") ?? false)
    );
  }
}
