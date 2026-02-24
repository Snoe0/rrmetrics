const getDateRange = (period) => {
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());

  // Handle specific month: "month-2026-01"
  const monthMatch = typeof period === 'string' && period.match(/^month-(\d{4})-(\d{2})$/);
  if (monthMatch) {
    const y = parseInt(monthMatch[1], 10);
    const m = parseInt(monthMatch[2], 10) - 1;
    return { start: new Date(y, m, 1), end: new Date(y, m + 1, 0, 23, 59, 59, 999) };
  }

  switch (period) {
    case 'thisMonth': {
      const start = new Date(today.getFullYear(), today.getMonth(), 1);
      const end = new Date(today.getFullYear(), today.getMonth() + 1, 0, 23, 59, 59, 999);
      return { start, end };
    }
    case 'lastMonth': {
      const start = new Date(today.getFullYear(), today.getMonth() - 1, 1);
      const end = new Date(today.getFullYear(), today.getMonth(), 0, 23, 59, 59, 999);
      return { start, end };
    }
    case 'thisWeek': {
      const dayOfWeek = today.getDay();
      const start = new Date(today);
      start.setDate(today.getDate() - dayOfWeek);
      const end = new Date(start);
      end.setDate(start.getDate() + 6);
      end.setHours(23, 59, 59, 999);
      return { start, end };
    }
    case 'lastWeek': {
      const dayOfWeek = today.getDay();
      const thisWeekStart = new Date(today);
      thisWeekStart.setDate(today.getDate() - dayOfWeek);
      const start = new Date(thisWeekStart);
      start.setDate(thisWeekStart.getDate() - 7);
      const end = new Date(thisWeekStart);
      end.setDate(thisWeekStart.getDate() - 1);
      end.setHours(23, 59, 59, 999);
      return { start, end };
    }
    case 'last7': {
      const start = new Date(today);
      start.setDate(today.getDate() - 6);
      return { start, end: new Date(now) };
    }
    case 'last30': {
      const start = new Date(today);
      start.setDate(today.getDate() - 29);
      return { start, end: new Date(now) };
    }
    case 'last90': {
      const start = new Date(today);
      start.setDate(today.getDate() - 89);
      return { start, end: new Date(now) };
    }
    default:
      return null;
  }
};

const getPreviousDateRange = (period) => {
  // For specific months, previous period is the prior month
  const monthMatch = typeof period === 'string' && period.match(/^month-(\d{4})-(\d{2})$/);
  if (monthMatch) {
    const y = parseInt(monthMatch[1], 10);
    const m = parseInt(monthMatch[2], 10) - 1;
    const prevMonth = m === 0 ? 11 : m - 1;
    const prevYear = m === 0 ? y - 1 : y;
    return { start: new Date(prevYear, prevMonth, 1), end: new Date(prevYear, prevMonth + 1, 0, 23, 59, 59, 999) };
  }

  const range = getDateRange(period);
  if (!range) return null;
  const duration = range.end - range.start;
  const prevEnd = new Date(range.start.getTime() - 1);
  const prevStart = new Date(prevEnd.getTime() - duration);
  return { start: prevStart, end: prevEnd };
};

const filterTradesByDateRange = (trades, range) => {
  if (!range) return trades;
  return trades.filter(t => {
    const exitDate = new Date(t.exitTime);
    return exitDate >= range.start && exitDate <= range.end;
  });
};

const calcPercentChange = (current, previous) => {
  if (previous === 0 && current === 0) return 0;
  if (previous === 0) return current > 0 ? 100 : -100;
  return ((current - previous) / Math.abs(previous)) * 100;
};

// Build available month options from trades
const getTradeMonths = (trades) => {
  const months = new Set();
  trades.forEach(t => {
    const d = new Date(t.exitTime);
    months.add(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`);
  });
  return Array.from(months).sort().reverse();
};

const MONTH_LABELS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

module.exports = { getDateRange, getPreviousDateRange, filterTradesByDateRange, calcPercentChange, getTradeMonths, MONTH_LABELS };
