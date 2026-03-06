# Sentinel

Safe execution infrastructure for Solana. Transaction security analysis, execution patterns, and Jito bundle management.

**Fabrknt DeFi Toolkit** (`fabrknt-defi-toolkit`) — the 5th Fabrknt QuickNode Marketplace add-on.

## Packages

| Package | Description |
|---------|-------------|
| `@sentinel/core` | Guard detector, pattern builders, bundle manager |
| `@sentinel/qn-addon` | QuickNode Marketplace REST add-on (Express) |

## What's Inside

### Guard — Transaction Security Analysis

Detects 8 dangerous patterns in Solana transactions:

| Pattern | ID | Severity |
|---------|----|----------|
| Mint authority kill | P-101 | Critical |
| Freeze authority kill | P-102 | Critical |
| Signer mismatch | P-103 | Warning |
| Dangerous account close | P-104 | Alert |
| Malicious Transfer Hook | P-105 | Critical |
| Unexpected hook execution | P-106 | Alert |
| Hook reentrancy | P-107 | Critical |
| Excessive hook accounts | P-108 | Warning |

Three enforcement modes (`block`, `warn`) and three risk tolerances (`strict`, `moderate`, `permissive`).

### Patterns — Execution Plan Builders

| Pattern | Endpoint | Description |
|---------|----------|-------------|
| Batch Payout | `/v1/pattern/batch-payout` | Optimized multi-recipient payout batching |
| Recurring Payment | `/v1/pattern/recurring-payment` | Payment schedule builder |
| Token Vesting | `/v1/pattern/vesting` | Cliff + linear vesting schedule |
| Grid Trading | `/v1/pattern/grid-trading` | Buy/sell grid level planning |
| DCA | `/v1/pattern/dca` | Dollar-cost averaging schedule |
| Rebalance | `/v1/pattern/rebalance` | Portfolio rebalancing with drift detection |

### Bundle — Jito Integration

| Endpoint | Description |
|----------|-------------|
| `/v1/bundle/tip` | Calculate tip amount + random tip account |
| `/v1/bundle/submit` | Submit bundle to Jito Block Engine (Pro) |
| `/v1/bundle/status/:id` | Check bundle confirmation status (Pro) |

## Quick Start

### As SDK

```typescript
import { Guard, buildGridTradingPlan, BundleManager } from "@sentinel/core";

// Analyze a transaction for security issues
const guard = new Guard({ mode: "block", riskTolerance: "moderate" });
const result = await guard.validateTransaction(transaction);

// Build a grid trading plan
const plan = buildGridTradingPlan({
  pair: { base: SOL, quote: USDC },
  lowerBound: 90,
  upperBound: 110,
  gridLevels: 10,
  amountPerGrid: 1,
  currentPrice: { token: "SOL", price: 100, quoteCurrency: "USDC", timestamp: Date.now() },
});

// Submit a Jito bundle
const bundler = new BundleManager({ endpoint: "https://api.mainnet-beta.solana.com" });
const tip = bundler.createTipInstruction(payerPubkey, TipLevel.Medium);
```

### As REST API

```bash
# Analyze transaction security
curl -X POST http://localhost:3050/v1/guard/analyze \
  -H "Content-Type: application/json" \
  -d '{"transaction": {"id": "tx1", "status": "pending", "instructions": [...]}}'

# Build a DCA plan
curl -X POST http://localhost:3050/v1/pattern/dca \
  -H "Content-Type: application/json" \
  -d '{"pair": {...}, "totalAmount": 1000, "numberOfOrders": 10, "intervalMs": 86400000}'

# Get a Jito tip account
curl -X POST http://localhost:3050/v1/bundle/tip \
  -H "Content-Type: application/json" \
  -d '{"level": "medium", "region": "tokyo"}'
```

## Development

```bash
npm install
npm run build
npm run dev    # Start server on port 3050
```

## Fabrknt Product Suite

| Product | Slug | Scope |
|---------|------|-------|
| On-Chain Compliance | fabrknt-onchain-compliance | KYC/AML, identity, transfer hooks |
| Off-Chain Compliance | fabrknt-offchain-compliance | Screening, SAR/STR, regulatory queries |
| Data Optimization | fabrknt-data-optimization | Merkle trees, bitfields, order matching |
| Privacy | fabrknt-privacy | Encryption, Shamir, ZK compression |
| **DeFi Toolkit** | **fabrknt-defi-toolkit** | **Guard, patterns, Jito bundles** |

## License

MIT
