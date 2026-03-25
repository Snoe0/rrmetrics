/**
 * Tradovate WebSocket client for real-time order/position events.
 * Protocol: SockJS-like frames over native WebSocket.
 *
 * Frame types:
 *   'o'       — connection opened
 *   'h'       — server heartbeat (respond with '[]')
 *   'a[...]'  — data frame (array of JSON-encoded messages)
 *   'c[...]'  — server close
 *
 * Request format: "endpoint\nrequestId\n\nbody"
 * Response format: { s: statusCode, i: requestId, d: data }
 */
class TradovateWebSocket {
  constructor({ wsUrl, accessToken, leaderAccountId, refreshToken, onOrder, onPosition, onStatus, onError }) {
    this.wsUrl = wsUrl;
    this.accessToken = accessToken;
    this.leaderAccountId = leaderAccountId;
    this.refreshToken = refreshToken;
    this.onOrder = onOrder;
    this.onPosition = onPosition;
    this.onStatus = onStatus;
    this.onError = onError;

    this.ws = null;
    this.requestId = 0;
    this.heartbeatTimer = null;
    this.reconnectTimer = null;
    this.reconnectDelay = 1000;
    this.isAuthorized = false;
    this.isSynced = false;
    this.shouldReconnect = true;
    this.authRequestId = null;
    this.syncRequestId = null;
  }

  connect() {
    this.shouldReconnect = true;
    this.reconnectDelay = 1000;
    this._doConnect();
  }

  disconnect() {
    this.shouldReconnect = false;
    this._stopHeartbeat();
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
    this.isAuthorized = false;
    this.isSynced = false;
    this.onStatus?.('disconnected');
  }

  updateToken(newToken) {
    this.accessToken = newToken;
  }

  // ── Internal ────────────────────────────────────────────────────────────────

  _doConnect() {
    this.onStatus?.('connecting');
    this.isAuthorized = false;
    this.isSynced = false;

    try {
      this.ws = new WebSocket(this.wsUrl);
    } catch (err) {
      console.error('[TvWS] WebSocket creation failed:', err);
      this.onError?.({ message: `WebSocket creation failed: ${err.message}` });
      this._scheduleReconnect();
      return;
    }

    this.ws.onopen = () => {
      console.log('[TvWS] WebSocket opened to', this.wsUrl);
    };

    this.ws.onmessage = (event) => this._onMessage(event.data);

    this.ws.onerror = (err) => {
      console.error('[TvWS] WebSocket error:', err);
      this.onError?.({ message: 'WebSocket connection error' });
    };

    this.ws.onclose = (event) => {
      console.log('[TvWS] WebSocket closed:', event.code, event.reason);
      this._stopHeartbeat();
      this.isAuthorized = false;
      this.isSynced = false;
      if (this.shouldReconnect) {
        this.onStatus?.('reconnecting');
        this._scheduleReconnect();
      }
    };
  }

  _send(endpoint, body = '') {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return null;
    this.requestId++;
    const msg = `${endpoint}\n${this.requestId}\n\n${body}`;
    console.log('[TvWS] send:', endpoint, 'id:', this.requestId);
    this.ws.send(msg);
    return this.requestId;
  }

  async _scheduleReconnect() {
    if (!this.shouldReconnect) return;

    const delay = this.reconnectDelay;
    this.reconnectDelay = Math.min(this.reconnectDelay * 2, 30000);

    console.log('[TvWS] reconnecting in', delay, 'ms');
    this.reconnectTimer = setTimeout(async () => {
      this.reconnectTimer = null;
      if (this.refreshToken) {
        try {
          const result = await this.refreshToken();
          if (result.token) this.accessToken = result.token;
          if (result.wsUrl) this.wsUrl = result.wsUrl;
        } catch {
          // Use existing token
        }
      }
      this._doConnect();
    }, delay);
  }

  _startHeartbeat() {
    this._stopHeartbeat();
    this.heartbeatTimer = setInterval(() => {
      if (this.ws && this.ws.readyState === WebSocket.OPEN) {
        this.ws.send('[]');
      }
    }, 2500);
  }

