const RH_API_BASE = 'https://api.robinhood.com';

// Types
interface RhAuthResponse {
  access_token: string;
  refresh_token: string;
  expires_in: number;
  token_type: string;
}

interface RhAccount {
  url: string;
  account_number: string;
  type: string;
  buying_power: string;
  cash: string;
}

interface RhOrder {
  id: string;
  instrument: string;
  side: 'buy' | 'sell';
  state: string;
  type: string;
  price: string | null;
  average_price: string | null;
  quantity: string;
  cumulative_quantity: string;
  created_at: string;
  updated_at: string;
  last_transaction_at: string;
  executions: Array<{
    id: string;
    price: string;
    quantity: string;
    timestamp: string;
  }>;
}

interface RhInstrument {
  url: string;
  symbol: string;
  simple_name: string;
  name: string;
  type: string;
}

export class RobinhoodAPI {
  /**
   * Authenticate with Robinhood using email + password.
   * Credentials are used once to obtain a token and must be discarded immediately.
   * A device_token is required for Robinhood auth — generate a UUID v4 per connection.
   */
  static async authenticate(
    email: string,
    password: string,
    deviceToken: string,
  ): Promise<{ accessToken: string; refreshToken: string; expiresIn: number }> {
    const res = await fetch(`${RH_API_BASE}/oauth2/token/`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'X-Robinhood-API-Version': '1.431.4',
      },
      body: new URLSearchParams({
        grant_type: 'password',
        client_id: 'c82SH0WZOsabOXGP2sxqcj34FxkvfnWRZBKlBjFS',
        username: email,
        password: password,
        device_token: deviceToken,
        scope: 'internal',
      }).toString(),
    });

    if (!res.ok) {
      const text = await res.text();
      throw new Error(`Robinhood authentication failed (${res.status}): ${text}`);
    }

    const data = await res.json() as RhAuthResponse;
    return {
      accessToken: data.access_token,
      refreshToken: data.refresh_token,
      expiresIn: data.expires_in,
    };
  }

  /**
   * Refresh an access token using a refresh token.
   */
  static async refreshAccessToken(
    refreshToken: string,
  ): Promise<{ accessToken: string; refreshToken: string; expiresIn: number }> {
    const res = await fetch(`${RH_API_BASE}/oauth2/token/`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'X-Robinhood-API-Version': '1.431.4',
      },
      body: new URLSearchParams({
        grant_type: 'refresh_token',
        client_id: 'c82SH0WZOsabOXGP2sxqcj34FxkvfnWRZBKlBjFS',
        refresh_token: refreshToken,
        scope: 'internal',
      }).toString(),
    });

    if (!res.ok) {
      const text = await res.text();
      throw new Error(`Robinhood token refresh failed (${res.status}): ${text}`);
    }

    const data = await res.json() as RhAuthResponse;
    return {
      accessToken: data.access_token,
      refreshToken: data.refresh_token,
      expiresIn: data.expires_in,
    };
  }

  /**
   * Get account info.
   */
  static async getAccounts(token: string): Promise<RhAccount[]> {
    const res = await fetch(`${RH_API_BASE}/accounts/`, {
      headers: { Authorization: `Bearer ${token}` },
    });

    if (!res.ok) {
      const text = await res.text();
      throw new Error(`Robinhood getAccounts failed (${res.status}): ${text}`);
    }

    const data = await res.json() as any;
    return (data.results || []) as RhAccount[];
  }

  /**
   * Get filled orders with pagination.
   */
  static async getOrders(token: string, updatedSince?: string): Promise<RhOrder[]> {
    const allOrders: RhOrder[] = [];
    let url: string | null = `${RH_API_BASE}/orders/?states=filled`;
    if (updatedSince) url += `&updated_at[gte]=${updatedSince}`;

    while (url) {
      const res = await fetch(url, {
        headers: { Authorization: `Bearer ${token}` },
      });

      if (!res.ok) {
        const text = await res.text();
        throw new Error(`Robinhood getOrders failed (${res.status}): ${text}`);
      }

      const data = await res.json() as any;
      allOrders.push(...(data.results || []));
      url = data.next || null;
    }

    return allOrders;
  }

  /**
   * Resolve an instrument URL to its symbol.
   * Cache-friendly since instruments don't change.
   */
  static async getInstrument(token: string, instrumentUrl: string): Promise<RhInstrument> {
    const res = await fetch(instrumentUrl, {
      headers: { Authorization: `Bearer ${token}` },
    });

    if (!res.ok) {
      const text = await res.text();
      throw new Error(`Robinhood getInstrument failed (${res.status}): ${text}`);
    }

    return await res.json() as RhInstrument;
  }
}
