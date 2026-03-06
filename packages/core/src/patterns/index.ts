/**
 * Pattern Library — Pre-built execution patterns for DeFi operations
 *
 * Each pattern returns a structured description (instructions, parameters,
 * estimated costs) that can be executed client-side or served via API.
 *
 * Categories:
 * - Financial: batch payouts, recurring payments, token vesting
 * - Trading: grid trading, DCA, arbitrage
 * - Treasury: rebalancing, yield farming
 * - DeFi: multi-route swaps, liquidity provision
 */

import type {
  Token,
  TradingPair,
  Price,
  PatternMetrics,
  ExecutionStrategy,
} from "../types";

// ── Financial Patterns ──

export interface BatchPayoutConfig {
  recipients: { address: string; amount: number; memo?: string }[];
  tokenMint: string;
  decimals: number;
}

export interface BatchPayoutResult {
  totalRecipients: number;
  totalAmount: number;
  estimatedFee: number;
  batches: { recipients: string[]; amounts: number[] }[];
}

export function buildBatchPayout(config: BatchPayoutConfig): BatchPayoutResult {
  const MAX_PER_TX = 20;
  const batches: { recipients: string[]; amounts: number[] }[] = [];

  for (let i = 0; i < config.recipients.length; i += MAX_PER_TX) {
    const chunk = config.recipients.slice(i, i + MAX_PER_TX);
    batches.push({
      recipients: chunk.map((r) => r.address),
      amounts: chunk.map((r) => r.amount),
    });
  }

  return {
    totalRecipients: config.recipients.length,
    totalAmount: config.recipients.reduce((sum, r) => sum + r.amount, 0),
    estimatedFee: batches.length * 0.000005,
    batches,
  };
}

export interface RecurringPaymentConfig {
  recipient: string;
  amount: number;
  tokenMint: string;
  intervalMs: number;
  totalPayments: number;
}

export interface RecurringPaymentSchedule {
  payments: { index: number; scheduledAt: number; amount: number }[];
  totalAmount: number;
  endDate: number;
}

export function buildRecurringPaymentSchedule(
  config: RecurringPaymentConfig
): RecurringPaymentSchedule {
  const now = Date.now();
  const payments = Array.from({ length: config.totalPayments }, (_, i) => ({
    index: i,
    scheduledAt: now + config.intervalMs * i,
    amount: config.amount,
  }));

  return {
    payments,
    totalAmount: config.amount * config.totalPayments,
    endDate: now + config.intervalMs * (config.totalPayments - 1),
  };
}

export interface VestingConfig {
  beneficiary: string;
  totalAmount: number;
  tokenMint: string;
  startDate: number;
  cliffDuration: number;
  vestingDuration: number;
  vestingInterval: number;
}

export interface VestingSchedule {
  cliffDate: number;
  endDate: number;
  totalPeriods: number;
  amountPerPeriod: number;
  periods: { index: number; unlockDate: number; amount: number; cumulative: number }[];
}

export function buildVestingSchedule(config: VestingConfig): VestingSchedule {
  const cliffDate = config.startDate + config.cliffDuration;
  const endDate = config.startDate + config.vestingDuration;
  const vestingAfterCliff = config.vestingDuration - config.cliffDuration;
  const totalPeriods = Math.floor(vestingAfterCliff / config.vestingInterval);
  const amountPerPeriod = config.totalAmount / totalPeriods;

  const periods = Array.from({ length: totalPeriods }, (_, i) => ({
    index: i,
    unlockDate: cliffDate + config.vestingInterval * i,
    amount: amountPerPeriod,
    cumulative: amountPerPeriod * (i + 1),
  }));

  return { cliffDate, endDate, totalPeriods, amountPerPeriod, periods };
}

// ── Trading Patterns ──

export interface GridTradingConfig {
  pair: TradingPair;
  lowerBound: number;
  upperBound: number;
  gridLevels: number;
  amountPerGrid: number;
  currentPrice: Price;
}

export interface GridLevel {
  price: number;
  side: "buy" | "sell";
  amount: number;
  index: number;
}

