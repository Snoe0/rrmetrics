/**
 * Tradovate broker API client.
 * Uses OAuth tokens obtained via the Tradovate OAuth flow.
 */

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

  async getAccounts(token: string): Promise<unknown[]> {
    const response = await fetch(`${this.baseUrl}/account/list`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!response.ok) throw new Error(`Failed to fetch accounts: ${response.status}`);
    return response.json() as Promise<unknown[]>;
  }

  async getFills(
    token: string,
  ): Promise<
    Array<{
      orderId?: string;
      id?: number;
      contractId: number;
      action?: string;
      qty?: number;
      price?: number;
      timestamp: string;
    }>
  > {
    const response = await fetch(`${this.baseUrl}/fill/list`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!response.ok) throw new Error(`Failed to fetch fills: ${response.status}`);
    return response.json() as Promise<any[]>;
  }

  async getFillsByAccount(
    token: string,
    accountId: number,
  ): Promise<
    Array<{
      orderId?: string;
      id?: number;
      contractId: number;
      action?: string;
      qty?: number;
      price?: number;
      timestamp: string;
    }>
  > {
    const response = await fetch(`${this.baseUrl}/fill/ldeps?masterid=${accountId}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!response.ok) throw new Error(`Failed to fetch fills for account ${accountId}: ${response.status}`);
    return response.json() as Promise<any[]>;
  }

  async getContract(
    token: string,
    id: number,
  ): Promise<{ name?: string; [key: string]: unknown }> {
    const response = await fetch(`${this.baseUrl}/contract/item?id=${id}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!response.ok) throw new Error(`Failed to fetch contract ${id}: ${response.status}`);
    return response.json() as Promise<{ name?: string }>;
  }
}
