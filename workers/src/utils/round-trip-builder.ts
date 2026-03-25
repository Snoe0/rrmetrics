/**
 * Shared FIFO round-trip builder for brokers that return individual orders
 * (Webull, Robinhood) rather than matched fill pairs (Tradovate).
 *
 * Groups filled orders by ticker, then FIFO-matches buys against sells
 * to produce entry/exit trade pairs.
 */

export interface BrokerFill {
  timestamp: string;
  side: 'buy' | 'sell';
  qty: number;
  price: number;
  orderId: string;
  ticker: string;
}

export interface RoundTrip {
  ticker: string;
  enterTime: string;
  exitTime: string;
  enterPrice: number;
  exitPrice: number;
  quantity: number;
  brokerOrderId: string; // composite: entryOrderId_exitOrderId
}

/**
 * Build round-trip trades from individual fills using FIFO matching.
 *
 * For each ticker, orders are sorted chronologically. The first side seen
 * is treated as the "entry" direction. When fills on the opposite side appear,
 * they're matched against the entry queue FIFO.
 *
 * Handles partial fills: if a sell of 3 matches a buy of 5, a round trip of
 * qty 3 is emitted and the remaining buy of 2 stays in the queue.
 */
export function buildRoundTrips(fills: BrokerFill[]): RoundTrip[] {
  if (fills.length === 0) return [];

  // Group by ticker
  const byTicker = new Map<string, BrokerFill[]>();
  for (const f of fills) {
    const group = byTicker.get(f.ticker) || [];
    group.push(f);
    byTicker.set(f.ticker, group);
  }

  const roundTrips: RoundTrip[] = [];

  for (const [ticker, tickerFills] of byTicker) {
    // Sort by timestamp
    tickerFills.sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());

    // Determine entry direction from first fill
    const entrySide = tickerFills[0].side;
    const exitSide = entrySide === 'buy' ? 'sell' : 'buy';

    // FIFO queues
    const entryQueue: Array<{ qty: number; price: number; timestamp: string; orderId: string }> = [];
    const exitQueue: Array<{ qty: number; price: number; timestamp: string; orderId: string }> = [];

    for (const fill of tickerFills) {
      if (fill.side === entrySide) {
        entryQueue.push({ qty: fill.qty, price: fill.price, timestamp: fill.timestamp, orderId: fill.orderId });
      } else {
        exitQueue.push({ qty: fill.qty, price: fill.price, timestamp: fill.timestamp, orderId: fill.orderId });
      }

      // Match entry against exit FIFO
      while (entryQueue.length > 0 && exitQueue.length > 0) {
        const entry = entryQueue[0];
        const exit = exitQueue[0];
        const matchQty = Math.min(entry.qty, exit.qty);

        const quantity = entrySide === 'buy' ? matchQty : -matchQty;

        roundTrips.push({
          ticker,
          enterTime: entry.timestamp,
          exitTime: exit.timestamp,
          enterPrice: entry.price,
          exitPrice: exit.price,
          quantity,
          brokerOrderId: `${entry.orderId}_${exit.orderId}`,
        });

        entry.qty -= matchQty;
        exit.qty -= matchQty;

        if (entry.qty === 0) entryQueue.shift();
        if (exit.qty === 0) exitQueue.shift();
      }
    }
  }

  return roundTrips;
}
