# Sentinel -- QuickNode Marketplace Add-On User Guide

## Table of Contents

1. [Overview](#overview)
2. [Getting Started](#getting-started)
3. [Authentication](#authentication)
4. [API Reference](#api-reference)
   - [Healthcheck](#healthcheck)
   - [Guard -- Transaction Security Analysis](#guard----transaction-security-analysis)
   - [Execution Pattern Builders](#execution-pattern-builders)
   - [Jito Bundle Management](#jito-bundle-management)
5. [Security Patterns](#security-patterns)
   - [Solana Patterns (P-101 to P-108)](#solana-patterns-p-101-to-p-108)
   - [EVM Patterns (EVM-001 to EVM-004)](#evm-patterns-evm-001-to-evm-004)
6. [Error Handling](#error-handling)
7. [Use Cases](#use-cases)

---

## Overview

Sentinel (listed as **Fabrknt DeFi Toolkit** on the QuickNode Marketplace) is a transaction security and DeFi execution toolkit. It provides three capabilities through a single add-on:

**Transaction Security Analysis** -- Scans transactions against 12 known attack and misconfiguration patterns across Solana and EVM chains. Detects mint/freeze authority kills, signer mismatches, malicious transfer hooks, reentrancy attacks, flash loan exploits, front-running patterns, and unauthorized access attempts.

**Execution Pattern Builders** -- Generates structured execution plans for common DeFi operations: batch payouts, recurring payments, token vesting schedules, grid trading, dollar-cost averaging (DCA), and portfolio rebalancing.

**Jito Bundle Management** -- Submits transaction bundles to Jito Block Engine for MEV protection on Solana, with dynamic tip calculation and bundle status tracking.

---

## Getting Started

### Installation

1. Go to the [QuickNode Marketplace](https://marketplace.quicknode.com).
2. Search for **Fabrknt DeFi Toolkit**.
3. Click **Add** on your target endpoint.
4. Select a plan (see below).
5. Once provisioned, your endpoint is ready. Use the `X-INSTANCE-ID` header (your endpoint ID) to authenticate API calls.

### Plans

| Plan | Price | Rate Limit | Features |
|------|-------|------------|----------|
| **Starter** | Free | 100 req/min | Transaction security analysis (8 Solana + 4 EVM patterns), all execution pattern builders |
| **Pro** | $49/month | 200 req/min | Everything in Starter, plus Jito bundle submission, bundle status tracking, bundle confirmation polling, dynamic tip calculation |

### Base URL

All API endpoints are served relative to your QuickNode add-on base URL:

```
https://<your-addon-base-url>
```

---

## Authentication

All API requests (except `/healthcheck`) require the `X-INSTANCE-ID` header. This value is your QuickNode endpoint ID, assigned during provisioning.

```bash
curl -X POST https://<your-addon-base-url>/v1/guard/analyze \
  -H "Content-Type: application/json" \
  -H "X-INSTANCE-ID: your-endpoint-id" \
  -d '{ ... }'
```

If the header is missing or invalid, the server returns `401 Unauthorized`.

---

## API Reference

### Healthcheck

Public endpoint -- no authentication required.

```
GET /healthcheck
```

```bash
curl https://<your-addon-base-url>/healthcheck
```

**Response:**

```json
{
  "status": "ok",
  "service": "fabrknt-defi-toolkit",
  "version": "0.1.0"
}
```

---

### Guard -- Transaction Security Analysis

#### POST /v1/guard/analyze

Analyze a transaction through the full Guard pipeline. Returns structured warnings, a validity flag, and any blocking pattern IDs.

**Plan:** Starter, Pro

**Request body:**

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `transaction` | object | Yes | Transaction to analyze (see schema below) |
| `transaction.chain` | string | Yes | `"solana"` or `"evm"` |
| `transaction.instructions` | array | Yes | Array of instruction objects |
| `transaction.signers` | string[] | No | Public keys of transaction signers (Solana) |
| `config` | object | No | Optional guard configuration |
| `config.validateTransferHooks` | boolean | No | Enable/disable transfer hook validation (default: `true`) |
| `config.maxHookAccounts` | number | No | Max accounts a hook can access before flagging (default: `20`) |
| `config.allowedHookPrograms` | string[] | No | Program IDs to whitelist from hook checks |

**Instruction object:**

| Field | Type | Description |
|-------|------|-------------|
| `programId` | string | Program ID (Solana) or contract address (EVM) |
| `data` | string | Base64-encoded instruction data (Solana) or hex-encoded calldata (EVM) |
| `keys` | array | Array of account key objects with `pubkey`, `isSigner`, `isWritable` |

```bash
curl -X POST https://<your-addon-base-url>/v1/guard/analyze \
  -H "Content-Type: application/json" \
  -H "X-INSTANCE-ID: your-endpoint-id" \
  -d '{
    "transaction": {
      "chain": "solana",
      "signers": ["So11111111111111111111111111111112"],
      "instructions": [
        {
          "programId": "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA",
          "data": "BgAAAAA=",
          "keys": [
            { "pubkey": "TokenMintAddress111111111111111111", "isSigner": false, "isWritable": true },
            { "pubkey": "So11111111111111111111111111111112", "isSigner": true, "isWritable": false }
          ]
        }
      ]
    },
    "config": {
      "validateTransferHooks": true
    }
  }'
```

**Response:**

```json
{
  "warnings": [
    {
      "patternId": "P-101",
      "severity": "critical",
      "message": "Permanently disabling mint authority. This action is irreversible.",
      "affectedAccount": "TokenMintAddress111111111111111111",
      "timestamp": 1709827200000
    }
  ],
  "isValid": false,
  "blockedBy": ["P-101"]
}
```

#### POST /v1/guard/analyze-raw

Lightweight analysis that returns warnings only, without the Guard wrapper logic.

**Plan:** Starter, Pro

```bash
curl -X POST https://<your-addon-base-url>/v1/guard/analyze-raw \
  -H "Content-Type: application/json" \
  -H "X-INSTANCE-ID: your-endpoint-id" \
  -d '{
    "transaction": {
      "chain": "evm",
      "instructions": [
        {
          "programId": "0x7d2768de32b0b80b7a3454c06bdac94a69ddc7a9",
          "data": "0x5cffe9de00000000000000000000000000000000",
          "keys": []
        },
        {
          "programId": "0x7a250d5630b4cf539739df2c5dacb4c659f2488d",
          "data": "0x022c0d9f00000000000000000000000000000000",
          "keys": []
        }
      ]
    }
  }'
```

**Response:**

```json
{
  "warnings": [
    {
      "patternId": "EVM-002",
      "severity": "critical",
      "message": "Flash loan combined with DEX swap detected. Possible price manipulation attack.",
      "timestamp": 1709827200000
    }
  ]
}
```

---

### Execution Pattern Builders

All pattern builder endpoints accept a configuration object and return a structured execution plan. These endpoints do not execute transactions -- they produce plans that your application can execute.

#### POST /v1/pattern/batch-payout

Build a batch payout plan with optimized transaction batching.

**Plan:** Starter, Pro

```bash
curl -X POST https://<your-addon-base-url>/v1/pattern/batch-payout \
  -H "Content-Type: application/json" \
  -H "X-INSTANCE-ID: your-endpoint-id" \
  -d '{
    "recipients": [
      { "address": "RecipientAddress1111111111111111111", "amount": 1000000 },
      { "address": "RecipientAddress2222222222222222222", "amount": 2000000 },
      { "address": "RecipientAddress3333333333333333333", "amount": 500000 }
    ],
    "tokenMint": "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v",
    "sender": "SenderAddress11111111111111111111111"
  }'
```

#### POST /v1/pattern/recurring-payment

Build a recurring payment schedule.

**Plan:** Starter, Pro

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `recipient` | string | Yes | Recipient address |
| `amount` | number | Yes | Amount per payment (in smallest unit) |
| `intervalMs` | number | Yes | Interval between payments in milliseconds |
| `totalPayments` | number | No | Total number of payments |

```bash
curl -X POST https://<your-addon-base-url>/v1/pattern/recurring-payment \
  -H "Content-Type: application/json" \
  -H "X-INSTANCE-ID: your-endpoint-id" \
  -d '{
    "recipient": "RecipientAddress1111111111111111111",
    "amount": 5000000,
    "intervalMs": 86400000,
    "totalPayments": 30
  }'
```

#### POST /v1/pattern/vesting

Build a token vesting schedule with cliff and linear unlock.

**Plan:** Starter, Pro

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `beneficiary` | string | Yes | Beneficiary address |
| `totalAmount` | number | Yes | Total tokens to vest |
| `vestingDuration` | number | Yes | Total vesting duration in milliseconds |
| `cliffDuration` | number | No | Cliff period in milliseconds |
| `startDate` | number | No | Start timestamp |
| `vestingInterval` | number | No | Unlock interval in milliseconds |

```bash
curl -X POST https://<your-addon-base-url>/v1/pattern/vesting \
  -H "Content-Type: application/json" \
  -H "X-INSTANCE-ID: your-endpoint-id" \
  -d '{
    "beneficiary": "BeneficiaryAddress111111111111111111",
    "totalAmount": 1000000000,
    "vestingDuration": 31536000000,
    "cliffDuration": 7776000000,
    "startDate": 1709827200000,
    "vestingInterval": 2592000000
  }'
```

#### POST /v1/pattern/grid-trading

Build a grid trading plan with buy/sell levels.

**Plan:** Starter, Pro

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `pair` | string | Yes | Trading pair (e.g., `"SOL/USDC"`) |
| `lowerBound` | number | Yes | Lower price bound |
| `upperBound` | number | Yes | Upper price bound |
| `gridLevels` | number | Yes | Number of grid levels |
| `amountPerGrid` | number | No | Amount to trade at each level |
| `currentPrice` | number | No | Current market price |

```bash
curl -X POST https://<your-addon-base-url>/v1/pattern/grid-trading \
  -H "Content-Type: application/json" \
  -H "X-INSTANCE-ID: your-endpoint-id" \
  -d '{
    "pair": "SOL/USDC",
    "lowerBound": 80,
    "upperBound": 150,
    "gridLevels": 10,
    "amountPerGrid": 1.0,
    "currentPrice": 120
  }'
```

#### POST /v1/pattern/dca

Build a DCA (Dollar Cost Averaging) strategy plan.

**Plan:** Starter, Pro

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `pair` | string | Yes | Trading pair (e.g., `"SOL/USDC"`) |
| `totalAmount` | number | Yes | Total amount to invest |
| `numberOfOrders` | number | Yes | Number of orders to split into |
| `intervalMs` | number | No | Interval between orders in milliseconds |

```bash
curl -X POST https://<your-addon-base-url>/v1/pattern/dca \
  -H "Content-Type: application/json" \
  -H "X-INSTANCE-ID: your-endpoint-id" \
  -d '{
    "pair": "SOL/USDC",
    "totalAmount": 10000,
    "numberOfOrders": 30,
    "intervalMs": 86400000
  }'
```

#### POST /v1/pattern/rebalance

Build a portfolio rebalance plan.

**Plan:** Starter, Pro

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `targetAllocations` | object | Yes | Map of token to target percentage (e.g., `{ "SOL": 50, "USDC": 30, "RAY": 20 }`) |
| `currentHoldings` | object | Yes | Map of token to current holdings (e.g., `{ "SOL": 100, "USDC": 5000, "RAY": 200 }`) |
| `rebalanceThreshold` | number | No | Minimum deviation percentage to trigger rebalance |

```bash
curl -X POST https://<your-addon-base-url>/v1/pattern/rebalance \
  -H "Content-Type: application/json" \
  -H "X-INSTANCE-ID: your-endpoint-id" \
  -d '{
    "targetAllocations": { "SOL": 50, "USDC": 30, "RAY": 20 },
    "currentHoldings": { "SOL": 100, "USDC": 5000, "RAY": 200 },
    "rebalanceThreshold": 5
  }'
```

---

### Jito Bundle Management

These endpoints require the **Pro** plan.

#### POST /v1/bundle/submit

Submit a Jito bundle of serialized transactions for MEV-protected execution.

**Plan:** Pro

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `transactions` | string[] | Yes | Array of base64-encoded serialized transactions |
| `region` | string | No | Jito region (default: `"default"`) |
| `tipLevel` | string | No | Tip level for priority |

```bash
curl -X POST https://<your-addon-base-url>/v1/bundle/submit \
  -H "Content-Type: application/json" \
  -H "X-INSTANCE-ID: your-endpoint-id" \
  -d '{
    "transactions": [
      "AQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA...",
      "AgAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA..."
    ],
    "region": "default"
  }'
```

**Response:**

```json
{
  "status": "accepted",
  "transactionCount": 2,
  "region": "default"
}
```

#### GET /v1/bundle/status/:bundleId

Check the status of a previously submitted bundle.

**Plan:** Pro

```bash
curl https://<your-addon-base-url>/v1/bundle/status/abc123-bundle-id \
  -H "X-INSTANCE-ID: your-endpoint-id"
```

**Response:**

```json
{
  "bundleId": "abc123-bundle-id",
  "status": "pending"
}
```

Possible status values: `pending`, `landed`, `failed`.

#### POST /v1/bundle/tip

Calculate a Jito tip amount and receive a random tip account address. Available on both plans.

**Plan:** Starter, Pro

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `level` | string | No | `"low"`, `"medium"`, `"high"`, `"very_high"`, or `"turbo"` (default: `"medium"`) |
| `region` | string | No | Jito region (default: `"default"`) |
| `multiplier` | number | No | Multiply the base tip amount (default: `1`) |

```bash
curl -X POST https://<your-addon-base-url>/v1/bundle/tip \
  -H "Content-Type: application/json" \
  -H "X-INSTANCE-ID: your-endpoint-id" \
  -d '{
    "level": "high",
    "region": "default",
    "multiplier": 1.5
  }'
```

**Response:**

```json
{
  "tipAmount": 15000000,
  "tipAmountSol": 0.015,
  "tipAccount": "96gYZGLnJYVFmbjzopPSU6QiEV5fGqZNyN9nmNhvrZU5",
  "region": "default"
}
```

---

## Security Patterns

Sentinel detects 12 security patterns: 8 for Solana and 4 for EVM. Each warning includes a severity level:

| Severity | Meaning |
|----------|---------|
| `critical` | Dangerous and likely irreversible. Block the transaction. |
| `alert` | Suspicious behavior that needs manual review. |
| `warning` | Potential risk. Verify intent before proceeding. |

### Solana Patterns (P-101 to P-108)

| ID | Name | Severity | Description |
|----|------|----------|-------------|
| **P-101** | Mint Authority Kill | Critical | Detects `SetAuthority` instructions that permanently disable mint authority on an SPL Token or Token-2022 mint. This is irreversible -- no new tokens can ever be minted. |
| **P-102** | Freeze Authority Kill | Critical | Detects `SetAuthority` instructions that permanently disable freeze authority. You will permanently lose the ability to freeze token accounts. |
| **P-103** | Signer Mismatch | Warning | Flags `SetAuthority` calls where the new authority is not a current transaction signer. This can lead to lockout if the new authority address is wrong or inaccessible. |
| **P-104** | Dangerous Account Close | Alert | Detects `CloseAccount` instructions on SPL Token accounts. Warns you to verify the account balance is zero or has been transferred before closing. |
| **P-105** | Excessive Hook Accounts | Warning | A non-standard program (potential transfer hook) accesses more accounts than the configured threshold (default: 20). May indicate a hook performing unexpected operations. |
| **P-106** | Malicious Transfer Hook | Critical | An unknown transfer hook program writes to more than 10 accounts and accesses more than 15 total. Strongly indicates a malicious hook siphoning funds or corrupting state. |
| **P-107** | Unexpected Hook Execution | Alert | A transfer hook is invoked but no token transfer instruction exists in the transaction. The hook may be executing outside its intended context. |
| **P-108** | Hook Reentrancy | Critical | A transfer hook program is either sandwiched between token operations or invoked more than 6 times in a single transaction. Indicates a possible reentrancy attack via hook callbacks. |

### EVM Patterns (EVM-001 to EVM-004)

| ID | Name | Severity | Description |
|----|------|----------|-------------|
| **EVM-001** | Reentrancy Attack | Critical | Detects when the same non-standard contract is called 3+ times with token transfer selectors (`transfer` or `transferFrom`) in a single transaction. Classic reentrancy pattern. |
| **EVM-002** | Flash Loan Attack | Critical/Alert | Flags transactions that combine flash loan calls (AAVE V2/V3, dYdX) with DEX swaps (Uniswap, SushiSwap, 1inch). Also flags flash loans with many operations and token transfers. |
| **EVM-003** | Front-Running / Sandwich | Alert | Detects multiple swap calls to the same DEX router within one transaction. This pattern is characteristic of sandwich attacks that extract value from other traders. |
| **EVM-004** | Unauthorized Access | Critical/Warning | Flags calls to admin functions: `transferOwnership`, `renounceOwnership`, `setAdmin`, `upgradeTo`. `renounceOwnership` is flagged as critical since it permanently removes admin control. |

---

## Error Handling

### HTTP Status Codes

| Code | Meaning |
|------|---------|
| `200` | Success |
| `400` | Bad request -- missing or invalid parameters |
| `401` | Unauthorized -- missing or invalid `X-INSTANCE-ID` header |
| `404` | Resource not found |
| `409` | Conflict -- resource already exists (e.g., duplicate provisioning) |
| `429` | Rate limit exceeded (Starter: 100 req/min, Pro: 200 req/min) |
| `500` | Internal server error |

### Error Response Format

All errors return a JSON body with an `error` field:

```json
{
  "error": "transaction is required"
}
```

For provisioning endpoints, errors include a `status` field:

```json
{
  "status": "error",
  "error": "Instance already provisioned"
}
```

### Common Errors

**Missing transaction body:**

```bash
curl -X POST https://<your-addon-base-url>/v1/guard/analyze \
  -H "Content-Type: application/json" \
  -H "X-INSTANCE-ID: your-endpoint-id" \
  -d '{}'
```

```json
{ "error": "transaction is required" }
```

**Missing required fields on pattern builders:**

```json
{ "error": "recipients array is required" }
{ "error": "pair, totalAmount, numberOfOrders, and intervalMs are required" }
{ "error": "targetAllocations, currentHoldings, and rebalanceThreshold are required" }
```

**Empty bundle submission:**

```json
{ "error": "transactions array is required (base64-encoded)" }
```

**Rate limit exceeded:**

The server returns HTTP 429. Back off and retry after the rate limit window resets.

---

## Use Cases

### Pre-Trade Security Scanning

Scan every transaction before signing to catch dangerous operations. Integrate the `/v1/guard/analyze` endpoint into your transaction signing flow.

```bash
# 1. Build your transaction as usual
# 2. Before signing, send it to Sentinel for analysis

RESULT=$(curl -s -X POST https://<your-addon-base-url>/v1/guard/analyze \
  -H "Content-Type: application/json" \
  -H "X-INSTANCE-ID: your-endpoint-id" \
  -d '{
    "transaction": {
      "chain": "solana",
      "signers": ["YourWalletPubkey111111111111111111111"],
      "instructions": [
        {
          "programId": "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA",
          "data": "BgAAAAA=",
          "keys": [
            { "pubkey": "MintAddress1111111111111111111111111", "isSigner": false, "isWritable": true }
          ]
        }
      ]
    }
  }')

# 3. Check the result
IS_VALID=$(echo "$RESULT" | jq -r '.isValid')

if [ "$IS_VALID" = "false" ]; then
  echo "BLOCKED: $(echo "$RESULT" | jq -r '.warnings[0].message')"
  exit 1
fi

# 4. Safe to sign and submit
```

### DCA Automation

Use the DCA pattern builder to generate an execution schedule, then run it with a cron job or scheduler.

```bash
# Generate a 30-day DCA plan: $10,000 into SOL, one buy per day
curl -s -X POST https://<your-addon-base-url>/v1/pattern/dca \
  -H "Content-Type: application/json" \
  -H "X-INSTANCE-ID: your-endpoint-id" \
  -d '{
    "pair": "SOL/USDC",
    "totalAmount": 10000,
    "numberOfOrders": 30,
    "intervalMs": 86400000
  }'
```

The response contains a schedule of orders with timestamps and amounts. Your application executes each order at the specified time.

### MEV Protection with Jito Bundles

Protect swaps from sandwich attacks by submitting them as Jito bundles (Pro plan).

```bash
# Step 1: Get a tip amount and tip account
TIP=$(curl -s -X POST https://<your-addon-base-url>/v1/bundle/tip \
  -H "Content-Type: application/json" \
  -H "X-INSTANCE-ID: your-endpoint-id" \
  -d '{ "level": "high" }')

TIP_ACCOUNT=$(echo "$TIP" | jq -r '.tipAccount')
TIP_AMOUNT=$(echo "$TIP" | jq -r '.tipAmount')

echo "Tip: $TIP_AMOUNT lamports -> $TIP_ACCOUNT"

# Step 2: Build your swap transaction + tip transaction locally
# (include a transfer of $TIP_AMOUNT lamports to $TIP_ACCOUNT)

# Step 3: Serialize and submit as a bundle
curl -s -X POST https://<your-addon-base-url>/v1/bundle/submit \
  -H "Content-Type: application/json" \
  -H "X-INSTANCE-ID: your-endpoint-id" \
  -d '{
    "transactions": [
      "<base64-encoded-swap-tx>",
      "<base64-encoded-tip-tx>"
    ],
    "region": "default"
  }'

# Step 4: Poll for confirmation
curl -s https://<your-addon-base-url>/v1/bundle/status/<bundle-id> \
  -H "X-INSTANCE-ID: your-endpoint-id"
```

### Portfolio Rebalancing

Generate a rebalance plan when your portfolio drifts from target allocations.

```bash
curl -s -X POST https://<your-addon-base-url>/v1/pattern/rebalance \
  -H "Content-Type: application/json" \
  -H "X-INSTANCE-ID: your-endpoint-id" \
  -d '{
    "targetAllocations": { "SOL": 50, "USDC": 30, "RAY": 20 },
    "currentHoldings": { "SOL": 100, "USDC": 5000, "RAY": 200 },
    "rebalanceThreshold": 5
  }'
```

The response tells you which tokens to buy or sell and in what quantities to reach your target allocation.

### Scanning EVM Transactions for Flash Loan Attacks

```bash
curl -s -X POST https://<your-addon-base-url>/v1/guard/analyze-raw \
  -H "Content-Type: application/json" \
  -H "X-INSTANCE-ID: your-endpoint-id" \
  -d '{
    "transaction": {
      "chain": "evm",
      "instructions": [
        {
          "programId": "0x87870bca3f3fd6335c3f4ce8392d69350b4fa4e2",
          "data": "0x5cffe9de0000000000000000000000000000000000000000",
          "keys": []
        },
        {
          "programId": "0x7a250d5630b4cf539739df2c5dacb4c659f2488d",
          "data": "0x022c0d9f0000000000000000000000000000000000000000",
          "keys": []
        },
        {
          "programId": "0x7a250d5630b4cf539739df2c5dacb4c659f2488d",
          "data": "0x022c0d9f0000000000000000000000000000000000000000",
          "keys": []
        }
      ]
    }
  }'
```

This transaction would trigger both **EVM-002** (flash loan + DEX swap) and **EVM-003** (multiple swaps on the same router).