  _stopHeartbeat() {
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }
  }

  _onMessage(raw) {
    if (!raw || raw.length === 0) return;

    const type = raw[0];

    switch (type) {
      case 'o':
        console.log('[TvWS] received open frame');
        this.authRequestId = this._send('authorize', this.accessToken);
        break;

      case 'h':
        // Server heartbeat — respond
        if (this.ws && this.ws.readyState === WebSocket.OPEN) {
          this.ws.send('[]');
        }
        break;

      case 'a': {
        // Data frame — parse the JSON array
        const jsonStr = raw.slice(1);
        try {
          const items = JSON.parse(jsonStr);
          if (Array.isArray(items)) {
            for (const item of items) {
              const parsed = typeof item === 'string' ? JSON.parse(item) : item;
              this._handleFrame(parsed);
            }
          }
        } catch (err) {
          console.error('[TvWS] failed to parse data frame:', err.message, 'raw:', raw.slice(0, 200));
        }
        break;
      }

      case 'c':
        console.log('[TvWS] server close frame:', raw);
        break;

      default:
        // Not a SockJS prefix — might be raw JSON
        console.log('[TvWS] unknown frame type:', raw.slice(0, 200));
        try {
          const parsed = JSON.parse(raw);
          this._handleFrame(parsed);
        } catch {
          // Not JSON either
        }
        break;
    }
  }

  _handleFrame(frame) {
    // Log all frames for debugging
    const framePreview = JSON.stringify(frame).slice(0, 300);
    console.log('[TvWS] frame:', framePreview);

    // ── Request/response frames (have .i request ID) ──────────────────────

    if (frame.i != null) {
      // Authorization response
      if (frame.i === this.authRequestId) {
        if (frame.s === 200) {
          console.log('[TvWS] authorized successfully');
          this.isAuthorized = true;
          this.reconnectDelay = 1000;
          this.onStatus?.('connected');
          this._startHeartbeat();
          this.syncRequestId = this._send('user/syncrequest', '{}');
        } else {
          console.error('[TvWS] auth failed:', frame.s, frame.d);
          this.onError?.({ message: `Authorization failed: ${frame.s}` });
          this.shouldReconnect = false;
          this.ws?.close();
        }
        return;
      }

      // Syncrequest response — may contain initial entity snapshots
      if (frame.i === this.syncRequestId) {
        if (frame.s === 200) {
          console.log('[TvWS] sync subscribed, snapshot keys:', frame.d ? Object.keys(frame.d) : 'none');
          this.isSynced = true;
          this.onStatus?.('subscribed');
          if (frame.d) {
            this._processSnapshot(frame.d);
          }
        } else {
          console.error('[TvWS] syncrequest failed:', frame.s, frame.d);
        }
        return;
      }

      // Other request responses — might contain entity data too
      if (frame.d) {
        this._processSnapshot(frame.d);
      }
      return;
    }

    // ── Real-time entity events (no .i, have .e) ─────────────────────────

    if (frame.e) {
      this._handleEntityEvent(frame);
      return;
    }

    // ── Unknown frame — try to extract entities anyway ────────────────────
    if (frame.d) {
      this._processSnapshot(frame.d);
    }
  }

  _handleEntityEvent(frame) {
    const eventType = frame.e;

    // Format 1: { e: "props", d: { entityType: "order", entity: {...} } }
    if (eventType === 'props' && frame.d) {
      const { entityType, entity } = frame.d;
      if (entity && entity.accountId === this.leaderAccountId) {
        if (entityType === 'order') this.onOrder?.(entity);
        else if (entityType === 'position') this.onPosition?.(entity);
      }
      // Also check if d is an array (batch props)
      if (Array.isArray(frame.d)) {
        for (const item of frame.d) {
          if (item.entity && item.entity.accountId === this.leaderAccountId) {
            if (item.entityType === 'order') this.onOrder?.(item.entity);
            else if (item.entityType === 'position') this.onPosition?.(item.entity);
          }
        }
      }
      return;
    }

    // Format 2: { e: "order", d: {...entity} }
    if (eventType === 'order' && frame.d) {
      if (frame.d.accountId === this.leaderAccountId) {
        this.onOrder?.(frame.d);
      }
      return;
    }

    if (eventType === 'position' && frame.d) {
      if (frame.d.accountId === this.leaderAccountId) {
        this.onPosition?.(frame.d);
      }
      return;
    }

    // Format 3: { e: "md"|"chart"|"clock"|... } — market data, ignore
    // Format 4: { e: "shutdown" } — server shutting down
    if (eventType === 'shutdown') {
      console.log('[TvWS] server shutdown event');
      return;
    }
  }

  _processSnapshot(data) {
    // The sync response may contain entities as arrays keyed by type name
    // Try multiple possible key formats

    // Direct arrays: { orders: [...], positions: [...] }
    const orderArrays = data.orders || data.order || data.executionReports;
    const positionArrays = data.positions || data.position;

    if (orderArrays && Array.isArray(orderArrays)) {
      console.log('[TvWS] snapshot: processing', orderArrays.length, 'orders');
      for (const order of orderArrays) {
        if (order.accountId === this.leaderAccountId) {
          this.onOrder?.(order);
        }
      }
    }

    if (positionArrays && Array.isArray(positionArrays)) {
      console.log('[TvWS] snapshot: processing', positionArrays.length, 'positions');
      for (const position of positionArrays) {
        if (position.accountId === this.leaderAccountId) {
          this.onPosition?.(position);
        }
      }
    }

    // Some Tradovate responses nest entities deeper
    // e.g. { d: { orders: [...] } } or the data itself is an array of entities
    if (Array.isArray(data)) {
      console.log('[TvWS] snapshot: processing array of', data.length, 'items');
      for (const item of data) {
        if (item && item.accountId === this.leaderAccountId) {
          // Determine type from fields present
          if (item.ordStatus || item.ordType || item.orderType) {
            this.onOrder?.(item);
          } else if (item.netPos != null) {
            this.onPosition?.(item);
          }
        }
      }
    }
  }
}

module.exports = TradovateWebSocket;
