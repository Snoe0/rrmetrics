/**
 * Webull OpenAPI client.
 * Handles OAuth token exchange, refresh, account listing, and order fetching.
 */

interface WebullAccount {
  accountId: string;
  accountType: string;
  currency: string;
}

interface WebullOrder {
  orderId: string;
  ticker: string;
  side: 'BUY' | 'SELL';
  orderType: string;
  status: string;
  filledQty: number;
  avgFilledPrice: number;
  filledTime: string;
  createTime: string;
}

interface WebullTokenResponse {
  access_token: string;
  refresh_token: string;
  expires_in: number;
  token_type: string;
}

const WEBULL_API_BASE = 'https://api.webull.com';

export class WebullAPI {
  /**
   * Build the OAuth authorize URL for Webull.
   */
  static getAuthUrl(appId: string, redirectUri: string, state: string): string {
    const params = new URLSearchParams({
      response_type: 'code',
      client_id: appId,
      redirect_uri: redirectUri,
      state,
      scope: 'trade.read account.read',
    });
    return `${WEBULL_API_BASE}/oauth2/authorize?${params.toString()}`;
  }

  /**
   * Exchange an OAuth authorization code for access and refresh tokens.
   */
  static async exchangeOAuthCode(opts: {
    appId: string;
    appSecret: string;
    code: string;
    redirectUri: string;
  }): Promise<{ accessToken: string; refreshToken: string; expiresIn: number }> {
    const res = await fetch(`${WEBULL_API_BASE}/oauth2/token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'authorization_code',
        client_id: opts.appId,
        client_secret: opts.appSecret,
        code: opts.code,
        redirect_uri: opts.redirectUri,
      }).toString(),
    });

    if (!res.ok) {
      const text = await res.text();
      throw new Error(`Webull OAuth exchange failed (${res.status}): ${text}`);
    }

    const data = (await res.json()) as WebullTokenResponse;
    return {
      accessToken: data.access_token,
      refreshToken: data.refresh_token,
      expiresIn: data.expires_in,
    };
  }

  /**
   * Refresh an access token using a refresh token.
   */
  static async refreshAccessToken(opts: {
    appId: string;
    appSecret: string;
    refreshToken: string;
  }): Promise<{ accessToken: string; refreshToken: string; expiresIn: number }> {
    const res = await fetch(`${WEBULL_API_BASE}/oauth2/token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'refresh_token',
        client_id: opts.appId,
        client_secret: opts.appSecret,
        refresh_token: opts.refreshToken,
      }).toString(),
    });

    if (!res.ok) {
      const text = await res.text();
      throw new Error(`Webull token refresh failed (${res.status}): ${text}`);
    }

    const data = (await res.json()) as WebullTokenResponse;
    return {
      accessToken: data.access_token,
      refreshToken: data.refresh_token,
      expiresIn: data.expires_in,
    };
  }

  /**
   * Fetch the list of accounts for the authenticated user.
   */
  static async getAccounts(token: string): Promise<WebullAccount[]> {
    const res = await fetch(`${WEBULL_API_BASE}/api/trade/v1/webull/account/list`, {
      headers: { Authorization: `Bearer ${token}` },
    });

    if (!res.ok) {
      const text = await res.text();
      throw new Error(`Webull getAccounts failed (${res.status}): ${text}`);
    }

    const data = (await res.json()) as any;
    return (data.accounts || data || []).map((a: any) => ({
      accountId: String(a.account_id || a.accountId),
      accountType: a.account_type || a.accountType || 'unknown',
      currency: a.currency || 'USD',
    }));
  }

  /**
   * Fetch filled orders for a specific account.
   * Handles pagination automatically.
   */
  static async getOrders(
    token: string,
    accountId: string,
    startDate?: string,
  ): Promise<WebullOrder[]> {
    const params = new URLSearchParams({ status: 'filled', count: '200' });
    if (startDate) params.set('startDate', startDate);

    const allOrders: WebullOrder[] = [];
    let url: string | null = `${WEBULL_API_BASE}/api/trade/v1/webull/account/${accountId}/orders?${params.toString()}`;

    while (url) {
      const res = await fetch(url, {
        headers: { Authorization: `Bearer ${token}` },
      });

      if (!res.ok) {
        const text = await res.text();
        throw new Error(`Webull getOrders failed (${res.status}): ${text}`);
      }

      const data = (await res.json()) as any;
      const orders = (data.orders || data || []) as any[];

      for (const o of orders) {
        if (!o.filledQty && !o.filled_qty) continue;
        allOrders.push({
          orderId: String(o.order_id || o.orderId),
          ticker: o.ticker?.symbol || o.symbol || o.ticker || '',
          side: (o.side || o.action || '').toUpperCase() as 'BUY' | 'SELL',
          orderType: o.order_type || o.orderType || 'MARKET',
          status: o.status || 'filled',
          filledQty: Number(o.filled_qty || o.filledQty || 0),
          avgFilledPrice: Number(o.avg_filled_price || o.avgFilledPrice || 0),
          filledTime: o.filled_time || o.filledTime || o.updated_at || o.createTime,
          createTime: o.create_time || o.createTime || o.created_at,
        });
      }

      // Pagination
      url = data.next || null;
    }

    return allOrders;
  }
}
