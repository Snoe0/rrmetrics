/**
 * Tradovate broker API client.
 * Copied from server/services/TradovateAPI.js - already uses fetch, no changes needed.
 */

export class TradovateAPI {
  private baseUrl: string;

  constructor(environment: string = 'demo') {
    this.baseUrl =
      environment === 'live'
        ? 'https://live.tradovateapi.com/v1'
        : 'https://demo.tradovateapi.com/v1';
  }

  async authenticate(credentials: {
    username: string;
    password: string;
    cid: string;
    secret: string;
  }): Promise<{ accessToken: string; [key: string]: unknown }> {
    const response = await fetch(`${this.baseUrl}/auth/accesstokenrequest`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: credentials.username,
        password: credentials.password,
        appId: credentials.cid,
        appVersion: '1.0',
        cid: credentials.cid,
        sec: credentials.secret,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Tradovate auth failed: ${response.status} ${errorText}`);
    }

    const data = (await response.json()) as { accessToken?: string; errorText?: string };
    if (!data.accessToken) {
      throw new Error(data.errorText || 'Authentication failed - no access token returned');
    }
    return data as { accessToken: string };
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
  ): Promise<Array<{ orderId?: string; id?: number; contractId: number; qty?: number; price?: number; timestamp: string }>> {
    const response = await fetch(`${this.baseUrl}/fill/list`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!response.ok) throw new Error(`Failed to fetch fills: ${response.status}`);
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
