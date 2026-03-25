/**
 * Tradovate broker API client.
 * Uses OAuth tokens obtained via the Tradovate OAuth flow.
 */

export interface TvPosition {
  id: number;
  accountId: number;
  contractId: number;
  timestamp: string;
  netPos: number;
}

export interface TvFillPair {
  id: number;
  positionId: number;
  buyFillId: number;
  sellFillId: number;
  qty: number;
  buyPrice: number;
  sellPrice: number;
  active: boolean;
}

export interface TvFill {
  id: number;
  orderId: number;
  contractId: number;
  timestamp: string;
  action: string;
  qty: number;
  price: number;
}

export interface TvContract {
  id: number;
  name: string;
}

export interface TvOrder {
  id: number;
  accountId: number;
  contractId: number;
  action: 'Buy' | 'Sell';
  ordType: string;
  ordStatus: string;
  orderQty: number;
  price?: number;
  stopPrice?: number;
  limitPrice?: number;
  triggerPrice?: number;
  qty?: number;
}

export interface PlaceOrderParams {
  accountSpec: string;
  accountId: number;
  action: 'Buy' | 'Sell';
  symbol: string;
  orderQty: number;
  orderType: string;
  price?: number;
  stopPrice?: number;
  isAutomated?: boolean;
}

export class TradovateAPI {
  private baseUrl: string;

  constructor(environment: string = 'demo') {
    this.baseUrl =
      environment === 'live'
        ? 'https://live.tradovateapi.com/v1'
        : 'https://demo.tradovateapi.com/v1';
  }

  /**
   * Exchange an OAuth authorization code for an access token.
   * Called after the user completes the Tradovate OAuth consent screen.
   */
  static async exchangeOAuthCode(opts: {
    code: string;
    environment: string;
    clientId: string;
    clientSecret: string;
    redirectUri: string;
  }): Promise<{ accessToken: string; expiresIn: number }> {
    const tokenUrl =
      opts.environment === 'live'
        ? 'https://live.tradovateapi.com/auth/oauthtoken'
        : 'https://demo.tradovateapi.com/auth/oauthtoken';

    const body = new URLSearchParams({
      grant_type: 'authorization_code',
      client_id: opts.clientId,
      client_secret: opts.clientSecret,
      redirect_uri: opts.redirectUri,
      code: opts.code,
    });

    const response = await fetch(tokenUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: body.toString(),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`OAuth token exchange failed: ${response.status} ${errorText}`);
    }

    const data = (await response.json()) as {
      access_token?: string;
      expires_in?: number;
      errorText?: string;
    };

    if (!data.access_token) {
      throw new Error(data.errorText || 'No access token returned from Tradovate OAuth');
    }

