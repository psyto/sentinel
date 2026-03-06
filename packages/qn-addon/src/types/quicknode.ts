/* ------------------------------------------------------------------ */
/*  QuickNode Marketplace PUDD lifecycle types                        */
/* ------------------------------------------------------------------ */

export interface ProvisionRequest {
  "quicknode-id": string;
  "endpoint-id": string;
  "wss-url": string;
  "http-url": string;
  chain: string;
  network: string;
  plan: string;
  referers?: string[];
  "contract-addresses"?: string[];
}

export interface UpdateRequest {
  "quicknode-id": string;
  "endpoint-id": string;
  "wss-url"?: string;
  "http-url"?: string;
  chain?: string;
  network?: string;
  plan?: string;
  referers?: string[];
  "contract-addresses"?: string[];
}

export interface DeactivateRequest {
  "quicknode-id": string;
  "endpoint-id": string;
}

export interface DeprovisionRequest {
  "quicknode-id": string;
  "endpoint-id": string;
}

export interface Instance {
  id: number;
  quicknode_id: string;
  endpoint_id: string;
  wss_url: string;
  http_url: string;
  chain: string;
  network: string;
  plan: string;
  referers: string | null;
  contract_addresses: string | null;
  is_active: number;
  created_at: string;
  updated_at: string;
}
