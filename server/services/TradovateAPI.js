class TradovateAPI {
  constructor(environment = 'demo') {
    this.baseUrl = environment === 'live'
      ? 'https://live.tradovateapi.com/v1'
      : 'https://demo.tradovateapi.com/v1';
  }

  async authenticate(credentials) {
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

    const data = await response.json();
    if (!data.accessToken) {
      throw new Error(data.errorText || 'Authentication failed - no access token returned');
    }
    return data;
  }

  async getAccounts(token) {
    const response = await fetch(`${this.baseUrl}/account/list`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!response.ok) throw new Error(`Failed to fetch accounts: ${response.status}`);
    return response.json();
  }

  async getFills(token) {
    const response = await fetch(`${this.baseUrl}/fill/list`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!response.ok) throw new Error(`Failed to fetch fills: ${response.status}`);
    return response.json();
  }

  async getContract(token, id) {
    const response = await fetch(`${this.baseUrl}/contract/item?id=${id}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!response.ok) throw new Error(`Failed to fetch contract ${id}: ${response.status}`);
    return response.json();
  }
}

module.exports = TradovateAPI;