    return { accessToken: data.access_token, expiresIn: data.expires_in ?? 5400 };
  }

  /**
   * Renew an existing access token before it expires.
   * Returns a fresh token with a new expiration window.
   */
  async renewAccessToken(token: string): Promise<{ accessToken: string; expiresIn: number }> {
    const response = await fetch(`${this.baseUrl}/auth/renewaccesstoken`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Token renewal failed: ${response.status} ${errorText}`);
    }

    const data = (await response.json()) as {
      accessToken?: string;
      expirationTime?: string;
      errorText?: string;
    };

    if (!data.accessToken) {
      throw new Error(data.errorText || 'No access token returned from renewal');
    }

    // Tradovate renewal returns expirationTime as ISO string; compute seconds remaining
    const expiresIn = data.expirationTime
      ? Math.floor((new Date(data.expirationTime).getTime() - Date.now()) / 1000)
      : 5400;

    return { accessToken: data.accessToken, expiresIn };
  }

  async getAccounts(token: string): Promise<unknown[]> {
    const response = await fetch(`${this.baseUrl}/account/list`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!response.ok) throw new Error(`Failed to fetch accounts: ${response.status}`);
    return response.json() as Promise<unknown[]>;
  }

  /** Fetch cash balance snapshot for a specific account. */
  async getCashBalance(token: string, accountId: number): Promise<{ cashBalance: number } | null> {
    try {
      const response = await fetch(`${this.baseUrl}/cashBalance/getCashBalanceSnapshot?accountId=${accountId}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!response.ok) return null;
      const data = await response.json() as any;
      return { cashBalance: data.cashBalance ?? data.totalCashValue ?? null };
    } catch {
      return null;
    }
  }

  /** All currently open positions for the authenticated user. */
  async getPositions(token: string): Promise<TvPosition[]> {
    const response = await fetch(`${this.baseUrl}/position/list`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!response.ok) throw new Error(`Failed to fetch positions: ${response.status}`);
    return response.json() as Promise<TvPosition[]>;
  }

  /** Batch-fetch specific positions by ID (works for historical/closed positions). */
  async getPositionItems(token: string, ids: number[]): Promise<TvPosition[]> {
    if (ids.length === 0) return [];
    const response = await fetch(`${this.baseUrl}/position/items?ids=${ids.join(',')}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!response.ok) throw new Error(`Failed to fetch position items: ${response.status}`);
    return response.json() as Promise<TvPosition[]>;
  }

  /**
   * All fill pairs for the authenticated user.
   * Each FillPair represents one matched buy+sell round-trip (Tradovate's own FIFO matching).
   * active=false → the pair's position is fully closed.
   */
  async getFillPairs(token: string): Promise<TvFillPair[]> {
    const response = await fetch(`${this.baseUrl}/fillPair/list`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!response.ok) throw new Error(`Failed to fetch fill pairs: ${response.status}`);
    return response.json() as Promise<TvFillPair[]>;
  }

  /** Batch-fetch fills by ID. Returns fill timestamps and order IDs. */
  async getFillItems(token: string, ids: number[]): Promise<TvFill[]> {
    if (ids.length === 0) return [];
    const response = await fetch(`${this.baseUrl}/fill/items?ids=${ids.join(',')}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!response.ok) throw new Error(`Failed to fetch fill items: ${response.status}`);
    return response.json() as Promise<TvFill[]>;
  }

  /** Batch-fetch contracts by ID to resolve names. */
  async getContractItems(token: string, ids: number[]): Promise<TvContract[]> {
    if (ids.length === 0) return [];
    const response = await fetch(`${this.baseUrl}/contract/items?ids=${ids.join(',')}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!response.ok) throw new Error(`Failed to fetch contract items: ${response.status}`);
    return response.json() as Promise<TvContract[]>;
  }

  /** Place an order on a Tradovate account. */
  async placeOrder(token: string, params: PlaceOrderParams): Promise<TvOrder> {
    const response = await fetch(`${this.baseUrl}/order/placeorder`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(params),
    });
    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Failed to place order: ${response.status} ${errorText}`);
    }
    return response.json() as Promise<TvOrder>;
  }

  /** Cancel an existing order by ID. */
  async cancelOrder(token: string, orderId: number): Promise<void> {
    const response = await fetch(`${this.baseUrl}/order/cancelorder`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ orderId }),
    });
    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Failed to cancel order: ${response.status} ${errorText}`);
    }
  }

  /** Modify an existing order (price, stopPrice, orderQty). */
  async modifyOrder(
    token: string,
    orderId: number,
    params: Partial<{ orderQty: number; price: number; stopPrice: number }>,
  ): Promise<TvOrder> {
    const response = await fetch(`${this.baseUrl}/order/modifyorder`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ orderId, ...params }),
    });
    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Failed to modify order: ${response.status} ${errorText}`);
    }
    return response.json() as Promise<TvOrder>;
  }

  /** Fetch a single order by ID. */
  async getOrderItem(token: string, orderId: number): Promise<TvOrder> {
    const response = await fetch(`${this.baseUrl}/order/item?id=${orderId}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!response.ok) throw new Error(`Failed to fetch order: ${response.status}`);
    return response.json() as Promise<TvOrder>;
  }

  /** Get open positions filtered by account ID. */
  async getPositionsByAccount(token: string, accountId: number): Promise<TvPosition[]> {
    const positions = await this.getPositions(token);
    return positions.filter((p) => p.accountId === accountId);
  }
}