export interface GridTradingPlan {
  levels: GridLevel[];
  gridSpacing: number;
  totalBuyAmount: number;
  totalSellAmount: number;
  estimatedFees: number;
}

export function buildGridTradingPlan(config: GridTradingConfig): GridTradingPlan {
  const gridSpacing =
    (config.upperBound - config.lowerBound) / (config.gridLevels - 1);

  const levels: GridLevel[] = Array.from(
    { length: config.gridLevels },
    (_, i) => {
      const price = config.lowerBound + gridSpacing * i;
      return {
        price,
        side: price < config.currentPrice.price ? "buy" : "sell",
        amount: config.amountPerGrid,
        index: i,
      };
    }
  );

  const buyLevels = levels.filter((l) => l.side === "buy");
  const sellLevels = levels.filter((l) => l.side === "sell");

  return {
    levels,
    gridSpacing,
    totalBuyAmount: buyLevels.reduce((s, l) => s + l.amount * l.price, 0),
    totalSellAmount: sellLevels.reduce((s, l) => s + l.amount, 0),
    estimatedFees: config.gridLevels * 0.000005,
  };
}

export interface DCAConfig {
  pair: TradingPair;
  totalAmount: number;
  numberOfOrders: number;
  intervalMs: number;
  strategy: ExecutionStrategy;
}

export interface DCAPlan {
  orders: { index: number; scheduledAt: number; amount: number }[];
  amountPerOrder: number;
  totalDuration: number;
}

export function buildDCAPlan(config: DCAConfig): DCAPlan {
  const amountPerOrder = config.totalAmount / config.numberOfOrders;
  const now = Date.now();

  return {
    orders: Array.from({ length: config.numberOfOrders }, (_, i) => ({
      index: i,
      scheduledAt: now + config.intervalMs * i,
      amount: amountPerOrder,
    })),
    amountPerOrder,
    totalDuration: config.intervalMs * (config.numberOfOrders - 1),
  };
}

// ── Treasury Patterns ──

export interface RebalanceConfig {
  targetAllocations: { token: Token; targetPct: number }[];
  currentHoldings: { token: Token; amount: number; valueUsd: number }[];
  rebalanceThreshold: number;
}

export interface RebalancePlan {
  trades: { from: Token; to: Token; amount: number; valueUsd: number }[];
  totalTradeValue: number;
  maxDrift: number;
  needsRebalance: boolean;
}

export function buildRebalancePlan(config: RebalanceConfig): RebalancePlan {
  const totalValue = config.currentHoldings.reduce((s, h) => s + h.valueUsd, 0);
  const trades: RebalancePlan["trades"] = [];
  let maxDrift = 0;

  const overweight: { token: Token; excessUsd: number }[] = [];
  const underweight: { token: Token; deficitUsd: number }[] = [];

  for (const target of config.targetAllocations) {
    const holding = config.currentHoldings.find(
      (h) => h.token.mint === target.token.mint
    );
    const currentPct = holding ? (holding.valueUsd / totalValue) * 100 : 0;
    const drift = Math.abs(currentPct - target.targetPct);
    maxDrift = Math.max(maxDrift, drift);

    const targetValue = (target.targetPct / 100) * totalValue;
    const currentValue = holding?.valueUsd ?? 0;
    const diff = currentValue - targetValue;

    if (diff > 0) overweight.push({ token: target.token, excessUsd: diff });
    else if (diff < 0)
      underweight.push({ token: target.token, deficitUsd: Math.abs(diff) });
  }

  const needsRebalance = maxDrift > config.rebalanceThreshold;

  if (needsRebalance) {
    for (const uw of underweight) {
      for (const ow of overweight) {
        if (ow.excessUsd <= 0 || uw.deficitUsd <= 0) continue;
        const tradeValue = Math.min(ow.excessUsd, uw.deficitUsd);
        trades.push({
          from: ow.token,
          to: uw.token,
          amount: tradeValue,
          valueUsd: tradeValue,
        });
        ow.excessUsd -= tradeValue;
        uw.deficitUsd -= tradeValue;
      }
    }
  }

  return {
    trades,
    totalTradeValue: trades.reduce((s, t) => s + t.valueUsd, 0),
    maxDrift,
    needsRebalance,
  };
}
