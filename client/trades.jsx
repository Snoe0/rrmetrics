const helper = require('./helper.js');
const { authFetch, supabase } = helper;
const React = require('react');
const { useState, useEffect, useRef, useMemo } = React;
const { createRoot } = require('react-dom/client');
const Papa = require('papaparse');
require('./styles/globals.css');

// =====================================================
// UTILITY FUNCTIONS
// =====================================================
const resizeImage = (dataUrl, maxWidth = 1280, maxHeight = 720) => {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      let { width, height } = img;
      if (width > maxWidth || height > maxHeight) {
        const ratio = Math.min(maxWidth / width, maxHeight / height);
        width = Math.floor(width * ratio);
        height = Math.floor(height * ratio);
      }
      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d');
      ctx.drawImage(img, 0, 0, width, height);
      resolve(canvas.toDataURL('image/jpeg', 0.85));
    };
    img.src = dataUrl;
  });
};

// Dollar value per 1 point of price movement for common futures contracts.
// Used when manualPL is not set. Add more tickers here as needed.
const TICK_VALUES = {
  // Equity index futures
  NQ: 20, MNQ: 2,
  ES: 50, MES: 5,
  YM: 5,  MYM: 0.5,
  RTY: 50, M2K: 5,
  // Metals
  GC: 100, MGC: 10,
  SI: 5000, SIL: 1000,
  // Energy
  CL: 1000, MCL: 100,
  NG: 10000,
  // Rates
  ZB: 1000, ZN: 1000, ZF: 1000,
};

const COMMON_TICKERS = [
  // Futures (from TICK_VALUES)
  'ES', 'MES', 'NQ', 'MNQ', 'YM', 'MYM', 'RTY', 'M2K',
  'GC', 'MGC', 'SI', 'SIL', 'CL', 'MCL', 'NG',
  'ZB', 'ZN', 'ZF',
  // Popular stocks & ETFs
  'SPY', 'QQQ', 'AAPL', 'MSFT', 'TSLA', 'AMZN', 'NVDA', 'GOOGL',
  'META', 'AMD', 'INTC', 'JPM', 'BAC', 'DIS', 'NFLX',
  'COIN', 'SOFI', 'PLTR', 'IWM', 'DIA', 'GLD', 'TLT',
];

const getPointValue = (ticker) => TICK_VALUES[(ticker || '').toUpperCase()] ?? 1;

const calculateAnalytics = (trades) => {
  if (!trades || trades.length === 0) {
    return {
      totalPL: 0, winRate: 0, avgWin: 0, avgLoss: 0,
      totalTrades: 0, wins: 0, losses: 0, avgDuration: 0,
      bestTrade: 0, worstTrade: 0,
    };
  }

  const tradesWithPL = trades.map(trade => ({
    ...trade,
    pl: getTradePL(trade),
    duration: new Date(trade.exitTime) - new Date(trade.enterTime)
  }));

  const winningTrades = tradesWithPL.filter(trade => trade.pl > 0);
  const losingTrades = tradesWithPL.filter(trade => trade.pl < 0);

  const totalPL = tradesWithPL.reduce((sum, trade) => sum + trade.pl, 0);
  const avgWin = winningTrades.length > 0
    ? winningTrades.reduce((sum, trade) => sum + trade.pl, 0) / winningTrades.length : 0;
  const avgLoss = losingTrades.length > 0
    ? losingTrades.reduce((sum, trade) => sum + trade.pl, 0) / losingTrades.length : 0;
  const avgDuration = tradesWithPL.reduce((sum, trade) => sum + trade.duration, 0) / tradesWithPL.length;
  const winRate = (winningTrades.length / tradesWithPL.length) * 100;

  const allPLs = tradesWithPL.map(trade => trade.pl);
  const bestTrade = Math.max(...allPLs);
  const worstTrade = Math.min(...allPLs);

  return {
    totalPL, winRate, avgWin, avgLoss,
    totalTrades: trades.length, wins: winningTrades.length,
    losses: losingTrades.length, avgDuration, bestTrade, worstTrade,
  };
};

const formatDuration = (milliseconds) => {
  const totalSeconds = Math.floor(milliseconds / 1000);
  const days = Math.floor(totalSeconds / (24 * 60 * 60));
  const hours = Math.floor((totalSeconds % (24 * 60 * 60)) / (60 * 60));
  const minutes = Math.floor((totalSeconds % (60 * 60)) / 60);
  const seconds = totalSeconds % 60;

  if (days > 0) return `${days}d ${hours}h ${minutes}m`;
  if (hours > 0) return `${hours}h ${minutes}m ${seconds}s`;
  if (minutes > 0) return `${minutes}m ${seconds}s`;
  return `${seconds}s`;
};

const groupTradesByDate = (trades) => {
  const grouped = {};
  trades.forEach(trade => {
    const pl = getTradePL(trade);
    const e = toEST(trade.exitTime);
    const dateKey = `${e.year}-${String(e.month).padStart(2, '0')}-${String(e.day).padStart(2, '0')}`;
    if (!grouped[dateKey]) grouped[dateKey] = { totalPL: 0, tradeCount: 0, trades: [] };
    grouped[dateKey].totalPL += pl;
    grouped[dateKey].tradeCount++;
    grouped[dateKey].trades.push(trade);
  });
  return grouped;
};

const getCSSVar = (name) => {
  const val = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  if (/^\d+ \d+ \d+$/.test(val)) return `rgb(${val})`;
  return val;
};

const EST_TZ = 'America/New_York';

// Format a date in EST timezone - returns an object with EST components
const toEST = (date) => {
  const d = new Date(date);
  // Use Intl to get the parts in EST
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: EST_TZ,
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
    hour12: false,
  }).formatToParts(d);
  const get = (type) => parts.find(p => p.type === type).value;
  return {
    year: parseInt(get('year'), 10),
    month: parseInt(get('month'), 10),
    day: parseInt(get('day'), 10),
    hours: parseInt(get('hour'), 10) % 24,
    minutes: parseInt(get('minute'), 10),
    seconds: parseInt(get('second'), 10),
  };
};

const formatDateEST = (dateString) => {
  return new Date(dateString).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: EST_TZ });
};

const formatTimeEST = (dateString) => {
  return new Date(dateString).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', timeZone: EST_TZ });
};

const formatFullDateEST = (dateString) => {
  return new Date(dateString).toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric', timeZone: EST_TZ });
};

// Get EST offset string for the given date (handles EST/EDT)
const getESTOffset = (date) => {
  const d = new Date(date);
  const utcStr = d.toLocaleString('en-US', { timeZone: 'UTC' });
  const estStr = d.toLocaleString('en-US', { timeZone: EST_TZ });
  const diffMs = new Date(estStr) - new Date(utcStr);
  const diffHours = diffMs / 3600000;
  return diffHours === -4 ? '-04:00' : '-05:00';
};

const colorToRgba = (color, alpha) => {
  const rgbMatch = color.match(/^rgb\((\d+),?\s*(\d+),?\s*(\d+)\)$/);
  if (rgbMatch) return `rgba(${rgbMatch[1]}, ${rgbMatch[2]}, ${rgbMatch[3]}, ${alpha})`;
  const r = parseInt(color.slice(1, 3), 16);
  const g = parseInt(color.slice(3, 5), 16);
  const b = parseInt(color.slice(5, 7), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
};

const drawTooltip = (ctx, x, y, title, lines, canvasWidth, canvasHeight) => {
  ctx.font = 'bold 12px Inter, sans-serif';
  const titleWidth = ctx.measureText(title).width;
  ctx.font = '11px Inter, sans-serif';
  const lineWidths = lines.map(l => ctx.measureText(`${l.label}: ${l.value}`).width);
  const maxWidth = Math.max(titleWidth, ...lineWidths) + 24;
  const height = 28 + lines.length * 18 + 8;

  let tx = x + 12;
  let ty = y - height - 8;
  if (tx + maxWidth > canvasWidth) tx = x - maxWidth - 12;
  if (ty < 0) ty = y + 12;

  ctx.fillStyle = getCSSVar('--bg-page') || '#1a1a2e';
  ctx.strokeStyle = getCSSVar('--border') || '#2a2a3e';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.roundRect(tx, ty, maxWidth, height, 6);
  ctx.fill();
  ctx.stroke();

  ctx.fillStyle = getCSSVar('--text-primary') || '#fff';
  ctx.font = 'bold 12px Inter, sans-serif';
  ctx.textAlign = 'left';
  ctx.fillText(title, tx + 12, ty + 18);

  lines.forEach((line, i) => {
    ctx.fillStyle = getCSSVar('--text-secondary') || '#aaa';
    ctx.font = '11px Inter, sans-serif';
    ctx.fillText(`${line.label}:`, tx + 12, ty + 36 + i * 18);
    ctx.fillStyle = line.color || getCSSVar('--text-primary') || '#fff';
    ctx.font = '11px JetBrains Mono, monospace';
    ctx.textAlign = 'right';
    ctx.fillText(line.value, tx + maxWidth - 12, ty + 36 + i * 18);
    ctx.textAlign = 'left';
  });
};

const getTradePL = (trade) => {
  if (trade.manualPL !== null && trade.manualPL !== undefined) return trade.manualPL;
  return (trade.exitPrice - trade.enterPrice) * trade.quantity * getPointValue(trade.ticker);
};

// =====================================================
// PERIOD FILTERING
// =====================================================
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

const PeriodFilter = ({ value, onChange, trades }) => {
  const [showMonthPicker, setShowMonthPicker] = useState(false);
  const pickerRef = useRef(null);
  const isMonthSelected = typeof value === 'string' && value.startsWith('month-');

  // Determine years that have trades for the month picker
  const tradeYears = (() => {
    const years = new Set();
    (trades || []).forEach(t => years.add(new Date(t.exitTime).getFullYear()));
    if (years.size === 0) years.add(new Date().getFullYear());
    return Array.from(years).sort((a, b) => b - a);
  })();
  const [pickerYear, setPickerYear] = useState(tradeYears[0] || new Date().getFullYear());

  useEffect(() => {
    const handleClick = (e) => {
      if (pickerRef.current && !pickerRef.current.contains(e.target)) setShowMonthPicker(false);
    };
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  const presets = [
    { value: 'all', label: 'All Time' },
    { value: 'last7', label: 'Last 7 Days' },
    { value: 'last30', label: 'Last 30 Days' },
    { value: 'last90', label: 'Last 90 Days' },
    { value: 'thisWeek', label: 'This Week' },
    { value: 'lastWeek', label: 'Last Week' },
    { value: 'thisMonth', label: 'This Month' },
    { value: 'lastMonth', label: 'Last Month' },
  ];

  const getLabel = () => {
    if (isMonthSelected) {
      const m = value.match(/^month-(\d{4})-(\d{2})$/);
      if (m) return `${MONTH_LABELS[parseInt(m[2], 10) - 1]} ${m[1]}`;
    }
    const preset = presets.find(p => p.value === value);
    return preset ? preset.label : 'All Time';
  };

  // Check which months have trades for the picker year
  const monthsWithTrades = new Set();
  (trades || []).forEach(t => {
    const d = new Date(t.exitTime);
    if (d.getFullYear() === pickerYear) monthsWithTrades.add(d.getMonth());
  });

  return (
    <div className="flex items-center gap-2">
      {/* Preset dropdown */}
      <div className="relative">
        <select
          value={isMonthSelected ? '__month__' : value}
          onChange={(e) => {
            if (e.target.value === '__month__') return;
            onChange(e.target.value);
          }}
          className="appearance-none bg-bg-input border border-border rounded-lg pl-3 pr-8 py-1.5 text-sm text-text-primary font-medium cursor-pointer focus:outline-none focus:border-accent transition-colors"
        >
          {presets.map(p => (
            <option key={p.value} value={p.value}>{p.label}</option>
          ))}
          {isMonthSelected && <option value="__month__">{getLabel()}</option>}
        </select>
        <Icons.ChevronDown className="w-3.5 h-3.5 text-text-muted absolute right-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
      </div>

      {/* Month picker button + popover */}
      <div className="relative" ref={pickerRef}>
        <button
          onClick={() => setShowMonthPicker(!showMonthPicker)}
          className={`flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium rounded-lg border transition-all ${
            isMonthSelected
              ? 'bg-accent text-accent-text border-accent'
              : 'bg-bg-input text-text-secondary border-border hover:text-text-primary'
          }`}
        >
          <Icons.Calendar className="w-3.5 h-3.5" />
          {isMonthSelected ? getLabel() : 'Select Month'}
        </button>

        {showMonthPicker && (
          <div className="absolute top-full left-0 mt-1 z-50 bg-bg-surface border border-border rounded-xl shadow-lg p-4 w-[260px]">
            {/* Year nav */}
            <div className="flex items-center justify-between mb-3">
              <button onClick={() => setPickerYear(pickerYear - 1)} className="p-1 rounded hover:bg-bg-input text-text-secondary transition-colors">
                <Icons.ChevronLeft className="w-4 h-4" />
              </button>
              <span className="text-sm font-semibold text-text-primary">{pickerYear}</span>
              <button onClick={() => setPickerYear(pickerYear + 1)} className="p-1 rounded hover:bg-bg-input text-text-secondary transition-colors">
                <Icons.ChevronRight className="w-4 h-4" />
              </button>
            </div>
            {/* Month grid */}
            <div className="grid grid-cols-4 gap-1.5">
              {MONTH_LABELS.map((label, mi) => {
                const monthVal = `month-${pickerYear}-${String(mi + 1).padStart(2, '0')}`;
                const isActive = value === monthVal;
                const hasTrades = monthsWithTrades.has(mi);
                return (
                  <button
                    key={mi}
                    onClick={() => { onChange(monthVal); setShowMonthPicker(false); }}
                    className={`px-2 py-1.5 text-xs font-medium rounded-lg transition-all ${
                      isActive
                        ? 'bg-accent text-accent-text'
                        : hasTrades
                          ? 'bg-bg-input text-text-primary hover:bg-accent/20'
                          : 'text-text-muted hover:bg-bg-input'
                    }`}
                  >
                    {label}
                  </button>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

const ChangeIndicator = ({ value }) => {
  if (value === null || value === undefined || !isFinite(value)) return null;
  const isPositive = value > 0;
  const isZero = value === 0;
  return (
    <span className={`inline-flex items-center text-xs font-medium ${isZero ? 'text-text-muted' : isPositive ? 'text-positive' : 'text-negative'}`}>
      {isPositive ? '\u25B2' : isZero ? '' : '\u25BC'} {Math.abs(value).toFixed(1)}%
    </span>
  );
};

const handleTrade = (e, onTradeAdded, screenshotData, tags) => {
  e.preventDefault();
  helper.hideError();

  const ticker = e.target.querySelector('#ticker').value;
  const enterTimeRaw = e.target.querySelector('#enterTime').value;
  const exitTimeRaw = e.target.querySelector('#exitTime').value;
  const enterPrice = e.target.querySelector('#enterPrice').value;
  const exitPrice = e.target.querySelector('#exitPrice').value;
  const quantity = e.target.querySelector('#quantity').value;
  const manualPL = e.target.querySelector('#manualPL').value;
  const comments = e.target.querySelector('#comments').value;

  const hasPrices = enterPrice && exitPrice;
  const hasPL = !!manualPL;
  if (!ticker || !enterTimeRaw || !exitTimeRaw || !quantity) {
    helper.handleError('Ticker, enter time, exit time, and quantity are required');
    return false;
  }
  if (!hasPrices && !hasPL) {
    helper.handleError('Either enter/exit prices or a manual P/L is required');
    return false;
  }

  // Append EST offset so server parses as Eastern time
  const enterTime = enterTimeRaw + getESTOffset(new Date(enterTimeRaw));
  const exitTime = exitTimeRaw + getESTOffset(new Date(exitTimeRaw));

  const tradeData = {
    ticker, enterTime, exitTime,
    enterPrice: hasPrices ? parseFloat(enterPrice) : 0,
    exitPrice: hasPrices ? parseFloat(exitPrice) : 0,
    quantity: parseFloat(quantity),
    comments
  };

  if (hasPL) tradeData.manualPL = parseFloat(manualPL);
  if (screenshotData) tradeData.screenshot = screenshotData;
  if (tags) tradeData.tags = tags;

  helper.sendPost(e.target.action, tradeData, onTradeAdded);
  return false;
};

const handleRemoveTrade = (id, onTradeRemoved) => {
  helper.hideError();
  if (!id) {
    helper.handleError('Trade ID is required to delete!');
    return false;
  }
  helper.sendPost('/api/removeTrade', { _id: id }, onTradeRemoved);
  return false;
};

const handleUpdateTrade = (e, tradeId, onTradeUpdated, screenshotData, tags) => {
  e.preventDefault();
  helper.hideError();

  const ticker = e.target.querySelector('#ticker').value;
  const enterTimeRaw = e.target.querySelector('#enterTime').value;
  const exitTimeRaw = e.target.querySelector('#exitTime').value;
  const enterPrice = e.target.querySelector('#enterPrice').value;
  const exitPrice = e.target.querySelector('#exitPrice').value;
  const quantity = e.target.querySelector('#quantity').value;
  const manualPL = e.target.querySelector('#manualPL').value;
  const comments = e.target.querySelector('#comments').value;

  const hasPrices = enterPrice && exitPrice;
  const hasPL = !!manualPL;
  if (!ticker || !enterTimeRaw || !exitTimeRaw || !quantity) {
    helper.handleError('Ticker, enter time, exit time, and quantity are required');
    return false;
  }
  if (!hasPrices && !hasPL) {
    helper.handleError('Either enter/exit prices or a manual P/L is required');
    return false;
  }

  const enterTime = enterTimeRaw + getESTOffset(new Date(enterTimeRaw));
  const exitTime = exitTimeRaw + getESTOffset(new Date(exitTimeRaw));

  const tradeData = {
    _id: tradeId, ticker, enterTime, exitTime,
    enterPrice: hasPrices ? parseFloat(enterPrice) : 0,
    exitPrice: hasPrices ? parseFloat(exitPrice) : 0,
    quantity: parseFloat(quantity),
    comments
  };

  if (hasPL) tradeData.manualPL = parseFloat(manualPL);
  if (screenshotData) tradeData.screenshot = screenshotData;
  if (tags) tradeData.tags = tags;

  helper.sendPost('/api/updateTrade', tradeData, onTradeUpdated);
  return false;
};

// =====================================================
// WINDOW SIZE HOOK + SIDE PANEL CONTEXT
// =====================================================
const useWindowWidth = () => {
  const [width, setWidth] = useState(() => window.innerWidth);
  useEffect(() => {
    const handler = () => setWidth(window.innerWidth);
    window.addEventListener('resize', handler);
    return () => window.removeEventListener('resize', handler);
  }, []);
  return width;
};

// Context for side panels to register their width offset with the App layout
const SidePanelContext = React.createContext(() => {});

// =====================================================
// ICON COMPONENTS
// =====================================================
const Icons = {
  Home: (props) => (
    <svg className={props.className || "w-5 h-5"} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"></path>
      <polyline points="9 22 9 12 15 12 15 22"></polyline>
    </svg>
  ),
  Briefcase: (props) => (
    <svg className={props.className || "w-5 h-5"} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="2" y="7" width="20" height="14" rx="2" ry="2"></rect>
      <path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16"></path>
    </svg>
  ),
  List: (props) => (
    <svg className={props.className || "w-5 h-5"} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <line x1="8" y1="6" x2="21" y2="6"></line>
      <line x1="8" y1="12" x2="21" y2="12"></line>
      <line x1="8" y1="18" x2="21" y2="18"></line>
      <line x1="3" y1="6" x2="3.01" y2="6"></line>
      <line x1="3" y1="12" x2="3.01" y2="12"></line>
      <line x1="3" y1="18" x2="3.01" y2="18"></line>
    </svg>
  ),
  Eye: (props) => (
    <svg className={props.className || "w-5 h-5"} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path>
      <circle cx="12" cy="12" r="3"></circle>
    </svg>
  ),
  BarChart: (props) => (
    <svg className={props.className || "w-5 h-5"} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <line x1="18" y1="20" x2="18" y2="10"></line>
      <line x1="12" y1="20" x2="12" y2="4"></line>
      <line x1="6" y1="20" x2="6" y2="14"></line>
    </svg>
  ),
  Settings: (props) => (
    <svg className={props.className || "w-5 h-5"} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="3"></circle>
      <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"></path>
    </svg>
  ),
  Search: (props) => (
    <svg className={props.className || "w-4 h-4"} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="11" cy="11" r="8"></circle>
      <line x1="21" y1="21" x2="16.65" y2="16.65"></line>
    </svg>
  ),
  Plus: (props) => (
    <svg className={props.className || "w-4 h-4"} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <line x1="12" y1="5" x2="12" y2="19"></line>
      <line x1="5" y1="12" x2="19" y2="12"></line>
    </svg>
  ),
  Edit: (props) => (
    <svg className={props.className || "w-4 h-4"} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path>
      <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path>
    </svg>
  ),
  Trash: (props) => (
    <svg className={props.className || "w-4 h-4"} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="3 6 5 6 21 6"></polyline>
      <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
    </svg>
  ),
  X: (props) => (
    <svg className={props.className || "w-5 h-5"} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <line x1="18" y1="6" x2="6" y2="18"></line>
      <line x1="6" y1="6" x2="18" y2="18"></line>
    </svg>
  ),
  ChevronDown: (props) => (
    <svg className={props.className || "w-4 h-4"} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="6 9 12 15 18 9"></polyline>
    </svg>
  ),
  ChevronUp: (props) => (
    <svg className={props.className || "w-4 h-4"} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="18 15 12 9 6 15"></polyline>
    </svg>
  ),
  ChevronLeft: (props) => (
    <svg className={props.className || "w-5 h-5"} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="15 18 9 12 15 6"></polyline>
    </svg>
  ),
  ChevronRight: (props) => (
    <svg className={props.className || "w-5 h-5"} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="9 18 15 12 9 6"></polyline>
    </svg>
  ),
  User: (props) => (
    <svg className={props.className || "w-5 h-5"} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path>
      <circle cx="12" cy="7" r="4"></circle>
    </svg>
  ),
  Lock: (props) => (
    <svg className={props.className || "w-5 h-5"} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect>
      <path d="M7 11V7a5 5 0 0 1 10 0v4"></path>
    </svg>
  ),
  LogOut: (props) => (
    <svg className={props.className || "w-5 h-5"} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"></path>
      <polyline points="16 17 21 12 16 7"></polyline>
      <line x1="21" y1="12" x2="9" y2="12"></line>
    </svg>
  ),
  Download: (props) => (
    <svg className={props.className || "w-4 h-4"} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
      <polyline points="7 10 12 15 17 10"></polyline>
      <line x1="12" y1="15" x2="12" y2="3"></line>
    </svg>
  ),
  TrendingUp: (props) => (
    <svg className={props.className || "w-5 h-5"} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="22 7 13.5 15.5 8.5 10.5 2 17"></polyline>
      <polyline points="16 7 22 7 22 13"></polyline>
    </svg>
  ),
  Zap: (props) => (
    <svg className={props.className || "w-5 h-5"} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"></polygon>
    </svg>
  ),
  Check: (props) => (
    <svg className={props.className || "w-4 h-4"} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="20 6 9 17 4 12"></polyline>
    </svg>
  ),
  Star: (props) => (
    <svg className={props.className || "w-5 h-5"} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"></polygon>
    </svg>
  ),
  RefreshCw: (props) => (
    <svg className={props.className || "w-4 h-4"} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="23 4 23 10 17 10"></polyline>
      <path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"></path>
    </svg>
  ),
  Menu: (props) => (
    <svg className={props.className || "w-6 h-6"} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <line x1="3" y1="12" x2="21" y2="12"></line>
      <line x1="3" y1="6" x2="21" y2="6"></line>
      <line x1="3" y1="18" x2="21" y2="18"></line>
    </svg>
  ),
  Tag: (props) => (
    <svg className={props.className || "w-5 h-5"} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M20.59 13.41l-7.17 7.17a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z"></path>
      <line x1="7" y1="7" x2="7.01" y2="7"></line>
    </svg>
  ),
  Calendar: (props) => (
    <svg className={props.className || "w-4 h-4"} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="4" width="18" height="18" rx="2" ry="2"></rect>
      <line x1="16" y1="2" x2="16" y2="6"></line>
      <line x1="8" y1="2" x2="8" y2="6"></line>
      <line x1="3" y1="10" x2="21" y2="10"></line>
    </svg>
  ),
  Grid: (props) => (
    <svg className={props.className || "w-4 h-4"} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="3" width="7" height="7"></rect>
      <rect x="14" y="3" width="7" height="7"></rect>
      <rect x="3" y="14" width="7" height="7"></rect>
      <rect x="14" y="14" width="7" height="7"></rect>
    </svg>
  ),
  Layers: (props) => (
    <svg className={props.className || "w-4 h-4"} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polygon points="12 2 2 7 12 12 22 7 12 2"></polygon>
      <polyline points="2 17 12 22 22 17"></polyline>
      <polyline points="2 12 12 17 22 12"></polyline>
    </svg>
  ),
  Sunrise: (props) => (
    <svg className={props.className || "w-5 h-5"} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M17 18a5 5 0 0 0-10 0"></path>
      <line x1="12" y1="2" x2="12" y2="9"></line>
      <line x1="4.22" y1="10.22" x2="5.64" y2="11.64"></line>
      <line x1="1" y1="18" x2="3" y2="18"></line>
      <line x1="21" y1="18" x2="23" y2="18"></line>
      <line x1="18.36" y1="11.64" x2="19.78" y2="10.22"></line>
      <line x1="23" y1="22" x2="1" y2="22"></line>
      <polyline points="8 6 12 2 16 6"></polyline>
    </svg>
  ),
  Target: (props) => (
    <svg className={props.className || "w-5 h-5"} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="10"></circle>
      <circle cx="12" cy="12" r="6"></circle>
      <circle cx="12" cy="12" r="2"></circle>
    </svg>
  ),
  BookOpen: (props) => (
    <svg className={props.className || "w-5 h-5"} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z"></path>
      <path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z"></path>
    </svg>
  ),
  Gift: (props) => (
    <svg className={props.className || "w-5 h-5"} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="20 12 20 22 4 22 4 12"></polyline>
      <rect x="2" y="7" width="20" height="5"></rect>
      <line x1="12" y1="22" x2="12" y2="7"></line>
      <path d="M12 7H7.5a2.5 2.5 0 0 1 0-5C11 2 12 7 12 7z"></path>
      <path d="M12 7h4.5a2.5 2.5 0 0 0 0-5C13 2 12 7 12 7z"></path>
    </svg>
  ),
  Copy: (props) => (
    <svg className={props.className || "w-4 h-4"} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect>
      <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path>
    </svg>
  ),
  FlaskConical: (props) => (
    <svg className={props.className || "w-5 h-5"} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M10 2v7.527a2 2 0 0 1-.211.896L4.72 20.55a1 1 0 0 0 .9 1.45h12.76a1 1 0 0 0 .9-1.45l-5.069-10.127A2 2 0 0 1 14 9.527V2"></path>
      <path d="M8.5 2h7"></path>
      <path d="M7 16h10"></path>
    </svg>
  ),
};

// =====================================================
// REFERRAL PAGE
// =====================================================
const ReferralPage = () => {
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [code, setCode] = useState(null);
  const [link, setLink] = useState(null);
  const [stats, setStats] = useState({ total: 0, subscribed: 0, completed: 0 });
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    authFetch('/api/referral')
      .then((r) => r.json())
      .then((data) => {
        if (data.code) setCode(data.code);
        if (data.link) setLink(data.link);
        if (data.stats) setStats(data.stats);
      })
      .catch(() => setError('Failed to load referral data.'))
      .finally(() => setLoading(false));
  }, []);

  const handleGenerate = async () => {
    setGenerating(true);
    setError(null);
    try {
      const res = await authFetch('/api/referral/generate', { method: 'POST' });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || 'Failed to generate code.');
      } else {
        setCode(data.code);
        setLink(data.link);
      }
    } catch {
      setError('Failed to generate code.');
    } finally {
      setGenerating(false);
    }
  };

  const handleCopy = () => {
    if (!link) return;
    navigator.clipboard.writeText(link).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-24 text-text-muted text-sm">
        Loading...
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto py-6">
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-text-primary mb-1">Refer &amp; Earn</h1>
        <p className="text-text-secondary text-sm">Share RR Metrics and earn free months.</p>
      </div>

      {error && (
        <div className="mb-6 p-3 bg-negative/10 border border-negative/20 rounded-lg text-negative text-sm">
          {error}
        </div>
      )}

      {/* How it works */}
      <div className="bg-bg-surface border border-border rounded-xl p-6 mb-6">
        <h2 className="text-text-primary font-semibold text-sm mb-4">How it works</h2>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          {[
            { step: '1', text: 'Generate your unique referral link below' },
            { step: '2', text: 'A friend signs up with your link — they get 15% off their first month' },
            { step: '3', text: 'After 3 friends complete their first billing cycle, you earn a free month' },
          ].map(({ step, text }) => (
            <div key={step} className="flex gap-3">
              <div className="w-6 h-6 rounded-full bg-accent/20 text-accent text-xs font-bold flex items-center justify-center flex-shrink-0 mt-0.5">
                {step}
              </div>
              <p className="text-text-secondary text-sm">{text}</p>
            </div>
          ))}
        </div>
      </div>

      {/* Referral link / generate */}
      <div className="bg-bg-surface border border-border rounded-xl p-6 mb-6">
        {code ? (
          <>
            <h2 className="text-text-primary font-semibold text-sm mb-1">Your referral link</h2>
            <p className="text-text-muted text-xs mb-4">
              Anyone who signs up with this link gets <span className="text-positive font-medium">15% off their first month</span>.
            </p>
            <div className="flex gap-2">
              <div className="flex-1 bg-bg-input border border-border rounded-lg px-3 py-2.5 font-mono text-sm text-text-secondary overflow-x-auto whitespace-nowrap">
                {link}
              </div>
              <button
                onClick={handleCopy}
                className="flex items-center gap-2 px-4 py-2.5 bg-accent text-accent-text text-sm font-medium rounded-lg hover:brightness-110 transition-all whitespace-nowrap"
              >
                {copied ? <Icons.Check className="w-4 h-4" /> : <Icons.Copy className="w-4 h-4" />}
                {copied ? 'Copied!' : 'Copy'}
              </button>
            </div>
            <p className="text-text-muted text-xs mt-3">Your code: <span className="font-mono text-text-secondary">{code}</span></p>
          </>
        ) : (
          <>
            <h2 className="text-text-primary font-semibold text-sm mb-1">Get your referral link</h2>
            <p className="text-text-secondary text-sm mb-4">
              Generate a unique link to share with friends. A link is only created when you ask for one.
            </p>
            <button
              onClick={handleGenerate}
              disabled={generating}
              className="flex items-center gap-2 px-4 py-2.5 bg-accent text-accent-text text-sm font-semibold rounded-lg hover:brightness-110 transition-all disabled:opacity-50"
            >
              <Icons.Gift className="w-4 h-4" />
              {generating ? 'Generating...' : 'Generate My Referral Link'}
            </button>
          </>
        )}
      </div>

      {/* Stats — only show once a code exists */}
      {code && (
        <div className="bg-bg-surface border border-border rounded-xl p-6">
          <h2 className="text-text-primary font-semibold text-sm mb-4">Your stats</h2>
          <div className="grid grid-cols-3 gap-4">
            {[
              { label: 'Referred', value: stats.total },
              { label: 'Subscribed', value: stats.subscribed },
              { label: 'First month done', value: stats.completed },
            ].map(({ label, value }) => (
              <div key={label} className="text-center p-3 bg-bg-input rounded-lg border border-border">
                <div className="text-2xl font-bold font-mono text-text-primary">{value}</div>
                <div className="text-text-muted text-xs mt-1">{label}</div>
              </div>
            ))}
          </div>
          <p className="text-text-muted text-xs mt-4">
            Every 3 friends who complete their first billing cycle earns you 1 free month, applied automatically at your next renewal.
          </p>
        </div>
      )}
    </div>
  );
};

// =====================================================
// SIDEBAR
// =====================================================
const Sidebar = ({ currentPage, onNavigate, subscriptionStatus }) => {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [accountOpen, setAccountOpen] = useState(false);

  const navItems = [
    { id: 'dashboard', label: 'Dashboard', icon: Icons.Home },
    { id: 'trades', label: 'Trades', icon: Icons.List },
    { id: 'analytics', label: 'Analytics', icon: Icons.BarChart },
    { id: 'strategy', label: 'Strategy', icon: Icons.Target },
    { id: 'premarket', label: 'Pre-Market', icon: Icons.Sunrise },
    { id: 'backtesting', label: 'Backtesting', icon: Icons.FlaskConical },
    { id: 'settings', label: 'Settings', icon: Icons.Settings },
  ];

  const handleNav = (id) => {
    onNavigate(id);
    setSidebarOpen(false);
  };

  return (
    <>
      {/* Mobile hamburger */}
      <button
        className="fixed top-4 left-4 z-50 lg:hidden w-10 h-10 flex items-center justify-center rounded-lg bg-bg-surface border border-border text-text-primary"
        onClick={() => setSidebarOpen(!sidebarOpen)}
        aria-label="Toggle menu"
      >
        <Icons.Menu />
      </button>

      {/* Overlay */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 bg-black/60 z-40 lg:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Sidebar */}
      <nav className={`fixed top-0 left-0 h-full w-60 bg-bg-page border-r border-border flex flex-col z-50 transition-transform duration-300 lg:translate-x-0 ${sidebarOpen ? 'translate-x-0' : '-translate-x-full'}`}>
        {/* Logo */}
        <div className="px-5 py-6 border-b border-border">
          <a
            href="/trades"
            className="flex items-center gap-3 no-underline"
            onClick={(e) => { e.preventDefault(); handleNav('dashboard'); }}
          >
            <img src="/assets/img/logo.svg" alt="RR Metrics" className="w-8 h-8 rounded-md flex-shrink-0" />
            <span className="text-text-primary font-semibold text-[15px] tracking-[3px] uppercase">RR Metrics</span>
          </a>
        </div>

        {/* Nav links */}
        <div className="flex-1 py-4 px-3 space-y-1">
          {navItems.map(item => {
            const Icon = item.icon;
            const isActive = currentPage === item.id;
            return (
              <a
                key={item.id}
                href="#"
                className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors no-underline ${
                  isActive
                    ? 'bg-bg-surface text-accent border-l-2 border-accent'
                    : 'text-text-secondary hover:text-text-primary hover:bg-bg-surface'
                }`}
                onClick={(e) => { e.preventDefault(); handleNav(item.id); }}
              >
                <Icon className="w-5 h-5" />
                {item.label}
              </a>
            );
          })}
        </div>

        {/* Upgrade box — show for trial and free users, not for paid */}
        {(!subscriptionStatus || (subscriptionStatus.plan !== 'pro' && subscriptionStatus.plan !== 'elite')) && (
          <div className="px-4 pb-3">
            <div className="bg-bg-surface border border-border rounded-xl p-4">
              <div className="flex items-center gap-2 mb-2">
                <Icons.Zap className="w-4 h-4 text-accent" />
                <span className="text-text-primary text-sm font-semibold">Upgrade to Pro</span>
              </div>
              <p className="text-text-tertiary text-xs mb-3">Get auto syncing, unlimited trades, and more.</p>
              <button
                className="w-full py-2 bg-accent text-accent-text text-xs font-semibold rounded-lg hover:brightness-110 transition-all"
                onClick={() => { window.location.href = '/upgrade'; }}
              >
                Upgrade Now
              </button>
            </div>
          </div>
        )}

        {/* Refer & Earn link */}
        <div className="px-3 pb-0">
          <a
            href="#"
            className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors no-underline ${
              currentPage === 'referral'
                ? 'bg-bg-surface text-accent border-l-2 border-accent'
                : 'text-text-secondary hover:text-text-primary hover:bg-bg-surface'
            }`}
            onClick={(e) => { e.preventDefault(); handleNav('referral'); }}
          >
            <Icons.Gift className="w-5 h-5" />
            Refer &amp; Earn
          </a>
        </div>

        {/* Guides link */}
        <div className="px-3 pb-2">
          <a
            href="/guides"
            className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium text-text-secondary hover:text-text-primary hover:bg-bg-surface transition-colors no-underline"
          >
            <Icons.BookOpen className="w-5 h-5" />
            Guides
          </a>
        </div>

        {/* Account section */}
        <div className="px-3 pb-4 border-t border-border pt-3">
          <div className="relative">
            <button
              className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm text-text-secondary hover:bg-bg-surface transition-colors"
              onClick={(e) => { e.stopPropagation(); setAccountOpen(!accountOpen); }}
            >
              <div className="w-8 h-8 bg-bg-surface border border-border rounded-full flex items-center justify-center flex-shrink-0">
                <Icons.User className="w-4 h-4" />
              </div>
              <span className="flex-1 text-left text-text-primary text-sm">Account</span>
              {accountOpen ? <Icons.ChevronUp className="w-4 h-4" /> : <Icons.ChevronDown className="w-4 h-4" />}
            </button>
            {accountOpen && (
              <div className="absolute bottom-full left-0 right-0 mb-1 bg-bg-surface border border-border rounded-lg overflow-hidden shadow-lg">
                <a href="/changePass" className="flex items-center gap-3 px-4 py-2.5 text-sm text-text-secondary hover:bg-bg-input hover:text-text-primary transition-colors no-underline">
                  <Icons.Lock className="w-4 h-4" />
                  Change Password
                </a>
                <button onClick={() => { supabase.auth.signOut().then(() => { window.location = '/'; }); }} className="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-text-secondary hover:bg-bg-input hover:text-text-primary transition-colors">
                  <Icons.LogOut className="w-4 h-4" />
                  Log Out
                </button>
              </div>
            )}
          </div>
        </div>
      </nav>
    </>
  );
};

// =====================================================
// STAT CARD
// =====================================================
const StatCard = ({ label, value, subValue, color, change }) => (
  <div className="bg-bg-surface border border-border rounded-xl p-5">
    <div className="text-text-secondary text-xs font-medium uppercase tracking-wider mb-2">{label}</div>
    <div className="flex items-baseline gap-2">
      <div className={`font-mono text-2xl font-bold ${color || 'text-text-primary'}`}>{value}</div>
      {change !== undefined && change !== null && <ChangeIndicator value={change} />}
    </div>
    {subValue && <div className="text-text-tertiary text-xs mt-1">{subValue}</div>}
  </div>
);

const WinRateCard = ({ wins, losses, total, change }) => {
  const neutral = Math.max(0, total - wins - losses);
  const winRate = total > 0 ? (wins / total * 100) : 0;
  // Stroke-dasharray gauge: circle starts at 3-o'clock and goes CW.
  // rotate(180) moves start to 9-o'clock; CW from there traces 9→12→3 = top semicircle.
  const cx = 36, cy = 32, r = 28, sw = 6;
  const C = 2 * Math.PI * r;
  const half = Math.PI * r; // gauge arc length = half circumference
  const winsLen = total > 0 ? (wins / total) * half : 0;
  const neuLen  = total > 0 ? (neutral / total) * half : 0;
  const losLen  = total > 0 ? (losses / total) * half : 0;
  // Each segment rotates to its starting position (CW degrees from 3-o'clock)
  const neuStartDeg = 180 + (total > 0 ? (wins / total) * 180 : 0);
  const losStartDeg = 180 + (total > 0 ? ((wins + neutral) / total) * 180 : 0);
  return (
    <div className="bg-bg-surface border border-border rounded-xl p-5 relative">
      <div className="text-text-secondary text-xs font-medium uppercase tracking-wider mb-2">Win Rate</div>
      <div className="flex items-baseline gap-2">
        <div className="font-mono text-2xl font-bold text-text-primary">{winRate.toFixed(1)}%</div>
        {change !== null && change !== undefined && <ChangeIndicator value={change} />}
      </div>
      <div className="absolute right-4 top-4 flex flex-col items-center gap-1">
        <svg width={96} height={50} viewBox="0 0 72 38">
          {/* Background track */}
          <circle cx={cx} cy={cy} r={r} fill="none"
            stroke="rgb(var(--border))" strokeWidth={sw} strokeLinecap="butt"
            strokeDasharray={`${half} ${C - half}`}
            transform={`rotate(180, ${cx}, ${cy})`} />
          {/* Wins */}
          {winsLen > 0.01 && (
            <circle cx={cx} cy={cy} r={r} fill="none"
              stroke="rgb(var(--positive))" strokeWidth={sw} strokeLinecap="butt"
              strokeDasharray={`${winsLen} ${C - winsLen}`}
              transform={`rotate(180, ${cx}, ${cy})`} />
          )}
          {/* Neutral */}
          {neuLen > 0.01 && (
            <circle cx={cx} cy={cy} r={r} fill="none"
              stroke="rgb(var(--accent))" strokeWidth={sw} strokeLinecap="butt"
              strokeDasharray={`${neuLen} ${C - neuLen}`}
              transform={`rotate(${neuStartDeg}, ${cx}, ${cy})`} />
          )}
          {/* Losses */}
          {losLen > 0.01 && (
            <circle cx={cx} cy={cy} r={r} fill="none"
              stroke="rgb(var(--negative))" strokeWidth={sw} strokeLinecap="butt"
              strokeDasharray={`${losLen} ${C - losLen}`}
              transform={`rotate(${losStartDeg}, ${cx}, ${cy})`} />
          )}
        </svg>
        <div className="flex justify-between" style={{ width: 96 }}>
          <span className="inline-flex items-center justify-center w-5 h-5 rounded-full bg-positive/20 text-positive text-[9px] font-bold">{wins}</span>
          {neutral > 0 && <span className="inline-flex items-center justify-center w-5 h-5 rounded-full bg-accent/20 text-accent text-[9px] font-bold">{neutral}</span>}
          <span className="inline-flex items-center justify-center w-5 h-5 rounded-full bg-negative/20 text-negative text-[9px] font-bold">{losses}</span>
        </div>
      </div>
    </div>
  );
};

const AvgWinLossCard = ({ avgWin, avgLoss }) => {
  const absLoss = Math.abs(avgLoss);
  const total = avgWin + absLoss;
  const ratio = absLoss > 0 ? (avgWin / absLoss).toFixed(2) : avgWin > 0 ? '∞' : '0.00';
  const winPct = total > 0 ? (avgWin / total) * 100 : 50;
  return (
    <div className="bg-bg-surface border border-border rounded-xl p-5">
      <div className="flex items-center gap-4">
        <div>
          <div className="text-text-secondary text-xs font-medium uppercase tracking-wider mb-2">Avg Win / Loss</div>
          <div className="font-mono text-2xl font-bold text-text-primary">{ratio}</div>
        </div>
        <div className="flex-1 flex flex-col gap-3 ml-8">
          <div className="flex h-2 rounded-full overflow-hidden">
            <div className="bg-positive" style={{ width: `${winPct}%` }} />
            <div className="bg-negative flex-1" />
          </div>
          <div className="flex justify-between text-[12px] font-mono">
            <span className="text-positive">${avgWin.toFixed(0)}</span>
            <span className="text-negative">-${absLoss.toFixed(0)}</span>
          </div>
        </div>
      </div>
    </div>
  );
};

// =====================================================
// DASHBOARD PAGE
// =====================================================
const applyEvalFilter = (trades, evalFilter) => {
  if (evalFilter === 'exclude') return trades.filter(t => !t.isEval);
  if (evalFilter === 'only') return trades.filter(t => t.isEval);
  return trades;
};

const EvalFilterControl = ({ trades, evalFilter, setEvalFilter }) => {
  if (!trades.some(t => t.isEval)) return null;
  return (
    <div className="flex-shrink-0 flex border border-border rounded-lg overflow-hidden text-xs font-medium">
      {[
        { value: 'all', label: 'All' },
        { value: 'exclude', label: 'Excl. Evals' },
        { value: 'only', label: 'Only Evals' },
      ].map(({ value, label }, i, arr) => (
        <button
          key={value}
          className={`px-3 py-1.5 transition-colors ${i < arr.length - 1 ? 'border-r border-border' : ''} ${
            evalFilter === value
              ? 'bg-accent/15 text-accent'
              : 'bg-bg-input text-text-secondary hover:text-text-primary'
          }`}
          onClick={() => setEvalFilter(value)}
        >
          {label}
        </button>
      ))}
    </div>
  );
};

const DashboardPage = ({ trades, subscriptionStatus, onOpenForm, onOpenImport, onOpenAddTrade, onEditTrade, dailyNotes, onSaveNote, onDeleteNote, tags, strategyRules, evalFilter, setEvalFilter }) => {
  const [period, setPeriod] = useState('all');

  const baseTrades = applyEvalFilter(trades, evalFilter);
  const dateRange = getDateRange(period);
  const filteredTrades = filterTradesByDateRange(baseTrades, dateRange);
  const stats = calculateAnalytics(filteredTrades);

  const prevRange = getPreviousDateRange(period);
  const prevTrades = prevRange ? filterTradesByDateRange(baseTrades, prevRange) : null;
  const prevStats = prevTrades ? calculateAnalytics(prevTrades) : null;
  const showChange = period !== 'all' && prevStats;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-text-primary">Dashboard</h1>
          <p className="text-text-secondary text-sm mt-1">Overview of your trading performance</p>
        </div>
        <div className="flex items-center gap-2">
          <button className="flex items-center gap-2 px-4 py-2.5 bg-bg-surface border border-border text-text-secondary text-sm font-semibold rounded-lg hover:text-text-primary hover:border-accent transition-all" onClick={onOpenImport}>
            <Icons.Download className="w-4 h-4" />
            Import CSV
          </button>
          {subscriptionStatus && subscriptionStatus.isPremium && (subscriptionStatus.tradeCount == null || subscriptionStatus.tradeCount < 50) && (
            <button className="flex items-center gap-2 px-4 py-2.5 bg-accent text-accent-text text-sm font-semibold rounded-lg hover:brightness-110 transition-all" onClick={onOpenForm}>
              <Icons.Plus className="w-4 h-4" />
              New Trade
            </button>
          )}
        </div>
      </div>

      {/* Period Filter + Eval filter */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex-1 min-w-0">
          <PeriodFilter value={period} onChange={setPeriod} trades={trades} />
        </div>
        <EvalFilterControl trades={trades} evalFilter={evalFilter} setEvalFilter={setEvalFilter} />
      </div>

      {/* Stats grid */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <StatCard
          label="Total P/L"
          value={`$${stats.totalPL.toFixed(2)}`}
          color={stats.totalPL >= 0 ? 'text-positive' : 'text-negative'}
          change={showChange ? calcPercentChange(stats.totalPL, prevStats.totalPL) : null}
        />
        <WinRateCard wins={stats.wins} losses={stats.losses} total={stats.totalTrades}
          change={showChange ? calcPercentChange(stats.winRate, prevStats.winRate) : null} />
        <StatCard label="Total Trades" value={stats.totalTrades} color="text-text-primary"
          change={showChange ? calcPercentChange(stats.totalTrades, prevStats.totalTrades) : null} />
        <StatCard label="Avg Duration" value={formatDuration(stats.avgDuration)} color="text-text-primary" />
      </div>

      {/* Secondary stats */}
      <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
        <AvgWinLossCard avgWin={stats.avgWin} avgLoss={stats.avgLoss} />
        <StatCard label="Best Trade" value={`$${stats.bestTrade.toFixed(2)}`} color="text-positive"
          change={showChange ? calcPercentChange(stats.bestTrade, prevStats.bestTrade) : null} />
        <StatCard label="Worst Trade" value={`$${stats.worstTrade.toFixed(2)}`} color="text-negative" />
      </div>

      {/* Calendar */}
      <CalendarView trades={baseTrades} dailyNotes={dailyNotes} onSaveNote={onSaveNote} onDeleteNote={onDeleteNote} tags={tags} subscriptionStatus={subscriptionStatus} strategyRules={strategyRules} onOpenAddTrade={onOpenAddTrade} onEditTrade={onEditTrade} />
    </div>
  );
};

// =====================================================
// DAY DETAIL PANEL
// =====================================================
const DayDetailPanel = ({ dateKey, dayData, onClose, dailyNotes, onSaveNote, onDeleteNote, tags, subscriptionStatus, strategyRules, onEditTrade }) => {
  const [expandedTrade, setExpandedTrade] = useState(null);
  const [dailyChecks, setDailyChecks] = useState([]);
  const [tradeChecksMap, setTradeChecksMap] = useState({});
  const [checksLoading, setChecksLoading] = useState(false);
  const date = new Date(dateKey + 'T00:00:00');
  const formatted = formatFullDateEST(date);
  const isElite = subscriptionStatus && subscriptionStatus.isPremium;
  const dayRules = strategyRules ? strategyRules.filter(r => r.type === 'day') : [];
  const tradeRules = strategyRules ? strategyRules.filter(r => r.type === 'trade') : [];
  const windowWidth = useWindowWidth();
  const isUltrawide = windowWidth >= 2000;
  const setSidePanelOffset = React.useContext(SidePanelContext);
  useEffect(() => {
    if (isUltrawide) setSidePanelOffset(480);
    return () => setSidePanelOffset(0);
  }, [isUltrawide, setSidePanelOffset]);

  useEffect(() => {
    if (!isElite || !strategyRules || strategyRules.length === 0) return;
    const fetchDailyChecks = async () => {
      try {
        const resp = await authFetch(`/api/strategy/checks/daily/${dateKey}`);
        const data = await resp.json();
        if (!data.error) setDailyChecks(data.checks || []);
      } catch (err) {
        console.error('Failed to fetch daily checks:', err);
      }
    };
    fetchDailyChecks();
  }, [dateKey, isElite, strategyRules]);

  const handleDailyToggle = async (ruleId, followed) => {
    setChecksLoading(true);
    try {
      const resp = await authFetch('/api/strategy/checks/daily', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ruleId, date: dateKey, followed }),
      });
      const check = await resp.json();
      if (!check.error) {
        setDailyChecks(prev => {
          const filtered = prev.filter(ch => ch.ruleId !== ruleId);
          return [...filtered, check];
        });
      }
    } catch (err) {
      console.error('Failed to toggle daily check:', err);
    } finally {
      setChecksLoading(false);
    }
  };

  const fetchTradeChecks = async (tradeId) => {
    if (tradeChecksMap[tradeId]) return;
    try {
      const resp = await authFetch(`/api/strategy/checks/trade/${tradeId}`);
      const data = await resp.json();
      if (!data.error) {
        setTradeChecksMap(prev => ({ ...prev, [tradeId]: data.checks || [] }));
      }
    } catch (err) {
      console.error('Failed to fetch trade checks:', err);
    }
  };

  const handleTradeToggle = async (tradeId, ruleId, followed) => {
    setChecksLoading(true);
    try {
      const resp = await authFetch('/api/strategy/checks/trade', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tradeId, ruleId, followed }),
      });
      const check = await resp.json();
      if (!check.error) {
        setTradeChecksMap(prev => {
          const existing = prev[tradeId] || [];
          const filtered = existing.filter(ch => ch.ruleId !== ruleId);
          return { ...prev, [tradeId]: [...filtered, check] };
        });
      }
    } catch (err) {
      console.error('Failed to toggle trade check:', err);
    } finally {
      setChecksLoading(false);
    }
  };

  const trades = dayData.trades;
  const wins = trades.filter(t => getTradePL(t) > 0).length;
  const winRate = trades.length > 0 ? ((wins / trades.length) * 100).toFixed(0) : 0;
  const avgDuration = trades.length > 0
    ? trades.reduce((sum, t) => sum + (new Date(t.exitTime) - new Date(t.enterTime)), 0) / trades.length
    : 0;

  const existingNote = dailyNotes && dailyNotes.find(n => n.date === dateKey);
  const [noteText, setNoteText] = useState(existingNote ? existingNote.content : '');
  const [noteSaving, setNoteSaving] = useState(false);

  useEffect(() => {
    const found = dailyNotes && dailyNotes.find(n => n.date === dateKey);
    setNoteText(found ? found.content : '');
  }, [dateKey, dailyNotes]);

  useEffect(() => {
    const handleEscape = (e) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', handleEscape);
    return () => document.removeEventListener('keydown', handleEscape);
  }, [onClose]);

  const handleSaveNote = async () => {
    if (!noteText.trim() || noteSaving) return;
    setNoteSaving(true);
    await onSaveNote(dateKey, noteText.trim());
    setNoteSaving(false);
  };

  const handleDeleteNote = async () => {
    setNoteSaving(true);
    await onDeleteNote(dateKey);
    setNoteText('');
    setNoteSaving(false);
  };

  return (
    <div className={isUltrawide ? "fixed right-0 top-0 h-screen z-40 flex" : "fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4"} onClick={!isUltrawide ? onClose : undefined}>
      <div className={isUltrawide ? "w-[480px] h-full flex flex-col bg-bg-surface border-l border-border shadow-2xl" : "bg-bg-surface border border-border rounded-xl w-full max-w-lg max-h-[85vh] flex flex-col"} onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-border">
          <div>
            <h3 className="text-text-primary font-semibold">{formatted}</h3>
            <p className="text-text-secondary text-xs mt-0.5">{dayData.tradeCount} trade{dayData.tradeCount !== 1 ? 's' : ''}</p>
          </div>
          <button className="text-text-secondary hover:text-text-primary transition-colors" onClick={onClose}>
            <Icons.X />
          </button>
        </div>

        {/* Summary stats */}
        <div className="grid grid-cols-4 gap-3 px-6 py-4 border-b border-border">
          <div className="text-center">
            <div className="text-text-secondary text-xs mb-1">Total P/L</div>
            {dayData.tradeCount > 0 ? (
              <div className={`font-mono text-sm font-bold ${dayData.totalPL >= 0 ? 'text-positive' : 'text-negative'}`}>
                ${dayData.totalPL.toFixed(2)}
              </div>
            ) : (
              <div className="font-mono text-sm font-bold text-text-muted">N/A</div>
            )}
          </div>
          <div className="text-center">
            <div className="text-text-secondary text-xs mb-1">Win Rate</div>
            <div className="font-mono text-sm font-bold text-text-primary">{dayData.tradeCount > 0 ? `${winRate}%` : 'N/A'}</div>
          </div>
          <div className="text-center">
            <div className="text-text-secondary text-xs mb-1">Trades</div>
            <div className="font-mono text-sm font-bold text-text-primary">{dayData.tradeCount}</div>
          </div>
          <div className="text-center">
            <div className="text-text-secondary text-xs mb-1">Avg Duration</div>
            <div className="font-mono text-sm font-bold text-text-primary">{dayData.tradeCount > 0 ? formatDuration(avgDuration) : 'N/A'}</div>
          </div>
        </div>

        {/* Trade list */}
        <div className="flex-1 overflow-y-auto px-6 py-3">
          {trades.length > 0 && (
            <div className="space-y-2 mb-4">
              {trades.map(trade => {
                const pl = getTradePL(trade);
                const duration = new Date(trade.exitTime) - new Date(trade.enterTime);
                const entryTime = formatTimeEST(trade.enterTime);
                const exitTime = formatTimeEST(trade.exitTime);
                const isLong = trade.quantity > 0;
                const isExpanded = expandedTrade === trade._id;
                const tradeTags = tags && trade.tags ? tags.filter(tag => trade.tags.includes(tag._id)) : [];
                return (
                  <div key={trade._id} className="rounded-lg bg-bg-input border border-border overflow-hidden">
                    <button
                      className="flex items-center justify-between w-full py-2.5 px-3 text-left hover:bg-bg-input/80 transition-colors"
                      onClick={() => {
                        const nextId = isExpanded ? null : trade._id;
                        setExpandedTrade(nextId);
                        if (nextId && isElite && tradeRules.length > 0) fetchTradeChecks(nextId);
                      }}
                    >
                      <div className="flex items-center gap-2">
                        <span className={`text-[10px] font-bold uppercase px-1.5 py-0.5 rounded ${isLong ? 'bg-positive/15 text-positive' : 'bg-negative/15 text-negative'}`}>
                          {isLong ? 'L' : 'S'}
                        </span>
                        <span className="font-mono text-sm font-semibold text-text-primary">{trade.ticker}</span>
                        <span className="text-text-tertiary text-xs">{entryTime} - {exitTime}</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className={`font-mono text-sm font-semibold ${pl >= 0 ? 'text-positive' : 'text-negative'}`}>
                          {pl >= 0 ? '+' : ''}${pl.toFixed(2)}
                        </span>
                        {onEditTrade && (
                          <button
                            className="text-text-muted hover:text-accent transition-colors"
                            title="Edit trade"
                            onClick={(e) => { e.stopPropagation(); onEditTrade(trade); onClose(); }}
                          >
                            <Icons.Edit className="w-3.5 h-3.5" />
                          </button>
                        )}
                        <Icons.ChevronDown className={`w-3.5 h-3.5 text-text-muted transition-transform ${isExpanded ? 'rotate-180' : ''}`} />
                      </div>
                    </button>
                    {isExpanded && (
                      <div className="px-3 pb-3 border-t border-border/50 pt-2.5 space-y-2">
                        <div className="grid grid-cols-2 gap-x-4 gap-y-1.5 text-xs">
                          <div className="flex justify-between">
                            <span className="text-text-secondary">Entry Price</span>
                            <span className="font-mono text-text-primary">${trade.enterPrice.toFixed(2)}</span>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-text-secondary">Exit Price</span>
                            <span className="font-mono text-text-primary">${trade.exitPrice.toFixed(2)}</span>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-text-secondary">Quantity</span>
                            <span className="font-mono text-text-primary">{Math.abs(trade.quantity)}</span>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-text-secondary">Duration</span>
                            <span className="font-mono text-text-primary">{formatDuration(duration)}</span>
                          </div>
                        </div>
                        {tradeTags.length > 0 && (
                          <div className="flex flex-wrap gap-1.5 pt-1">
                            {tradeTags.map(tag => (
                              <span key={tag._id} className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium" style={{ backgroundColor: tag.color + '22', color: tag.color }}>
                                <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: tag.color }}></span>
                                {tag.name}
                              </span>
                            ))}
                          </div>
                        )}
                        {trade.comments && (
                          <div className="text-xs text-text-secondary bg-bg-surface rounded px-2.5 py-2 mt-1">
                            {trade.comments}
                          </div>
                        )}
                        {trade.screenshot && (
                          <div className="mt-1">
                            <img src={trade.screenshot} alt="Trade screenshot" className="rounded-lg border border-border max-h-40 w-full object-contain bg-bg-surface" />
                          </div>
                        )}
                        {isElite && tradeRules.length > 0 && (
                          <div className="mt-2 pt-2 border-t border-border/50">
                            <label className="text-text-secondary text-[10px] font-semibold uppercase tracking-wider mb-1.5 block">Trade Rules</label>
                            <RuleChecklist
                              rules={tradeRules}
                              checks={tradeChecksMap[trade._id] || []}
                              onToggle={(ruleId, followed) => handleTradeToggle(trade._id, ruleId, followed)}
                              loading={checksLoading}
                            />
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}

          {/* Daily Note */}
          <div className="border-t border-border pt-3">
            <label className="text-text-secondary text-xs font-medium mb-1.5 block">Daily Note</label>
            <textarea
              className="w-full px-3 py-2 bg-bg-input border border-border rounded-lg text-text-primary text-sm placeholder-text-muted focus:outline-none focus:border-accent transition-colors resize-none"
              rows="3"
              placeholder="Add a note for this day..."
              value={noteText}
              onChange={(e) => setNoteText(e.target.value)}
            />
            <div className="flex items-center gap-2 mt-2">
              <button
                className="px-3 py-1.5 bg-accent text-accent-text text-xs font-semibold rounded-lg hover:brightness-110 transition-all disabled:opacity-50"
                onClick={handleSaveNote}
                disabled={noteSaving || !noteText.trim()}
              >
                {noteSaving ? 'Saving...' : 'Save Note'}
              </button>
              {existingNote && (
                <button
                  className="px-3 py-1.5 text-xs text-text-tertiary hover:text-negative transition-colors"
                  onClick={handleDeleteNote}
                  disabled={noteSaving}
                >
                  Delete Note
                </button>
              )}
            </div>
          </div>

          {/* Daily Rule Checks */}
          {isElite && dayRules.length > 0 && (
            <div className="border-t border-border pt-3">
              <label className="text-text-secondary text-xs font-medium mb-1.5 block">Daily Rules</label>
              <RuleChecklist
                rules={dayRules}
                checks={dailyChecks}
                onToggle={handleDailyToggle}
                loading={checksLoading}
              />
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

// =====================================================
// CALENDAR VIEW (with Daily / Heatmap / Monthly modes)
// =====================================================
const MONTH_NAMES = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const MONTH_SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

const CalendarView = ({ trades, dailyNotes, onSaveNote, onDeleteNote, tags, subscriptionStatus, strategyRules, onOpenAddTrade, onEditTrade }) => {
  const [viewMode, setViewMode] = useState('daily'); // 'daily' | 'heatmap' | 'monthly'
  const [currentDate, setCurrentDate] = useState(new Date());
  const [selectedDay, setSelectedDay] = useState(null);
  const dailyData = groupTradesByDate(trades);
  const canAddTrade = subscriptionStatus && subscriptionStatus.isPremium
    && (subscriptionStatus.tradeCount == null || subscriptionStatus.tradeCount < 50);

  const year = currentDate.getFullYear();
  const month = currentDate.getMonth();

  const viewModes = [
    { id: 'daily', label: 'Daily', icon: Icons.Calendar },
    { id: 'heatmap', label: 'Heatmap', icon: Icons.Grid },
    { id: 'monthly', label: 'Monthly', icon: Icons.Layers },
  ];

  // Compute month P&L for the header badge (daily view only)
  let monthPL = 0;
  let monthTrades = 0;
  let prevMonthPL = 0;
  let prevMonthTrades = 0;
  if (viewMode === 'daily') {
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    for (let d = 1; d <= daysInMonth; d++) {
      const dk = `${year}-${String(month + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
      if (dailyData[dk]) {
        monthPL += dailyData[dk].totalPL;
        monthTrades += dailyData[dk].tradeCount;
      }
    }
    // Previous month for % change
    const prevM = month === 0 ? 11 : month - 1;
    const prevY = month === 0 ? year - 1 : year;
    const daysInPrevMonth = new Date(prevY, prevM + 1, 0).getDate();
    for (let d = 1; d <= daysInPrevMonth; d++) {
      const dk = `${prevY}-${String(prevM + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
      if (dailyData[dk]) {
        prevMonthPL += dailyData[dk].totalPL;
        prevMonthTrades += dailyData[dk].tradeCount;
      }
    }
  }

  return (
    <div className="bg-bg-surface border border-border rounded-xl p-6">
      {/* Header with view toggle */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          {viewMode !== 'heatmap' && (
            <button onClick={() => {
              if (viewMode === 'daily') setCurrentDate(new Date(year, month - 1, 1));
              else setCurrentDate(new Date(year - 1, month, 1));
            }} className="p-2 rounded-lg hover:bg-bg-input text-text-secondary transition-colors">
              <Icons.ChevronLeft />
            </button>
          )}
          <h3 className="text-text-primary font-semibold text-lg">
            {viewMode === 'daily' ? `${MONTH_NAMES[month]} ${year}` : year}
          </h3>
          {viewMode !== 'heatmap' && (
            <button onClick={() => {
              if (viewMode === 'daily') setCurrentDate(new Date(year, month + 1, 1));
              else setCurrentDate(new Date(year + 1, month, 1));
            }} className="p-2 rounded-lg hover:bg-bg-input text-text-secondary transition-colors">
              <Icons.ChevronRight />
            </button>
          )}

          {/* Month P&L badge (daily view only) */}
          {viewMode === 'daily' && (
            <span className={`ml-2 inline-flex items-center gap-1.5 font-mono text-sm font-bold px-2.5 py-1 rounded-md ${
              monthTrades > 0
                ? monthPL >= 0 ? 'text-positive bg-positive/10' : 'text-negative bg-negative/10'
                : 'text-text-muted bg-bg-input'
            }`}>
              {monthTrades > 0 ? `$${monthPL.toFixed(2)}` : '--'}
              {monthTrades > 0 && prevMonthTrades > 0 && (
                <ChangeIndicator value={calcPercentChange(monthPL, prevMonthPL)} />
              )}
            </span>
          )}
        </div>

        {/* View mode toggle */}
        <div className="flex bg-bg-input rounded-lg p-0.5 gap-0.5">
          {viewModes.map(mode => (
            <button
              key={mode.id}
              onClick={() => setViewMode(mode.id)}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-all ${
                viewMode === mode.id
                  ? 'bg-bg-surface text-accent shadow-sm'
                  : 'text-text-tertiary hover:text-text-secondary'
              }`}
            >
              <mode.icon className="w-3.5 h-3.5" />
              {mode.label}
            </button>
          ))}
        </div>
      </div>

      {/* Heatmap has its own year nav */}
      {viewMode === 'heatmap' && (
        <div className="flex items-center gap-2 mb-4">
          <button onClick={() => setCurrentDate(new Date(year - 1, 0, 1))} className="p-1.5 rounded-lg hover:bg-bg-input text-text-secondary transition-colors">
            <Icons.ChevronLeft />
          </button>
          <span className="text-text-primary font-semibold text-lg">{year}</span>
          <button onClick={() => setCurrentDate(new Date(year + 1, 0, 1))} className="p-1.5 rounded-lg hover:bg-bg-input text-text-secondary transition-colors">
            <Icons.ChevronRight />
          </button>
        </div>
      )}

      {viewMode === 'daily' && (
        <DailyCalendar
          year={year}
          month={month}
          dailyData={dailyData}
          onSelectDay={setSelectedDay}
          dailyNotes={dailyNotes}
          onOpenAddTrade={canAddTrade ? onOpenAddTrade : undefined}
        />
      )}

      {viewMode === 'heatmap' && (
        <YearHeatmap
          year={year}
          dailyData={dailyData}
          onSelectDay={setSelectedDay}
        />
      )}

      {viewMode === 'monthly' && (
        <MonthlyGrid
          year={year}
          dailyData={dailyData}
        />
      )}

      {selectedDay && (
        <DayDetailPanel
          dateKey={selectedDay}
          dayData={dailyData[selectedDay] || { totalPL: 0, tradeCount: 0, trades: [] }}
          onClose={() => setSelectedDay(null)}
          dailyNotes={dailyNotes}
          onSaveNote={onSaveNote}
          onDeleteNote={onDeleteNote}
          tags={tags}
          subscriptionStatus={subscriptionStatus}
          strategyRules={strategyRules}
          onEditTrade={onEditTrade}
        />
      )}
    </div>
  );
};

// --- Daily Calendar (original view) ---
const DailyCalendar = ({ year, month, dailyData, onSelectDay, dailyNotes, onOpenAddTrade }) => {
  const daysInMonth = new Date(year, month + 1, 0).getDate();

  // Build weeks as rows: each week is an array of 7 day slots (null for empty)
  const weeks = [];
  let currentWeek = new Array(7).fill(null);
  for (let day = 1; day <= daysInMonth; day++) {
    const dow = new Date(year, month, day).getDay();
    const dateKey = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    currentWeek[dow] = { day, dateKey };
    if (dow === 6 || day === daysInMonth) {
      weeks.push(currentWeek);
      currentWeek = new Array(7).fill(null);
    }
  }

  const colTemplate = 'repeat(7, 1fr) 1px 80px';

  return (
    <>
      {/* Header row: day names + divider + "Week" column */}
      <div className="grid gap-1 mb-1" style={{ gridTemplateColumns: colTemplate }}>
        {DAY_NAMES.map(d => (
          <div key={d} className="text-center text-xs font-medium text-text-tertiary py-2">{d}</div>
        ))}
        <div></div>
        <div className="text-center text-xs font-medium text-text-tertiary py-2">Week</div>
      </div>

      {/* Week rows */}
      {weeks.map((week, wi) => {
        let weekPL = 0;
        let weekTrades = 0;
        week.forEach(slot => {
          if (slot && dailyData[slot.dateKey]) {
            weekPL += dailyData[slot.dateKey].totalPL;
            weekTrades += dailyData[slot.dateKey].tradeCount;
          }
        });

        return (
          <div key={wi} className="grid gap-1 mb-1" style={{ gridTemplateColumns: colTemplate }}>
            {week.map((slot, di) => {
              if (!slot) return <div key={`empty-${wi}-${di}`} className="h-24 rounded-lg"></div>;

              const data = dailyData[slot.dateKey];
              const hasActivity = data !== undefined;
              const pl = hasActivity ? data.totalPL : 0;
              const hasNote = dailyNotes && dailyNotes.some(n => n.date === slot.dateKey);
              const dayWins = hasActivity ? data.trades.filter(t => getTradePL(t) > 0).length : 0;
              const dayWinRate = hasActivity && data.tradeCount > 0 ? Math.round((dayWins / data.tradeCount) * 100) : null;

              let bgClass = 'bg-bg-input';
              if (hasActivity) {
                bgClass = pl >= 0 ? 'bg-positive/10 border-positive/30' : 'bg-negative/10 border-negative/30';
              }

              return (
                <div
                  key={slot.day}
                  className={`h-24 rounded-lg border border-border p-2 ${bgClass} cursor-pointer hover:brightness-110 transition-all group relative`}
                  onClick={() => onSelectDay(slot.dateKey)}
                >
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-text-secondary">{slot.day}</span>
                    <div className="flex items-center gap-1">
                      {hasNote && (
                        <svg className="w-3 h-3 text-accent" viewBox="0 0 24 24" fill="currentColor"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8l-6-6z"></path></svg>
                      )}
                      {onOpenAddTrade && (
                        <button
                          className="opacity-0 group-hover:opacity-100 transition-opacity w-4 h-4 rounded flex items-center justify-center bg-accent/20 hover:bg-accent/40 text-accent text-[10px] font-bold leading-none"
                          onClick={(e) => { e.stopPropagation(); onOpenAddTrade(slot.dateKey); }}
                          title="Add trade"
                        >+</button>
                      )}
                    </div>
                  </div>
                  <div className={`font-mono text-sm font-semibold mt-1 ${hasActivity ? (pl >= 0 ? 'text-positive' : 'text-negative') : 'text-text-muted'}`}>
                    {hasActivity ? `$${pl.toFixed(0)}` : '—'}
                  </div>
                  <div className="text-text-tertiary text-[10px] mt-0.5">
                    {hasActivity ? data.tradeCount : 0} trade{(!hasActivity || data.tradeCount !== 1) ? 's' : ''}
                  </div>
                  {hasActivity && dayWinRate !== null && (
                    <div className={`text-[10px] mt-0.5 font-mono ${dayWinRate >= 50 ? 'text-positive/70' : 'text-negative/70'}`}>
                      {dayWinRate}% WR
                    </div>
                  )}
                  {!hasActivity && (
                    <div className="text-text-muted text-[10px] mt-0.5 font-mono">N/A WR</div>
                  )}
                </div>
              );
            })}

            {/* Vertical divider */}
            <div className="bg-border my-1 rounded-full"></div>

            {/* Weekly P&L summary cell */}
            <div className={`h-24 rounded-lg border p-2 flex flex-col items-center justify-center ${
              weekTrades > 0
                ? weekPL >= 0 ? 'bg-positive/5 border-positive/20' : 'bg-negative/5 border-negative/20'
                : 'bg-bg-input border-border'
            }`}>
              {weekTrades > 0 ? (
                <>
                  <div className={`font-mono text-sm font-bold ${weekPL >= 0 ? 'text-positive' : 'text-negative'}`}>
                    ${weekPL.toFixed(0)}
                  </div>
                  <div className="text-text-tertiary text-[10px] mt-0.5">
                    {weekTrades} trade{weekTrades !== 1 ? 's' : ''}
                  </div>
                </>
              ) : (
                <div className="text-text-muted text-xs">--</div>
              )}
            </div>
          </div>
        );
      })}
    </>
  );
};

// --- Year Heatmap (GitHub-style) ---
const YearHeatmap = ({ year, dailyData, onSelectDay }) => {
  const [tooltip, setTooltip] = useState(null);

  // Build all days of the year
  const startDate = new Date(year, 0, 1);
  const endDate = new Date(year, 11, 31);

  // Collect all P/L values for the year to compute intensity scale
  const yearPLs = [];
  for (let d = new Date(startDate); d <= endDate; d.setDate(d.getDate() + 1)) {
    const dk = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    if (dailyData[dk]) yearPLs.push(Math.abs(dailyData[dk].totalPL));
  }
  const maxPL = Math.max(...yearPLs, 1);

  // Generate weeks (columns) with days (rows 0-6 = Sun-Sat)
  const weeks = [];
  let currentWeek = new Array(7).fill(null);
  for (let d = new Date(startDate); d <= endDate; d = new Date(d.getFullYear(), d.getMonth(), d.getDate() + 1)) {
    const dow = d.getDay();
    const dateKey = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    currentWeek[dow] = { dateKey, day: d.getDate(), month: d.getMonth() };
    if (dow === 6 || (d.getMonth() === 11 && d.getDate() === 31)) {
      weeks.push(currentWeek);
      currentWeek = new Array(7).fill(null);
    }
  }

  const getHeatColor = (dateKey) => {
    const data = dailyData[dateKey];
    if (!data) return 'bg-bg-input';
    const pl = data.totalPL;
    const intensity = Math.min(Math.abs(pl) / maxPL, 1);
    if (pl === 0) return 'bg-text-muted/30';
    if (pl > 0) {
      if (intensity < 0.25) return 'bg-positive/35';
      if (intensity < 0.5) return 'bg-positive/55';
      if (intensity < 0.75) return 'bg-positive/75';
      return 'bg-positive';
    }
    if (intensity < 0.25) return 'bg-negative/35';
    if (intensity < 0.5) return 'bg-negative/55';
    if (intensity < 0.75) return 'bg-negative/75';
    return 'bg-negative';
  };

  // Find which weeks correspond to month boundaries for labels
  const monthLabels = [];
  let lastMonth = -1;
  weeks.forEach((week, wi) => {
    const firstDayInWeek = week.find(d => d !== null);
    if (firstDayInWeek && firstDayInWeek.month !== lastMonth) {
      monthLabels.push({ weekIndex: wi, label: MONTH_SHORT[firstDayInWeek.month] });
      lastMonth = firstDayInWeek.month;
    }
  });

  // Compute stats for the side panel
  const tradingDays = Object.keys(dailyData).filter(k => k.startsWith(`${year}-`)).length;
  const totalTrades = Object.keys(dailyData).filter(k => k.startsWith(`${year}-`)).reduce((s, k) => s + dailyData[k].tradeCount, 0);
  const totalPL = Object.keys(dailyData).filter(k => k.startsWith(`${year}-`)).reduce((s, k) => s + dailyData[k].totalPL, 0);
  const avgDailyTrades = tradingDays > 0 ? (totalTrades / tradingDays) : 0;
  const avgDailyPL = tradingDays > 0 ? (totalPL / tradingDays) : 0;
  const daysInYear = (year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0)) ? 366 : 365;
  const tradingWeekdays = (() => {
    let count = 0;
    for (let d = new Date(year, 0, 1); d.getFullYear() === year; d.setDate(d.getDate() + 1)) {
      if (d.getDay() !== 0 && d.getDay() !== 6) count++;
    }
    return count;
  })();
  const pctYearTrading = tradingWeekdays > 0 ? ((tradingDays / tradingWeekdays) * 100) : 0;
  const winDays = Object.keys(dailyData).filter(k => k.startsWith(`${year}-`) && dailyData[k].totalPL > 0).length;
  const lossDays = Object.keys(dailyData).filter(k => k.startsWith(`${year}-`) && dailyData[k].totalPL < 0).length;

  return (
    <div>
      <div className="relative">
        {/* Month labels */}
        <div className="flex ml-8 mb-1 text-[11px] text-text-tertiary" style={{ gap: 0 }}>
          {(() => {
            const labels = [];
            let lastIdx = -1;
            monthLabels.forEach(({ weekIndex, label }) => {
              const left = weekIndex * 18;
              if (lastIdx === -1 || left - lastIdx > 32) {
                labels.push(<span key={label} style={{ position: 'absolute', left: `${36 + left}px` }}>{label}</span>);
                lastIdx = left;
              }
            });
            return labels;
          })()}
        </div>

        <div className="flex gap-0 mt-5">
          {/* Day-of-week labels */}
          <div className="flex flex-col gap-[3px] mr-2 text-[11px] text-text-tertiary pt-0">
            {['Sun', '', 'Tue', '', 'Thu', '', 'Sat'].map((label, i) => (
              <div key={i} className="h-[15px] flex items-center justify-end w-7">{label}</div>
            ))}
          </div>

          {/* Heatmap grid */}
          <div className="flex gap-[3px] overflow-x-auto">
            {weeks.map((week, wi) => (
              <div key={wi} className="flex flex-col gap-[3px]">
                {week.map((day, di) => {
                  if (!day) return <div key={di} className="w-[15px] h-[15px]" />;
                  const data = dailyData[day.dateKey];
                  const hasActivity = !!data;
                  return (
                    <div
                      key={di}
                      className={`w-[15px] h-[15px] rounded-[2px] ${getHeatColor(day.dateKey)} ${hasActivity ? 'cursor-pointer' : ''} transition-all`}
                      onMouseEnter={(e) => {
                        if (!hasActivity) return;
                        const rect = e.target.getBoundingClientRect();
                        setTooltip({ x: rect.left, y: rect.top - 8, dateKey: day.dateKey, pl: data.totalPL, trades: data.tradeCount });
                      }}
                      onMouseLeave={() => setTooltip(null)}
                      onClick={() => hasActivity && onSelectDay(day.dateKey)}
                    />
                  );
                })}
              </div>
            ))}
          </div>
        </div>

        {/* Legend */}
        <div className="flex items-center gap-2 mt-3 text-[10px] text-text-tertiary justify-end">
          <span>Loss</span>
          <div className="flex gap-[2px]">
            <div className="w-[13px] h-[13px] rounded-[2px] bg-negative" />
            <div className="w-[13px] h-[13px] rounded-[2px] bg-negative/55" />
            <div className="w-[13px] h-[13px] rounded-[2px] bg-bg-input" />
            <div className="w-[13px] h-[13px] rounded-[2px] bg-positive/55" />
            <div className="w-[13px] h-[13px] rounded-[2px] bg-positive" />
          </div>
          <span>Profit</span>
        </div>

        {/* Tooltip */}
        {tooltip && (
          <div
            className="fixed z-50 bg-bg-page border border-border rounded-lg px-3 py-2 shadow-lg pointer-events-none"
            style={{ left: tooltip.x, top: tooltip.y, transform: 'translate(-50%, -100%)' }}
          >
            <div className="text-[11px] text-text-secondary">{tooltip.dateKey}</div>
            <div className={`font-mono text-sm font-semibold ${tooltip.pl >= 0 ? 'text-positive' : 'text-negative'}`}>
              ${tooltip.pl.toFixed(2)}
            </div>
            <div className="text-[10px] text-text-tertiary">{tooltip.trades} trade{tooltip.trades !== 1 ? 's' : ''}</div>
          </div>
        )}
      </div>

      {/* Stats row */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-4">
        <div className="bg-bg-input rounded-lg p-3 border border-border">
          <div className="text-text-tertiary text-[10px] uppercase tracking-wider mb-1">Avg Daily Trades</div>
          <div className="font-mono text-lg font-bold text-text-primary">{avgDailyTrades.toFixed(1)}</div>
        </div>
        <div className="bg-bg-input rounded-lg p-3 border border-border">
          <div className="text-text-tertiary text-[10px] uppercase tracking-wider mb-1">Avg Daily P&L</div>
          <div className={`font-mono text-lg font-bold ${avgDailyPL >= 0 ? 'text-positive' : 'text-negative'}`}>
            ${avgDailyPL.toFixed(2)}
          </div>
        </div>
        <div className="bg-bg-input rounded-lg p-3 border border-border">
          <div className="text-text-tertiary text-[10px] uppercase tracking-wider mb-1">Year Active</div>
          <div className="font-mono text-lg font-bold text-text-primary">{pctYearTrading.toFixed(1)}%</div>
          <div className="text-text-muted text-[10px] mt-0.5">{tradingDays} of {tradingWeekdays} weekdays</div>
        </div>
        <div className="bg-bg-input rounded-lg p-3 border border-border">
          <div className="text-text-tertiary text-[10px] uppercase tracking-wider mb-1">Win / Loss Days</div>
          <div className="flex items-center gap-2">
            <span className="font-mono text-sm font-bold text-positive">{winDays}</span>
            <span className="text-text-muted text-xs">/</span>
            <span className="font-mono text-sm font-bold text-negative">{lossDays}</span>
          </div>
        </div>
      </div>
    </div>
  );
};

// --- Monthly Grid (P/L per month for the year) ---
const MonthlyGrid = ({ year, dailyData }) => {
  // Helper to aggregate a specific month
  const aggregateMonth = (y, mi) => {
    let totalPL = 0;
    let tradeCount = 0;
    let winDays = 0;
    let lossDays = 0;
    const daysInMonth = new Date(y, mi + 1, 0).getDate();
    for (let d = 1; d <= daysInMonth; d++) {
      const dk = `${y}-${String(mi + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
      if (dailyData[dk]) {
        totalPL += dailyData[dk].totalPL;
        tradeCount += dailyData[dk].tradeCount;
        if (dailyData[dk].totalPL > 0) winDays++;
        else if (dailyData[dk].totalPL < 0) lossDays++;
      }
    }
    return { totalPL, tradeCount, winDays, lossDays };
  };

  // Aggregate P/L and trades per month
  const monthlyData = MONTH_NAMES.map((name, mi) => {
    const current = aggregateMonth(year, mi);
    const prevMi = mi === 0 ? 11 : mi - 1;
    const prevY = mi === 0 ? year - 1 : year;
    const prev = aggregateMonth(prevY, prevMi);
    return { name, shortName: MONTH_SHORT[mi], ...current, prevTotalPL: prev.totalPL, prevTradeCount: prev.tradeCount };
  });

  const yearTotal = monthlyData.reduce((s, m) => s + m.totalPL, 0);
  const yearTrades = monthlyData.reduce((s, m) => s + m.tradeCount, 0);

  return (
    <div>
      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
        {monthlyData.map((m, i) => {
          const hasActivity = m.tradeCount > 0;
          let bgClass = 'bg-bg-input';
          if (hasActivity) {
            bgClass = m.totalPL >= 0 ? 'bg-positive/10 border-positive/30' : 'bg-negative/10 border-negative/30';
          }

          return (
            <div key={i} className={`rounded-lg border border-border p-4 ${bgClass}`}>
              <div className="text-sm font-medium text-text-secondary mb-2">{m.name}</div>
              {hasActivity ? (
                <>
                  <div className="flex items-baseline gap-1.5">
                    <div className={`font-mono text-xl font-bold ${m.totalPL >= 0 ? 'text-positive' : 'text-negative'}`}>
                      ${m.totalPL.toFixed(2)}
                    </div>
                    {m.prevTradeCount > 0 && (
                      <ChangeIndicator value={calcPercentChange(m.totalPL, m.prevTotalPL)} />
                    )}
                  </div>
                  <div className="text-text-tertiary text-xs mt-1">
                    {m.tradeCount} trade{m.tradeCount !== 1 ? 's' : ''}
                  </div>
                  <div className="flex gap-2 mt-1 text-[10px]">
                    {m.winDays > 0 && <span className="text-positive">{m.winDays} green day{m.winDays !== 1 ? 's' : ''}</span>}
                    {m.lossDays > 0 && <span className="text-negative">{m.lossDays} red day{m.lossDays !== 1 ? 's' : ''}</span>}
                  </div>
                </>
              ) : (
                <div className="text-text-muted text-sm">No trades</div>
              )}
            </div>
          );
        })}
      </div>

      {/* Year summary */}
      <div className={`mt-4 rounded-lg border border-border p-4 ${yearTrades > 0 ? (yearTotal >= 0 ? 'bg-positive/5 border-positive/20' : 'bg-negative/5 border-negative/20') : 'bg-bg-input'}`}>
        <div className="flex items-center justify-between">
          <span className="text-sm font-medium text-text-secondary">Year Total</span>
          <div className="text-right">
            <div className={`font-mono text-xl font-bold ${yearTotal >= 0 ? 'text-positive' : 'text-negative'}`}>
              ${yearTotal.toFixed(2)}
            </div>
            <div className="text-text-tertiary text-xs">{yearTrades} trade{yearTrades !== 1 ? 's' : ''}</div>
          </div>
        </div>
      </div>
    </div>
  );
};

// =====================================================
// TOAST NOTIFICATION
// =====================================================

const Toast = ({ toast, onClose }) => {
  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(onClose, 5000);
    return () => clearTimeout(t);
  }, [toast]);

  if (!toast) return null;

  return (
    <div className="fixed bottom-6 right-6 z-[200] flex items-start gap-3 bg-bg-surface border border-amber-500/40 rounded-xl px-4 py-3 shadow-2xl max-w-sm">
      <div className="w-8 h-8 rounded-full bg-amber-500/15 flex items-center justify-center flex-shrink-0 mt-0.5">
        <svg className="w-4 h-4 text-amber-500" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"></path>
          <line x1="12" y1="9" x2="12" y2="13"></line>
          <line x1="12" y1="17" x2="12.01" y2="17"></line>
        </svg>
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-text-primary text-sm font-semibold">Duplicates skipped</p>
        <p className="text-text-secondary text-xs mt-0.5">{toast.message}</p>
      </div>
      <button onClick={onClose} className="text-text-muted hover:text-text-primary transition-colors flex-shrink-0 mt-0.5">
        <Icons.X className="w-4 h-4" />
      </button>
    </div>
  );
};

// =====================================================
// CSV IMPORT MODAL
// =====================================================

// Strip futures contract month+year suffix (e.g. NQH6 -> NQ, MNQH6 -> MNQ, ESZ25 -> ES)
const parseContractTicker = (name) => {
  if (!name) return name;
  return name.trim().replace(/[FGHJKMNQUVXZ]\d{1,2}$/, '').trim() || name.trim();
};

// Known broker CSV formats — matched by required header presence
const KNOWN_BROKER_FORMATS = [
  {
    name: 'Topstep',
    requiredHeaders: ['ContractName', 'EnteredAt', 'ExitedAt', 'EntryPrice', 'ExitPrice', 'PnL', 'Size', 'Type', 'Fees'],
    transform: (row) => {
      const isShort = row.Type && row.Type.toLowerCase() === 'short';
      const qty = Math.abs(parseFloat(row.Size) || 0);
      const pnl = parseFloat(row.PnL) || 0;
      const fees = parseFloat(row.Fees) || 0;
      return {
        ticker: parseContractTicker(row.ContractName),
        enterTime: row.EnteredAt,
        exitTime: row.ExitedAt,
        enterPrice: row.EntryPrice,
        exitPrice: row.ExitPrice,
        quantity: isShort ? -qty : qty,
        manualPL: pnl - fees,
        comments: '',
      };
    },
  },
  {
    name: 'Tradovate (Positions)',
    requiredHeaders: ['Product', 'Avg. Buy', 'Avg. Sell', 'Paired Qty', 'P/L', 'Buy Fill ID', 'Sell Fill ID', 'Bought Timestamp', 'Sold Timestamp'],
    transform: (row) => {
      const buyFillId = parseInt(row['Buy Fill ID']) || 0;
      const sellFillId = parseInt(row['Sell Fill ID']) || 0;
      const isLong = sellFillId > buyFillId;
      const qty = Math.abs(parseFloat(row['Paired Qty']) || 0);
      return {
        ticker: parseContractTicker(row.Product),
        enterTime: isLong ? row['Bought Timestamp'] : row['Sold Timestamp'],
        exitTime: isLong ? row['Sold Timestamp'] : row['Bought Timestamp'],
        enterPrice: isLong ? row['Avg. Buy'] : row['Avg. Sell'],
        exitPrice: isLong ? row['Avg. Sell'] : row['Avg. Buy'],
        quantity: isLong ? qty : -qty,
        manualPL: parseFloat(row['P/L']) || 0,
        comments: '',
      };
    },
  },
  {
    name: 'Tradovate (Fills)',
    requiredHeaders: ['symbol', 'buyFillId', 'sellFillId', 'qty', 'buyPrice', 'sellPrice', 'pnl', 'boughtTimestamp', 'soldTimestamp'],
    transform: (row) => {
      const buyFillId = parseInt(row.buyFillId) || 0;
      const sellFillId = parseInt(row.sellFillId) || 0;
      const isLong = sellFillId > buyFillId;
      const qty = Math.abs(parseFloat(row.qty) || 0);
      return {
        ticker: parseContractTicker(row.symbol),
        enterTime: isLong ? row.boughtTimestamp : row.soldTimestamp,
        exitTime: isLong ? row.soldTimestamp : row.boughtTimestamp,
        enterPrice: isLong ? row.buyPrice : row.sellPrice,
        exitPrice: isLong ? row.sellPrice : row.buyPrice,
        quantity: isLong ? qty : -qty,
        manualPL: parseFloat(row.pnl) || 0,
        comments: '',
      };
    },
  },
];

const CSV_TRADE_FIELDS = [
  { key: 'ticker', label: 'Ticker', required: true, aliases: ['ticker', 'symbol', 'instrument', 'name', 'asset'] },
  { key: 'enterTime', label: 'Enter Time', required: true, aliases: ['entertime', 'opendate', 'opentime', 'entrydate', 'entrytime', 'entry_time', 'open_date', 'entry date', 'entry time'] },
  { key: 'exitTime', label: 'Exit Time', required: true, aliases: ['exittime', 'closedate', 'closetime', 'exitdate', 'exit_time', 'close_date', 'close date', 'close time'] },
  { key: 'enterPrice', label: 'Enter Price', required: true, aliases: ['enterprice', 'openprice', 'entryprice', 'entry_price', 'open_price', 'entry price', 'open price'] },
  { key: 'exitPrice', label: 'Exit Price', required: true, aliases: ['exitprice', 'closeprice', 'exit_price', 'close_price', 'exit price', 'close price'] },
  { key: 'quantity', label: 'Quantity', required: true, aliases: ['quantity', 'qty', 'size', 'shares', 'contracts', 'lots', 'volume'] },
  { key: 'manualPL', label: 'P/L (Optional)', required: false, aliases: ['pl', 'pnl', 'profit', 'profitloss', 'profit_loss', 'profit/loss', 'net p/l', 'net profit', 'realized p/l'] },
  { key: 'comments', label: 'Comments (Optional)', required: false, aliases: ['comments', 'notes', 'comment', 'note', 'description'] },
];

const CSVImportModal = ({ isOpen, onClose, triggerReload, onDuplicatesSkipped }) => {
  const [step, setStep] = useState(1);
  const [csvData, setCsvData] = useState([]);
  const [csvHeaders, setCsvHeaders] = useState([]);
  const [columnMap, setColumnMap] = useState({});
  const [mappedTrades, setMappedTrades] = useState([]);
  const [importing, setImporting] = useState(false);
  const [importResult, setImportResult] = useState(null);
  const [error, setError] = useState(null);
  const [detectedFormat, setDetectedFormat] = useState(null);

  useEffect(() => {
    if (!isOpen) {
      setStep(1); setCsvData([]); setCsvHeaders([]); setColumnMap({});
      setMappedTrades([]); setImporting(false); setImportResult(null);
      setError(null); setDetectedFormat(null);
    }
  }, [isOpen]);

  const handleFileUpload = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    setError(null);

    Papa.parse(file, {
      header: true,
      skipEmptyLines: true,
      complete: (results) => {
        if (results.errors.length > 0) {
          setError(`CSV parse error: ${results.errors[0].message}`);
          return;
        }
        if (results.data.length === 0) {
          setError('CSV file is empty');
          return;
        }

        const headers = results.meta.fields || [];

        // Check for a known broker format first
        const knownFormat = KNOWN_BROKER_FORMATS.find(fmt =>
          fmt.requiredHeaders.every(h => headers.includes(h))
        );

        if (knownFormat) {
          const trades = results.data
            .map(knownFormat.transform)
            .filter(t => t.ticker && t.enterTime && t.exitTime);
          setDetectedFormat(knownFormat.name);
          setMappedTrades(trades);
          setStep(3);
          return;
        }

        // Unknown format — fall through to manual column mapping
        setCsvData(results.data);
        setCsvHeaders(headers);
        const autoMap = {};
        CSV_TRADE_FIELDS.forEach(field => {
          const match = headers.find(h =>
            field.aliases.some(alias => h.toLowerCase().replace(/[^a-z0-9]/g, '').includes(alias.replace(/[^a-z0-9]/g, '')))
          );
          if (match) autoMap[field.key] = match;
        });
        setColumnMap(autoMap);
        setStep(2);
      },
    });
  };

  const handleMapConfirm = () => {
    setError(null);
    const missing = CSV_TRADE_FIELDS.filter(f => f.required && !columnMap[f.key]);
    if (missing.length > 0) {
      setError(`Missing required mappings: ${missing.map(f => f.label).join(', ')}`);
      return;
    }

    const trades = csvData.map(row => {
      const trade = {};
      CSV_TRADE_FIELDS.forEach(field => {
        if (columnMap[field.key]) {
          trade[field.key] = row[columnMap[field.key]];
        }
      });
      return trade;
    }).filter(t => t.ticker && t.enterTime && t.exitTime)
      .map(t => ({ ...t, ticker: parseContractTicker(t.ticker) }));

    setMappedTrades(trades);
    setStep(3);
  };

  const handleImport = async () => {
    setImporting(true);
    setError(null);
    try {
      // CSV timestamps are in EST with no timezone info. Append the EST offset so the
      // server stores the correct UTC value instead of treating them as UTC.
      const toESTIso = (ts) => {
        if (!ts) return ts;
        const s = String(ts).trim();
        const offset = getESTOffset(new Date(s));
        // Normalize "YYYY-MM-DD HH:MM:SS" → "YYYY-MM-DDTHH:MM:SS" for reliable parsing
        const normalized = s.replace(/^(\d{4}-\d{2}-\d{2}) (\d{2}:)/, '$1T$2');
        const d = new Date(normalized + offset);
        return isNaN(d.getTime()) ? s : d.toISOString();
      };
      const tradesToSend = mappedTrades.map(t => ({
        ...t,
        enterTime: toESTIso(t.enterTime),
        exitTime: toESTIso(t.exitTime),
      }));
      const response = await authFetch('/api/importTrades', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ trades: tradesToSend }),
      });
      const data = await response.json();
      if (data.error) {
        setError(data.error);
      } else {
        setImportResult(data);
        triggerReload();
        if (data.skipped > 0 && onDuplicatesSkipped) {
          onDuplicatesSkipped(data.skipped);
        }
      }
    } catch (err) {
      setError('Import failed. Please try again.');
    }
    setImporting(false);
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-bg-surface border border-border rounded-xl w-full max-w-2xl max-h-[85vh] flex flex-col" onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-border">
          <div>
            <h2 className="text-lg font-semibold text-text-primary">Import Trades from CSV</h2>
            <p className="text-text-tertiary text-xs mt-0.5">Step {importResult ? 3 : step} of 3</p>
          </div>
          <button className="text-text-secondary hover:text-text-primary transition-colors" onClick={onClose}>
            <Icons.X />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-6">
          {error && (
            <div className="mb-4 p-3 bg-negative/10 border border-negative/30 rounded-lg text-negative text-sm">{error}</div>
          )}

          {/* Step 1: Upload */}
          {step === 1 && (
            <div className="text-center py-8">
              <Icons.Download className="w-12 h-12 text-text-muted mx-auto mb-4" />
              <h3 className="text-text-primary font-semibold mb-2">Upload CSV File</h3>
              <p className="text-text-tertiary text-sm mb-6">Select a CSV file with your trade history. Headers should include ticker, dates, prices, and quantity.</p>
              <label className="inline-flex items-center gap-2 px-6 py-3 bg-accent text-accent-text font-semibold rounded-lg hover:brightness-110 transition-all cursor-pointer">
                <Icons.Plus className="w-4 h-4" />
                Choose File
                <input type="file" accept=".csv" onChange={handleFileUpload} className="hidden" />
              </label>
            </div>
          )}

          {/* Step 2: Map columns */}
          {step === 2 && (
            <div className="space-y-4">
              <p className="text-text-secondary text-sm">Map your CSV columns to trade fields. We auto-detected some matches.</p>
              <div className="space-y-3">
                {CSV_TRADE_FIELDS.map(field => (
                  <div key={field.key} className="flex items-center gap-3">
                    <div className="w-40 flex-shrink-0">
                      <span className="text-text-primary text-sm font-medium">{field.label}</span>
                      {field.required && <span className="text-negative text-xs ml-1">*</span>}
                    </div>
                    <select
                      value={columnMap[field.key] || ''}
                      onChange={(e) => setColumnMap(prev => ({ ...prev, [field.key]: e.target.value || undefined }))}
                      className="flex-1 px-3 py-2 bg-bg-input border border-border rounded-lg text-text-primary text-sm focus:outline-none focus:border-accent transition-colors"
                    >
                      <option value="">-- Skip --</option>
                      {csvHeaders.map(h => (
                        <option key={h} value={h}>{h}</option>
                      ))}
                    </select>
                  </div>
                ))}
              </div>
              <p className="text-text-muted text-xs">{csvData.length} rows found in CSV</p>
            </div>
          )}

          {/* Step 3: Preview & Confirm */}
          {step === 3 && !importResult && (
            <div className="space-y-4">
              {detectedFormat && (
                <div className="flex items-center gap-2 px-3 py-2 bg-positive/10 border border-positive/20 rounded-lg">
                  <span className="w-1.5 h-1.5 rounded-full bg-positive flex-shrink-0"></span>
                  <span className="text-positive text-xs font-medium">{detectedFormat} format detected — columns mapped automatically</span>
                </div>
              )}
              <p className="text-text-secondary text-sm">{mappedTrades.length} trades ready to import. Preview below (showing first 50):</p>
              <div className="overflow-x-auto border border-border rounded-lg">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="border-b border-border bg-bg-input">
                      <th className="px-3 py-2 text-left text-text-tertiary font-medium">#</th>
                      <th className="px-3 py-2 text-left text-text-tertiary font-medium">Ticker</th>
                      <th className="px-3 py-2 text-left text-text-tertiary font-medium">Enter Time</th>
                      <th className="px-3 py-2 text-left text-text-tertiary font-medium">Exit Time</th>
                      <th className="px-3 py-2 text-right text-text-tertiary font-medium">Entry $</th>
                      <th className="px-3 py-2 text-right text-text-tertiary font-medium">Exit $</th>
                      <th className="px-3 py-2 text-right text-text-tertiary font-medium">Qty</th>
                    </tr>
                  </thead>
                  <tbody>
                    {mappedTrades.slice(0, 50).map((t, i) => (
                      <tr key={i} className="border-b border-border/50">
                        <td className="px-3 py-1.5 text-text-muted">{i + 1}</td>
                        <td className="px-3 py-1.5 font-mono text-text-primary font-semibold">{t.ticker}</td>
                        <td className="px-3 py-1.5 text-text-secondary">{t.enterTime}</td>
                        <td className="px-3 py-1.5 text-text-secondary">{t.exitTime}</td>
                        <td className="px-3 py-1.5 text-right font-mono text-text-secondary">{t.enterPrice}</td>
                        <td className="px-3 py-1.5 text-right font-mono text-text-secondary">{t.exitPrice}</td>
                        <td className="px-3 py-1.5 text-right font-mono text-text-secondary">{t.quantity}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {mappedTrades.length > 50 && (
                <p className="text-text-muted text-xs">...and {mappedTrades.length - 50} more</p>
              )}
            </div>
          )}

          {/* Import success */}
          {importResult && (
            <div className="text-center py-8">
              <div className="w-16 h-16 bg-positive/20 rounded-full flex items-center justify-center mx-auto mb-4">
                <Icons.Check className="w-8 h-8 text-positive" />
              </div>
              <h3 className="text-text-primary font-semibold text-lg mb-2">Import Complete</h3>
              <p className="text-text-secondary text-sm">{importResult.imported} trade{importResult.imported !== 1 ? 's' : ''} imported successfully.{importResult.skipped > 0 ? ` ${importResult.skipped} duplicate${importResult.skipped !== 1 ? 's' : ''} skipped.` : ''}</p>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between px-6 py-4 border-t border-border">
          <div>
            {step > 1 && !importResult && (
              <button className="px-4 py-2 text-sm text-text-secondary hover:text-text-primary transition-colors" onClick={() => setStep(step - 1)}>
                Back
              </button>
            )}
          </div>
          <div className="flex gap-3">
            <button className="px-4 py-2 text-sm text-text-secondary hover:text-text-primary transition-colors" onClick={onClose}>
              {importResult ? 'Done' : 'Cancel'}
            </button>
            {step === 2 && (
              <button
                className="px-4 py-2 bg-accent text-accent-text text-sm font-semibold rounded-lg hover:brightness-110 transition-all"
                onClick={handleMapConfirm}
              >
                Preview Trades
              </button>
            )}
            {step === 3 && !importResult && (
              <button
                className="px-4 py-2 bg-accent text-accent-text text-sm font-semibold rounded-lg hover:brightness-110 transition-all disabled:opacity-50"
                onClick={handleImport}
                disabled={importing}
              >
                {importing ? 'Importing...' : `Import ${mappedTrades.length} Trades`}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

// =====================================================
// TRADE LIST PAGE
// =====================================================
const TradeListPage = ({ trades, triggerReload, onEdit, subscriptionStatus, onOpenForm, onOpenImport, tags, strategyRules }) => {
  const [searchTicker, setSearchTicker] = useState('');
  const [sortField, setSortField] = useState('exitTime');
  const [sortDir, setSortDir] = useState('desc');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [sideFilters, setSideFilters] = useState([]);
  const [filterTags, setFilterTags] = useState([]);
  const [showNewTagInline, setShowNewTagInline] = useState(false);
  const [inlineTagName, setInlineTagName] = useState('');
  const [inlineTagColor, setInlineTagColor] = useState(TAG_COLOR_PRESETS[0]);
  const [inlineTagCreating, setInlineTagCreating] = useState(false);
  const [expandedTradeId, setExpandedTradeId] = useState(null);
  const [tradeChecksMap, setTradeChecksMap] = useState({});
  const [checksLoading, setChecksLoading] = useState(false);
  const [deletingIds, setDeletingIds] = useState(new Set());
  const [deleteConfirmId, setDeleteConfirmId] = useState(null);
  const [showColumnMenu, setShowColumnMenu] = useState(false);
  const [selectedTradeIds, setSelectedTradeIds] = useState(new Set());
  const [bulkTagPickerOpen, setBulkTagPickerOpen] = useState(false);
  const [bulkDeleteConfirm, setBulkDeleteConfirm] = useState(false);
  const [bulkActionLoading, setBulkActionLoading] = useState(false);

  useEffect(() => {
    setSelectedTradeIds(new Set());
  }, [searchTicker, dateFrom, dateTo, sideFilters, filterTags]);

  const COLUMN_DEFS = [
    { id: 'date', label: 'Date', alwaysOn: true },
    { id: 'ticker', label: 'Ticker', alwaysOn: true },
    { id: 'tags', label: 'Tags' },
    { id: 'entry', label: 'Entry' },
    { id: 'exit', label: 'Exit' },
    { id: 'qty', label: 'Qty' },
    { id: 'pl', label: 'P/L', alwaysOn: true },
    { id: 'duration', label: 'Duration' },
  ];
  const DEFAULT_COLUMNS = ['date','ticker','tags','entry','exit','qty','pl','duration'];
  const [visibleColumns, setVisibleColumns] = useState(() => {
    try {
      const saved = JSON.parse(localStorage.getItem('tradeTableColumns'));
      if (Array.isArray(saved)) return saved;
    } catch {}
    return DEFAULT_COLUMNS;
  });
  const toggleColumn = (colId) => {
    setVisibleColumns(prev => {
      const next = prev.includes(colId) ? prev.filter(c => c !== colId) : [...prev, colId];
      localStorage.setItem('tradeTableColumns', JSON.stringify(next));
      return next;
    });
  };
  const isCol = (colId) => visibleColumns.includes(colId);
  const visibleColCount = visibleColumns.length + 2; // +1 for checkbox, +1 for actions

  const doDelete = async (id) => {
    setDeletingIds(prev => new Set([...prev, id]));
    setDeleteConfirmId(null);
    try {
      const response = await authFetch('/api/removeTrade', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ _id: id }),
      });
      const data = await response.json();
      if (data.error) {
        setDeletingIds(prev => { const s = new Set(prev); s.delete(id); return s; });
      } else {
        triggerReload();
      }
    } catch {
      setDeletingIds(prev => { const s = new Set(prev); s.delete(id); return s; });
    }
  };

  const handleDeleteClick = (id) => {
    if (localStorage.getItem('skipTradeDeleteConfirm') === 'true') {
      doDelete(id);
    } else {
      setDeleteConfirmId(id);
    }
  };

  const isElite = subscriptionStatus && subscriptionStatus.isPremium;
  const tradeRules = strategyRules ? strategyRules.filter(r => r.type === 'trade') : [];

  const fetchTradeChecksForList = async (tradeId) => {
    if (tradeChecksMap[tradeId] !== undefined) return;
    try {
      const resp = await authFetch(`/api/strategy/checks/trade/${tradeId}`);
      const data = await resp.json();
      if (!data.error) setTradeChecksMap(prev => ({ ...prev, [tradeId]: data.checks || [] }));
    } catch (err) {
      console.error('Failed to fetch trade checks:', err);
    }
  };

  const handleTradeRuleToggle = async (tradeId, ruleId, followed) => {
    setChecksLoading(true);
    try {
      const resp = await authFetch('/api/strategy/checks/trade', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tradeId, ruleId, followed }),
      });
      const check = await resp.json();
      if (!check.error) {
        setTradeChecksMap(prev => {
          const existing = prev[tradeId] || [];
          const filtered = existing.filter(ch => ch.ruleId !== ruleId);
          return { ...prev, [tradeId]: [...filtered, check] };
        });
      }
    } catch (err) {
      console.error('Failed to toggle trade check:', err);
    } finally {
      setChecksLoading(false);
    }
  };

  const handleInlineCreateTag = async () => {
    if (!inlineTagName.trim() || inlineTagCreating) return;
    setInlineTagCreating(true);
    try {
      const response = await authFetch('/api/makeTag', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: inlineTagName.trim(), color: inlineTagColor }),
      });
      const data = await response.json();
      if (!data.error) {
        setInlineTagName('');
        setInlineTagColor(TAG_COLOR_PRESETS[0]);
        setShowNewTagInline(false);
        triggerReload();
      }
    } catch (err) {
      console.error('Failed to create tag:', err);
    }
    setInlineTagCreating(false);
  };

  /**
   * handleBulkEval - Marks or unmarks selected trades as evaluation trades.
   * Calls POST /api/bulkUpdateTrades with action 'markEval' or 'unmarkEval'.
   * Clears selection and triggers data reload on success.
   * @param {boolean} isEval - true to mark as eval, false to unmark
   */
  const handleBulkEval = async (isEval) => {
    if (selectedTradeIds.size === 0 || bulkActionLoading) return;
    setBulkActionLoading(true);
    try {
      const response = await authFetch('/api/bulkUpdateTrades', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tradeIds: [...selectedTradeIds],
          action: isEval ? 'markEval' : 'unmarkEval',
        }),
      });
      const data = await response.json();
      if (!data.error) {
        setSelectedTradeIds(new Set());
        triggerReload();
      }
    } catch (err) {
      console.error('Bulk eval error:', err);
    }
    setBulkActionLoading(false);
  };

  /**
   * handleBulkAddTags - Adds one or more tags to all selected trades.
   * Calls POST /api/bulkUpdateTrades with action 'addTags' and tag ID array.
   * Closes tag picker, clears selection, and triggers reload on success.
   * @param {string[]} tagIds - Array of tag IDs to add
   */
  const handleBulkAddTags = async (tagIds) => {
    if (selectedTradeIds.size === 0 || tagIds.length === 0 || bulkActionLoading) return;
    setBulkActionLoading(true);
    try {
      const response = await authFetch('/api/bulkUpdateTrades', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tradeIds: [...selectedTradeIds],
          action: 'addTags',
          tags: tagIds,
        }),
      });
      const data = await response.json();
      if (!data.error) {
        setBulkTagPickerOpen(false);
        setSelectedTradeIds(new Set());
        triggerReload();
      }
    } catch (err) {
      console.error('Bulk add tags error:', err);
    }
    setBulkActionLoading(false);
  };

  /**
   * handleBulkDelete - Deletes all selected trades after confirmation.
   * Calls POST /api/bulkDeleteTrades with array of trade IDs.
   * Closes confirm modal, clears selection, and triggers reload on success.
   */
  const handleBulkDelete = async () => {
    if (selectedTradeIds.size === 0 || bulkActionLoading) return;
    setBulkActionLoading(true);
    try {
      const response = await authFetch('/api/bulkDeleteTrades', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tradeIds: [...selectedTradeIds] }),
      });
      const data = await response.json();
      if (!data.error) {
        setBulkDeleteConfirm(false);
        setSelectedTradeIds(new Set());
        triggerReload();
      }
    } catch (err) {
      console.error('Bulk delete error:', err);
    }
    setBulkActionLoading(false);
  };

  const handleExportCSV = () => {
    if (filtered.length === 0) return;
    const colMap = [
      { id: 'date', header: 'Date', value: t => new Date(t.exitTime).toISOString(), alwaysOn: true },
      { id: 'ticker', header: 'Ticker', value: t => t.ticker, alwaysOn: true },
      { id: 'tags', header: 'Tags', value: t => {
        if (!t.tags || !tags) return '';
        return t.tags.map(tid => { const tag = tags.find(tg => tg._id === tid); return tag ? tag.name : ''; }).filter(Boolean).join('; ');
      }},
      { id: 'entry', header: 'Enter Price', value: t => t.enterPrice },
      { id: 'exit', header: 'Exit Price', value: t => t.exitPrice },
      { id: 'qty', header: 'Quantity', value: t => t.quantity },
      { id: 'pl', header: 'P/L', value: t => getTradePL(t).toFixed(2), alwaysOn: true },
      { id: 'duration', header: 'Duration', value: t => {
        const dur = new Date(t.exitTime) - new Date(t.enterTime);
        return formatDuration(dur);
      }},
    ];
    const activeCols = colMap.filter(c => c.alwaysOn || visibleColumns.includes(c.id));
    // Always include enter/exit times and comments in export for completeness
    const headers = [...activeCols.map(c => c.header), 'Enter Time', 'Exit Time', 'Comments'];
    const rows = filtered.map(t => {
      return [
        ...activeCols.map(c => c.value(t)),
        new Date(t.enterTime).toISOString(),
        new Date(t.exitTime).toISOString(),
        (t.comments || '').replace(/"/g, '""'),
      ].map(v => `"${v}"`).join(',');
    });
    const csv = [headers.join(','), ...rows].join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `rr-metrics-trades-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  let filtered = deletingIds.size > 0 ? trades.filter(t => !deletingIds.has(t._id)) : trades;

  if (searchTicker) {
    const terms = searchTicker.split(',').map(s => s.trim().toLowerCase()).filter(Boolean);
    if (terms.length > 0) {
      filtered = filtered.filter(t => terms.some(term => t.ticker.toLowerCase().includes(term)));
    }
  }

  if (filterTags.length > 0) {
    filtered = filtered.filter(t =>
      t.tags && t.tags.some(tagId => filterTags.includes(tagId))
    );
  }

  if (sideFilters.length > 0) {
    filtered = filtered.filter(t => {
      const pl = getTradePL(t);
      return sideFilters.every(f => {
        if (f === 'wins') return pl > 0;
        if (f === 'losses') return pl < 0;
        if (f === 'long') return t.quantity > 0;
        if (f === 'short') return t.quantity < 0;
        return true;
      });
    });
  }

  if (dateFrom) {
    const from = new Date(dateFrom);
    filtered = filtered.filter(t => new Date(t.exitTime) >= from);
  }
  if (dateTo) {
    const to = new Date(dateTo);
    to.setHours(23, 59, 59, 999);
    filtered = filtered.filter(t => new Date(t.exitTime) <= to);
  }

  filtered = [...filtered].sort((a, b) => {
    let valA, valB;
    if (sortField === 'ticker') {
      valA = a.ticker.toLowerCase();
      valB = b.ticker.toLowerCase();
    } else if (sortField === 'pl') {
      valA = getTradePL(a);
      valB = getTradePL(b);
    } else {
      valA = new Date(a[sortField]);
      valB = new Date(b[sortField]);
    }
    if (valA < valB) return sortDir === 'asc' ? -1 : 1;
    if (valA > valB) return sortDir === 'asc' ? 1 : -1;
    return 0;
  });

  const toggleSort = (field) => {
    if (sortField === field) {
      setSortDir(sortDir === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortDir('desc');
    }
  };

  const SortIcon = ({ field }) => {
    if (sortField !== field) return null;
    return sortDir === 'asc' ? <Icons.ChevronUp className="w-3 h-3 ml-1 inline" /> : <Icons.ChevronDown className="w-3 h-3 ml-1 inline" />;
  };

  const formatDateTime = (dateString) => formatDateEST(dateString);

  const formatTime = (dateString) => formatTimeEST(dateString);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-text-primary">Trades</h1>
          <p className="text-text-secondary text-sm mt-1">Manage and review your trade history</p>
        </div>
        <div className="flex items-center gap-3">
          <button
            className="flex items-center gap-2 px-4 py-2.5 bg-bg-surface border border-border text-text-secondary text-sm font-semibold rounded-lg hover:text-text-primary hover:border-accent transition-all disabled:opacity-40"
            onClick={handleExportCSV}
            disabled={filtered.length === 0}
          >
            <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
              <polyline points="17 8 12 3 7 8"></polyline>
              <line x1="12" y1="3" x2="12" y2="15"></line>
            </svg>
            Export CSV
          </button>
          <button
            className="flex items-center gap-2 px-4 py-2.5 bg-bg-surface border border-border text-text-secondary text-sm font-semibold rounded-lg hover:text-text-primary hover:border-accent transition-all"
            onClick={onOpenImport}
          >
            <Icons.Download className="w-4 h-4" />
            Import CSV
          </button>
          {subscriptionStatus && subscriptionStatus.isPremium && (subscriptionStatus.tradeCount == null || subscriptionStatus.tradeCount < 50) && (
            <button className="flex items-center gap-2 px-4 py-2.5 bg-accent text-accent-text text-sm font-semibold rounded-lg hover:brightness-110 transition-all" onClick={onOpenForm}>
              <Icons.Plus className="w-4 h-4" />
              New Trade
            </button>
          )}
        </div>
      </div>

      {/* Filter bar */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative flex-1 min-w-[200px] max-w-xs">
          <Icons.Search className="absolute left-3 top-1/2 -translate-y-1/2 text-text-muted w-4 h-4" />
          <input
            type="text"
            placeholder="Search tickers (comma-separated)..."
            value={searchTicker}
            onChange={(e) => setSearchTicker(e.target.value.toUpperCase())}
            className="w-full pl-9 pr-4 py-2.5 bg-bg-input border border-border rounded-lg text-text-primary text-sm placeholder-text-muted focus:outline-none focus:border-accent transition-colors"
            style={{ textTransform: 'uppercase' }}
            autoComplete="off"
          />
        </div>
        <input
          type="date"
          value={dateFrom}
          onChange={(e) => setDateFrom(e.target.value)}
          className="px-3 py-2.5 bg-bg-input border border-border rounded-lg text-text-primary text-sm focus:outline-none focus:border-accent transition-colors"
        />
        <input
          type="date"
          value={dateTo}
          onChange={(e) => setDateTo(e.target.value)}
          className="px-3 py-2.5 bg-bg-input border border-border rounded-lg text-text-primary text-sm focus:outline-none focus:border-accent transition-colors"
        />
        <div className="flex items-center gap-1.5">
          {[
            { id: 'long', label: 'Long', activeClass: 'bg-positive/15 border-positive/50 text-positive' },
            { id: 'short', label: 'Short', activeClass: 'bg-negative/15 border-negative/50 text-negative' },
            { id: 'wins', label: 'Wins', activeClass: 'bg-positive/15 border-positive/50 text-positive' },
            { id: 'losses', label: 'Losses', activeClass: 'bg-negative/15 border-negative/50 text-negative' },
          ].map(opt => {
            const isActive = sideFilters.includes(opt.id);
            return (
              <button
                key={opt.id}
                className={`px-2.5 py-1.5 rounded-full text-xs font-medium border transition-colors ${
                  isActive
                    ? opt.activeClass
                    : 'bg-bg-input border-border text-text-secondary hover:text-text-primary'
                }`}
                onClick={() => setSideFilters(prev =>
                  prev.includes(opt.id) ? prev.filter(f => f !== opt.id) : [...prev, opt.id]
                )}
              >
                {opt.label}
              </button>
            );
          })}
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          {tags && tags.map(tag => {
            const isActive = filterTags.includes(tag._id);
            return (
              <button
                key={tag._id}
                className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-full text-xs font-medium border transition-colors ${
                  !isActive ? 'bg-bg-input border-border text-text-secondary hover:text-text-primary' : ''
                }`}
                style={isActive ? {
                  borderColor: tag.color,
                  backgroundColor: tag.color + '20',
                  color: tag.color,
                } : undefined}
                onClick={() => {
                  setFilterTags(prev =>
                    prev.includes(tag._id)
                      ? prev.filter(id => id !== tag._id)
                      : [...prev, tag._id]
                  );
                }}
              >
                <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: tag.color }}></span>
                {tag.name}
              </button>
            );
          })}
          {!showNewTagInline ? (
            <button
              className="flex items-center gap-1 px-2.5 py-1.5 rounded-full text-xs font-medium border border-dashed border-border text-text-tertiary hover:text-text-primary hover:border-accent transition-colors"
              onClick={() => setShowNewTagInline(true)}
            >
              <Icons.Plus className="w-3 h-3" />
              New Tag
            </button>
          ) : (
            <div className="flex items-center gap-1.5 px-2 py-1 bg-bg-input border border-border rounded-full">
              <input
                type="text"
                value={inlineTagName}
                onChange={(e) => setInlineTagName(e.target.value)}
                placeholder="Tag name"
                className="bg-transparent text-text-primary text-xs focus:outline-none w-20 placeholder-text-muted"
                autoFocus
                onKeyDown={(e) => { if (e.key === 'Enter') handleInlineCreateTag(); if (e.key === 'Escape') { setShowNewTagInline(false); setInlineTagName(''); } }}
              />
              {TAG_COLOR_PRESETS.slice(0, 4).map(color => (
                <button
                  key={color}
                  type="button"
                  className={`w-4 h-4 rounded-full border transition-all flex-shrink-0 ${
                    inlineTagColor === color ? 'border-white scale-110' : 'border-transparent'
                  }`}
                  style={{ backgroundColor: color }}
                  onClick={() => setInlineTagColor(color)}
                />
              ))}
              <button
                className="text-accent text-xs font-semibold hover:brightness-110 disabled:opacity-50 px-1"
                onClick={handleInlineCreateTag}
                disabled={inlineTagCreating || !inlineTagName.trim()}
              >
                {inlineTagCreating ? '...' : 'Add'}
              </button>
              <button
                className="text-text-muted text-xs hover:text-text-primary px-0.5"
                onClick={() => { setShowNewTagInline(false); setInlineTagName(''); }}
              >
                &times;
              </button>
            </div>
          )}
        </div>
        <div className="flex items-center gap-3">
          <span className="text-text-tertiary text-sm">{filtered.length} trade{filtered.length !== 1 ? 's' : ''}</span>
          <div className="relative">
            <button
              onClick={() => setShowColumnMenu(v => !v)}
              className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium text-text-tertiary hover:text-text-primary hover:bg-bg-input border border-border transition-colors"
              title="Toggle columns"
            >
              <Icons.Layers className="w-3.5 h-3.5" />
              Columns
            </button>
            {showColumnMenu && (
              <>
              <div className="fixed inset-0 z-10" onClick={() => setShowColumnMenu(false)} />
              <div className="absolute right-0 top-full mt-1 z-20 bg-bg-surface border border-border rounded-lg shadow-xl p-1.5 min-w-[160px]">
                {COLUMN_DEFS.filter(c => !c.alwaysOn).map(col => (
                  <label
                    key={col.id}
                    className="flex items-center gap-2.5 px-2.5 py-2 rounded-md cursor-pointer hover:bg-bg-input transition-colors"
                  >
                    <div
                      className={`w-4 h-4 rounded border flex items-center justify-center flex-shrink-0 transition-colors ${
                        isCol(col.id) ? 'bg-accent border-accent' : 'border-border'
                      }`}
                      onClick={(e) => { e.preventDefault(); toggleColumn(col.id); }}
                    >
                      {isCol(col.id) && <Icons.Check className="w-3 h-3 text-accent-text" />}
                    </div>
                    <span className="text-sm text-text-secondary">{col.label}</span>
                  </label>
                ))}
              </div>
              </>
            )}
          </div>
        </div>
      </div>

      {/* Bulk action bar — shown when one or more trades are checkbox-selected */}
      {selectedTradeIds.size > 0 && (
        <div className="flex items-center gap-3 px-4 py-3 bg-accent/10 border border-accent/30 rounded-xl">
          <span className="text-sm font-semibold text-text-primary">{selectedTradeIds.size} trade{selectedTradeIds.size !== 1 ? 's' : ''} selected</span>
          <div className="flex items-center gap-2 ml-auto">
            <button
              className="px-3 py-1.5 text-xs font-medium bg-bg-surface border border-border rounded-lg text-text-secondary hover:text-text-primary hover:border-accent transition-all disabled:opacity-50"
              onClick={() => handleBulkEval(true)}
              disabled={bulkActionLoading}
            >
              Mark Eval
            </button>
            <button
              className="px-3 py-1.5 text-xs font-medium bg-bg-surface border border-border rounded-lg text-text-secondary hover:text-text-primary hover:border-accent transition-all disabled:opacity-50"
              onClick={() => handleBulkEval(false)}
              disabled={bulkActionLoading}
            >
              Unmark Eval
            </button>
            <div className="relative">
              <button
                className="px-3 py-1.5 text-xs font-medium bg-bg-surface border border-border rounded-lg text-text-secondary hover:text-text-primary hover:border-accent transition-all disabled:opacity-50"
                onClick={() => setBulkTagPickerOpen(v => !v)}
                disabled={bulkActionLoading}
              >
                Add Tags
              </button>
              {bulkTagPickerOpen && (
                <>
                  <div className="fixed inset-0 z-10" onClick={() => setBulkTagPickerOpen(false)} />
                  <div className="absolute left-0 top-full mt-1 z-20 bg-bg-surface border border-border rounded-lg shadow-xl p-2 min-w-[180px]">
                    {tags && tags.map(tag => (
                      <button
                        key={tag._id}
                        className="flex items-center gap-2 w-full px-3 py-2 rounded-md text-sm text-text-secondary hover:bg-bg-input hover:text-text-primary transition-colors"
                        onClick={() => handleBulkAddTags([tag._id])}
                      >
                        <span className="w-3 h-3 rounded-full flex-shrink-0" style={{ backgroundColor: tag.color }}></span>
                        {tag.name}
                      </button>
                    ))}
                    {(!tags || tags.length === 0) && (
                      <p className="text-text-muted text-xs px-3 py-2">No tags created yet</p>
                    )}
                  </div>
                </>
              )}
            </div>
            <button
              className="px-3 py-1.5 text-xs font-medium bg-negative/10 border border-negative/30 rounded-lg text-negative hover:bg-negative/20 transition-all disabled:opacity-50"
              onClick={() => setBulkDeleteConfirm(true)}
              disabled={bulkActionLoading}
            >
              Delete
            </button>
            <button
              className="px-3 py-1.5 text-xs font-medium text-text-tertiary hover:text-text-primary transition-colors"
              onClick={() => setSelectedTradeIds(new Set())}
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Table */}
      <div className="bg-bg-surface border border-border rounded-xl overflow-hidden">
        {filtered.length === 0 ? (
          <div className="text-center py-16">
            <p className="text-text-tertiary text-lg">No trades yet</p>
            <p className="text-text-muted text-sm mt-1">Add your first trade to get started</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-border">
                  <th className="px-4 py-3 w-10">
                    <input
                      type="checkbox"
                      className="rounded border-border accent-accent"
                      checked={filtered.length > 0 && filtered.every(t => selectedTradeIds.has(t._id))}
                      onChange={(e) => {
                        if (e.target.checked) {
                          setSelectedTradeIds(new Set(filtered.map(t => t._id)));
                        } else {
                          setSelectedTradeIds(new Set());
                        }
                      }}
                    />
                  </th>
                  <th className="text-left px-4 py-3 text-xs font-medium text-text-tertiary uppercase tracking-wider cursor-pointer hover:text-text-primary" onClick={() => toggleSort('exitTime')}>
                    Date <SortIcon field="exitTime" />
                  </th>
                  <th className="text-left px-4 py-3 text-xs font-medium text-text-tertiary uppercase tracking-wider cursor-pointer hover:text-text-primary" onClick={() => toggleSort('ticker')}>
                    Ticker <SortIcon field="ticker" />
                  </th>
                  {isCol('tags') && <th className="text-left px-4 py-3 text-xs font-medium text-text-tertiary uppercase tracking-wider">Tags</th>}
                  {isCol('entry') && <th className="text-left px-4 py-3 text-xs font-medium text-text-tertiary uppercase tracking-wider">Entry</th>}
                  {isCol('exit') && <th className="text-left px-4 py-3 text-xs font-medium text-text-tertiary uppercase tracking-wider">Exit</th>}
                  {isCol('qty') && <th className="text-left px-4 py-3 text-xs font-medium text-text-tertiary uppercase tracking-wider">Qty</th>}
                  <th className="text-left px-4 py-3 text-xs font-medium text-text-tertiary uppercase tracking-wider cursor-pointer hover:text-text-primary" onClick={() => toggleSort('pl')}>
                    P/L <SortIcon field="pl" />
                  </th>
                  {isCol('duration') && <th className="text-left px-4 py-3 text-xs font-medium text-text-tertiary uppercase tracking-wider">Duration</th>}
                  <th className="text-right px-4 py-3 text-xs font-medium text-text-tertiary uppercase tracking-wider">Actions</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map(trade => {
                  const pl = getTradePL(trade);
                  const duration = new Date(trade.exitTime) - new Date(trade.enterTime);
                  const isExpanded = expandedTradeId === trade._id;
                  const tradeTags = tags && trade.tags ? tags.filter(tag => trade.tags.includes(tag._id)) : [];
                  return (
                    <React.Fragment key={trade._id}>
                      <tr
                        className="border-b border-border/50 hover:bg-bg-input/50 transition-colors cursor-pointer"
                        onClick={() => onEdit(trade)}
                      >
                        <td className="px-4 py-3 w-10" onClick={(e) => e.stopPropagation()}>
                          <input
                            type="checkbox"
                            className="rounded border-border accent-accent"
                            checked={selectedTradeIds.has(trade._id)}
                            onChange={() => {
                              setSelectedTradeIds(prev => {
                                const next = new Set(prev);
                                if (next.has(trade._id)) next.delete(trade._id);
                                else next.add(trade._id);
                                return next;
                              });
                            }}
                          />
                        </td>
                        <td className="px-4 py-3">
                          <div className="text-text-primary text-sm">{formatDateTime(trade.exitTime)}</div>
                          <div className="text-text-muted text-xs">{formatTime(trade.enterTime)} - {formatTime(trade.exitTime)}</div>
                        </td>
                        <td className="px-4 py-3">
                          <span className="font-mono text-sm font-semibold text-text-primary">{trade.ticker}</span>
                          <span className={`ml-1.5 inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-bold uppercase ${
                            trade.quantity > 0
                              ? 'bg-positive/15 text-positive'
                              : 'bg-negative/15 text-negative'
                          }`}>
                            {trade.quantity > 0 ? 'LONG' : 'SHORT'}
                          </span>
                          {trade.isEval && (
                            <span className="ml-1 inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-bold uppercase bg-accent/15 text-accent">EVAL</span>
                          )}
                        </td>
                        {isCol('tags') && (
                          <td className="px-4 py-3">
                            <div className="flex flex-wrap gap-1">
                              {trade.tags && trade.tags.map(tagId => {
                                const tag = tags && tags.find(t => t._id === tagId);
                                if (!tag) return null;
                                return (
                                  <span
                                    key={tagId}
                                    className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium"
                                    style={{ backgroundColor: tag.color + '20', color: tag.color }}
                                  >
                                    {tag.name}
                                  </span>
                                );
                              })}
                            </div>
                          </td>
                        )}
                        {isCol('entry') && <td className="px-4 py-3 font-mono text-sm text-text-secondary">${trade.enterPrice.toFixed(2)}</td>}
                        {isCol('exit') && <td className="px-4 py-3 font-mono text-sm text-text-secondary">${trade.exitPrice.toFixed(2)}</td>}
                        {isCol('qty') && <td className="px-4 py-3 font-mono text-sm text-text-secondary">{trade.quantity}</td>}
                        <td className="px-4 py-3">
                          <span className={`font-mono text-sm font-semibold ${pl >= 0 ? 'text-positive' : 'text-negative'}`}>
                            {pl >= 0 ? '+' : ''}${pl.toFixed(2)}
                          </span>
                          {trade.manualPL !== null && trade.manualPL !== undefined && (
                            <span className="text-text-muted text-xs ml-1">(M)</span>
                          )}
                        </td>
                        {isCol('duration') && <td className="px-4 py-3 text-sm text-text-secondary">{formatDuration(duration)}</td>}
                        <td className="px-4 py-3">
                          <div className="flex items-center justify-end gap-2">
                            <button
                              className="p-1.5 rounded-lg text-text-tertiary hover:text-text-primary hover:bg-bg-input transition-colors"
                              onClick={(e) => { e.stopPropagation(); onEdit(trade); }}
                              title="Edit"
                            >
                              <Icons.Edit />
                            </button>
                            <button
                              className="p-1.5 rounded-lg text-text-tertiary hover:text-negative hover:bg-negative/10 transition-colors"
                              onClick={(e) => { e.stopPropagation(); handleDeleteClick(trade._id); }}
                              title="Delete"
                            >
                              <Icons.Trash />
                            </button>
                          </div>
                        </td>
                      </tr>
                      {isExpanded && (
                        <tr className="border-b border-border/50">
                          <td colSpan={visibleColCount} className="px-6 py-4 bg-bg-input/20">
                            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                              <div className="space-y-3">
                                {tradeTags.length > 0 && (
                                  <div>
                                    <span className="text-text-muted text-[10px] font-semibold uppercase tracking-wider">Tags</span>
                                    <div className="flex flex-wrap gap-1.5 mt-1.5">
                                      {tradeTags.map(tag => (
                                        <span key={tag._id} className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium" style={{ backgroundColor: tag.color + '22', color: tag.color }}>
                                          <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: tag.color }}></span>
                                          {tag.name}
                                        </span>
                                      ))}
                                    </div>
                                  </div>
                                )}
                                {trade.comments && (
                                  <div>
                                    <span className="text-text-muted text-[10px] font-semibold uppercase tracking-wider">Notes</span>
                                    <div className="text-xs text-text-secondary bg-bg-surface rounded-lg px-3 py-2 mt-1.5">{trade.comments}</div>
                                  </div>
                                )}
                                {trade.screenshot && (
                                  <div>
                                    <span className="text-text-muted text-[10px] font-semibold uppercase tracking-wider">Screenshot</span>
                                    <img src={trade.screenshot} alt="Trade screenshot" className="rounded-lg border border-border max-h-48 w-full object-contain bg-bg-surface mt-1.5" />
                                  </div>
                                )}
                                {!trade.comments && !trade.screenshot && tradeTags.length === 0 && (!isElite || tradeRules.length === 0) && (
                                  <p className="text-text-muted text-xs">No notes or screenshot attached to this trade.</p>
                                )}
                              </div>
                              {isElite && tradeRules.length > 0 && (
                                <div>
                                  <span className="text-text-muted text-[10px] font-semibold uppercase tracking-wider">Trade Rules</span>
                                  <div className="mt-1.5">
                                    <RuleChecklist
                                      rules={tradeRules}
                                      checks={tradeChecksMap[trade._id] || []}
                                      onToggle={(ruleId, followed) => handleTradeRuleToggle(trade._id, ruleId, followed)}
                                      loading={checksLoading}
                                    />
                                  </div>
                                </div>
                              )}
                            </div>
                          </td>
                        </tr>
                      )}
                    </React.Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {deleteConfirmId && (
        <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4" onClick={() => setDeleteConfirmId(null)}>
          <div className="bg-bg-surface border border-border rounded-xl p-6 w-full max-w-sm shadow-xl" onClick={e => e.stopPropagation()}>
            <h3 className="text-text-primary font-semibold mb-1">Delete Trade</h3>
            <p className="text-text-secondary text-sm mb-5">Are you sure you want to delete this trade? This cannot be undone.</p>
            <label className="flex items-center gap-2 text-text-tertiary text-sm mb-5 cursor-pointer select-none">
              <input
                type="checkbox"
                className="rounded"
                onChange={e => {
                  if (e.target.checked) localStorage.setItem('skipTradeDeleteConfirm', 'true');
                  else localStorage.removeItem('skipTradeDeleteConfirm');
                }}
              />
              Do not show again
            </label>
            <div className="flex gap-2 justify-end">
              <button
                className="px-4 py-2 text-sm text-text-secondary hover:text-text-primary transition-colors"
                onClick={() => setDeleteConfirmId(null)}
              >Cancel</button>
              <button
                className="px-4 py-2 text-sm bg-negative text-white rounded-lg hover:opacity-80 transition-opacity"
                onClick={() => doDelete(deleteConfirmId)}
              >Delete</button>
            </div>
          </div>
        </div>
      )}

      {/* Bulk delete confirmation modal */}
      {bulkDeleteConfirm && (
        <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4" onClick={() => setBulkDeleteConfirm(false)}>
          <div className="bg-bg-surface border border-border rounded-xl p-6 w-full max-w-sm shadow-xl" onClick={e => e.stopPropagation()}>
            <h3 className="text-text-primary font-semibold mb-1">Delete {selectedTradeIds.size} Trade{selectedTradeIds.size !== 1 ? 's' : ''}</h3>
            <p className="text-text-secondary text-sm mb-5">Are you sure you want to delete {selectedTradeIds.size} trade{selectedTradeIds.size !== 1 ? 's' : ''}? This cannot be undone.</p>
            <div className="flex gap-2 justify-end">
              <button
                className="px-4 py-2 text-sm text-text-secondary hover:text-text-primary transition-colors"
                onClick={() => setBulkDeleteConfirm(false)}
              >Cancel</button>
              <button
                className="px-4 py-2 text-sm bg-negative text-white rounded-lg hover:opacity-80 transition-opacity disabled:opacity-50"
                onClick={handleBulkDelete}
                disabled={bulkActionLoading}
              >{bulkActionLoading ? 'Deleting...' : 'Delete'}</button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
};

// =====================================================
// ANALYTICS PAGE
// =====================================================
const AnalyticsPage = ({ trades: allTrades, evalFilter, setEvalFilter }) => {
  const canvasRef = useRef(null);
  const barCanvasRef = useRef(null);
  const timeCanvasRef = useRef(null);
  const dayBarRects = useRef([]);
  const timeBarRects = useRef([]);
  const [hoveredDayIndex, setHoveredDayIndex] = useState(null);
  const [hoveredTimeIndex, setHoveredTimeIndex] = useState(null);
  const [period, setPeriod] = useState('all');

  const baseTradesForPeriod = applyEvalFilter(allTrades, evalFilter);
  const dateRange = getDateRange(period);
  const trades = filterTradesByDateRange(baseTradesForPeriod, dateRange);
  const stats = calculateAnalytics(trades);

  const prevRange = getPreviousDateRange(period);
  const prevTrades = prevRange ? filterTradesByDateRange(baseTradesForPeriod, prevRange) : null;
  const prevStats = prevTrades ? calculateAnalytics(prevTrades) : null;
  const showChange = period !== 'all' && prevStats;

  // Cumulative P/L chart
  useEffect(() => {
    if (!canvasRef.current || trades.length === 0) return;

    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    const dpr = window.devicePixelRatio || 1;

    const rect = canvas.parentElement.getBoundingClientRect();
    canvas.width = rect.width * dpr;
    canvas.height = 300 * dpr;
    canvas.style.width = rect.width + 'px';
    canvas.style.height = '300px';
    ctx.scale(dpr, dpr);

    const w = rect.width;
    const h = 300;
    const padding = { top: 30, right: 20, bottom: 40, left: 60 };

    const sorted = [...trades].sort((a, b) => new Date(a.exitTime) - new Date(b.exitTime));
    const cumPL = [];
    let running = 0;
    sorted.forEach(t => {
      const pl = getTradePL(t);
      running += pl;
      cumPL.push(running);
    });

    const minPL = Math.min(0, ...cumPL);
    const maxPL = Math.max(0, ...cumPL);
    const range = maxPL - minPL || 1;

    const chartW = w - padding.left - padding.right;
    const chartH = h - padding.top - padding.bottom;

    const bgSurface = getCSSVar('--bg-surface');
    const borderColor = getCSSVar('--border');
    const textTertiary = getCSSVar('--text-tertiary');
    const textMuted = getCSSVar('--text-muted');

    ctx.clearRect(0, 0, w, h);
    ctx.fillStyle = bgSurface;
    ctx.fillRect(0, 0, w, h);

    // Grid
    ctx.strokeStyle = borderColor;
    ctx.lineWidth = 1;
    const gridLines = 5;
    for (let i = 0; i <= gridLines; i++) {
      const y = padding.top + (chartH / gridLines) * i;
      ctx.beginPath();
      ctx.moveTo(padding.left, y);
      ctx.lineTo(w - padding.right, y);
      ctx.stroke();

      const val = maxPL - (range / gridLines) * i;
      ctx.fillStyle = textTertiary;
      ctx.font = '11px JetBrains Mono, monospace';
      ctx.textAlign = 'right';
      ctx.fillText('$' + val.toFixed(0), padding.left - 8, y + 4);
    }

    // Zero line
    if (minPL < 0) {
      const zeroY = padding.top + ((maxPL - 0) / range) * chartH;
      ctx.strokeStyle = textMuted;
      ctx.lineWidth = 1;
      ctx.setLineDash([4, 4]);
      ctx.beginPath();
      ctx.moveTo(padding.left, zeroY);
      ctx.lineTo(w - padding.right, zeroY);
      ctx.stroke();
      ctx.setLineDash([]);
    }

    // Line
    if (cumPL.length > 1) {
      ctx.beginPath();
      cumPL.forEach((val, i) => {
        const x = padding.left + (chartW / (cumPL.length - 1)) * i;
        const y = padding.top + ((maxPL - val) / range) * chartH;
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      });

      const posColor = getCSSVar('--positive');
      const negColor = getCSSVar('--negative');
      const lineColor = cumPL[cumPL.length - 1] >= 0 ? posColor : negColor;
      ctx.strokeStyle = lineColor;
      ctx.lineWidth = 2;
      ctx.stroke();

      // Fill gradient
      const lastX = padding.left + chartW;
      const zeroY = padding.top + ((maxPL - 0) / range) * chartH;
      ctx.lineTo(lastX, zeroY);
      ctx.lineTo(padding.left, zeroY);
      ctx.closePath();

      const gradColor = cumPL[cumPL.length - 1] >= 0 ? posColor : negColor;
      const gradient = ctx.createLinearGradient(0, padding.top, 0, h - padding.bottom);
      if (cumPL[cumPL.length - 1] >= 0) {
        gradient.addColorStop(0, colorToRgba(gradColor, 0.15));
        gradient.addColorStop(1, colorToRgba(gradColor, 0));
      } else {
        gradient.addColorStop(0, colorToRgba(gradColor, 0));
        gradient.addColorStop(1, colorToRgba(gradColor, 0.15));
      }
      ctx.fillStyle = gradient;
      ctx.fill();
    }
  }, [trades, document.documentElement.dataset.theme]);

  // Performance by day bar chart
  useEffect(() => {
    if (!barCanvasRef.current || trades.length === 0) return;

    const canvas = barCanvasRef.current;
    const ctx = canvas.getContext('2d');
    const dpr = window.devicePixelRatio || 1;

    const rect = canvas.parentElement.getBoundingClientRect();
    canvas.width = rect.width * dpr;
    canvas.height = 250 * dpr;
    canvas.style.width = rect.width + 'px';
    canvas.style.height = '250px';
    ctx.scale(dpr, dpr);

    const w = rect.width;
    const h = 250;
    const padding = { top: 20, right: 20, bottom: 40, left: 60 };

    const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    const dayPL = [0, 0, 0, 0, 0, 0, 0];
    const dayCounts = [0, 0, 0, 0, 0, 0, 0];
    const dayWins = [0, 0, 0, 0, 0, 0, 0];
    const dayLosses = [0, 0, 0, 0, 0, 0, 0];
    const dayWinPL = [0, 0, 0, 0, 0, 0, 0];
    const dayLossPL = [0, 0, 0, 0, 0, 0, 0];

    trades.forEach(t => {
      const estDate = toEST(t.exitTime);
      const day = new Date(estDate.year, estDate.month - 1, estDate.day).getDay();
      const pl = getTradePL(t);
      dayPL[day] += pl;
      dayCounts[day]++;
      if (pl > 0) { dayWins[day]++; dayWinPL[day] += pl; }
      else { dayLosses[day]++; dayLossPL[day] += Math.abs(pl); }
    });

    const maxVal = Math.max(...dayPL.map(Math.abs), 1);
    const chartW = w - padding.left - padding.right;
    const chartH = h - padding.top - padding.bottom;

    const bgSurface = getCSSVar('--bg-surface');
    const textMuted = getCSSVar('--text-muted');
    const textTertiary = getCSSVar('--text-tertiary');

    ctx.clearRect(0, 0, w, h);
    ctx.fillStyle = bgSurface;
    ctx.fillRect(0, 0, w, h);

    // Zero line
    const zeroY = padding.top + chartH / 2;
    ctx.strokeStyle = textMuted;
    ctx.lineWidth = 1;
    ctx.setLineDash([4, 4]);
    ctx.beginPath();
    ctx.moveTo(padding.left, zeroY);
    ctx.lineTo(w - padding.right, zeroY);
    ctx.stroke();
    ctx.setLineDash([]);

    const barWidth = chartW / 7 * 0.6;
    const barGap = chartW / 7;
    const rects = [];

    const dayPosColor = getCSSVar('--positive');
    const dayNegColor = getCSSVar('--negative');

    dayPL.forEach((val, i) => {
      const x = padding.left + barGap * i + (barGap - barWidth) / 2;
      const barH = (Math.abs(val) / maxVal) * (chartH / 2);
      const y = val >= 0 ? zeroY - barH : zeroY;

      const isHovered = hoveredDayIndex === i;
      const baseColor = val >= 0 ? dayPosColor : dayNegColor;
      ctx.fillStyle = isHovered ? baseColor + 'CC' : baseColor;
      ctx.beginPath();
      ctx.roundRect(x, y, barWidth, barH, 4);
      ctx.fill();

      rects.push({ x, y, w: barWidth, h: barH, index: i });

      // Day label
      ctx.fillStyle = textTertiary;
      ctx.font = '11px Inter, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(dayNames[i], x + barWidth / 2, h - 10);
    });

    dayBarRects.current = rects;

    // Draw tooltip for hovered day
    if (hoveredDayIndex !== null && dayCounts[hoveredDayIndex] > 0) {
      const i = hoveredDayIndex;
      const wr = dayCounts[i] > 0 ? ((dayWins[i] / dayCounts[i]) * 100).toFixed(1) : '0.0';
      const pf = dayLossPL[i] === 0 ? (dayWinPL[i] > 0 ? '∞' : '0.00') : (dayWinPL[i] / dayLossPL[i]).toFixed(2);
      const avgW = dayWins[i] > 0 ? (dayWinPL[i] / dayWins[i]).toFixed(2) : '0.00';
      const avgL = dayLosses[i] > 0 ? (dayLossPL[i] / dayLosses[i]).toFixed(2) : '0.00';
      const r = rects[i];
      drawTooltip(ctx, r.x + r.w / 2, r.y, dayNames[i], [
        { label: 'Trades', value: `${dayCounts[i]}` },
        { label: 'Win Rate', value: `${wr}%` },
        { label: 'Profit Factor', value: pf },
        { label: 'Avg Win', value: `$${avgW}`, color: dayPosColor },
        { label: 'Avg Loss', value: `-$${avgL}`, color: dayNegColor },
        { label: 'Total P/L', value: `$${dayPL[i].toFixed(2)}`, color: dayPL[i] >= 0 ? dayPosColor : dayNegColor },
      ], w, h);
    }
  }, [trades, hoveredDayIndex, document.documentElement.dataset.theme]);

  // Win rate by ticker
  const tickerStats = {};
  trades.forEach(t => {
    if (!tickerStats[t.ticker]) tickerStats[t.ticker] = { wins: 0, losses: 0, totalPL: 0 };
    const pl = getTradePL(t);
    if (pl > 0) tickerStats[t.ticker].wins++;
    else tickerStats[t.ticker].losses++;
    tickerStats[t.ticker].totalPL += pl;
  });

  // Streaks
  let bestWinStreak = 0, bestLossStreak = 0, tempStreak = 0, lastWin = null;
  const sorted = [...trades].sort((a, b) => new Date(a.exitTime) - new Date(b.exitTime));
  sorted.forEach(t => {
    const isWin = getTradePL(t) > 0;
    if (lastWin === null) { tempStreak = 1; }
    else if (isWin === lastWin) { tempStreak++; }
    else { tempStreak = 1; }
    lastWin = isWin;
    if (isWin && tempStreak > bestWinStreak) bestWinStreak = tempStreak;
    if (!isWin && tempStreak > bestLossStreak) bestLossStreak = tempStreak;
  });

  const profitFactor = (() => {
    let grossWins = 0, grossLosses = 0;
    trades.forEach(t => {
      const pl = getTradePL(t);
      if (pl > 0) grossWins += pl;
      else grossLosses += Math.abs(pl);
    });
    return grossLosses === 0 ? grossWins : (grossWins / grossLosses);
  })();

  const expectancy = stats.totalTrades > 0
    ? (stats.winRate / 100) * stats.avgWin + (1 - stats.winRate / 100) * stats.avgLoss
    : 0;

  // Previous period profit factor & expectancy for % change
  const prevProfitFactor = (() => {
    if (!prevTrades || prevTrades.length === 0) return 0;
    let grossWins = 0, grossLosses = 0;
    prevTrades.forEach(t => {
      const pl = getTradePL(t);
      if (pl > 0) grossWins += pl;
      else grossLosses += Math.abs(pl);
    });
    return grossLosses === 0 ? grossWins : (grossWins / grossLosses);
  })();

  const prevExpectancy = prevStats && prevStats.totalTrades > 0
    ? (prevStats.winRate / 100) * prevStats.avgWin + (1 - prevStats.winRate / 100) * prevStats.avgLoss
    : 0;

  // Max drawdown
  const maxDrawdown = (() => {
    if (trades.length === 0) return 0;
    const sorted = [...trades].sort((a, b) => new Date(a.exitTime) - new Date(b.exitTime));
    let peak = 0, running = 0, dd = 0;
    sorted.forEach(t => {
      running += getTradePL(t);
      if (running > peak) peak = running;
      const drawdown = peak - running;
      if (drawdown > dd) dd = drawdown;
    });
    return dd;
  })();

  // Performance by time of day (30-min intervals)
  const timeOfDayStats = (() => {
    const buckets = {};
    trades.forEach(t => {
      const estParts = toEST(t.enterTime);
      const h = estParts.hours;
      const m = estParts.minutes < 30 ? 0 : 30;
      const key = `${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}`;
      if (!buckets[key]) buckets[key] = { totalPL: 0, wins: 0, losses: 0, count: 0 };
      const pl = getTradePL(t);
      buckets[key].totalPL += pl;
      buckets[key].count++;
      if (pl > 0) buckets[key].wins++;
      else buckets[key].losses++;
    });
    return Object.entries(buckets)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([time, data]) => ({
        time,
        ...data,
        winRate: data.count > 0 ? (data.wins / data.count * 100) : 0,
        avgPL: data.count > 0 ? data.totalPL / data.count : 0,
      }));
  })();

  // Time of day bar chart
  useEffect(() => {
    if (!timeCanvasRef.current || timeOfDayStats.length === 0) return;

    const canvas = timeCanvasRef.current;
    const ctx = canvas.getContext('2d');
    const dpr = window.devicePixelRatio || 1;

    const rect = canvas.parentElement.getBoundingClientRect();
    canvas.width = rect.width * dpr;
    canvas.height = 320 * dpr;
    canvas.style.width = rect.width + 'px';
    canvas.style.height = '320px';
    ctx.scale(dpr, dpr);

    const w = rect.width;
    const h = 320;
    const padding = { top: 20, right: 20, bottom: 90, left: 60 };

    const values = timeOfDayStats.map(s => s.totalPL);
    const maxVal = Math.max(...values.map(Math.abs), 1);
    const chartW = w - padding.left - padding.right;
    const chartH = h - padding.top - padding.bottom;

    const bgSurface = getCSSVar('--bg-surface');
    const textMuted = getCSSVar('--text-muted');
    const textTertiary = getCSSVar('--text-tertiary');

    ctx.clearRect(0, 0, w, h);
    ctx.fillStyle = bgSurface;
    ctx.fillRect(0, 0, w, h);

    // Zero line
    const zeroY = padding.top + chartH / 2;
    ctx.strokeStyle = textMuted;
    ctx.lineWidth = 1;
    ctx.setLineDash([4, 4]);
    ctx.beginPath();
    ctx.moveTo(padding.left, zeroY);
    ctx.lineTo(w - padding.right, zeroY);
    ctx.stroke();
    ctx.setLineDash([]);

    // Y-axis labels
    const gridLines = 4;
    const borderColor = getCSSVar('--border');
    ctx.strokeStyle = borderColor;
    ctx.lineWidth = 1;
    for (let i = 0; i <= gridLines; i++) {
      const y = padding.top + (chartH / gridLines) * i;
      ctx.beginPath();
      ctx.moveTo(padding.left, y);
      ctx.lineTo(w - padding.right, y);
      ctx.stroke();

      const val = maxVal - (2 * maxVal / gridLines) * i;
      ctx.fillStyle = textTertiary;
      ctx.font = '11px JetBrains Mono, monospace';
      ctx.textAlign = 'right';
      ctx.fillText('$' + val.toFixed(0), padding.left - 8, y + 4);
    }

    const n = timeOfDayStats.length;
    const barGap = chartW / n;
    const barWidth = barGap * 0.6;
    const rects = [];
    const timePosColor = getCSSVar('--positive');
    const timeNegColor = getCSSVar('--negative');

    timeOfDayStats.forEach((stat, i) => {
      const x = padding.left + barGap * i + (barGap - barWidth) / 2;
      const barH = (Math.abs(stat.totalPL) / maxVal) * (chartH / 2);
      const y = stat.totalPL >= 0 ? zeroY - barH : zeroY;

      const isHovered = hoveredTimeIndex === i;
      const timeBaseColor = stat.totalPL >= 0 ? timePosColor : timeNegColor;
      ctx.fillStyle = isHovered ? timeBaseColor + 'CC' : timeBaseColor;
      ctx.beginPath();
      ctx.roundRect(x, y, barWidth, barH, 3);
      ctx.fill();

      rects.push({ x, y, w: barWidth, h: barH, index: i });

      // Time label
      ctx.fillStyle = textTertiary;
      ctx.font = '10px JetBrains Mono, monospace';
      ctx.textAlign = 'right';
      ctx.textBaseline = 'middle';
      ctx.save();
      ctx.translate(x + barWidth / 2, padding.top + chartH + 12);
      ctx.rotate(-Math.PI / 4);
      ctx.fillText(stat.time, 0, 0);
      ctx.restore();
      ctx.textBaseline = 'alphabetic';
    });

    timeBarRects.current = rects;

    // Draw tooltip for hovered time bucket
    if (hoveredTimeIndex !== null && hoveredTimeIndex < timeOfDayStats.length) {
      const stat = timeOfDayStats[hoveredTimeIndex];
      const pf = (() => {
        const gw = stat.wins > 0 ? stat.totalPL > 0 ? stat.totalPL : 0 : 0;
        let grossW = 0, grossL = 0;
        trades.forEach(t => {
          const estParts = toEST(t.enterTime);
          const hh = estParts.hours;
          const mm = estParts.minutes < 30 ? 0 : 30;
          const key = `${String(hh).padStart(2,'0')}:${String(mm).padStart(2,'0')}`;
          if (key === stat.time) {
            const pl = getTradePL(t);
            if (pl > 0) grossW += pl; else grossL += Math.abs(pl);
          }
        });
        return grossL === 0 ? (grossW > 0 ? '∞' : '0.00') : (grossW / grossL).toFixed(2);
      })();
      const r = rects[hoveredTimeIndex];
      drawTooltip(ctx, r.x + r.w / 2, r.y, stat.time, [
        { label: 'Trades', value: `${stat.count}` },
        { label: 'Win Rate', value: `${stat.winRate.toFixed(1)}%` },
        { label: 'Profit Factor', value: pf },
        { label: 'Avg P/L', value: `$${stat.avgPL.toFixed(2)}`, color: stat.avgPL >= 0 ? timePosColor : timeNegColor },
        { label: 'Total P/L', value: `$${stat.totalPL.toFixed(2)}`, color: stat.totalPL >= 0 ? timePosColor : timeNegColor },
      ], w, h);
    }
  }, [trades, hoveredTimeIndex, document.documentElement.dataset.theme]);

  // Canvas hover listeners for bar charts
  useEffect(() => {
    const handleBarHover = (canvas, barRects, setIndex) => {
      if (!canvas) return () => {};
      const dpr = window.devicePixelRatio || 1;
      const onMove = (e) => {
        const rect = canvas.getBoundingClientRect();
        const mx = (e.clientX - rect.left);
        const my = (e.clientY - rect.top);
        let found = null;
        for (const r of barRects.current) {
          if (mx >= r.x && mx <= r.x + r.w && my >= r.y && my <= r.y + r.h) {
            found = r.index;
            break;
          }
        }
        setIndex(found);
      };
      const onLeave = () => setIndex(null);
      canvas.addEventListener('mousemove', onMove);
      canvas.addEventListener('mouseleave', onLeave);
      return () => {
        canvas.removeEventListener('mousemove', onMove);
        canvas.removeEventListener('mouseleave', onLeave);
      };
    };

    const cleanupDay = handleBarHover(barCanvasRef.current, dayBarRects, setHoveredDayIndex);
    const cleanupTime = handleBarHover(timeCanvasRef.current, timeBarRects, setHoveredTimeIndex);
    return () => { cleanupDay(); cleanupTime(); };
  }, [trades]);

  if (trades.length === 0 && period === 'all') {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-text-primary">Analytics</h1>
          <p className="text-text-secondary text-sm mt-1">Add trades to see analytics</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-text-primary">Analytics</h1>
        <p className="text-text-secondary text-sm mt-1">Detailed performance analysis</p>
      </div>

      {/* Period Filter + Eval filter */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex-1 min-w-0">
          <PeriodFilter value={period} onChange={setPeriod} trades={allTrades} />
        </div>
        <EvalFilterControl trades={allTrades} evalFilter={evalFilter} setEvalFilter={setEvalFilter} />
      </div>

      {trades.length === 0 ? (
        <div className="bg-bg-surface border border-border rounded-xl p-8 text-center">
          <p className="text-text-secondary text-sm">No trades found for this period</p>
        </div>
      ) : (<>

      {/* Stat cards */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
        <StatCard label="Total P/L" value={`$${stats.totalPL.toFixed(2)}`} color={stats.totalPL >= 0 ? 'text-positive' : 'text-negative'}
          change={showChange ? calcPercentChange(stats.totalPL, prevStats.totalPL) : null} />
        <WinRateCard wins={stats.wins} losses={stats.losses} total={stats.totalTrades}
          change={showChange ? calcPercentChange(stats.winRate, prevStats.winRate) : null} />
        <StatCard label="Profit Factor" value={profitFactor.toFixed(2)} color="text-text-primary"
          change={showChange ? calcPercentChange(profitFactor, prevProfitFactor) : null} />
        <StatCard label="Expectancy" value={`$${expectancy.toFixed(2)}`} color={expectancy >= 0 ? 'text-positive' : 'text-negative'}
          change={showChange ? calcPercentChange(expectancy, prevExpectancy) : null} />
        <StatCard label="Max Drawdown" value={`$${maxDrawdown.toFixed(2)}`} color="text-negative" />
      </div>

      {/* Long vs Short Breakdown */}
      {(() => {
        const longTrades = trades.filter(t => t.quantity > 0);
        const shortTrades = trades.filter(t => t.quantity < 0);
        const longStats = calculateAnalytics(longTrades);
        const shortStats = calculateAnalytics(shortTrades);
        return (
          <div className="bg-bg-surface border border-border rounded-xl p-6">
            <h3 className="text-text-primary font-semibold mb-4">Long vs Short Breakdown</h3>
            <div className="grid grid-cols-2 gap-6">
              <div>
                <div className="flex items-center gap-2 mb-3">
                  <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-bold uppercase bg-positive/15 text-positive">LONG</span>
                  <span className="text-text-secondary text-sm">{longStats.totalTrades} trades</span>
                </div>
                <div className="space-y-2">
                  <div className="flex justify-between text-sm">
                    <span className="text-text-secondary">Win Rate</span>
                    <span className="font-mono text-text-primary">{longStats.winRate.toFixed(1)}%</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-text-secondary">Avg P/L</span>
                    <span className={`font-mono font-semibold ${longStats.totalTrades > 0 ? (longStats.totalPL / longStats.totalTrades >= 0 ? 'text-positive' : 'text-negative') : 'text-text-primary'}`}>
                      ${longStats.totalTrades > 0 ? (longStats.totalPL / longStats.totalTrades).toFixed(2) : '0.00'}
                    </span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-text-secondary">Total P/L</span>
                    <span className={`font-mono font-semibold ${longStats.totalPL >= 0 ? 'text-positive' : 'text-negative'}`}>
                      ${longStats.totalPL.toFixed(2)}
                    </span>
                  </div>
                </div>
              </div>
              <div>
                <div className="flex items-center gap-2 mb-3">
                  <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-bold uppercase bg-negative/15 text-negative">SHORT</span>
                  <span className="text-text-secondary text-sm">{shortStats.totalTrades} trades</span>
                </div>
                <div className="space-y-2">
                  <div className="flex justify-between text-sm">
                    <span className="text-text-secondary">Win Rate</span>
                    <span className="font-mono text-text-primary">{shortStats.winRate.toFixed(1)}%</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-text-secondary">Avg P/L</span>
                    <span className={`font-mono font-semibold ${shortStats.totalTrades > 0 ? (shortStats.totalPL / shortStats.totalTrades >= 0 ? 'text-positive' : 'text-negative') : 'text-text-primary'}`}>
                      ${shortStats.totalTrades > 0 ? (shortStats.totalPL / shortStats.totalTrades).toFixed(2) : '0.00'}
                    </span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-text-secondary">Total P/L</span>
                    <span className={`font-mono font-semibold ${shortStats.totalPL >= 0 ? 'text-positive' : 'text-negative'}`}>
                      ${shortStats.totalPL.toFixed(2)}
                    </span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        );
      })()}

      {/* Charts row */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Equity Curve */}
        <div className="bg-bg-surface border border-border rounded-xl p-6">
          <h3 className="text-text-primary font-semibold mb-4">Equity Curve</h3>
          <div>
            <canvas ref={canvasRef}></canvas>
          </div>
        </div>

        {/* P/L by Ticker */}
        <div className="bg-bg-surface border border-border rounded-xl p-6">
          <h3 className="text-text-primary font-semibold mb-4">P/L by Ticker</h3>
          <div className="space-y-3 max-h-[280px] overflow-y-auto">
            {Object.entries(tickerStats)
              .sort((a, b) => Math.abs(b[1].totalPL) - Math.abs(a[1].totalPL))
              .map(([ticker, data]) => {
                const total = data.wins + data.losses;
                const wr = total > 0 ? ((data.wins / total) * 100).toFixed(0) : 0;
                return (
                  <div key={ticker} className="flex items-center justify-between py-2 border-b border-border/50">
                    <div>
                      <span className="font-mono text-sm font-semibold text-text-primary">{ticker}</span>
                      <span className="text-text-tertiary text-xs ml-2">{total} trades | {wr}% WR</span>
                    </div>
                    <span className={`font-mono text-sm font-semibold ${data.totalPL >= 0 ? 'text-positive' : 'text-negative'}`}>
                      {data.totalPL >= 0 ? '+' : ''}${data.totalPL.toFixed(2)}
                    </span>
                  </div>
                );
              })}
          </div>
        </div>
      </div>

      {/* Bottom row */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Performance by Day */}
        <div className="bg-bg-surface border border-border rounded-xl p-6">
          <h3 className="text-text-primary font-semibold mb-4">Performance by Day</h3>
          <div>
            <canvas ref={barCanvasRef}></canvas>
          </div>
        </div>

        {/* Detailed Statistics */}
        <div className="bg-bg-surface border border-border rounded-xl p-6">
          <h3 className="text-text-primary font-semibold mb-4">Detailed Statistics</h3>
          <div className="space-y-3">
            {[
              ['Total Trades', stats.totalTrades],
              ['Winning Trades', stats.wins],
              ['Losing Trades', stats.losses],
              ['Avg Win', `$${stats.avgWin.toFixed(2)}`],
              ['Avg Loss', `$${stats.avgLoss.toFixed(2)}`],
              ['Best Trade', `$${stats.bestTrade.toFixed(2)}`],
              ['Worst Trade', `$${stats.worstTrade.toFixed(2)}`],
              ['Best Win Streak', bestWinStreak],
              ['Worst Loss Streak', bestLossStreak],
              ['Avg Duration', formatDuration(stats.avgDuration)],
            ].map(([label, value]) => (
              <div key={label} className="flex items-center justify-between py-1.5 border-b border-border/50">
                <span className="text-text-secondary text-sm">{label}</span>
                <span className="font-mono text-sm text-text-primary">{value}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Performance by Time of Day */}
      {timeOfDayStats.length > 0 && (
        <div className="bg-bg-surface border border-border rounded-xl p-6">
          <h3 className="text-text-primary font-semibold mb-4">Performance by Entry Time (30-Min)</h3>
          <div className="mb-6">
            <canvas ref={timeCanvasRef} className="w-full"></canvas>
          </div>
          <div className="max-h-[300px] overflow-y-auto">
            <table className="w-full text-sm">
              <thead className="sticky top-0 bg-bg-surface">
                <tr className="border-b border-border">
                  <th className="text-left px-3 py-2 text-xs font-medium text-text-tertiary uppercase tracking-wider">Time</th>
                  <th className="text-right px-3 py-2 text-xs font-medium text-text-tertiary uppercase tracking-wider">Trades</th>
                  <th className="text-right px-3 py-2 text-xs font-medium text-text-tertiary uppercase tracking-wider">Wins</th>
                  <th className="text-right px-3 py-2 text-xs font-medium text-text-tertiary uppercase tracking-wider">Losses</th>
                  <th className="text-right px-3 py-2 text-xs font-medium text-text-tertiary uppercase tracking-wider">Win Rate</th>
                  <th className="text-right px-3 py-2 text-xs font-medium text-text-tertiary uppercase tracking-wider">Total P/L</th>
                  <th className="text-right px-3 py-2 text-xs font-medium text-text-tertiary uppercase tracking-wider">Avg P/L</th>
                </tr>
              </thead>
              <tbody>
                {timeOfDayStats.map(row => (
                  <tr key={row.time} className="border-b border-border/50 hover:bg-bg-input/50 transition-colors">
                    <td className="px-3 py-2 font-mono text-text-primary">{row.time}</td>
                    <td className="text-right px-3 py-2 text-text-secondary">{row.count}</td>
                    <td className="text-right px-3 py-2 text-positive">{row.wins}</td>
                    <td className="text-right px-3 py-2 text-negative">{row.losses}</td>
                    <td className="text-right px-3 py-2 text-text-secondary">{row.winRate.toFixed(1)}%</td>
                    <td className={`text-right px-3 py-2 font-mono font-semibold ${row.totalPL >= 0 ? 'text-positive' : 'text-negative'}`}>
                      {row.totalPL >= 0 ? '+' : ''}${row.totalPL.toFixed(2)}
                    </td>
                    <td className={`text-right px-3 py-2 font-mono ${row.avgPL >= 0 ? 'text-positive' : 'text-negative'}`}>
                      {row.avgPL >= 0 ? '+' : ''}${row.avgPL.toFixed(2)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      </>)}
    </div>
  );
};

// =====================================================
// SETTINGS PAGE
// =====================================================
const TAG_COLOR_PRESETS = [
  '#EF4444', '#F59E0B', '#10B981', '#3B82F6',
  '#8B5CF6', '#EC4899', '#6B7280', '#F97316',
];

const SettingsPage = ({ onSyncComplete, onNavigate, theme, onThemeChange, customColors, tags, triggerReload, subscriptionStatus }) => {
  const [activeTab, setActiveTab] = useState('brokers');
  const [tvEnvironment, setTvEnvironment] = useState('demo');
  const [tvStatus, setTvStatus] = useState(null);
  const [saving, setSaving] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [message, setMessage] = useState(null);
  const [pxStatus, setPxStatus] = useState(null);
  const [pxAccounts, setPxAccounts] = useState([]);
  const [pxUsername, setPxUsername] = useState('');
  const [pxApiKey, setPxApiKey] = useState('');
  const [pxSelectedAccounts, setPxSelectedAccounts] = useState([]);
  const [pxCopytradeEnabled, setPxCopytradeEnabled] = useState(false);
  const [pxLeadAccount, setPxLeadAccount] = useState(null);
  const [pxMultiplier, setPxMultiplier] = useState(1);
  const [pxConnecting, setPxConnecting] = useState(false);
  const [pxSyncing, setPxSyncing] = useState(false);
  const [newTagName, setNewTagName] = useState('');
  const [newTagColor, setNewTagColor] = useState(TAG_COLOR_PRESETS[0]);
  const [editingTagId, setEditingTagId] = useState(null);
  const [editTagName, setEditTagName] = useState('');
  const [editTagColor, setEditTagColor] = useState('');

  useEffect(() => { fetchStatus(); fetchPxStatus(); }, []);

  // Handle OAuth callback: exchange code when redirected back from Tradovate
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const code = params.get('tv_code');
    const env = params.get('tv_env');
    const error = params.get('tv_error');

    // Clear OAuth params from URL immediately
    if (code || error) {
      window.history.replaceState({}, '', window.location.pathname);
    }

    if (error) {
      setMessage({ type: 'error', text: 'Tradovate OAuth failed. Please try again.' });
      return;
    }

    if (!code) return;

    const exchangeCode = async () => {
      setSaving(true);
      setMessage(null);
      try {
        const response = await authFetch('/api/tradovate/exchange', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ code, environment: env || 'demo' }),
        });
        const data = await response.json();
        if (data.error) {
          setMessage({ type: 'error', text: data.error });
        } else {
          setMessage({ type: 'success', text: 'Tradovate connected successfully!' });
          fetchStatus();
        }
      } catch (err) {
        setMessage({ type: 'error', text: 'Failed to connect Tradovate' });
      }
      setSaving(false);
    };
    exchangeCode();
  }, []);

  const fetchStatus = async () => {
    try {
      const response = await authFetch('/api/tradovate/status');
      const data = await response.json();
      setTvStatus(data);
      if (data.environment) setTvEnvironment(data.environment);
    } catch (err) {
      console.error('Failed to fetch Tradovate status:', err);
    }
  };

  const handleConnect = () => {
    window.location.href = `/api/tradovate/connect?environment=${tvEnvironment}`;
  };

  const handleSync = async () => {
    setSyncing(true);
    setMessage(null);
    try {
      const response = await authFetch('/api/tradovate/sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      });
      const data = await response.json();
      if (data.error) {
        setMessage({ type: 'error', text: data.error });
      } else {
        setMessage({ type: 'success', text: data.message });
        fetchStatus();
        if (onSyncComplete) onSyncComplete();
      }
    } catch (err) {
      setMessage({ type: 'error', text: 'Sync failed' });
    }
    setSyncing(false);
  };

  const handleDeleteCredentials = async () => {
    setMessage(null);
    try {
      const response = await authFetch('/api/tradovate/credentials', { method: 'DELETE' });
      const data = await response.json();
      if (data.error) {
        setMessage({ type: 'error', text: data.error });
      } else {
        setMessage({ type: 'success', text: data.message });
        fetchStatus();
      }
    } catch (err) {
      setMessage({ type: 'error', text: 'Failed to delete credentials' });
    }
  };

  const fetchPxStatus = async () => {
    try {
      const response = await authFetch('/api/projectx/status');
      const data = await response.json();
      setPxStatus(data);
      if (data.accounts) setPxAccounts(data.accounts);
      if (data.selectedAccounts) setPxSelectedAccounts(data.selectedAccounts);
      if (data.copytradeConfig) {
        setPxCopytradeEnabled(true);
        setPxLeadAccount(data.copytradeConfig.leadAccountId);
        setPxMultiplier(data.copytradeConfig.multiplier);
      }
    } catch (err) {
      console.error('Failed to fetch ProjectX status:', err);
    }
  };

  const handlePxConnect = async () => {
    if (!pxUsername.trim() || !pxApiKey.trim()) {
      setMessage({ type: 'error', text: 'Username and API key are required' });
      return;
    }
    setPxConnecting(true);
    setMessage(null);
    try {
      const response = await authFetch('/api/projectx/connect', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: pxUsername.trim(), apiKey: pxApiKey.trim() }),
      });
      const data = await response.json();
      if (data.error) {
        setMessage({ type: 'error', text: data.error });
      } else {
        setMessage({ type: 'success', text: 'Connected to ProjectX!' });
        setPxAccounts(data.accounts || []);
        setPxApiKey('');
        fetchPxStatus();
      }
    } catch (err) {
      setMessage({ type: 'error', text: 'Failed to connect to ProjectX' });
    }
    setPxConnecting(false);
  };

  const handlePxSaveAccounts = async () => {
    if (pxSelectedAccounts.length === 0) {
      setMessage({ type: 'error', text: 'Select at least one account' });
      return;
    }
    setMessage(null);
    try {
      const copytradeConfig = pxCopytradeEnabled && pxLeadAccount
        ? { leadAccountId: pxLeadAccount, multiplier: pxMultiplier }
        : null;
      const response = await authFetch('/api/projectx/accounts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ selectedAccounts: pxSelectedAccounts, copytradeConfig }),
      });
      const data = await response.json();
      if (data.error) {
        setMessage({ type: 'error', text: data.error });
      } else {
        setMessage({ type: 'success', text: 'Account settings saved' });
        fetchPxStatus();
      }
    } catch (err) {
      setMessage({ type: 'error', text: 'Failed to save settings' });
    }
  };

  const handlePxSync = async () => {
    setPxSyncing(true);
    setMessage(null);
    try {
      const response = await authFetch('/api/projectx/sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      });
      const data = await response.json();
      if (data.error) {
        setMessage({ type: 'error', text: data.error });
      } else {
        setMessage({ type: 'success', text: data.message });
        fetchPxStatus();
        if (onSyncComplete) onSyncComplete();
      }
    } catch (err) {
      setMessage({ type: 'error', text: 'Sync failed' });
    }
    setPxSyncing(false);
  };

  const handlePxDisconnect = async () => {
    setMessage(null);
    try {
      const response = await authFetch('/api/projectx/credentials', { method: 'DELETE' });
      const data = await response.json();
      if (data.error) {
        setMessage({ type: 'error', text: data.error });
      } else {
        setMessage({ type: 'success', text: data.message });
        setPxStatus(null);
        setPxAccounts([]);
        setPxSelectedAccounts([]);
        setPxCopytradeEnabled(false);
        setPxLeadAccount(null);
        setPxMultiplier(1);
        fetchPxStatus();
      }
    } catch (err) {
      setMessage({ type: 'error', text: 'Failed to disconnect' });
    }
  };

  const togglePxAccount = (accountId) => {
    setPxSelectedAccounts(prev =>
      prev.includes(accountId)
        ? prev.filter(id => id !== accountId)
        : [...prev, accountId]
    );
  };

  const handleCreateTag = async () => {
    if (!newTagName.trim()) return;
    try {
      const response = await authFetch('/api/makeTag', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: newTagName.trim(), color: newTagColor }),
      });
      const data = await response.json();
      if (data.error) {
        setMessage({ type: 'error', text: data.error });
      } else {
        setNewTagName('');
        setNewTagColor(TAG_COLOR_PRESETS[0]);
        if (triggerReload) triggerReload();
      }
    } catch (err) {
      setMessage({ type: 'error', text: 'Failed to create tag' });
    }
  };

  const handleEditTag = async (tagId) => {
    if (!editTagName.trim()) return;
    try {
      const response = await authFetch('/api/updateTag', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ _id: tagId, name: editTagName.trim(), color: editTagColor }),
      });
      const data = await response.json();
      if (data.error) {
        setMessage({ type: 'error', text: data.error });
      } else {
        setEditingTagId(null);
        if (triggerReload) triggerReload();
      }
    } catch (err) {
      setMessage({ type: 'error', text: 'Failed to update tag' });
    }
  };

  const handleDeleteTag = async (tagId) => {
    if (!confirm('Delete this tag? It will be removed from all trades.')) return;
    try {
      const response = await authFetch('/api/removeTag', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ _id: tagId }),
      });
      const data = await response.json();
      if (data.error) {
        setMessage({ type: 'error', text: data.error });
      } else {
        if (triggerReload) triggerReload();
      }
    } catch (err) {
      setMessage({ type: 'error', text: 'Failed to delete tag' });
    }
  };

  const tabs = [
    { id: 'brokers', label: 'Broker Connections' },
    { id: 'tags', label: 'Tags' },
    { id: 'account', label: 'Account' },
    { id: 'preferences', label: 'Preferences' },
  ];

  const [expandedBroker, setExpandedBroker] = useState(null);

  const toggleBroker = (id) => setExpandedBroker(expandedBroker === id ? null : id);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-text-primary">Settings</h1>
        <p className="text-text-secondary text-sm mt-1">Manage your account and integrations</p>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 bg-bg-input rounded-lg p-1 w-fit">
        {tabs.map(tab => (
          <button
            key={tab.id}
            className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${
              activeTab === tab.id
                ? 'bg-bg-surface text-text-primary'
                : 'text-text-secondary hover:text-text-primary'
            }`}
            onClick={() => setActiveTab(tab.id)}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Broker Connections tab */}
      {activeTab === 'brokers' && (
        <div className="space-y-6">
          {/* Message */}
          {message && (
            <div className={`p-3 rounded-lg text-sm ${
              message.type === 'error'
                ? 'bg-negative/10 border border-negative/30 text-negative'
                : 'bg-positive/10 border border-positive/30 text-positive'
            }`}>
              {message.text}
            </div>
          )}

          {/* Tradovate */}
          <div className="bg-bg-surface border border-border rounded-xl overflow-hidden">
            <button
              onClick={() => toggleBroker('tradovate')}
              className="w-full flex items-center justify-between p-5 hover:bg-bg-page/50 transition-colors"
            >
              <div className="flex items-center gap-3">
                <img src="/assets/img/tradovate.png" alt="Tradovate" className="w-10 h-10 rounded-lg object-contain" />
                <div className="text-left">
                  <h3 className="text-text-primary font-semibold text-sm">Tradovate</h3>
                  <p className="text-text-tertiary text-xs">Futures trading platform</p>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <div className="flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-medium bg-warning/10 text-warning">
                  Coming Soon
                </div>
                {expandedBroker === 'tradovate' ? <Icons.ChevronUp className="w-4 h-4 text-text-secondary" /> : <Icons.ChevronDown className="w-4 h-4 text-text-secondary" />}
              </div>
            </button>

            {expandedBroker === 'tradovate' && (
              <div className="px-5 pb-5 border-t border-border pt-4">
                <div className="bg-bg-page/50 rounded-lg p-3 mb-3">
                  <p className="text-xs text-text-secondary leading-relaxed">
                    Direct API sync is coming soon. In the meantime, you can export your trades as a CSV from Tradovate and import them into RR Metrics.
                  </p>
                </div>
                <a
                  href="/guides/tradovate-import"
                  className="inline-flex items-center gap-2 px-4 py-2 bg-accent/10 text-accent text-sm font-medium rounded-lg hover:bg-accent/20 transition-colors"
                >
                  <Icons.FileText className="w-4 h-4" />
                  How to Export from Tradovate (CSV)
                </a>
              </div>
            )}
          </div>

          {/* ProjectX / Topstep */}
          <div className="bg-bg-surface border border-border rounded-xl overflow-hidden">
            <button
              onClick={() => toggleBroker('projectx')}
              className="w-full flex items-center justify-between p-5 hover:bg-bg-page/50 transition-colors"
            >
              <div className="flex items-center gap-3">
                <img src="/assets/img/topstep.png" alt="ProjectX" className="w-10 h-10 rounded-lg object-contain" />
                <div className="text-left">
                  <h3 className="text-text-primary font-semibold text-sm">ProjectX / Topstep</h3>
                  <p className="text-text-tertiary text-xs">Futures trading platform</p>
                </div>
              </div>
              <div className="flex items-center gap-3">
                {pxStatus?.configured ? (
                  <div className="flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-medium bg-positive/10 text-positive">
                    Connected
                  </div>
                ) : (
                  <div className="flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-medium bg-text-secondary/10 text-text-secondary">
                    Not Connected
                  </div>
                )}
                {expandedBroker === 'projectx' ? <Icons.ChevronUp className="w-4 h-4 text-text-secondary" /> : <Icons.ChevronDown className="w-4 h-4 text-text-secondary" />}
              </div>
            </button>

            {expandedBroker === 'projectx' && (
              <div className="px-5 pb-5 border-t border-border pt-4 space-y-4">
                {!pxStatus?.configured ? (
                  <>
                    <div className="bg-bg-page/50 rounded-lg p-3">
                      <p className="text-xs text-text-secondary leading-relaxed">
                        Connect your Topstep account via the ProjectX API to automatically sync trades. You'll need a paid API subscription from Topstep ($29/month).
                      </p>
                    </div>
                    <div className="space-y-3">
                      <div>
                        <label className="block text-xs font-medium text-text-secondary mb-1">Username</label>
                        <input
                          type="text"
                          value={pxUsername}
                          onChange={(e) => setPxUsername(e.target.value)}
                          placeholder="Your Topstep username"
                          className="w-full px-3 py-2 bg-bg-input border border-border rounded-lg text-sm text-text-primary placeholder:text-text-muted focus:outline-none focus:border-accent"
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-text-secondary mb-1">API Key</label>
                        <input
                          type="password"
                          value={pxApiKey}
                          onChange={(e) => setPxApiKey(e.target.value)}
                          placeholder="Your ProjectX API key"
                          className="w-full px-3 py-2 bg-bg-input border border-border rounded-lg text-sm text-text-primary placeholder:text-text-muted focus:outline-none focus:border-accent"
                        />
                      </div>
                      <button
                        onClick={handlePxConnect}
                        disabled={pxConnecting}
                        className="px-4 py-2 bg-accent text-white text-sm font-medium rounded-lg hover:bg-accent/90 transition-colors disabled:opacity-50"
                      >
                        {pxConnecting ? 'Connecting...' : 'Connect'}
                      </button>
                    </div>
                    <a
                      href="https://help.topstep.com/en/articles/11187768-topstepx-api-access"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-2 text-accent text-xs hover:underline"
                    >
                      <Icons.FileText className="w-3.5 h-3.5" />
                      How to get your API key
                    </a>
                  </>
                ) : (
                  <>
                    {/* Account Selection */}
                    {pxAccounts.length > 0 && (
                      <div>
                        <h4 className="text-sm font-medium text-text-primary mb-2">Accounts</h4>
                        <div className="space-y-2">
                          {pxAccounts.map(account => (
                            <label key={account.id} className="flex items-center gap-3 p-2.5 bg-bg-page/50 rounded-lg cursor-pointer hover:bg-bg-page transition-colors">
                              <input
                                type="checkbox"
                                checked={pxSelectedAccounts.includes(account.id)}
                                onChange={() => togglePxAccount(account.id)}
                                className="w-4 h-4 rounded border-border text-accent focus:ring-accent"
                              />
                              <div className="flex-1">
                                <span className="text-sm text-text-primary font-medium">{account.name}</span>
                                <span className="text-xs text-text-secondary ml-2">${account.balance?.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                              </div>
                              {account.canTrade && (
                                <span className="text-xs text-positive bg-positive/10 px-2 py-0.5 rounded-full">Active</span>
                              )}
                            </label>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Copytrading Toggle */}
                    <div className="border border-border rounded-lg p-4 space-y-3">
                      <label className="flex items-center gap-3 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={pxCopytradeEnabled}
                          onChange={(e) => {
                            setPxCopytradeEnabled(e.target.checked);
                            if (!e.target.checked) {
                              setPxLeadAccount(null);
                              setPxMultiplier(1);
                            }
                          }}
                          className="w-4 h-4 rounded border-border text-accent focus:ring-accent"
                        />
                        <div>
                          <span className="text-sm text-text-primary font-medium">I am copytrading / tradesyncing</span>
                          <p className="text-xs text-text-secondary mt-0.5">Only sync from a lead account and multiply quantity and P&L</p>
                        </div>
                      </label>

                      {pxCopytradeEnabled && (
                        <div className="pl-7 space-y-3">
                          <div>
                            <label className="block text-xs font-medium text-text-secondary mb-1">Lead Account</label>
                            <select
                              value={pxLeadAccount || ''}
                              onChange={(e) => setPxLeadAccount(Number(e.target.value))}
                              className="w-full px-3 py-2 bg-bg-input border border-border rounded-lg text-sm text-text-primary focus:outline-none focus:border-accent"
                            >
                              <option value="">Select lead account</option>
                              {pxAccounts.filter(a => pxSelectedAccounts.includes(a.id)).map(account => (
                                <option key={account.id} value={account.id}>{account.name}</option>
                              ))}
                            </select>
                          </div>
                          <div>
                            <label className="block text-xs font-medium text-text-secondary mb-1">Total Accounts (multiplier)</label>
                            <input
                              type="number"
                              min="1"
                              max="50"
                              value={pxMultiplier}
                              onChange={(e) => setPxMultiplier(Math.max(1, parseInt(e.target.value) || 1))}
                              className="w-24 px-3 py-2 bg-bg-input border border-border rounded-lg text-sm text-text-primary focus:outline-none focus:border-accent"
                            />
                            <p className="text-xs text-text-muted mt-1">Quantity and P&L will be multiplied by this number</p>
                          </div>
                          <a
                            href="/guides/copytrading"
                            className="inline-flex items-center gap-1.5 text-accent text-xs hover:underline"
                          >
                            <Icons.FileText className="w-3.5 h-3.5" />
                            Learn more about copytrading setup
                          </a>
                        </div>
                      )}
                    </div>

                    {/* Action Buttons */}
                    <div className="flex flex-wrap items-center gap-3">
                      <button
                        onClick={handlePxSaveAccounts}
                        className="px-4 py-2 bg-accent text-white text-sm font-medium rounded-lg hover:bg-accent/90 transition-colors"
                      >
                        Save Settings
                      </button>
                      <button
                        onClick={handlePxSync}
                        disabled={pxSyncing || pxSelectedAccounts.length === 0}
                        className="px-4 py-2 bg-bg-page border border-border text-text-primary text-sm font-medium rounded-lg hover:bg-bg-input transition-colors disabled:opacity-50 flex items-center gap-2"
                      >
                        <Icons.RefreshCw className={`w-4 h-4 ${pxSyncing ? 'animate-spin' : ''}`} />
                        {pxSyncing ? 'Syncing...' : 'Sync Now'}
                      </button>
                      <button
                        onClick={handlePxDisconnect}
                        className="px-4 py-2 text-negative text-sm font-medium hover:bg-negative/10 rounded-lg transition-colors"
                      >
                        Disconnect
                      </button>
                    </div>

                    {/* Last Sync Time */}
                    {pxStatus?.lastSyncTime && (
                      <p className="text-xs text-text-muted">
                        Last synced: {new Date(pxStatus.lastSyncTime).toLocaleString()}
                      </p>
                    )}
                  </>
                )}
              </div>
            )}
          </div>

          {/* NinjaTrader */}
          <div className="bg-bg-surface border border-border rounded-xl overflow-hidden">
            <button
              onClick={() => toggleBroker('ninjatrader')}
              className="w-full flex items-center justify-between p-5 hover:bg-bg-page/50 transition-colors"
            >
              <div className="flex items-center gap-3">
                <img src="/assets/img/ninjatrader.jpeg" alt="NinjaTrader" className="w-10 h-10 rounded-lg object-contain" />
                <div className="text-left">
                  <h3 className="text-text-primary font-semibold text-sm">NinjaTrader</h3>
                  <p className="text-text-tertiary text-xs">Advanced charting &amp; trading platform</p>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <div className="flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-medium bg-warning/10 text-warning">
                  Coming Soon
                </div>
                {expandedBroker === 'ninjatrader' ? <Icons.ChevronUp className="w-4 h-4 text-text-secondary" /> : <Icons.ChevronDown className="w-4 h-4 text-text-secondary" />}
              </div>
            </button>

            {expandedBroker === 'ninjatrader' && (
              <div className="px-5 pb-5 border-t border-border pt-4">
                <div className="bg-bg-page/50 rounded-lg p-3 mb-3">
                  <p className="text-xs text-text-secondary leading-relaxed">
                    Direct API sync is coming soon. In the meantime, you can export your trades as a CSV and import them using the generic CSV format.
                  </p>
                </div>
                <a
                  href="/guides/generic-csv"
                  className="inline-flex items-center gap-2 px-4 py-2 bg-accent/10 text-accent text-sm font-medium rounded-lg hover:bg-accent/20 transition-colors"
                >
                  <Icons.FileText className="w-4 h-4" />
                  CSV Format Reference
                </a>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Tags tab */}
      {activeTab === 'tags' && (
        <div className="space-y-6">
          {message && (
            <div className={`p-3 rounded-lg text-sm ${
              message.type === 'error'
                ? 'bg-negative/10 border border-negative/30 text-negative'
                : 'bg-positive/10 border border-positive/30 text-positive'
            }`}>
              {message.text}
            </div>
          )}

          {/* Create tag form */}
          <div className="bg-bg-surface border border-border rounded-xl p-6">
            <h3 className="text-text-primary font-semibold mb-4">Create Tag</h3>
            <div className="flex flex-wrap items-end gap-4">
              <div className="flex-1 min-w-[200px]">
                <label className="block text-xs font-medium text-text-secondary mb-1.5">Tag Name</label>
                <input
                  type="text"
                  value={newTagName}
                  onChange={(e) => setNewTagName(e.target.value)}
                  placeholder="e.g. Breakout, Scalp, News Play"
                  className="w-full px-3 py-2.5 bg-bg-input border border-border rounded-lg text-text-primary text-sm placeholder-text-muted focus:outline-none focus:border-accent transition-colors"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-text-secondary mb-1.5">Color</label>
                <div className="flex gap-1.5">
                  {TAG_COLOR_PRESETS.map(color => (
                    <button
                      key={color}
                      type="button"
                      className={`w-7 h-7 rounded-full border-2 transition-all ${
                        newTagColor === color ? 'border-white scale-110' : 'border-transparent'
                      }`}
                      style={{ backgroundColor: color }}
                      onClick={() => setNewTagColor(color)}
                    />
                  ))}
                </div>
              </div>
              <button
                type="button"
                className="px-4 py-2.5 bg-accent text-accent-text text-sm font-semibold rounded-lg hover:brightness-110 transition-all"
                onClick={handleCreateTag}
              >
                Add Tag
              </button>
            </div>
          </div>

          {/* Tag list */}
          <div className="bg-bg-surface border border-border rounded-xl p-6">
            <h3 className="text-text-primary font-semibold mb-4">Your Tags</h3>
            {(!tags || tags.length === 0) ? (
              <p className="text-text-tertiary text-sm">No tags yet. Create one above to get started.</p>
            ) : (
              <div className="space-y-2">
                {tags.map(tag => (
                  <div key={tag._id} className="flex items-center justify-between py-3 px-4 bg-bg-input border border-border rounded-lg">
                    {editingTagId === tag._id ? (
                      <div className="flex flex-wrap items-center gap-3 flex-1">
                        <input
                          type="text"
                          value={editTagName}
                          onChange={(e) => setEditTagName(e.target.value)}
                          className="px-3 py-1.5 bg-bg-surface border border-border rounded-lg text-text-primary text-sm focus:outline-none focus:border-accent transition-colors"
                        />
                        <div className="flex gap-1.5">
                          {TAG_COLOR_PRESETS.map(color => (
                            <button
                              key={color}
                              type="button"
                              className={`w-6 h-6 rounded-full border-2 transition-all ${
                                editTagColor === color ? 'border-white scale-110' : 'border-transparent'
                              }`}
                              style={{ backgroundColor: color }}
                              onClick={() => setEditTagColor(color)}
                            />
                          ))}
                        </div>
                        <button
                          type="button"
                          className="px-3 py-1.5 bg-accent text-accent-text text-xs font-semibold rounded-lg hover:brightness-110 transition-all"
                          onClick={() => handleEditTag(tag._id)}
                        >
                          Save
                        </button>
                        <button
                          type="button"
                          className="px-3 py-1.5 text-text-secondary text-xs hover:text-text-primary transition-colors"
                          onClick={() => setEditingTagId(null)}
                        >
                          Cancel
                        </button>
                      </div>
                    ) : (
                      <>
                        <div className="flex items-center gap-3">
                          <span className="w-3 h-3 rounded-full flex-shrink-0" style={{ backgroundColor: tag.color }}></span>
                          <span className="text-text-primary text-sm font-medium">{tag.name}</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <button
                            className="p-1.5 rounded-lg text-text-tertiary hover:text-text-primary hover:bg-bg-surface transition-colors"
                            onClick={() => { setEditingTagId(tag._id); setEditTagName(tag.name); setEditTagColor(tag.color); }}
                            title="Edit"
                          >
                            <Icons.Edit />
                          </button>
                          <button
                            className="p-1.5 rounded-lg text-text-tertiary hover:text-negative hover:bg-negative/10 transition-colors"
                            onClick={() => handleDeleteTag(tag._id)}
                            title="Delete"
                          >
                            <Icons.Trash />
                          </button>
                        </div>
                      </>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Account tab */}
      {activeTab === 'account' && (
        <div className="space-y-6">
          {/* Subscription section */}
          <div className="bg-bg-surface border border-border rounded-xl p-6 space-y-6">
            <h3 className="text-text-primary font-semibold">Subscription</h3>
            <div className="flex items-center gap-4">
              <div>
                <div className="flex items-center gap-2 mb-1">
                  <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-bold uppercase ${
                    subscriptionStatus && subscriptionStatus.isPremium
                      ? 'bg-accent/15 text-accent'
                      : 'bg-text-muted/15 text-text-secondary'
                  }`}>
                    {subscriptionStatus && subscriptionStatus.isPremium
                      ? (subscriptionStatus.plan || 'Pro')
                      : 'Free'}
                  </span>
                  {subscriptionStatus && subscriptionStatus.subscriptionStatus && (
                    <span className={`text-xs ${
                      subscriptionStatus.subscriptionStatus === 'active' ? 'text-positive'
                        : subscriptionStatus.subscriptionStatus === 'canceled' ? 'text-negative'
                          : 'text-warning'
                    }`}>
                      {subscriptionStatus.subscriptionStatus.charAt(0).toUpperCase() + subscriptionStatus.subscriptionStatus.slice(1)}
                    </span>
                  )}
                </div>
                {subscriptionStatus && subscriptionStatus.createdDate && (
                  <p className="text-text-muted text-xs mt-1">
                    Account created: {new Date(subscriptionStatus.createdDate).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}
                  </p>
                )}
              </div>
            </div>

            <div className="border-t border-border pt-4 space-y-3">
              {subscriptionStatus && subscriptionStatus.isPremium ? (
                <button
                  className="flex items-center gap-2 px-4 py-2.5 bg-bg-input border border-border text-text-primary text-sm font-semibold rounded-lg hover:border-accent transition-all"
                  onClick={async () => {
                    try {
                      const response = await authFetch('/api/stripe/billing-portal', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                      });
                      const data = await response.json();
                      if (data.url) {
                        window.location.href = data.url;
                      } else if (data.error) {
                        alert(data.error);
                      }
                    } catch (err) {
                      console.error('Failed to open billing portal:', err);
                    }
                  }}
                >
                  <Icons.Settings className="w-4 h-4" />
                  Manage Subscription
                </button>
              ) : (
                <button
                  className="flex items-center gap-2 px-4 py-2.5 bg-accent text-accent-text text-sm font-semibold rounded-lg hover:brightness-110 transition-all"
                  onClick={() => { window.location.href = '/upgrade'; }}
                >
                  <Icons.Zap className="w-4 h-4" />
                  Upgrade Now
                </button>
              )}
            </div>
          </div>

          {/* Account settings section */}
          <div className="bg-bg-surface border border-border rounded-xl p-6 space-y-4">
            <h3 className="text-text-primary font-semibold">Account Settings</h3>
            <div className="space-y-3">
              <a href="/changePass" className="flex items-center gap-3 px-4 py-3 bg-bg-input border border-border rounded-lg text-text-secondary hover:text-text-primary transition-colors no-underline">
                <Icons.Lock className="w-5 h-5" />
                <span className="text-sm">Change Password</span>
              </a>
              <button onClick={() => { supabase.auth.signOut().then(() => { window.location = '/'; }); }} className="flex items-center gap-3 px-4 py-3 bg-bg-input border border-border rounded-lg text-text-secondary hover:text-negative transition-colors w-full">
                <Icons.LogOut className="w-5 h-5" />
                <span className="text-sm">Log Out</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Preferences tab */}
      {activeTab === 'preferences' && (
        <div className="bg-bg-surface border border-border rounded-xl p-6">
          <h3 className="text-text-primary font-semibold mb-4">Preferences</h3>
          <div className="flex items-center justify-between py-3">
            <div>
              <div className="text-text-primary text-sm font-medium">Theme</div>
              <div className="text-text-tertiary text-xs mt-0.5">Choose your preferred appearance</div>
            </div>
            <div className="flex gap-1 bg-bg-input rounded-lg p-1">
              <button
                className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${
                  theme === 'dark' ? 'bg-bg-surface text-text-primary' : 'text-text-secondary hover:text-text-primary'
                }`}
                onClick={() => onThemeChange('dark')}
              >
                Dark
              </button>
              <button
                className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${
                  theme === 'light' ? 'bg-bg-surface text-text-primary' : 'text-text-secondary hover:text-text-primary'
                }`}
                onClick={() => onThemeChange('light')}
              >
                Light
              </button>
              {subscriptionStatus && subscriptionStatus.plan === 'elite' ? (
                <button
                  className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${
                    theme === 'custom' ? 'bg-bg-surface text-text-primary' : 'text-text-secondary hover:text-text-primary'
                  }`}
                  onClick={() => onThemeChange('custom', customColors)}
                >
                  Custom
                </button>
              ) : (
                <button
                  className="px-4 py-2 rounded-md text-sm font-medium text-text-muted cursor-not-allowed"
                  title="Upgrade to Elite to use custom themes"
                  disabled
                >
                  Custom
                  <Icons.Lock className="w-3 h-3 inline ml-1 opacity-50" />
                </button>
              )}
            </div>
          </div>

          {theme === 'custom' && subscriptionStatus && subscriptionStatus.plan === 'elite' && (
            <div className="mt-4 pt-4 border-t border-border space-y-4">
              <div className="text-text-secondary text-sm font-medium">Custom Colors</div>
              <div className="grid grid-cols-3 gap-4">
                {[
                  { key: 'bgPage', label: 'Background', defaultVal: '#0B0E14' },
                  { key: 'bgSurface', label: 'Elements', defaultVal: '#111111' },
                  { key: 'textPrimary', label: 'Text', defaultVal: '#FFFFFF' },
                  { key: 'accent', label: 'Primary / Accent', defaultVal: '#3B82F6' },
                  { key: 'positive', label: 'Bullish (Positive)', defaultVal: '#10B981' },
                  { key: 'negative', label: 'Bearish (Negative)', defaultVal: '#EF4444' },
                ].map(({ key, label, defaultVal }) => (
                  <div key={key} className="flex items-center gap-3">
                    <input
                      type="color"
                      value={(customColors && customColors[key]) || defaultVal}
                      onChange={(e) => {
                        const updated = { ...customColors, [key]: e.target.value };
                        onThemeChange('custom', updated);
                      }}
                      className="w-10 h-10 rounded-lg border border-border cursor-pointer bg-transparent p-0.5"
                    />
                    <div>
                      <div className="text-text-primary text-sm">{label}</div>
                      <div className="text-text-muted text-xs font-mono">{(customColors && customColors[key]) || defaultVal}</div>
                    </div>
                  </div>
                ))}
              </div>
              <button
                className="text-text-tertiary text-xs hover:text-text-secondary transition-colors"
                onClick={() => {
                  const defaults = { bgPage: '#0B0E14', bgSurface: '#111111', textPrimary: '#FFFFFF', accent: '#3B82F6', positive: '#10B981', negative: '#EF4444' };
                  onThemeChange('custom', defaults);
                }}
              >
                Reset to defaults
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

// =====================================================
// PRE-MARKET PAGE
// =====================================================
const PreMarketPage = ({ subscriptionStatus, trades }) => {
  const [items, setItems] = useState([]);
  const [completions, setCompletions] = useState([]);
  const [settings, setSettings] = useState({ resetTime: '06:00', timezone: 'America/New_York' });
  const [loading, setLoading] = useState(true);
  const [newItemLabel, setNewItemLabel] = useState('');
  const [editingId, setEditingId] = useState(null);
  const [editingLabel, setEditingLabel] = useState('');
  const [showSettings, setShowSettings] = useState(false);
  const [consistencyData, setConsistencyData] = useState(null);
  const [consistencyLoading, setConsistencyLoading] = useState(true);

  const isElite = subscriptionStatus && subscriptionStatus.isPremium;

  const getTodayDate = () => {
    const now = new Date();
    return now.toLocaleDateString('en-CA'); // YYYY-MM-DD
  };

  const todayDate = getTodayDate();

  const fetchChecklist = async () => {
    try {
      const resp = await authFetch(`/api/premarket/checklist?date=${todayDate}`);
      const data = await resp.json();
      if (!data.error) {
        setItems(data.items || []);
        setCompletions(data.completions || []);
        if (data.settings) {
          setSettings({
            resetTime: data.settings.resetTime,
            timezone: data.settings.timezone,
          });
        }
      }
    } catch (err) {
      console.error('Failed to fetch checklist:', err);
    } finally {
      setLoading(false);
    }
  };

  const fetchConsistency = async () => {
    try {
      const end = new Date();
      const start = new Date();
      start.setDate(start.getDate() - 90);
      const startDate = start.toLocaleDateString('en-CA');
      const endDate = end.toLocaleDateString('en-CA');
      const resp = await authFetch(`/api/premarket/consistency?startDate=${startDate}&endDate=${endDate}`);
      const data = await resp.json();
      if (!data.error) {
        setConsistencyData(data.completionsByDate || {});
      }
    } catch (err) {
      console.error('Failed to fetch consistency:', err);
    } finally {
      setConsistencyLoading(false);
    }
  };

  useEffect(() => {
    if (!isElite) { setLoading(false); setConsistencyLoading(false); return; }
    fetchChecklist();
    fetchConsistency();
  }, [isElite]);

  const addItem = async () => {
    const label = newItemLabel.trim();
    if (!label) return;
    try {
      const resp = await authFetch('/api/premarket/checklist', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ label, sortOrder: items.length }),
      });
      const item = await resp.json();
      if (!item.error) {
        setItems([...items, item]);
        setNewItemLabel('');
      }
    } catch (err) {
      console.error('Failed to add item:', err);
    }
  };

  const updateItem = async (id) => {
    const label = editingLabel.trim();
    if (!label) return;
    try {
      const resp = await authFetch(`/api/premarket/checklist/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ label }),
      });
      const updated = await resp.json();
      if (!updated.error) {
        setItems(items.map(i => i._id === id ? updated : i));
        setEditingId(null);
        setEditingLabel('');
      }
    } catch (err) {
      console.error('Failed to update item:', err);
    }
  };

  const deleteItem = async (id) => {
    try {
      await authFetch(`/api/premarket/checklist/${id}`, { method: 'DELETE' });
      setItems(items.filter(i => i._id !== id));
      setCompletions(completions.filter(c => c.itemId !== id));
    } catch (err) {
      console.error('Failed to delete item:', err);
    }
  };

  const toggleItem = async (itemId) => {
    // Optimistic update — immediately reflect in UI
    const wasCompleted = completions.some(c => c.itemId === itemId);
    if (wasCompleted) {
      setCompletions(prev => prev.filter(c => c.itemId !== itemId));
    } else {
      setCompletions(prev => [...prev, { itemId, completedDate: todayDate }]);
    }
    try {
      const resp = await authFetch('/api/premarket/checklist/toggle', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ itemId, date: todayDate }),
      });
      const result = await resp.json();
      if (result.error) {
        // Revert on error
        if (wasCompleted) {
          setCompletions(prev => [...prev, { itemId, completedDate: todayDate }]);
        } else {
          setCompletions(prev => prev.filter(c => c.itemId !== itemId));
        }
      }
    } catch (err) {
      console.error('Failed to toggle item:', err);
      // Revert on error
      if (wasCompleted) {
        setCompletions(prev => [...prev, { itemId, completedDate: todayDate }]);
      } else {
        setCompletions(prev => prev.filter(c => c.itemId !== itemId));
      }
    }
  };

  const saveSettings = async (resetTime, timezone) => {
    try {
      const resp = await authFetch('/api/premarket/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ resetTime, timezone }),
      });
      const result = await resp.json();
      if (!result.error) {
        setSettings(prev => ({ ...prev, resetTime: result.resetTime, timezone: result.timezone }));
      }
    } catch (err) {
      console.error('Failed to save settings:', err);
    }
  };

  const isCompleted = (itemId) => completions.some(c => c.itemId === itemId);
  const completedCount = items.filter(i => isCompleted(i._id)).length;
  const progress = items.length > 0 ? Math.round((completedCount / items.length) * 100) : 0;

  const [calendarMonth, setCalendarMonth] = useState(() => {
    const now = new Date();
    return { year: now.getFullYear(), month: now.getMonth() };
  });
  const [selectedCalDate, setSelectedCalDate] = useState(null);

  const toggleCalendarItem = async (itemId, date) => {
    if (!date) return;
    const completedIds = consistencyData?.[date] || [];
    const wasCompleted = completedIds.includes(itemId);

    // Optimistic update
    setConsistencyData(prev => {
      const updated = { ...prev };
      if (wasCompleted) {
        updated[date] = (updated[date] || []).filter(id => id !== itemId);
      } else {
        updated[date] = [...(updated[date] || []), itemId];
      }
      return updated;
    });
    if (date === todayDate) {
      if (wasCompleted) {
        setCompletions(prev => prev.filter(c => c.itemId !== itemId));
      } else {
        setCompletions(prev => [...prev, { itemId, completedDate: todayDate }]);
      }
    }

    try {
      const resp = await authFetch('/api/premarket/checklist/toggle', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ itemId, date }),
      });
      const result = await resp.json();
      if (result.error) {
        // Revert
        await fetchConsistency();
        if (date === todayDate) await fetchChecklist();
      }
    } catch (err) {
      console.error('Failed to toggle item:', err);
      await fetchConsistency();
      if (date === todayDate) await fetchChecklist();
    }
  };

  const timezoneLabels = {
    'America/New_York': 'ET',
    'America/Chicago': 'CT',
    'America/Denver': 'MT',
    'America/Los_Angeles': 'PT',
    'UTC': 'UTC',
  };

  if (!isElite) {
    return (
      <div className="text-center py-16">
        <Icons.Sunrise className="w-12 h-12 text-text-muted mx-auto mb-4" />
        <h2 className="text-text-primary text-xl font-semibold mb-2">Pre-Market Prep</h2>
        <p className="text-text-secondary text-sm mb-6 max-w-md mx-auto">
          Build a daily pre-market checklist, track your routine consistency, and see how your preparation correlates with trading performance.
        </p>
        <a href="/upgrade" className="inline-flex items-center gap-2 px-6 py-3 bg-accent text-accent-text text-sm font-semibold rounded-xl hover:brightness-110 transition-all">
          <Icons.Zap className="w-4 h-4" /> Upgrade to Elite
        </a>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="w-8 h-8 border-2 border-accent border-t-transparent rounded-full animate-spin"></div>
      </div>
    );
  }

  // --- Consistency analytics (computed client-side) ---
  const now90 = new Date();
  const start90 = new Date();
  start90.setDate(start90.getDate() - 90);
  const start90Str = start90.toLocaleDateString('en-CA');
  const now90Str = now90.toLocaleDateString('en-CA');

  const tradingDates = trades
    ? [...new Set(
        trades
          .filter(t => t.exitTime)
          .map(t => {
            const e = toEST(t.exitTime);
            return `${e.year}-${String(e.month).padStart(2, '0')}-${String(e.day).padStart(2, '0')}`;
          })
          .filter(d => d >= start90Str && d <= now90Str)
      )]
    : [];

  const tradingDaysCount = tradingDates.length;

  const itemConsistency = consistencyData !== null && items.length > 0
    ? items.map(item => {
        const daysCompleted = tradingDates.filter(d => {
          const completedIds = consistencyData[d] || [];
          return completedIds.includes(item._id);
        }).length;
        const rate = tradingDaysCount > 0 ? daysCompleted / tradingDaysCount : 0;
        return { item, daysCompleted, rate };
      }).sort((a, b) => a.rate - b.rate)
    : [];

  const overallRate = itemConsistency.length > 0
    ? itemConsistency.reduce((sum, x) => sum + x.rate, 0) / itemConsistency.length
    : 0;

  const overallPct = Math.round(overallRate * 100);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-text-primary">Pre-Market Prep</h1>
          <p className="text-text-secondary text-sm mt-1">
            {new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}
          </p>
        </div>
        <button
          onClick={() => setShowSettings(!showSettings)}
          className="flex items-center gap-2 px-3 py-1.5 text-xs rounded-lg bg-bg-surface border border-border text-text-secondary hover:text-text-primary transition-colors"
        >
          <Icons.Settings className="w-3.5 h-3.5" />
          {settings.resetTime} {timezoneLabels[settings.timezone] || settings.timezone}
        </button>
      </div>

      {/* Settings Panel */}
      {showSettings && (
        <div className="bg-bg-surface border border-border rounded-xl p-4 space-y-3">
          <h3 className="text-sm font-medium text-text-primary">Reset Settings</h3>
          <p className="text-xs text-text-secondary">Checklist resets daily at this time. Items completed before this time count for the previous day.</p>
          <div className="flex gap-3">
            <div>
              <label className="block text-xs text-text-secondary mb-1">Reset Time</label>
              <select
                value={settings.resetTime}
                onChange={(e) => {
                  const newTime = e.target.value;
                  setSettings({ ...settings, resetTime: newTime });
                  saveSettings(newTime, settings.timezone);
                }}
                className="bg-bg-page border border-border rounded-lg px-3 py-1.5 text-sm text-text-primary"
              >
                {Array.from({ length: 24 }, (_, i) => {
                  const h = String(i).padStart(2, '0');
                  return <option key={h} value={`${h}:00`}>{`${h}:00`}</option>;
                })}
              </select>
            </div>
            <div>
              <label className="block text-xs text-text-secondary mb-1">Timezone</label>
              <select
                value={settings.timezone}
                onChange={(e) => {
                  const newTz = e.target.value;
                  setSettings({ ...settings, timezone: newTz });
                  saveSettings(settings.resetTime, newTz);
                }}
                className="bg-bg-page border border-border rounded-lg px-3 py-1.5 text-sm text-text-primary"
              >
                <option value="America/New_York">Eastern (ET)</option>
                <option value="America/Chicago">Central (CT)</option>
                <option value="America/Denver">Mountain (MT)</option>
                <option value="America/Los_Angeles">Pacific (PT)</option>
                <option value="UTC">UTC</option>
              </select>
            </div>
          </div>
        </div>
      )}

      {/* Checklist Section */}
      <div className="bg-bg-surface border border-border rounded-xl overflow-hidden">
        <div className="px-5 py-4 border-b border-border">
          <div className="flex items-center justify-between mb-2">
            <h2 className="text-sm font-semibold text-text-primary uppercase tracking-wider">My Checklist</h2>
            <span className="text-xs text-text-secondary">{completedCount}/{items.length} complete</span>
          </div>
          {items.length > 0 && (
            <div className="w-full bg-bg-page rounded-full h-2">
              <div
                className={`h-2 rounded-full transition-all duration-500 ease-out bg-positive`}
                style={{ width: `${progress}%` }}
              />
            </div>
          )}
        </div>

        <div className="divide-y divide-border">
          {items.map((item) => (
            <div key={item._id} className="flex items-center gap-3 px-5 py-3 group hover:bg-bg-page/50 transition-colors">
              <button
                onClick={() => toggleItem(item._id)}
                className={`w-5 h-5 rounded border-2 flex items-center justify-center flex-shrink-0 transition-colors ${
                  isCompleted(item._id)
                    ? 'bg-accent border-accent text-white'
                    : 'border-border hover:border-accent'
                }`}
              >
                {isCompleted(item._id) && (
                  <svg className="w-3 h-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                    <polyline points="20 6 9 17 4 12"></polyline>
                  </svg>
                )}
              </button>

              {editingId === item._id ? (
                <div className="flex-1 flex gap-2">
                  <input
                    type="text"
                    value={editingLabel}
                    onChange={(e) => setEditingLabel(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') updateItem(item._id);
                      if (e.key === 'Escape') { setEditingId(null); setEditingLabel(''); }
                    }}
                    className="flex-1 bg-bg-page border border-border rounded px-2 py-1 text-sm text-text-primary"
                    autoFocus
                  />
                  <button onClick={() => updateItem(item._id)} className="text-accent text-xs font-medium">Save</button>
                  <button onClick={() => { setEditingId(null); setEditingLabel(''); }} className="text-text-secondary text-xs">Cancel</button>
                </div>
              ) : (
                <>
                  <span className={`flex-1 text-sm ${isCompleted(item._id) ? 'line-through text-text-secondary' : 'text-text-primary'}`}>
                    {item.label}
                  </span>
                  <div className="hidden group-hover:flex items-center gap-1">
                    <button
                      onClick={() => { setEditingId(item._id); setEditingLabel(item.label); }}
                      className="p-1 text-text-secondary hover:text-text-primary transition-colors"
                    >
                      <Icons.Edit className="w-3.5 h-3.5" />
                    </button>
                    <button
                      onClick={() => deleteItem(item._id)}
                      className="p-1 text-text-secondary hover:text-negative transition-colors"
                    >
                      <Icons.X className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </>
              )}
            </div>
          ))}
        </div>

        {/* Add item */}
        <div className="px-5 py-3 border-t border-border">
          <div className="flex gap-2">
            <input
              type="text"
              value={newItemLabel}
              onChange={(e) => setNewItemLabel(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') addItem(); }}
              placeholder="Add a checklist item..."
              className="flex-1 bg-bg-page border border-border rounded-lg px-3 py-2 text-sm text-text-primary placeholder-text-secondary"
            />
            <button
              onClick={addItem}
              disabled={!newItemLabel.trim()}
              className="px-3 py-2 bg-accent text-white rounded-lg text-sm font-medium hover:opacity-90 transition-opacity disabled:opacity-50"
            >
              <Icons.Plus className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>

      {/* Calendar + Consistency — side by side */}
      {items.length > 0 && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Prep Calendar (Mon-Fri only) */}
          <div className="bg-bg-surface border border-border rounded-xl overflow-hidden">
            <div className="px-4 py-3 border-b border-border flex items-center justify-between">
              <h2 className="text-sm font-semibold text-text-primary uppercase tracking-wider">Prep Calendar</h2>
              <div className="flex items-center gap-1">
                <button
                  onClick={() => setCalendarMonth(prev => {
                    const d = new Date(prev.year, prev.month - 1, 1);
                    return { year: d.getFullYear(), month: d.getMonth() };
                  })}
                  className="p-1 rounded hover:bg-bg-input text-text-muted hover:text-text-primary transition-colors"
                >
                  <Icons.ChevronLeft className="w-3.5 h-3.5" />
                </button>
                <span className="text-xs font-medium text-text-primary min-w-[100px] text-center">
                  {new Date(calendarMonth.year, calendarMonth.month).toLocaleDateString('en-US', { month: 'short', year: 'numeric' })}
                </span>
                <button
                  onClick={() => setCalendarMonth(prev => {
                    const d = new Date(prev.year, prev.month + 1, 1);
                    return { year: d.getFullYear(), month: d.getMonth() };
                  })}
                  className="p-1 rounded hover:bg-bg-input text-text-muted hover:text-text-primary transition-colors"
                >
                  <Icons.ChevronRight className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
            <div className="p-4">
              {(() => {
                const { year, month } = calendarMonth;
                const daysInMonth = new Date(year, month + 1, 0).getDate();

                // Build rows: each row is Mon-Fri for one week
                const dayNames = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri'];
                const weeks = [];
                let currentWeek = [null, null, null, null, null]; // Mon-Fri slots

                for (let d = 1; d <= daysInMonth; d++) {
                  const date = new Date(year, month, d);
                  const dow = date.getDay(); // 0=Sun, 6=Sat
                  if (dow === 0 || dow === 6) continue; // skip weekends
                  const slot = dow - 1; // Mon=0, Tue=1, ... Fri=4
                  currentWeek[slot] = d;
                  if (dow === 5 || d === daysInMonth) {
                    weeks.push(currentWeek);
                    currentWeek = [null, null, null, null, null];
                  }
                }

                return (
                  <div>
                    <div className="grid grid-cols-5 gap-1 mb-1">
                      {dayNames.map(d => (
                        <div key={d} className="text-center text-[9px] font-medium text-text-muted py-0.5">{d}</div>
                      ))}
                    </div>
                    <div className="space-y-1">
                      {weeks.map((week, wi) => (
                        <div key={wi} className="grid grid-cols-5 gap-1">
                          {week.map((day, di) => {
                            if (day === null) return <div key={`e-${di}`} />;

                            const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
                            const isToday = dateStr === todayDate;
                            const isFuture = dateStr > todayDate;
                            const isSelected = dateStr === selectedCalDate;
                            const completedIds = consistencyData?.[dateStr] || [];
                            const done = completedIds.length;
                            const total = items.length;
                            const allDone = done >= total && total > 0;
                            const someDone = done > 0 && done < total;

                            return (
                              <button
                                key={day}
                                onClick={() => !isFuture && setSelectedCalDate(isSelected ? null : dateStr)}
                                className={`relative aspect-square rounded text-[11px] font-medium transition-all flex items-center justify-center ${
                                  isFuture ? 'text-text-muted/30 cursor-default' :
                                  allDone ? 'bg-positive/15 text-positive' :
                                  someDone ? 'bg-yellow-500/10 text-yellow-600' :
                                  'bg-bg-page text-text-muted hover:bg-bg-input'
                                } ${isToday ? 'ring-2 ring-accent' : ''} ${isSelected ? 'ring-2 ring-text-primary' : ''}`}
                              >
                                {day}
                                {allDone && (
                                  <svg className="absolute bottom-0 right-0 w-2 h-2 text-positive" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round">
                                    <polyline points="20 6 9 17 4 12" />
                                  </svg>
                                )}
                              </button>
                            );
                          })}
                        </div>
                      ))}
                    </div>

                    {/* Selected day task list */}
                    {selectedCalDate && (
                      <div className="mt-3 pt-3 border-t border-border">
                        <p className="text-xs font-semibold text-text-primary mb-2">
                          {new Date(selectedCalDate + 'T12:00:00').toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}
                        </p>
                        <div className="space-y-1">
                          {items.map(item => {
                            const completedIds = consistencyData?.[selectedCalDate] || [];
                            const isDone = completedIds.includes(item._id);
                            return (
                              <button
                                key={item._id}
                                onClick={() => toggleCalendarItem(item._id, selectedCalDate)}
                                className="flex items-center gap-2 w-full text-left px-2 py-1.5 rounded hover:bg-bg-input/50 transition-colors"
                              >
                                <span className={`w-4 h-4 rounded border-2 flex items-center justify-center flex-shrink-0 transition-colors ${
                                  isDone ? 'bg-accent border-accent text-white' : 'border-border'
                                }`}>
                                  {isDone && (
                                    <svg className="w-2.5 h-2.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                                      <polyline points="20 6 9 17 4 12" />
                                    </svg>
                                  )}
                                </span>
                                <span className={`text-xs ${isDone ? 'line-through text-text-secondary' : 'text-text-primary'}`}>{item.label}</span>
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    )}

                    {/* Legend */}
                    <div className="flex items-center gap-3 mt-3 text-[9px] text-text-muted">
                      <div className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded bg-positive/15 inline-block" /> Done</div>
                      <div className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded bg-yellow-500/10 inline-block" /> Partial</div>
                      <div className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded bg-bg-page inline-block" /> None</div>
                    </div>
                  </div>
                );
              })()}
            </div>
          </div>

          {/* Consistency Analytics */}
          <div className="bg-bg-surface border border-border rounded-xl overflow-hidden">
            <div className="px-4 py-3 border-b border-border">
              <h2 className="text-sm font-semibold text-text-primary uppercase tracking-wider">Checklist Consistency</h2>
              <p className="text-xs text-text-secondary mt-0.5">On days you traded (last 90 days)</p>
            </div>

            {consistencyLoading ? (
              <div className="flex items-center justify-center py-8">
                <div className="w-6 h-6 border-2 border-accent border-t-transparent rounded-full animate-spin"></div>
              </div>
            ) : tradingDaysCount === 0 ? (
              <div className="px-4 py-8 text-center text-sm text-text-secondary">
                No trading days found in the last 90 days
              </div>
            ) : (
              <div className="px-4 py-4 space-y-4">
                {/* Overall stat */}
                <div className="flex items-center gap-4">
                  <div className="relative w-14 h-14 flex-shrink-0">
                    <svg className="w-14 h-14 -rotate-90" viewBox="0 0 64 64">
                      <circle cx="32" cy="32" r="26" fill="none" className="stroke-border" strokeWidth="6" />
                      <circle
                        cx="32" cy="32" r="26" fill="none"
                        className="stroke-positive"
                        strokeWidth="6"
                        strokeLinecap="round"
                        strokeDasharray={`${2 * Math.PI * 26}`}
                        strokeDashoffset={`${2 * Math.PI * 26 * (1 - overallRate)}`}
                      />
                    </svg>
                    <span className="absolute inset-0 flex items-center justify-center text-xs font-bold text-text-primary">
                      {overallPct}%
                    </span>
                  </div>
                  <div>
                    <div className="text-text-primary font-semibold text-sm">Overall Adherence</div>
                    <div className="text-text-secondary text-xs mt-0.5">{tradingDaysCount} trading {tradingDaysCount === 1 ? 'day' : 'days'} analyzed</div>
                  </div>
                </div>

                {/* Per-item breakdown */}
                <div className="space-y-2">
                  {itemConsistency.map(({ item, daysCompleted, rate }) => {
                    const pct = Math.round(rate * 100);
                    const isMostSkipped = rate < 0.5;
                    return (
                      <div key={item._id}>
                        <div className="flex items-center justify-between mb-1">
                          <div className="flex items-center gap-1.5 min-w-0">
                            <span className="text-xs text-text-primary truncate">{item.label}</span>
                            {isMostSkipped && (
                              <span className="text-[10px] text-negative font-medium flex-shrink-0">Most skipped</span>
                            )}
                          </div>
                          <span className="text-[10px] text-text-secondary flex-shrink-0 ml-2">
                            {daysCompleted}/{tradingDaysCount} — {pct}%
                          </span>
                        </div>
                        <div className="w-full bg-bg-page rounded-full h-1.5">
                          <div
                            className={`h-1.5 rounded-full transition-all duration-300 bg-positive`}
                            style={{ width: `${pct}%` }}
                          />
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* P&L vs Prep Completion Chart */}
      {trades && trades.length > 0 && items.length > 0 && !consistencyLoading && (
        <div className="bg-bg-surface border border-border rounded-xl overflow-hidden">
          <div className="px-5 py-4 border-b border-border">
            <h2 className="text-sm font-semibold text-text-primary uppercase tracking-wider">P&L vs Prep Completion</h2>
            <p className="text-xs text-text-secondary mt-0.5">X-axis: tasks completed. Green = winning day, red = losing day.</p>
          </div>
          <div className="px-5 py-4">
            {(() => {
              // Group trades by date, compute daily P&L
              const dailyPL = {};
              trades.filter(t => t.exitTime).forEach(t => {
                const e = toEST(t.exitTime);
                const dateStr = `${e.year}-${String(e.month).padStart(2, '0')}-${String(e.day).padStart(2, '0')}`;
                if (dateStr < start90Str || dateStr > now90Str) return;
                if (!dailyPL[dateStr]) dailyPL[dateStr] = 0;
                dailyPL[dateStr] += getTradePL(t);
              });

              const totalTasks = items.length;
              const dataPoints = Object.entries(dailyPL).map(([date, pl]) => {
                const completedIds = consistencyData?.[date] || [];
                const tasksCompleted = completedIds.length;
                return { date, pl, tasksCompleted };
              });

              if (dataPoints.length === 0) {
                return <p className="text-text-muted text-sm text-center py-4">No trading days with P&L data in the last 90 days</p>;
              }

              const pls = dataPoints.map(d => d.pl);
              const maxPL = Math.max(...pls, 0);
              const minPL = Math.min(...pls, 0);
              const range = Math.max(maxPL - minPL, 1);

              const chartW = 600;
              const chartH = 220;
              const padL = 60;
              const padR = 20;
              const padT = 15;
              const padB = 35;
              const plotW = chartW - padL - padR;
              const plotH = chartH - padT - padB;

              const zeroY = padT + plotH * (maxPL / range);

              return (
                <div>
                  <svg viewBox={`0 0 ${chartW} ${chartH}`} className="w-full" style={{ maxHeight: '260px' }}>
                    {/* Zero line */}
                    <line x1={padL} y1={zeroY} x2={chartW - padR} y2={zeroY} stroke="rgb(var(--border))" strokeWidth="1" strokeDasharray="4 2" />
                    <text x={padL - 8} y={zeroY + 3} textAnchor="end" fill="rgb(var(--text-muted))" fontSize="9" fontFamily="monospace">$0</text>

                    {/* Max line */}
                    {maxPL > 0 && (
                      <>
                        <line x1={padL} y1={padT} x2={chartW - padR} y2={padT} stroke="rgb(var(--border))" strokeWidth="0.5" />
                        <text x={padL - 8} y={padT + 3} textAnchor="end" fill="rgb(var(--text-muted))" fontSize="9" fontFamily="monospace">
                          ${maxPL >= 1000 ? `${(maxPL / 1000).toFixed(1)}k` : maxPL.toFixed(0)}
                        </text>
                      </>
                    )}

                    {/* Min line */}
                    {minPL < 0 && (
                      <>
                        <line x1={padL} y1={padT + plotH} x2={chartW - padR} y2={padT + plotH} stroke="rgb(var(--border))" strokeWidth="0.5" />
                        <text x={padL - 8} y={padT + plotH + 3} textAnchor="end" fill="rgb(var(--text-muted))" fontSize="9" fontFamily="monospace">
                          {minPL >= -1000 ? `-$${Math.abs(minPL).toFixed(0)}` : `-$${(Math.abs(minPL) / 1000).toFixed(1)}k`}
                        </text>
                      </>
                    )}

                    {/* X-axis labels (task count) */}
                    {Array.from({ length: totalTasks + 1 }, (_, i) => {
                      const x = padL + (i / totalTasks) * plotW;
                      return (
                        <g key={i}>
                          <line x1={x} y1={padT + plotH} x2={x} y2={padT + plotH + 4} stroke="rgb(var(--border))" strokeWidth="0.5" />
                          <text x={x} y={chartH - 8} textAnchor="middle" fill="rgb(var(--text-muted))" fontSize="9" fontFamily="monospace">{i}</text>
                        </g>
                      );
                    })}
                    <text x={padL + plotW / 2} y={chartH - 0} textAnchor="middle" fill="rgb(var(--text-muted))" fontSize="8">Tasks Completed</text>

                    {/* Vertical grid lines */}
                    {Array.from({ length: totalTasks + 1 }, (_, i) => {
                      const x = padL + (i / totalTasks) * plotW;
                      return <line key={i} x1={x} y1={padT} x2={x} y2={padT + plotH} stroke="rgb(var(--border))" strokeWidth="0.3" strokeDasharray="2 3" />;
                    })}

                    {/* Data points */}
                    {dataPoints.map((d) => {
                      const x = padL + (d.tasksCompleted / totalTasks) * plotW;
                      const y = padT + plotH * ((maxPL - d.pl) / range);
                      const isWin = d.pl > 0;
                      return (
                        <g key={d.date}>
                          <circle
                            cx={x} cy={y} r={5}
                            fill={isWin ? 'rgb(var(--positive))' : 'rgb(var(--negative))'}
                            fillOpacity={0.8}
                            stroke={isWin ? 'rgb(var(--positive))' : 'rgb(var(--negative))'}
                            strokeWidth={1.5}
                          />
                          <title>{`${d.date}: $${d.pl.toFixed(2)} (${d.tasksCompleted}/${totalTasks} tasks)`}</title>
                        </g>
                      );
                    })}
                  </svg>

                  {/* Summary stats by task completion */}
                  <div className="grid grid-cols-3 gap-3 mt-3">
                    {[
                      { label: 'All Done', filter: d => d.tasksCompleted >= totalTasks, color: 'text-positive' },
                      { label: 'Partial', filter: d => d.tasksCompleted > 0 && d.tasksCompleted < totalTasks, color: 'text-yellow-500' },
                      { label: 'No Prep', filter: d => d.tasksCompleted === 0, color: 'text-negative' },
                    ].map(({ label, filter, color }) => {
                      const pts = dataPoints.filter(filter);
                      const avgPL = pts.length > 0 ? pts.reduce((s, d) => s + d.pl, 0) / pts.length : 0;
                      const winRate = pts.length > 0 ? (pts.filter(d => d.pl > 0).length / pts.length) * 100 : 0;
                      return (
                        <div key={label} className="bg-bg-input rounded-lg p-3 text-center">
                          <div className={`text-xs font-medium ${color} mb-1`}>{label}</div>
                          <div className="text-text-primary font-mono font-semibold text-sm">
                            {pts.length > 0 ? `$${avgPL.toFixed(0)}` : '—'}
                          </div>
                          <div className="text-text-muted text-xs">
                            {pts.length > 0 ? `${winRate.toFixed(0)}% win · ${pts.length} days` : 'No data'}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })()}
          </div>
        </div>
      )}
    </div>
  );
};

// =====================================================
// UPGRADE PAGE
// =====================================================
const UpgradePage = ({ pricing }) => {
  const planDefs = (pricing && pricing.plans) || {};
  const plans = [
    {
      name: (planDefs.trial && planDefs.trial.name) || 'Trial',
      price: '$0',
      period: '14 days',
      features: (planDefs.trial && planDefs.trial.features) || ['All Pro features for 14 days', 'Up to 50 trades'],
      accent: false,
      popular: false,
    },
    {
      name: (planDefs.pro && planDefs.pro.name) || 'Pro',
      price: `$${(pricing && pricing.pro) || '19'}`,
      period: '/month',
      features: (planDefs.pro && planDefs.pro.features) || ['Unlimited trades', 'Advanced analytics', '1 Backtesting session'],
      accent: true,
      popular: true,
    },
    {
      name: (planDefs.elite && planDefs.elite.name) || 'Elite',
      price: `$${(pricing && pricing.elite) || '24'}`,
      period: '/month',
      features: (planDefs.elite && planDefs.elite.features) || ['Everything in Pro', 'Unlimited Backtesting'],
      accent: false,
      popular: false,
    },
  ];

  return (
    <div className="space-y-8">
      <div className="text-center">
        <h1 className="text-3xl font-bold text-text-primary">Upgrade Your Plan</h1>
        <p className="text-text-secondary mt-2 max-w-lg mx-auto">Choose the plan that fits your trading style.</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 max-w-4xl mx-auto">
        {plans.map(plan => (
          <div
            key={plan.name}
            className={`relative bg-bg-surface rounded-xl p-6 flex flex-col ${
              plan.accent
                ? 'border-2 border-accent'
                : 'border border-border'
            }`}
          >
            {plan.popular && (
              <div className="absolute -top-3 left-1/2 -translate-x-1/2 px-3 py-1 bg-accent text-accent-text text-xs font-bold rounded-full">
                Most Popular
              </div>
            )}
            <h3 className="text-text-primary font-semibold text-lg">{plan.name}</h3>
            <div className="mt-4 mb-6">
              <span className="text-text-primary font-mono text-4xl font-bold">{plan.price}</span>
              <span className="text-text-tertiary text-sm ml-1">{plan.period}</span>
            </div>
            <ul className="space-y-3 flex-1">
              {plan.features.map(feature => (
                <li key={feature} className="flex items-center gap-2 text-sm text-text-secondary">
                  <Icons.Check className="w-4 h-4 text-accent flex-shrink-0" />
                  {feature}
                </li>
              ))}
            </ul>
            <button
              onClick={() => plan.name !== 'Trial' && (window.location.href = '/upgrade')}
              className={`mt-6 w-full py-2.5 text-sm font-semibold rounded-lg transition-all ${
                plan.accent
                  ? 'bg-accent text-accent-text hover:brightness-110'
                  : 'bg-bg-input border border-border text-text-primary hover:border-accent'
              }`}
            >
              {plan.name === 'Trial' ? 'Current Plan' : `Get ${plan.name}`}
            </button>
          </div>
        ))}
      </div>

      <p className="text-center text-text-muted text-xs">Cancel anytime. Remaining balance refunded.</p>
    </div>
  );
};

// =====================================================
// SCREENSHOT MARKUP MODAL
// =====================================================
const ScreenshotMarkupModal = ({ isOpen, onClose, onSave, initialImage }) => {
  const canvasRef = useRef(null);
  const textInputRef = useRef(null);
  const [currentTool, setCurrentTool] = useState('pen');
  const [currentColor, setCurrentColor] = useState('#ef4444');
  const [isDrawing, setIsDrawing] = useState(false);
  const [history, setHistory] = useState([]);
  const [historyStep, setHistoryStep] = useState(-1);
  const [textInput, setTextInput] = useState({ visible: false, x: 0, y: 0, value: '' });

  useEffect(() => {
    if (!isOpen || !canvasRef.current) return;
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    const img = new Image();
    img.onload = () => {
      const maxWidth = 900, maxHeight = 700;
      let width = img.width, height = img.height;
      if (width > maxWidth) { height = (height * maxWidth) / width; width = maxWidth; }
      if (height > maxHeight) { width = (width * maxHeight) / height; height = maxHeight; }
      canvas.width = width; canvas.height = height;
      ctx.drawImage(img, 0, 0, width, height);
      saveState();
    };
    img.src = initialImage;
  }, [isOpen, initialImage]);

  const saveState = () => {
    if (!canvasRef.current) return;
    const newHistory = history.slice(0, historyStep + 1);
    newHistory.push(canvasRef.current.toDataURL());
    setHistory(newHistory);
    setHistoryStep(newHistory.length - 1);
  };

  const undo = () => {
    if (historyStep > 0) {
      const canvas = canvasRef.current;
      const ctx = canvas.getContext('2d');
      const img = new Image();
      img.onload = () => { ctx.clearRect(0, 0, canvas.width, canvas.height); ctx.drawImage(img, 0, 0); };
      img.src = history[historyStep - 1];
      setHistoryStep(historyStep - 1);
    }
  };

  const clearCanvas = () => {
    if (!canvasRef.current) return;
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    const img = new Image();
    img.onload = () => { ctx.clearRect(0, 0, canvas.width, canvas.height); ctx.drawImage(img, 0, 0, canvas.width, canvas.height); saveState(); };
    img.src = initialImage;
  };

  useEffect(() => {
    if (textInput.visible && textInputRef.current) {
      textInputRef.current.focus();
    }
  }, [textInput.visible]);

  const commitText = () => {
    if (!textInput.visible) return;
    if (textInput.value.trim()) {
      const canvas = canvasRef.current;
      const ctx = canvas.getContext('2d');
      ctx.font = 'bold 18px Inter, sans-serif';
      ctx.fillStyle = currentColor;
      ctx.fillText(textInput.value, textInput.x, textInput.y + 18);
      saveState();
    }
    setTextInput({ visible: false, x: 0, y: 0, value: '' });
  };

  const startDrawing = (e) => {
    if (textInput.visible) return;
    const canvas = canvasRef.current;
    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    setIsDrawing(true);
    const ctx = canvas.getContext('2d');
    ctx.strokeStyle = currentColor;
    ctx.lineWidth = 3;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    if (currentTool === 'pen') { ctx.beginPath(); ctx.moveTo(x, y); }
    else if (currentTool === 'arrow') { canvas.dataset.startX = x; canvas.dataset.startY = y; }
    else if (currentTool === 'text') {
      setTextInput({ visible: true, x, y, value: '' });
      setIsDrawing(false);
    }
  };

  const draw = (e) => {
    if (!isDrawing) return;
    const canvas = canvasRef.current;
    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    const ctx = canvas.getContext('2d');
    if (currentTool === 'pen') { ctx.lineTo(x, y); ctx.stroke(); }
  };

  const stopDrawing = (e) => {
    if (!isDrawing) return;
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    if (currentTool === 'arrow') {
      const rect = canvas.getBoundingClientRect();
      const endX = e.clientX - rect.left;
      const endY = e.clientY - rect.top;
      const startX = parseFloat(canvas.dataset.startX);
      const startY = parseFloat(canvas.dataset.startY);
      const angle = Math.atan2(endY - startY, endX - startX);
      const headLength = 15;
      ctx.beginPath();
      ctx.moveTo(startX, startY); ctx.lineTo(endX, endY);
      ctx.lineTo(endX - headLength * Math.cos(angle - Math.PI / 6), endY - headLength * Math.sin(angle - Math.PI / 6));
      ctx.moveTo(endX, endY);
      ctx.lineTo(endX - headLength * Math.cos(angle + Math.PI / 6), endY - headLength * Math.sin(angle + Math.PI / 6));
      ctx.stroke();
    }
    setIsDrawing(false);
    saveState();
  };

  const handleSave = async () => {
    if (!canvasRef.current) return;
    const resizedData = await resizeImage(canvasRef.current.toDataURL('image/png'));
    onSave(resizedData);
    onClose();
  };

  if (!isOpen) return null;

  const tools = [
    { id: 'pen', label: 'Pen' },
    { id: 'arrow', label: 'Arrow' },
    { id: 'text', label: 'Text' },
  ];

  return (
    <div className="fixed inset-0 z-[60] bg-black/80 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-bg-surface border border-border rounded-xl max-w-[960px] w-full max-h-[90vh] flex flex-col" onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-border">
          <h3 className="text-text-primary font-semibold">Annotate Screenshot</h3>
          <button className="text-text-secondary hover:text-text-primary transition-colors" onClick={onClose}>
            <Icons.X />
          </button>
        </div>

        {/* Toolbar */}
        <div className="flex items-center gap-4 px-6 py-3 border-b border-border">
          <div className="flex gap-1">
            {tools.map(tool => (
              <button
                key={tool.id}
                className={`px-3 py-1.5 text-xs font-medium rounded-lg transition-colors ${
                  currentTool === tool.id ? 'bg-accent text-accent-text' : 'bg-bg-input text-text-secondary hover:text-text-primary'
                }`}
                onClick={() => setCurrentTool(tool.id)}
              >
                {tool.label}
              </button>
            ))}
          </div>

          <div className="h-5 w-px bg-border"></div>

          <div className="flex gap-1.5">
            {['#ef4444', '#10b981', '#3b82f6', '#ffffff'].map(color => (
              <button
                key={color}
                className={`w-6 h-6 rounded-full border-2 transition-all ${
                  currentColor === color ? 'border-white scale-110' : 'border-transparent'
                }`}
                style={{ backgroundColor: color }}
                onClick={() => setCurrentColor(color)}
              />
            ))}
          </div>

          <div className="h-5 w-px bg-border"></div>

          <button className="px-3 py-1.5 text-xs bg-bg-input text-text-secondary rounded-lg hover:text-text-primary disabled:opacity-30" onClick={undo} disabled={historyStep <= 0}>
            Undo
          </button>
          <button className="px-3 py-1.5 text-xs bg-bg-input text-text-secondary rounded-lg hover:text-text-primary" onClick={clearCanvas}>
            Clear
          </button>
        </div>

        {/* Canvas */}
        <div className="flex-1 overflow-auto p-4 flex justify-center">
          <div className="relative" style={{ display: 'inline-block' }}>
            <canvas
              ref={canvasRef}
              className={`rounded-lg ${currentTool === 'text' ? 'cursor-text' : 'cursor-crosshair'}`}
              onMouseDown={startDrawing}
              onMouseMove={draw}
              onMouseUp={stopDrawing}
              onMouseLeave={stopDrawing}
            />
            {textInput.visible && (
              <input
                ref={textInputRef}
                type="text"
                className="absolute bg-transparent border-none outline-none p-0 m-0"
                style={{
                  left: textInput.x,
                  top: textInput.y,
                  color: currentColor,
                  font: 'bold 18px Inter, sans-serif',
                  minWidth: 80,
                  width: Math.max(80, textInput.value.length * 11 + 20),
                  caretColor: currentColor,
                  textShadow: '0 1px 3px rgba(0,0,0,0.8)',
                }}
                value={textInput.value}
                onChange={e => setTextInput(prev => ({ ...prev, value: e.target.value }))}
                onKeyDown={e => {
                  if (e.key === 'Enter') { e.preventDefault(); commitText(); }
                  if (e.key === 'Escape') { setTextInput({ visible: false, x: 0, y: 0, value: '' }); }
                }}
                onBlur={commitText}
              />
            )}
          </div>
        </div>

        {/* Actions */}
        <div className="flex justify-end gap-3 px-6 py-4 border-t border-border">
          <button className="px-4 py-2 text-sm text-text-secondary hover:text-text-primary transition-colors" onClick={onClose}>Cancel</button>
          <button className="px-4 py-2 bg-accent text-accent-text text-sm font-semibold rounded-lg hover:brightness-110 transition-all" onClick={handleSave}>Save Screenshot</button>
        </div>
      </div>
    </div>
  );
};

// =====================================================
// TICKER AUTOFILL
// =====================================================
const TickerAutofill = ({ id, name, placeholder, defaultValue, className, trades, onChange }) => {
  const [value, setValue] = useState(defaultValue || '');
  const [open, setOpen] = useState(false);
  const [highlightIdx, setHighlightIdx] = useState(-1);
  const wrapperRef = useRef(null);

  // Build merged suggestion list: user history first, then static, deduplicated
  const suggestions = useMemo(() => {
    const userTickers = [...new Set((trades || []).map(t => (t.ticker || '').toUpperCase()).filter(Boolean))];
    const seen = new Set(userTickers);
    const staticFiltered = COMMON_TICKERS.filter(t => !seen.has(t));
    return [...userTickers, ...staticFiltered];
  }, [trades]);

  const filtered = useMemo(() => {
    const q = value.toUpperCase().trim();
    if (!q) return suggestions.slice(0, 8);
    return suggestions.filter(t => t.startsWith(q)).slice(0, 8);
  }, [value, suggestions]);

  useEffect(() => {
    const handleClickOutside = (e) => {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target)) setOpen(false);
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const select = (ticker) => {
    setValue(ticker);
    setOpen(false);
    setHighlightIdx(-1);
    if (onChange) onChange(ticker);
  };

  const handleKeyDown = (e) => {
    if (!open || filtered.length === 0) return;
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setHighlightIdx(prev => (prev + 1) % filtered.length);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setHighlightIdx(prev => (prev - 1 + filtered.length) % filtered.length);
    } else if (e.key === 'Enter' && highlightIdx >= 0) {
      e.preventDefault();
      select(filtered[highlightIdx]);
    } else if (e.key === 'Escape') {
      setOpen(false);
      setHighlightIdx(-1);
    }
  };

  return (
    <div ref={wrapperRef} className="relative">
      <input
        id={id}
        name={name}
        type="text"
        placeholder={placeholder}
        value={value}
        onChange={(e) => {
          const v = e.target.value.toUpperCase();
          setValue(v);
          setOpen(true);
          setHighlightIdx(-1);
          if (onChange) onChange(v);
        }}
        onFocus={() => setOpen(true)}
        onKeyDown={handleKeyDown}
        className={className}
        style={{ textTransform: 'uppercase' }}
        autoComplete="off"
      />
      {open && filtered.length > 0 && (
        <ul className="absolute z-50 left-0 right-0 mt-1 bg-bg-surface border border-border rounded-lg shadow-lg max-h-52 overflow-y-auto">
          {filtered.map((t, i) => (
            <li
              key={t}
              className={`px-3 py-2 text-sm cursor-pointer font-mono ${i === highlightIdx ? 'bg-accent/20 text-accent' : 'text-text-primary hover:bg-bg-input'}`}
              onMouseDown={() => select(t)}
              onMouseEnter={() => setHighlightIdx(i)}
            >
              {t}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
};

// =====================================================
// TRADE FORM POPUP
// =====================================================
const TradeFormPopup = ({ isOpen, onClose, triggerReload, editingTrade, prefillDate, tags, strategyRules, subscriptionStatus, trades }) => {
  const [screenshot, setScreenshot] = useState(null);
  const [pastedImage, setPastedImage] = useState(null);
  const [isMarkupOpen, setIsMarkupOpen] = useState(false);
  const [markupSource, setMarkupSource] = useState(null);
  const [lightboxOpen, setLightboxOpen] = useState(false);
  const [selectedTags, setSelectedTags] = useState([]);
  const [showNewTag, setShowNewTag] = useState(false);
  const [quickTagName, setQuickTagName] = useState('');
  const [quickTagColor, setQuickTagColor] = useState(TAG_COLOR_PRESETS[0]);
  const [creatingTag, setCreatingTag] = useState(false);
  const [isEval, setIsEval] = useState(false);
  const [tradeRuleChecks, setTradeRuleChecks] = useState([]);
  const [pendingRuleChecks, setPendingRuleChecks] = useState([]);
  const [ruleChecksLoading, setRuleChecksLoading] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const fileInputRef = useRef(null);
  const windowWidth = useWindowWidth();
  const isUltrawide = windowWidth >= 2000;
  const setSidePanelOffset = React.useContext(SidePanelContext);
  const tradeRules = strategyRules ? strategyRules.filter(r => r.type === 'trade') : [];
  const isElite = subscriptionStatus && subscriptionStatus.plan === 'elite';
  useEffect(() => {
    if (!isOpen) { setSidePanelOffset(0); return; }
    if (isUltrawide) setSidePanelOffset(520);
    else setSidePanelOffset(0);
    return () => setSidePanelOffset(0);
  }, [isOpen, isUltrawide, setSidePanelOffset]);

  const handleQuickCreateTag = async () => {
    if (!quickTagName.trim() || creatingTag) return;
    setCreatingTag(true);
    try {
      const response = await authFetch('/api/makeTag', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: quickTagName.trim(), color: quickTagColor }),
      });
      const data = await response.json();
      if (!data.error && data._id) {
        setSelectedTags(prev => [...prev, data._id]);
        setQuickTagName('');
        setQuickTagColor(TAG_COLOR_PRESETS[0]);
        setShowNewTag(false);
        triggerReload();
      }
    } catch (err) {
      console.error('Failed to create tag:', err);
    }
    setCreatingTag(false);
  };

  useEffect(() => {
    const handleEscape = (e) => { if (e.key === 'Escape') onClose(); };
    if (isOpen) {
      document.addEventListener('keydown', handleEscape);
      if (!isUltrawide) document.body.style.overflow = 'hidden';
    }
    return () => {
      document.removeEventListener('keydown', handleEscape);
      document.body.style.overflow = 'unset';
    };
  }, [isOpen, onClose, isUltrawide]);

  useEffect(() => {
    if (!isOpen) {
      setScreenshot(null); setPastedImage(null); setSelectedTags([]);
      setIsEval(false); setTradeRuleChecks([]); setPendingRuleChecks([]);
      return;
    }
    if (editingTrade && editingTrade.screenshot) setScreenshot(editingTrade.screenshot);
    if (editingTrade && editingTrade.tags) setSelectedTags(editingTrade.tags);
    else setSelectedTags([]);
    if (editingTrade) {
      setIsEval(editingTrade.isEval || false);
      if (editingTrade._id && tradeRules.length > 0) {
        authFetch(`/api/strategy/checks/trade/${editingTrade._id}`)
          .then(r => r.json())
          .then(data => { if (!data.error) setTradeRuleChecks(data.checks || []); })
          .catch(() => {});
      }
    } else {
      setIsEval(false);
    }

    const handlePaste = (e) => {
      const items = e.clipboardData?.items;
      if (!items) return;
      for (let i = 0; i < items.length; i++) {
        if (items[i].type.indexOf('image') !== -1) {
          const blob = items[i].getAsFile();
          const reader = new FileReader();
          reader.onload = (event) => setPastedImage(event.target.result);
          reader.readAsDataURL(blob);
          e.preventDefault();
          break;
        }
      }
    };
    document.addEventListener('paste', handlePaste);
    return () => document.removeEventListener('paste', handlePaste);
  }, [isOpen, editingTrade]);

  if (!isOpen) return null;

  const isEditing = editingTrade !== null;

  const uploadScreenshot = async (dataUrl) => {
    setIsUploading(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Not authenticated');
      const base64 = dataUrl.split(',')[1];
      const byteChars = atob(base64);
      const byteArr = new Uint8Array(byteChars.length);
      for (let i = 0; i < byteChars.length; i++) byteArr[i] = byteChars.charCodeAt(i);
      const blob = new Blob([byteArr], { type: 'image/jpeg' });
      const fileName = `${user.id}/${Date.now()}-${Math.random().toString(36).slice(2)}.jpg`;
      const { data, error } = await supabase.storage.from('trade-screenshots').upload(fileName, blob, { contentType: 'image/jpeg', upsert: false });
      if (error) throw new Error(error.message);
      const { data: urlData } = supabase.storage.from('trade-screenshots').getPublicUrl(data.path);
      return urlData.publicUrl;
    } finally {
      setIsUploading(false);
    }
  };

  const handleFileChange = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (event) => setPastedImage(event.target.result);
    reader.readAsDataURL(file);
    e.target.value = '';
  };

  const handleRuleToggle = async (ruleId, followed) => {
    if (isEditing && editingTrade?._id) {
      setRuleChecksLoading(true);
      try {
        const resp = await authFetch('/api/strategy/checks/trade', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ tradeId: editingTrade._id, ruleId, followed }),
        });
        const check = await resp.json();
        if (!check.error) {
          setTradeRuleChecks(prev => {
            const filtered = prev.filter(ch => ch.ruleId !== ruleId);
            return [...filtered, check];
          });
        }
      } catch (err) {
        console.error('Failed to toggle rule:', err);
      } finally {
        setRuleChecksLoading(false);
      }
    } else {
      setPendingRuleChecks(prev => {
        const filtered = prev.filter(ch => ch.ruleId !== ruleId);
        return [...filtered, { ruleId, followed }];
      });
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    helper.hideError();
    const ticker = e.target.querySelector('#ticker').value;
    const enterTimeRaw = e.target.querySelector('#enterTime').value;
    const exitTimeRaw = e.target.querySelector('#exitTime').value;
    const enterPrice = e.target.querySelector('#enterPrice').value;
    const exitPrice = e.target.querySelector('#exitPrice').value;
    const quantity = e.target.querySelector('#quantity').value;
    const manualPL = e.target.querySelector('#manualPL').value;
    const comments = e.target.querySelector('#comments').value;
    const hasPrices = enterPrice && exitPrice;
    const hasPL = manualPL;
    if (!ticker || !enterTimeRaw || !exitTimeRaw || !quantity) {
      helper.handleError('Ticker, enter time, exit time, and quantity are required');
      return;
    }
    if (!hasPrices && !hasPL) {
      helper.handleError('Either enter/exit prices or a manual P/L is required');
      return;
    }
    const enterTime = enterTimeRaw + getESTOffset(new Date(enterTimeRaw));
    const exitTime = exitTimeRaw + getESTOffset(new Date(exitTimeRaw));
    const tradeData = {
      ticker, enterTime, exitTime,
      enterPrice: enterPrice ? parseFloat(enterPrice) : 0,
      exitPrice: exitPrice ? parseFloat(exitPrice) : 0,
      quantity: parseFloat(quantity),
      comments, isEval,
    };
    if (hasPL) tradeData.manualPL = parseFloat(manualPL);
    if (screenshot) tradeData.screenshot = screenshot;
    if (selectedTags.length > 0) tradeData.tags = selectedTags;
    try {
      if (isEditing) {
        tradeData._id = editingTrade._id;
        const resp = await authFetch('/api/updateTrade', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(tradeData),
        });
        const result = await resp.json();
        if (result.error) { helper.handleError(result.error); return; }
      } else {
        const resp = await authFetch('/api/trades', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(tradeData),
        });
        const result = await resp.json();
        if (result.error) { helper.handleError(result.error); return; }
        if (result._id && pendingRuleChecks.length > 0) {
          await Promise.all(
            pendingRuleChecks.filter(ch => ch.followed).map(ch =>
              authFetch('/api/strategy/checks/trade', {
                method: 'POST', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ tradeId: result._id, ruleId: ch.ruleId, followed: ch.followed }),
              }).catch(() => {})
            )
          );
        }
      }
      triggerReload();
      onClose();
    } catch (err) {
      helper.handleError(err.message || 'An error occurred');
    }
  };

  const formatDateTimeForInput = (dateString) => {
    if (!dateString) return '';
    const e = toEST(dateString);
    return `${e.year}-${String(e.month).padStart(2, '0')}-${String(e.day).padStart(2, '0')}T${String(e.hours).padStart(2, '0')}:${String(e.minutes).padStart(2, '0')}:${String(e.seconds).padStart(2, '0')}`;
  };

  const inputClass = "w-full px-3 py-2.5 bg-bg-input border border-border rounded-lg text-text-primary text-sm placeholder-text-muted focus:outline-none focus:border-accent transition-colors";
  const labelClass = "block text-xs font-medium text-text-secondary mb-1.5";

  return (
    <>
      <div className={isUltrawide ? "fixed right-0 top-0 h-screen z-40 flex" : "fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4"} onClick={!isUltrawide ? onClose : undefined}>
        <div className={isUltrawide ? "w-[520px] h-full overflow-y-auto bg-bg-surface border-l border-border shadow-2xl" : "bg-bg-surface border border-border rounded-xl w-full max-w-lg max-h-[90vh] overflow-y-auto"} onClick={(e) => e.stopPropagation()}>
          {/* Header */}
          <div className="flex items-center justify-between px-6 py-4 border-b border-border sticky top-0 bg-bg-surface z-10">
            <h2 className="text-lg font-semibold text-text-primary">{isEditing ? 'Edit Trade' : 'New Trade'}</h2>
            <button className="text-text-secondary hover:text-text-primary transition-colors" onClick={onClose}>
              <Icons.X />
            </button>
          </div>

          <form
            id="tradeForm"
            onSubmit={handleSubmit}
            name="tradeForm"
            action={isEditing ? "/api/updateTrade" : "/api/trades"}
            method="POST"
            className="p-6 space-y-4"
          >
            <div>
              <label htmlFor="ticker" className={labelClass}>Ticker</label>
              <TickerAutofill id="ticker" name="ticker" placeholder="AAPL" defaultValue={isEditing ? editingTrade.ticker : ''} className={inputClass} trades={trades} />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label htmlFor="enterTime" className={labelClass}>Enter Time</label>
                <input id="enterTime" type="datetime-local" name="enterTime" step="1" defaultValue={isEditing ? formatDateTimeForInput(editingTrade.enterTime) : `${prefillDate || new Date().toISOString().split('T')[0]}T09:30:00`} className={inputClass} />
              </div>
              <div>
                <label htmlFor="exitTime" className={labelClass}>Exit Time</label>
                <input id="exitTime" type="datetime-local" name="exitTime" step="1" defaultValue={isEditing ? formatDateTimeForInput(editingTrade.exitTime) : `${prefillDate || new Date().toISOString().split('T')[0]}T09:30:00`} className={inputClass} />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label htmlFor="enterPrice" className={labelClass}>Enter Price <span className="text-text-muted font-normal normal-case">(or use P/L)</span></label>
                <input id="enterPrice" type="number" step="0.01" min="0" name="enterPrice" placeholder="0.00" defaultValue={isEditing ? editingTrade.enterPrice || '' : ''} className={inputClass} />
              </div>
              <div>
                <label htmlFor="exitPrice" className={labelClass}>Exit Price <span className="text-text-muted font-normal normal-case">(or use P/L)</span></label>
                <input id="exitPrice" type="number" step="0.01" min="0" name="exitPrice" placeholder="0.00" defaultValue={isEditing ? editingTrade.exitPrice || '' : ''} className={inputClass} />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label htmlFor="quantity" className={labelClass}>Quantity</label>
                <input id="quantity" type="number" step="0.01" name="quantity" placeholder="1" defaultValue={isEditing ? editingTrade.quantity : ''} className={inputClass} />
                <p className="text-text-muted text-xs mt-0.5">Use negative for short trades</p>
              </div>
              <div>
                <label htmlFor="manualPL" className={labelClass}>P/L <span className="text-text-muted font-normal normal-case">(or use prices)</span></label>
                <input id="manualPL" type="number" step="0.01" name="manualPL" placeholder="Required if no prices" defaultValue={isEditing && editingTrade.manualPL ? editingTrade.manualPL : ''} className={inputClass} />
              </div>
            </div>

            <div>
              <label htmlFor="comments" className={labelClass}>Comments</label>
              <textarea id="comments" name="comments" placeholder="Trade notes..." rows="3" defaultValue={isEditing ? editingTrade.comments : ''} className={`${inputClass} resize-none`}></textarea>
            </div>

            {/* Eval checkbox */}
            <div>
              <label className="flex items-center gap-2.5 cursor-pointer select-none group">
                <div
                  className={`w-4 h-4 rounded border flex items-center justify-center flex-shrink-0 transition-colors ${
                    isEval ? 'bg-accent border-accent' : 'border-border group-hover:border-accent/60'
                  }`}
                  onClick={() => setIsEval(prev => !prev)}
                >
                  {isEval && <Icons.Check className="w-3 h-3 text-accent-text" />}
                </div>
                <span className="text-sm text-text-secondary group-hover:text-text-primary transition-colors" onClick={() => setIsEval(prev => !prev)}>
                  Evaluation trade
                </span>
                {isEval && (
                  <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-bold uppercase bg-accent/15 text-accent">EVAL</span>
                )}
              </label>
              <p className="text-text-muted text-xs mt-1 ml-7">Mark this trade as taken on an evaluation account. Eval trades can be excluded from analytics.</p>
            </div>

            {/* Strategy rule checklist */}
            {tradeRules.length > 0 && (
              <div>
                <label className={labelClass}>Strategy Checklist</label>
                <RuleChecklist
                  rules={tradeRules}
                  checks={isEditing ? tradeRuleChecks : pendingRuleChecks.map(ch => ({ ruleId: ch.ruleId, followed: ch.followed }))}
                  onToggle={handleRuleToggle}
                  loading={ruleChecksLoading}
                />
              </div>
            )}

            {/* Tags section */}
            <div>
              <label className={labelClass}>Tags</label>
              <div className="flex flex-wrap gap-2">
                {tags && tags.map(tag => {
                  const isSelected = selectedTags.includes(tag._id);
                  return (
                    <button
                      key={tag._id}
                      type="button"
                      className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium border transition-colors ${
                        !isSelected ? 'bg-bg-input border-border text-text-secondary hover:text-text-primary' : ''
                      }`}
                      style={isSelected ? {
                        borderColor: tag.color,
                        backgroundColor: tag.color + '20',
                        color: tag.color,
                      } : undefined}
                      onClick={() => {
                        setSelectedTags(prev =>
                          prev.includes(tag._id)
                            ? prev.filter(id => id !== tag._id)
                            : [...prev, tag._id]
                        );
                      }}
                    >
                      <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: tag.color }}></span>
                      {tag.name}
                    </button>
                  );
                })}
                {!showNewTag && (
                  <button
                    type="button"
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium border border-dashed border-border text-text-tertiary hover:text-text-primary hover:border-accent transition-colors"
                    onClick={() => setShowNewTag(true)}
                  >
                    <Icons.Plus className="w-3 h-3" />
                    New Tag
                  </button>
                )}
              </div>
              {showNewTag && (
                <div className="flex flex-wrap items-center gap-2 mt-2 p-3 bg-bg-input border border-border rounded-lg">
                  <input
                    type="text"
                    value={quickTagName}
                    onChange={(e) => setQuickTagName(e.target.value)}
                    placeholder="Tag name"
                    className="px-2.5 py-1.5 bg-bg-surface border border-border rounded-md text-text-primary text-xs focus:outline-none focus:border-accent transition-colors w-28"
                    onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); handleQuickCreateTag(); } }}
                  />
                  <div className="flex gap-1">
                    {TAG_COLOR_PRESETS.slice(0, 4).map(color => (
                      <button
                        key={color}
                        type="button"
                        className={`w-5 h-5 rounded-full border-2 transition-all ${
                          quickTagColor === color ? 'border-white scale-110' : 'border-transparent'
                        }`}
                        style={{ backgroundColor: color }}
                        onClick={() => setQuickTagColor(color)}
                      />
                    ))}
                  </div>
                  <button
                    type="button"
                    className="px-2.5 py-1.5 bg-accent text-accent-text text-xs font-semibold rounded-md hover:brightness-110 transition-all disabled:opacity-50"
                    onClick={handleQuickCreateTag}
                    disabled={creatingTag || !quickTagName.trim()}
                  >
                    {creatingTag ? '...' : 'Add'}
                  </button>
                  <button
                    type="button"
                    className="px-2 py-1.5 text-text-tertiary text-xs hover:text-text-primary transition-colors"
                    onClick={() => { setShowNewTag(false); setQuickTagName(''); }}
                  >
                    Cancel
                  </button>
                </div>
              )}
            </div>

            {/* Screenshot section — Elite only */}
            <div>
              <div className="flex items-center gap-2 mb-1.5">
                <label className={labelClass + ' mb-0'}>Screenshot</label>
                {!isElite && (
                  <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-bold uppercase bg-yellow-500/15 text-yellow-400">Elite</span>
                )}
              </div>
              {isElite ? (
                <>
                  {!screenshot && !pastedImage && (
                    <div className="border-2 border-dashed border-border rounded-lg p-6 text-center">
                      <Icons.Download className="w-8 h-8 text-text-muted mx-auto mb-2" />
                      <p className="text-text-tertiary text-sm mb-3">Paste (Ctrl+V) or drag an image here, or</p>
                      <button
                        type="button"
                        className="px-3 py-1.5 bg-bg-input border border-border text-text-secondary text-xs rounded-lg hover:border-accent hover:text-text-primary transition-colors"
                        onClick={() => fileInputRef.current?.click()}
                      >
                        Choose File
                      </button>
                      <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={handleFileChange} />
                    </div>
                  )}

                  {pastedImage && !screenshot && (
                    <div className="space-y-3">
                      <img src={pastedImage} alt="Pasted screenshot" className="rounded-lg max-h-48 w-full object-contain bg-bg-input cursor-pointer hover:opacity-80 transition-opacity" onClick={() => setLightboxOpen(true)} />
                      <div className="flex gap-2">
                        <button type="button" className="flex-1 py-2 text-xs bg-accent text-accent-text font-semibold rounded-lg hover:brightness-110" onClick={() => { setMarkupSource(pastedImage); setIsMarkupOpen(true); }}>
                          Annotate
                        </button>
                        <button type="button" className="flex-1 py-2 text-xs bg-bg-input border border-border text-text-primary rounded-lg hover:border-accent disabled:opacity-50" disabled={isUploading} onClick={async () => {
                          try {
                            const resized = await resizeImage(pastedImage);
                            const url = await uploadScreenshot(resized);
                            setScreenshot(url);
                            setPastedImage(null);
                          } catch (err) {
                            helper.handleError('Failed to upload screenshot: ' + err.message);
                          }
                        }}>
                          {isUploading ? 'Uploading...' : 'Use As-Is'}
                        </button>
                        <button type="button" className="py-2 px-3 text-xs bg-bg-input border border-border text-text-secondary rounded-lg hover:text-negative hover:border-negative/50" onClick={() => { setScreenshot(null); setPastedImage(null); }}>
                          Remove
                        </button>
                      </div>
                    </div>
                  )}

                  {screenshot && (
                    <div className="space-y-3">
                      <img src={screenshot} alt="Trade screenshot" className="rounded-lg max-h-48 w-full object-contain bg-bg-input cursor-pointer hover:opacity-80 transition-opacity" onClick={() => setLightboxOpen(true)} />
                      <div className="flex gap-2">
                        <button type="button" className="flex-1 py-2 text-xs bg-accent text-accent-text font-semibold rounded-lg hover:brightness-110" onClick={() => { setMarkupSource(screenshot); setIsMarkupOpen(true); }}>
                          Annotate
                        </button>
                        <button type="button" className="py-2 px-3 text-xs bg-bg-input border border-border text-text-secondary rounded-lg hover:text-negative hover:border-negative/50" onClick={() => { setScreenshot(null); setPastedImage(null); }}>
                          Remove
                        </button>
                      </div>
                    </div>
                  )}
                </>
              ) : (
                <div className="border border-border rounded-lg p-4 flex items-center gap-3 bg-bg-input">
                  <Icons.Lock className="w-4 h-4 text-text-muted flex-shrink-0" />
                  <div className="flex-1 min-w-0">
                    <p className="text-text-secondary text-xs">Screenshot attachments are available on the <span className="text-yellow-400 font-medium">Elite</span> plan.</p>
                  </div>
                  <a href="/upgrade" className="flex-shrink-0 px-2.5 py-1.5 text-xs font-semibold bg-yellow-500 text-black rounded-lg hover:brightness-110 transition-all">
                    Upgrade
                  </a>
                </div>
              )}
            </div>

            {/* Image Lightbox */}
            {lightboxOpen && (screenshot || pastedImage) && (
              <div className="fixed inset-0 z-[60] bg-black/90 flex items-center justify-center p-4" onClick={() => setLightboxOpen(false)}>
                <button className="absolute top-4 right-4 text-white/70 hover:text-white transition-colors" onClick={() => setLightboxOpen(false)}>
                  <Icons.X />
                </button>
                <img src={screenshot || pastedImage} alt="Screenshot preview" className="max-w-[90vw] max-h-[90vh] object-contain rounded-lg" onClick={(e) => e.stopPropagation()} />
              </div>
            )}

            <div id="errorDiv" className="hidden">
              <div className="p-3 bg-negative/10 border border-negative/30 rounded-lg">
                <span id="errorMessage" className="text-negative text-sm"></span>
              </div>
            </div>

            <button
              type="submit"
              className="w-full py-3 bg-accent text-accent-text font-semibold rounded-lg hover:brightness-110 transition-all"
            >
              {isEditing ? 'Update Trade' : 'Add Trade'}
            </button>
          </form>
        </div>
      </div>

      <ScreenshotMarkupModal
        isOpen={isMarkupOpen}
        onClose={() => setIsMarkupOpen(false)}
        onSave={async (annotatedImage) => {
          try {
            const url = await uploadScreenshot(annotatedImage);
            setScreenshot(url);
            setPastedImage(null);
            setMarkupSource(null);
          } catch (err) {
            helper.handleError('Failed to upload screenshot: ' + err.message);
          }
        }}
        initialImage={markupSource}
      />
    </>
  );
};

// =====================================================
// RULE CHECKLIST (shared by DayDetailPanel & trade detail)
// =====================================================
const RuleChecklist = ({ rules, checks, onToggle, loading }) => {
  if (!rules || rules.length === 0) return null;

  return (
    <div className="space-y-1.5">
      {rules.map(rule => {
        const check = checks.find(ch => ch.ruleId === rule._id);
        const followed = check ? check.followed : false;
        return (
          <button
            key={rule._id}
            className={`flex items-center gap-2 w-full text-left px-2.5 py-1.5 rounded-lg text-xs transition-colors ${
              followed
                ? 'bg-positive/10 text-positive'
                : 'bg-bg-input text-text-secondary hover:text-text-primary'
            }`}
            onClick={() => onToggle(rule._id, !followed)}
            disabled={loading}
          >
            <span className={`w-4 h-4 rounded border flex items-center justify-center flex-shrink-0 ${
              followed ? 'bg-positive border-positive' : 'border-border'
            }`}>
              {followed && <Icons.Check className="w-3 h-3 text-white" />}
            </span>
            {rule.label}
          </button>
        );
      })}
    </div>
  );
};

// =====================================================
// STRATEGY PAGE
// =====================================================
const StrategyPage = ({ subscriptionStatus, trades, evalFilter, setEvalFilter }) => {
  const [rules, setRules] = useState([]);
  const [analytics, setAnalytics] = useState([]);
  const [disciplineScore, setDisciplineScore] = useState(0);
  const [combinations, setCombinations] = useState([]);
  const [tradeRuleStates, setTradeRuleStates] = useState([]);
  const [dailyRuleStates, setDailyRuleStates] = useState([]);
  const [ruleFilters, setRuleFilters] = useState({});
  const [loading, setLoading] = useState(true);
  const [newRuleLabel, setNewRuleLabel] = useState('');
  const [newRuleType, setNewRuleType] = useState('trade');
  const [editingId, setEditingId] = useState(null);
  const [editingLabel, setEditingLabel] = useState('');
  const [activeTab, setActiveTab] = useState('rules');

  const isElite = subscriptionStatus && subscriptionStatus.isPremium;

  const fetchRules = async () => {
    try {
      const resp = await authFetch('/api/strategy/rules');
      const data = await resp.json();
      if (!data.error) setRules(data.rules || []);
    } catch (err) {
      console.error('Failed to fetch rules:', err);
    }
  };

  const fetchAnalytics = async () => {
    try {
      const resp = await authFetch(`/api/strategy/analytics${evalFilter !== 'all' ? `?evalFilter=${evalFilter}` : ''}`);
      const data = await resp.json();
      if (!data.error) {
        setAnalytics(data.analytics || []);
        setDisciplineScore(data.disciplineScore || 0);
        setCombinations(data.combinations || []);
        setTradeRuleStates(data.tradeRuleStates || []);
        setDailyRuleStates(data.dailyRuleStates || []);
      }
    } catch (err) {
      console.error('Failed to fetch analytics:', err);
    }
  };

  useEffect(() => {
    if (!isElite) { setLoading(false); return; }
    Promise.all([fetchRules(), fetchAnalytics()]).finally(() => setLoading(false));
  }, [isElite]);

  useEffect(() => {
    if (!isElite) return;
    fetchAnalytics();
  }, [evalFilter]);

  const handleAddRule = async () => {
    if (!newRuleLabel.trim()) return;
    try {
      const resp = await authFetch('/api/strategy/rules', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ label: newRuleLabel.trim(), type: newRuleType }),
      });
      const rule = await resp.json();
      if (!rule.error) {
        setRules(prev => [...prev, rule]);
        setNewRuleLabel('');
        fetchAnalytics();
      }
    } catch (err) {
      console.error('Failed to add rule:', err);
    }
  };

  const handleUpdateRule = async (ruleId) => {
    if (!editingLabel.trim()) return;
    try {
      const resp = await authFetch(`/api/strategy/rules/${ruleId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ label: editingLabel.trim() }),
      });
      const updated = await resp.json();
      if (!updated.error) {
        setRules(prev => prev.map(r => r._id === ruleId ? updated : r));
        setEditingId(null);
      }
    } catch (err) {
      console.error('Failed to update rule:', err);
    }
  };

  const handleDeleteRule = async (ruleId) => {
    try {
      await authFetch(`/api/strategy/rules/${ruleId}`, { method: 'DELETE' });
      setRules(prev => prev.filter(r => r._id !== ruleId));
      fetchAnalytics();
    } catch (err) {
      console.error('Failed to delete rule:', err);
    }
  };

  if (!isElite) {
    return (
      <div className="text-center py-16">
        <Icons.Target className="w-12 h-12 text-text-muted mx-auto mb-4" />
        <h2 className="text-text-primary text-xl font-semibold mb-2">Strategy & Rule Tracking</h2>
        <p className="text-text-secondary text-sm mb-6 max-w-md mx-auto">
          Define trading rules, track adherence per trade and per day, and see how rule-following correlates with profitability.
        </p>
        <a href="/upgrade" className="inline-flex items-center gap-2 px-6 py-3 bg-accent text-accent-text text-sm font-semibold rounded-xl hover:brightness-110 transition-all">
          <Icons.Zap className="w-4 h-4" /> Upgrade to Elite
        </a>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16">
        <Icons.RefreshCw className="w-5 h-5 animate-spin text-text-muted" />
      </div>
    );
  }

  const tradeRules = rules.filter(r => r.type === 'trade');
  const dayRules = rules.filter(r => r.type === 'day');

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-text-primary text-2xl font-bold">Strategy</h1>
          <p className="text-text-secondary text-sm mt-1">Define and track your trading rules</p>
        </div>
        {trades && <EvalFilterControl trades={trades} evalFilter={evalFilter} setEvalFilter={setEvalFilter} />}
      </div>

      {/* Tabs */}
      <div className="flex gap-1 mb-6 bg-bg-surface rounded-lg p-1 w-fit">
        {['rules', 'analytics'].map(tab => (
          <button
            key={tab}
            className={`px-4 py-2 text-sm font-medium rounded-md transition-colors ${
              activeTab === tab
                ? 'bg-bg-page text-text-primary'
                : 'text-text-secondary hover:text-text-primary'
            }`}
            onClick={() => setActiveTab(tab)}
          >
            {tab === 'rules' ? 'Rules' : 'Analytics'}
          </button>
        ))}
      </div>

      {activeTab === 'rules' && (
        <div className="space-y-6">
          {/* Add new rule */}
          <div className="bg-bg-surface border border-border rounded-xl p-5">
            <h3 className="text-text-primary font-semibold text-sm mb-3">Add New Rule</h3>
            <div className="flex gap-3">
              <select
                className="px-3 py-2 bg-bg-input border border-border rounded-lg text-text-primary text-sm focus:outline-none focus:border-accent"
                value={newRuleType}
                onChange={(e) => setNewRuleType(e.target.value)}
              >
                <option value="trade">Trade Rule</option>
                <option value="day">Daily Rule</option>
              </select>
              <input
                type="text"
                className="flex-1 px-3 py-2 bg-bg-input border border-border rounded-lg text-text-primary text-sm placeholder-text-muted focus:outline-none focus:border-accent"
                placeholder="e.g., Wait for confirmation before entry"
                value={newRuleLabel}
                onChange={(e) => setNewRuleLabel(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleAddRule()}
              />
              <button
                className="px-4 py-2 bg-accent text-accent-text text-sm font-semibold rounded-lg hover:brightness-110 transition-all disabled:opacity-50"
                onClick={handleAddRule}
                disabled={!newRuleLabel.trim()}
              >
                Add
              </button>
            </div>
          </div>

          {/* Trade Rules */}
          <div className="bg-bg-surface border border-border rounded-xl p-5">
            <h3 className="text-text-primary font-semibold text-sm mb-3">Trade Rules</h3>
            <p className="text-text-tertiary text-xs mb-3">Check these off for each trade individually</p>
            {tradeRules.length === 0 ? (
              <p className="text-text-muted text-sm">No trade rules defined yet.</p>
            ) : (
              <div className="space-y-2">
                {tradeRules.map(rule => (
                  <div key={rule._id} className="flex items-center gap-3 bg-bg-input rounded-lg px-3 py-2.5">
                    {editingId === rule._id ? (
                      <>
                        <input
                          type="text"
                          className="flex-1 px-2 py-1 bg-bg-surface border border-border rounded text-text-primary text-sm focus:outline-none focus:border-accent"
                          value={editingLabel}
                          onChange={(e) => setEditingLabel(e.target.value)}
                          onKeyDown={(e) => e.key === 'Enter' && handleUpdateRule(rule._id)}
                          autoFocus
                        />
                        <button className="text-positive text-xs font-medium" onClick={() => handleUpdateRule(rule._id)}>Save</button>
                        <button className="text-text-muted text-xs" onClick={() => setEditingId(null)}>Cancel</button>
                      </>
                    ) : (
                      <>
                        <Icons.Target className="w-4 h-4 text-accent flex-shrink-0" />
                        <span className="flex-1 text-text-primary text-sm">{rule.label}</span>
                        <button
                          className="text-text-muted hover:text-text-secondary text-xs"
                          onClick={() => { setEditingId(rule._id); setEditingLabel(rule.label); }}
                        >
                          Edit
                        </button>
                        <button
                          className="text-text-muted hover:text-negative text-xs"
                          onClick={() => handleDeleteRule(rule._id)}
                        >
                          Delete
                        </button>
                      </>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Daily Rules */}
          <div className="bg-bg-surface border border-border rounded-xl p-5">
            <h3 className="text-text-primary font-semibold text-sm mb-3">Daily Rules</h3>
            <p className="text-text-tertiary text-xs mb-3">Check these off each trading day in the day detail panel</p>
            {dayRules.length === 0 ? (
              <p className="text-text-muted text-sm">No daily rules defined yet.</p>
            ) : (
              <div className="space-y-2">
                {dayRules.map(rule => (
                  <div key={rule._id} className="flex items-center gap-3 bg-bg-input rounded-lg px-3 py-2.5">
                    {editingId === rule._id ? (
                      <>
                        <input
                          type="text"
                          className="flex-1 px-2 py-1 bg-bg-surface border border-border rounded text-text-primary text-sm focus:outline-none focus:border-accent"
                          value={editingLabel}
                          onChange={(e) => setEditingLabel(e.target.value)}
                          onKeyDown={(e) => e.key === 'Enter' && handleUpdateRule(rule._id)}
                          autoFocus
                        />
                        <button className="text-positive text-xs font-medium" onClick={() => handleUpdateRule(rule._id)}>Save</button>
                        <button className="text-text-muted text-xs" onClick={() => setEditingId(null)}>Cancel</button>
                      </>
                    ) : (
                      <>
                        <Icons.Target className="w-4 h-4 text-info flex-shrink-0" />
                        <span className="flex-1 text-text-primary text-sm">{rule.label}</span>
                        <button
                          className="text-text-muted hover:text-text-secondary text-xs"
                          onClick={() => { setEditingId(rule._id); setEditingLabel(rule.label); }}
                        >
                          Edit
                        </button>
                        <button
                          className="text-text-muted hover:text-negative text-xs"
                          onClick={() => handleDeleteRule(rule._id)}
                        >
                          Delete
                        </button>
                      </>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {activeTab === 'analytics' && (() => {
        // Computed values for analytics tab
        const tradeAnalytics = analytics.filter(a => a.type === 'trade');
        const dayAnalytics = analytics.filter(a => a.type === 'day');

        // Insights: top rules by profitability
        const mostProfitableTradeRule = tradeAnalytics
          .filter(a => a.followedCount >= 2)
          .sort((a, b) => b.avgPLFollowed - a.avgPLFollowed)[0];
        const bestDailyRule = dayAnalytics
          .filter(a => a.daysWithDataFollowed >= 2)
          .sort((a, b) => b.winRateFollowed - a.winRateFollowed)[0];

        // Rule filters
        const getFilter = (ruleId) => ruleFilters[ruleId] || 'any';
        const hasActiveFilters = Object.values(ruleFilters).some(v => v !== 'any');
        const toggleFilter = (ruleId, state) => setRuleFilters(prev => ({ ...prev, [ruleId]: (prev[ruleId] || 'any') === state ? 'any' : state }));

        // Compute filtered stats based on active rule filters
        const filteredStats = (() => {
          if (!hasActiveFilters) return null;
          const activeFilters = Object.entries(ruleFilters).filter(([, s]) => s !== 'any');
          const tradeFilters = activeFilters.filter(([id]) => rules.find(r => r._id === id && r.type === 'trade'));
          const dayFilters = activeFilters.filter(([id]) => rules.find(r => r._id === id && r.type === 'day'));
          let pls = [];
          if (tradeFilters.length > 0) {
            pls = tradeRuleStates
              .filter(t => tradeFilters.every(([id, state]) => state === 'followed' ? !!t.checks[id] : !t.checks[id]))
              .map(t => t.pl);
          }
          if (dayFilters.length > 0) {
            const dayPLs = dailyRuleStates
              .filter(d => dayFilters.every(([id, state]) => state === 'followed' ? !!d.checks[id] : !d.checks[id]))
              .flatMap(d => d.tradePLs);
            pls = [...pls, ...dayPLs];
          }
          if (pls.length === 0) return { count: 0, avgPL: 0, winRate: 0, profitFactor: 0 };
          const count = pls.length;
          const avgPL = pls.reduce((s, v) => s + v, 0) / count;
          const winRate = (pls.filter(v => v > 0).length / count) * 100;
          const grossWin = pls.filter(v => v > 0).reduce((s, v) => s + v, 0);
          const grossLoss = Math.abs(pls.filter(v => v < 0).reduce((s, v) => s + v, 0));
          const profitFactor = grossLoss > 0 ? grossWin / grossLoss : grossWin > 0 ? 99 : 0;
          return { count, avgPL, winRate, profitFactor };
        })();

        // Small metric display helper
        const Metric = ({ label, followed, broken, isPositiveBetter = true }) => {
          const fGood = isPositiveBetter ? followed >= broken : followed <= broken;
          return (
            <div className="flex justify-between text-xs py-1 border-b border-border/40 last:border-0">
              <span className="text-text-muted">{label}</span>
              <div className="flex gap-4">
                <span className={`font-mono font-medium ${fGood ? 'text-positive' : 'text-text-secondary'}`}>{followed}</span>
                <span className={`font-mono font-medium ${!fGood ? 'text-positive' : 'text-text-secondary'}`}>{broken}</span>
              </div>
            </div>
          );
        };

        return (
          <div className="space-y-6">
            {/* Discipline Score */}
            <div className="bg-bg-surface border border-border rounded-xl p-5">
              <h3 className="text-text-primary font-semibold text-sm mb-3">Overall Discipline Score</h3>
              <div className="flex items-center gap-4">
                <div className="text-3xl font-bold font-mono text-accent">{disciplineScore.toFixed(0)}%</div>
                <div className="flex-1">
                  <div className="w-full bg-bg-input rounded-full h-3">
                    <div className="bg-accent h-3 rounded-full transition-all" style={{ width: `${Math.min(100, disciplineScore)}%` }} />
                  </div>
                </div>
              </div>
            </div>

            {analytics.length === 0 ? (
              <div className="bg-bg-surface border border-border rounded-xl p-8 text-center">
                <p className="text-text-muted text-sm">No rule check data yet. Start checking off rules in your day detail panels.</p>
              </div>
            ) : (
              <>
                {/* Insights */}
                {(mostProfitableTradeRule || bestDailyRule) && (
                  <div className="bg-bg-surface border border-border rounded-xl p-5">
                    <h3 className="text-text-primary font-semibold text-sm mb-4">Top Insights</h3>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      {mostProfitableTradeRule && (
                        <div className="bg-positive/5 border border-positive/20 rounded-lg p-4">
                          <div className="text-text-muted text-[10px] font-semibold uppercase tracking-wider mb-1">Most Profitable Trade Rule</div>
                          <div className="text-text-primary text-sm font-medium leading-snug mb-2">{mostProfitableTradeRule.label}</div>
                          <div className="flex items-baseline gap-2">
                            <span className="text-positive text-xl font-mono font-bold">{mostProfitableTradeRule.avgPLFollowed >= 0 ? '+' : ''}${mostProfitableTradeRule.avgPLFollowed.toFixed(2)}</span>
                            <span className="text-text-muted text-xs">avg P/L when followed</span>
                          </div>
                          <div className="flex gap-3 mt-1.5 text-xs text-text-tertiary">
                            <span>{mostProfitableTradeRule.winRateFollowed.toFixed(0)}% win rate</span>
                            <span>{mostProfitableTradeRule.profitFactorFollowed.toFixed(2)}x profit factor</span>
                          </div>
                        </div>
                      )}
                      {bestDailyRule && (
                        <div className="bg-accent/5 border border-accent/20 rounded-lg p-4">
                          <div className="text-text-muted text-[10px] font-semibold uppercase tracking-wider mb-1">Best Daily Rule (Win Rate)</div>
                          <div className="text-text-primary text-sm font-medium leading-snug mb-2">{bestDailyRule.label}</div>
                          <div className="flex items-baseline gap-2">
                            <span className="text-accent text-xl font-mono font-bold">{bestDailyRule.winRateFollowed.toFixed(0)}%</span>
                            <span className="text-text-muted text-xs">day win rate when followed</span>
                          </div>
                          <div className="flex gap-3 mt-1.5 text-xs text-text-tertiary">
                            <span>{bestDailyRule.avgPLFollowed >= 0 ? '+' : ''}${bestDailyRule.avgPLFollowed.toFixed(2)} avg day P/L</span>
                            <span>{bestDailyRule.profitFactorFollowed.toFixed(2)}x profit factor</span>
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {/* Rule Filter */}
                {rules.length > 0 && (tradeRuleStates.length > 0 || dailyRuleStates.length > 0) && (
                  <div className="bg-bg-surface border border-border rounded-xl p-5">
                    <div className="flex items-center justify-between mb-4">
                      <div>
                        <h3 className="text-text-primary font-semibold text-sm">Filter by Rule State</h3>
                        <p className="text-text-tertiary text-xs mt-0.5">Select rules to see performance when they're followed or broken</p>
                      </div>
                      {hasActiveFilters && (
                        <button className="text-xs text-text-tertiary hover:text-text-primary transition-colors" onClick={() => setRuleFilters({})}>Clear all</button>
                      )}
                    </div>
                    <div className="space-y-2">
                      {rules.map(rule => {
                        const f = getFilter(rule._id);
                        return (
                          <div key={rule._id} className="flex items-center gap-3">
                            <span className="flex-1 text-text-primary text-xs truncate">{rule.label}</span>
                            <div className="flex rounded-lg overflow-hidden border border-border text-[11px] font-medium shrink-0">
                              <button
                                className={`px-3 py-1.5 transition-colors ${f === 'followed' ? 'bg-positive text-white' : 'text-text-tertiary hover:text-positive hover:bg-positive/10'}`}
                                onClick={() => toggleFilter(rule._id, 'followed')}
                              >✓ Followed</button>
                              <button
                                className={`px-3 py-1.5 border-x border-border transition-colors ${f === 'any' ? 'bg-bg-input text-text-primary' : 'text-text-tertiary hover:text-text-primary hover:bg-bg-input'}`}
                                onClick={() => toggleFilter(rule._id, 'any')}
                              >Any</button>
                              <button
                                className={`px-3 py-1.5 transition-colors ${f === 'broken' ? 'bg-negative text-white' : 'text-text-tertiary hover:text-negative hover:bg-negative/10'}`}
                                onClick={() => toggleFilter(rule._id, 'broken')}
                              >✗ Broken</button>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                    {hasActiveFilters && filteredStats && (
                      <div className="mt-4 pt-4 border-t border-border">
                        {filteredStats.count === 0 ? (
                          <p className="text-text-muted text-xs text-center">No trades match this filter combination.</p>
                        ) : (
                          <>
                            <div className="text-text-secondary text-xs font-medium mb-3">Filtered Results — {filteredStats.count} trade{filteredStats.count !== 1 ? 's' : ''}</div>
                            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                              {[
                                { label: 'Win Rate', value: filteredStats.winRate.toFixed(0) + '%', color: filteredStats.winRate >= 50 ? 'text-positive' : 'text-negative' },
                                { label: 'Avg P/L', value: (filteredStats.avgPL >= 0 ? '+' : '') + '$' + filteredStats.avgPL.toFixed(2), color: filteredStats.avgPL >= 0 ? 'text-positive' : 'text-negative' },
                                { label: 'Profit Factor', value: filteredStats.profitFactor >= 99 ? '∞' : filteredStats.profitFactor.toFixed(2) + 'x', color: filteredStats.profitFactor >= 1 ? 'text-positive' : 'text-negative' },
                                { label: 'Trades', value: filteredStats.count, color: 'text-text-primary' },
                              ].map(item => (
                                <div key={item.label} className="bg-bg-input rounded-lg px-3 py-2.5 text-center">
                                  <div className="text-text-muted text-[10px] uppercase tracking-wider mb-1">{item.label}</div>
                                  <div className={`font-mono font-bold text-sm ${item.color}`}>{item.value}</div>
                                </div>
                              ))}
                            </div>
                          </>
                        )}
                      </div>
                    )}
                  </div>
                )}

                {/* Trade Rule Analytics */}
                {tradeAnalytics.length > 0 && (
                  <div className="bg-bg-surface border border-border rounded-xl p-5">
                    <h3 className="text-text-primary font-semibold text-sm mb-4">Trade Rule Analytics</h3>
                    <div className="space-y-5">
                      {tradeAnalytics.map(a => (
                        <div key={a.ruleId}>
                          <div className="flex items-center justify-between mb-1.5">
                            <span className="text-text-primary text-sm font-medium">{a.label}</span>
                            <span className={`text-xs font-mono ${a.adherenceRate >= 70 ? 'text-positive' : a.adherenceRate >= 40 ? 'text-warning' : 'text-negative'}`}>{a.adherenceRate.toFixed(0)}% adherence</span>
                          </div>
                          <div className="w-full bg-bg-input rounded-full h-1.5 mb-3">
                            <div className={`h-1.5 rounded-full transition-all ${a.adherenceRate >= 70 ? 'bg-positive' : a.adherenceRate >= 40 ? 'bg-warning' : 'bg-negative'}`} style={{ width: `${Math.min(100, a.adherenceRate)}%` }} />
                          </div>
                          <div className="rounded-lg border border-border overflow-hidden">
                            <table className="w-full text-xs">
                              <thead>
                                <tr className="bg-bg-input border-b border-border">
                                  <th className="text-left px-3 py-2 text-text-muted font-medium">Metric</th>
                                  <th className="text-right px-3 py-2 text-positive font-medium">Followed ({a.followedCount})</th>
                                  <th className="text-right px-3 py-2 text-negative font-medium">Broken ({a.brokenCount})</th>
                                </tr>
                              </thead>
                              <tbody>
                                {[
                                  { label: 'Avg P/L', fVal: (a.avgPLFollowed >= 0 ? '+' : '') + '$' + a.avgPLFollowed.toFixed(2), bVal: (a.avgPLBroken >= 0 ? '+' : '') + '$' + a.avgPLBroken.toFixed(2), fBetter: a.avgPLFollowed >= a.avgPLBroken },
                                  { label: 'Win Rate', fVal: a.winRateFollowed.toFixed(0) + '%', bVal: a.winRateBroken.toFixed(0) + '%', fBetter: a.winRateFollowed >= a.winRateBroken },
                                  { label: 'Profit Factor', fVal: a.profitFactorFollowed >= 99 ? '∞' : a.profitFactorFollowed.toFixed(2) + 'x', bVal: a.profitFactorBroken >= 99 ? '∞' : a.profitFactorBroken.toFixed(2) + 'x', fBetter: a.profitFactorFollowed >= a.profitFactorBroken },
                                ].map(row => (
                                  <tr key={row.label} className="border-b border-border/40 last:border-0">
                                    <td className="px-3 py-2 text-text-muted">{row.label}</td>
                                    <td className={`px-3 py-2 text-right font-mono font-semibold ${row.fBetter ? 'text-positive' : 'text-text-secondary'}`}>{row.fVal}</td>
                                    <td className={`px-3 py-2 text-right font-mono font-semibold ${!row.fBetter ? 'text-positive' : 'text-text-secondary'}`}>{row.bVal}</td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Daily Rule Analytics */}
                {dayAnalytics.length > 0 && (
                  <div className="bg-bg-surface border border-border rounded-xl p-5">
                    <h3 className="text-text-primary font-semibold text-sm mb-1">Daily Rule Analytics</h3>
                    <p className="text-text-tertiary text-xs mb-4">Stats are computed at the day level — each followed/broken day is one data point</p>
                    <div className="space-y-5">
                      {dayAnalytics.map(a => (
                        <div key={a.ruleId}>
                          <div className="flex items-center justify-between mb-1.5">
                            <span className="text-text-primary text-sm font-medium">{a.label}</span>
                            <span className={`text-xs font-mono ${a.adherenceRate >= 70 ? 'text-positive' : a.adherenceRate >= 40 ? 'text-warning' : 'text-negative'}`}>{a.adherenceRate.toFixed(0)}% adherence</span>
                          </div>
                          <div className="w-full bg-bg-input rounded-full h-1.5 mb-3">
                            <div className={`h-1.5 rounded-full transition-all ${a.adherenceRate >= 70 ? 'bg-positive' : a.adherenceRate >= 40 ? 'bg-warning' : 'bg-negative'}`} style={{ width: `${Math.min(100, a.adherenceRate)}%` }} />
                          </div>
                          <div className="rounded-lg border border-border overflow-hidden">
                            <table className="w-full text-xs">
                              <thead>
                                <tr className="bg-bg-input border-b border-border">
                                  <th className="text-left px-3 py-2 text-text-muted font-medium">Day Metric</th>
                                  <th className="text-right px-3 py-2 text-positive font-medium">Followed ({a.daysWithDataFollowed ?? a.followedCount}d)</th>
                                  <th className="text-right px-3 py-2 text-negative font-medium">Broken ({a.daysWithDataBroken ?? a.brokenCount}d)</th>
                                </tr>
                              </thead>
                              <tbody>
                                {[
                                  { label: 'Avg Day P/L', fVal: (a.avgPLFollowed >= 0 ? '+' : '') + '$' + a.avgPLFollowed.toFixed(2), bVal: (a.avgPLBroken >= 0 ? '+' : '') + '$' + a.avgPLBroken.toFixed(2), fBetter: a.avgPLFollowed >= a.avgPLBroken },
                                  { label: 'Day Win Rate', fVal: a.winRateFollowed.toFixed(0) + '%', bVal: a.winRateBroken.toFixed(0) + '%', fBetter: a.winRateFollowed >= a.winRateBroken },
                                  { label: 'Profit Factor', fVal: a.profitFactorFollowed >= 99 ? '∞' : a.profitFactorFollowed.toFixed(2) + 'x', bVal: a.profitFactorBroken >= 99 ? '∞' : a.profitFactorBroken.toFixed(2) + 'x', fBetter: a.profitFactorFollowed >= a.profitFactorBroken },
                                ].map(row => (
                                  <tr key={row.label} className="border-b border-border/40 last:border-0">
                                    <td className="px-3 py-2 text-text-muted">{row.label}</td>
                                    <td className={`px-3 py-2 text-right font-mono font-semibold ${row.fBetter ? 'text-positive' : 'text-text-secondary'}`}>{row.fVal}</td>
                                    <td className={`px-3 py-2 text-right font-mono font-semibold ${!row.fBetter ? 'text-positive' : 'text-text-secondary'}`}>{row.bVal}</td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Most Broken Rules */}
                {analytics.filter(a => a.brokenCount > 0).length > 0 && (
                  <div className="bg-bg-surface border border-border rounded-xl p-5">
                    <h3 className="text-text-primary font-semibold text-sm mb-3">Most Broken Rules</h3>
                    <div className="space-y-2">
                      {analytics.filter(a => a.brokenCount > 0).sort((a, b) => b.brokenCount - a.brokenCount).slice(0, 5).map(a => (
                        <div key={a.ruleId} className="flex items-center justify-between bg-bg-input rounded-lg px-3 py-2">
                          <span className="text-text-primary text-sm">{a.label}</span>
                          <span className="text-negative text-xs font-mono">{a.brokenCount} time{a.brokenCount !== 1 ? 's' : ''}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Combination Analytics */}
                {combinations && combinations.length > 0 && (
                  <div className="bg-bg-surface border border-border rounded-xl p-5">
                    <h3 className="text-text-primary font-semibold text-sm mb-1">Rule Combination Analysis</h3>
                    <p className="text-text-tertiary text-xs mb-5">How P&L compares when following pairs of rules together</p>
                    <div className="space-y-6">
                      {combinations.map((combo, idx) => {
                        const rows = [
                          { label: '✓ Both followed', stats: combo.both, highlight: true },
                          { label: `✓ ${combo.rule1Label} only`, stats: combo.onlyRule1 },
                          { label: `✓ ${combo.rule2Label} only`, stats: combo.onlyRule2 },
                          { label: 'Neither followed', stats: combo.neither },
                        ].filter(r => r.stats.count > 0);
                        if (rows.length === 0) return null;
                        return (
                          <div key={idx}>
                            <div className="text-xs font-medium mb-2 flex items-center gap-1.5 flex-wrap">
                              <span className="px-2 py-0.5 rounded bg-accent/10 text-accent truncate max-w-[45%]">{combo.rule1Label}</span>
                              <span className="text-text-muted">×</span>
                              <span className="px-2 py-0.5 rounded bg-accent/10 text-accent truncate max-w-[45%]">{combo.rule2Label}</span>
                            </div>
                            <div className="rounded-lg border border-border overflow-hidden">
                              <table className="w-full text-xs">
                                <thead>
                                  <tr className="bg-bg-input border-b border-border">
                                    <th className="text-left px-3 py-2 text-text-tertiary font-medium">Scenario</th>
                                    <th className="text-right px-3 py-2 text-text-tertiary font-medium">Trades</th>
                                    <th className="text-right px-3 py-2 text-text-tertiary font-medium">Avg P/L</th>
                                    <th className="text-right px-3 py-2 text-text-tertiary font-medium">Win Rate</th>
                                  </tr>
                                </thead>
                                <tbody>
                                  {rows.map((row, ri) => (
                                    <tr key={ri} className={`border-b border-border/50 last:border-0 ${row.highlight ? 'bg-positive/5' : ''}`}>
                                      <td className="px-3 py-2 text-text-secondary">{row.label}</td>
                                      <td className="px-3 py-2 text-right font-mono text-text-primary">{row.stats.count}</td>
                                      <td className={`px-3 py-2 text-right font-mono font-semibold ${row.stats.avgPL >= 0 ? 'text-positive' : 'text-negative'}`}>{row.stats.avgPL >= 0 ? '+' : ''}${row.stats.avgPL.toFixed(2)}</td>
                                      <td className="px-3 py-2 text-right font-mono text-text-secondary">{row.stats.winRate.toFixed(0)}%</td>
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}
              </>
            )}
          </div>
        );
      })()}
    </div>
  );
};

// =====================================================
// BACKTESTING PAGE
// =====================================================
// Wrapper — handles subscription gate without conditionally calling hooks.
const BacktestingPage = ({ subscriptionStatus }) => {
  const plan = subscriptionStatus?.plan;
  // Free and trial users see a blurred preview
  if (plan !== 'pro' && plan !== 'elite') {
    return (
      <div>
        <h1 className="text-text-primary text-2xl font-bold mb-1">Backtesting</h1>
        <p className="text-text-muted text-sm mb-8">Track wins and losses across backtesting sessions</p>

        {/* Blurred peek of the interface */}
        <div className="relative rounded-xl overflow-hidden">
          <div className="pointer-events-none select-none blur-[6px] opacity-60">
            {/* Fake active session panel */}
            <div className="bg-bg-surface border border-accent/30 rounded-xl p-5 space-y-4 mb-6">
              <div className="flex items-start justify-between">
                <div>
                  <div className="flex items-center gap-2 mb-1">
                    <span className="w-2 h-2 rounded-full bg-positive"></span>
                    <span className="text-xs font-semibold uppercase tracking-wider text-positive">Active Session</span>
                  </div>
                  <h2 className="text-text-primary font-semibold text-lg">Morning Breakout v2 <span className="text-text-muted font-normal ml-2 text-sm">(NQ)</span></h2>
                  <p className="text-text-muted text-xs mt-0.5">Started 2026-02-15</p>
                </div>
              </div>
              <div className="border-t border-border pt-4">
                <p className="text-text-tertiary text-xs font-semibold uppercase tracking-wider mb-3">Log Trade</p>
                <div className="flex flex-wrap items-end gap-3">
                  <div className="flex rounded-lg overflow-hidden border border-border">
                    <span className="px-4 py-2 text-sm font-semibold bg-positive text-white">Win</span>
                    <span className="px-4 py-2 text-sm font-semibold bg-bg-input text-text-muted">Loss</span>
                  </div>
                  <div className="flex-1 min-w-[100px] bg-bg-input border border-border rounded-lg px-3 py-2 text-sm text-text-muted">2.50</div>
                  <div className="bg-bg-input border border-border rounded-lg px-3 py-2 text-sm text-text-muted">09:45</div>
                  <span className="px-4 py-2 bg-accent text-accent-text text-sm font-semibold rounded-lg">Add Trade</span>
                </div>
              </div>
            </div>

            {/* Fake stats overview */}
            <div className="bg-bg-surface border border-border rounded-xl p-5">
              <h2 className="text-text-primary font-semibold mb-4">Stats Overview</h2>
              <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
                {[
                  { label: 'Total Trades', value: '24' },
                  { label: 'Wins', value: '16' },
                  { label: 'Losses', value: '8' },
                  { label: 'Win Rate', value: '66.7%' },
                  { label: 'Avg RR', value: '2.14R' },
                ].map(stat => (
                  <div key={stat.label} className="bg-bg-input rounded-lg p-3 text-center">
                    <div className="text-xl font-bold font-mono text-text-primary">{stat.value}</div>
                    <div className="text-text-muted text-xs mt-0.5">{stat.label}</div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Overlay CTA */}
          <div className="absolute inset-0 flex items-center justify-center">
            <div className="bg-bg-surface/95 backdrop-blur-sm border border-border rounded-xl p-8 text-center shadow-2xl max-w-sm mx-4">
              <Icons.FlaskConical className="w-10 h-10 text-yellow-400 mx-auto mb-3" />
              <h2 className="text-text-primary font-semibold text-lg mb-2">Pro & Elite Feature</h2>
              <p className="text-text-muted text-sm mb-5">
                Backtesting is available on the Pro and Elite plans. Create sessions, log trades, and track your strategy performance over time.
              </p>
              <button
                className="px-6 py-2.5 bg-accent text-accent-text text-sm font-semibold rounded-lg hover:brightness-110 transition-all"
                onClick={() => { window.location.href = '/upgrade'; }}
              >
                Upgrade Now
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return <BacktestingContent subscriptionStatus={subscriptionStatus} />;
};

const BacktestingContent = ({ subscriptionStatus }) => {
  const [sessions, setSessions] = useState([]);
  const [activeTrades, setActiveTrades] = useState([]);
  const [allTrades, setAllTrades] = useState([]);
  const [loading, setLoading] = useState(true);
  const isProUser = subscriptionStatus?.plan === 'pro';
  const hasReachedSessionLimit = isProUser && sessions.length >= 1;
  const [statsFilter, setStatsFilter] = useState('all'); // 'all' | session id
  const [showStartForm, setShowStartForm] = useState(false);
  const [showEndForm, setShowEndForm] = useState(false);

  // Start session form state
  const [newTicker, setNewTicker] = useState('');
  const [newName, setNewName] = useState('');
  const [newStartDate, setNewStartDate] = useState(() => new Date().toISOString().slice(0, 10));

  // End session form state
  const [endDate, setEndDate] = useState('');

  // Add trade form state
  const [tradeResult, setTradeResult] = useState('win');
  const [tradePF, setTradePF] = useState('');
  const [tradeTime, setTradeTime] = useState('');
  const [tradeSubmitting, setTradeSubmitting] = useState(false);

  const activeSession = sessions.find(s => s.isActive) || null;

  const load = async (showSpinner = true) => {
    if (showSpinner) setLoading(true);
    try {
      const [sessRes, tradesRes] = await Promise.all([
        authFetch('/api/backtesting/sessions'),
        authFetch('/api/backtesting/trades'),
      ]);
      const sessData = await sessRes.json();
      const tradesData = await tradesRes.json();
      setSessions(sessData.sessions || []);
      setAllTrades(tradesData.trades || []);
    } catch (err) {
      console.error('Failed to load sessions', err);
    } finally {
      if (showSpinner) setLoading(false);
    }
  };

  const loadActiveTrades = async (sessionId) => {
    try {
      const res = await authFetch(`/api/backtesting/sessions/${sessionId}/trades`);
      const data = await res.json();
      setActiveTrades(data.trades || []);
    } catch (err) {
      console.error('Failed to load active trades', err);
    }
  };

  useEffect(() => { load(); }, []);

  useEffect(() => {
    if (activeSession) loadActiveTrades(activeSession._id);
    else setActiveTrades([]);
  }, [activeSession?._id]);

  const handleStartSession = async (e) => {
    e.preventDefault();
    if (!newTicker.trim()) return;
    try {
      await authFetch('/api/backtesting/sessions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: newName.trim() || undefined, ticker: newTicker.trim(), startDate: newStartDate }),
      });
      setShowStartForm(false);
      setNewTicker(''); setNewName(''); setNewStartDate(new Date().toISOString().slice(0, 10));
      await load(false);
    } catch (err) {
      console.error('Failed to start session', err);
    }
  };

  const handleEndSession = async (e) => {
    e.preventDefault();
    if (!activeSession) return;
    try {
      await authFetch(`/api/backtesting/sessions/${activeSession._id}/end`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ endDate }),
      });
      setShowEndForm(false);
      setEndDate('');
      await load(false);
    } catch (err) {
      console.error('Failed to end session', err);
    }
  };

  const handleContinueSession = async (sessionId) => {
    try {
      await authFetch(`/api/backtesting/sessions/${sessionId}/continue`, { method: 'POST' });
      await load(false);
    } catch (err) {
      console.error('Failed to continue session', err);
    }
  };

  const handleDeleteSession = async (sessionId) => {
    if (!window.confirm('Delete this session and all its trades?')) return;
    try {
      await authFetch(`/api/backtesting/sessions/${sessionId}`, { method: 'DELETE' });
      await load(false);
    } catch (err) {
      console.error('Failed to delete session', err);
    }
  };

  const openEndForm = () => {
    if (!showEndForm && activeSession) {
      setEndDate(activeSession.endDate || new Date().toISOString().slice(0, 10));
    }
    setShowEndForm(!showEndForm);
  };

  const handleAddTrade = async (e) => {
    e.preventDefault();
    if (!activeSession || !tradePF || !tradeTime) return;
    setTradeSubmitting(true);
    try {
      await authFetch('/api/backtesting/trades', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sessionId: activeSession._id,
          result: tradeResult,
          profitFactor: parseFloat(tradePF),
          timeOfDay: tradeTime,
        }),
      });
      setTradePF(''); setTradeTime(''); setTradeResult('win');
      await loadActiveTrades(activeSession._id);
      await load(false);
    } catch (err) {
      console.error('Failed to add trade', err);
    } finally {
      setTradeSubmitting(false);
    }
  };

  const handleDeleteTrade = async (tradeId) => {
    try {
      await authFetch(`/api/backtesting/trades/${tradeId}`, { method: 'DELETE' });
      await loadActiveTrades(activeSession._id);
      await load(false);
    } catch (err) {
      console.error('Failed to delete trade', err);
    }
  };

  // Compute aggregate stats from filtered sessions
  const filteredSessions = statsFilter === 'all'
    ? sessions
    : sessions.filter(s => s._id === statsFilter);

  const filteredTrades = statsFilter === 'all'
    ? allTrades
    : allTrades.filter(t => t.sessionId === statsFilter);

  const aggregateStats = (() => {
    const total = filteredSessions.reduce((s, x) => s + (x.tradeCount || 0), 0);
    const wins = filteredSessions.reduce((s, x) => s + (x.winCount || 0), 0);
    const losses = filteredSessions.reduce((s, x) => s + (x.lossCount || 0), 0);
    const rrSum = filteredSessions.reduce((s, x) => s + (x.avgProfitFactor || 0) * (x.tradeCount || 0), 0);
    return {
      total,
      wins,
      losses,
      winRate: total > 0 ? (wins / total) * 100 : 0,
      avgRR: total > 0 ? rrSum / total : 0,
    };
  })();

  // R:R distribution analysis
  const rrBuckets = (() => {
    const buckets = [
      { label: '0-1R', min: 0, max: 1, trades: [] },
      { label: '1-2R', min: 1, max: 2, trades: [] },
      { label: '2-3R', min: 2, max: 3, trades: [] },
      { label: '3R+', min: 3, max: Infinity, trades: [] },
    ];
    filteredTrades.forEach(t => {
      const rr = t.profitFactor;
      const bucket = buckets.find(b => rr >= b.min && rr < b.max) || buckets[buckets.length - 1];
      bucket.trades.push(t);
    });
    return buckets.map(b => ({
      label: b.label,
      count: b.trades.length,
      wins: b.trades.filter(t => t.result === 'win').length,
      losses: b.trades.filter(t => t.result === 'loss').length,
      winRate: b.trades.length > 0 ? (b.trades.filter(t => t.result === 'win').length / b.trades.length) * 100 : 0,
    }));
  })();

  // Time-of-day buckets
  const timeBuckets = (() => {
    const buckets = [
      { label: 'Pre-Market', desc: 'Before 9:30', min: '00:00', max: '09:30', trades: [] },
      { label: 'Open', desc: '9:30–10:30', min: '09:30', max: '10:30', trades: [] },
      { label: 'Mid-Morning', desc: '10:30–12:00', min: '10:30', max: '12:00', trades: [] },
      { label: 'Midday', desc: '12:00–14:00', min: '12:00', max: '14:00', trades: [] },
      { label: 'Afternoon', desc: '14:00–16:00', min: '14:00', max: '16:00', trades: [] },
      { label: 'After-Hours', desc: 'After 16:00', min: '16:00', max: '24:00', trades: [] },
    ];
    filteredTrades.forEach(t => {
      const time = t.timeOfDay; // "HH:MM" format
      const bucket = buckets.find(b => time >= b.min && time < b.max) || buckets[buckets.length - 1];
      bucket.trades.push(t);
    });
    return buckets.map(b => ({
      label: b.label,
      desc: b.desc,
      count: b.trades.length,
      wins: b.trades.filter(t => t.result === 'win').length,
      losses: b.trades.filter(t => t.result === 'loss').length,
      winRate: b.trades.length > 0 ? (b.trades.filter(t => t.result === 'win').length / b.trades.length) * 100 : 0,
    })).filter(b => b.count > 0);
  })();

  const inputClass = 'bg-bg-input border border-border rounded-lg px-3 py-2 text-sm text-text-primary placeholder-text-muted focus:outline-none focus:border-accent w-full';
  const labelClass = 'block text-text-tertiary text-xs font-semibold uppercase tracking-wider mb-1';
  const btnPrimary = 'px-4 py-2 bg-accent text-accent-text text-sm font-semibold rounded-lg hover:brightness-110 transition-all';
  const btnSecondary = 'px-4 py-2 bg-bg-input border border-border text-text-secondary text-sm font-medium rounded-lg hover:text-text-primary transition-colors';

  if (loading) {
    return (
      <div className="flex items-center justify-center h-48 text-text-muted text-sm">
        Loading backtesting data...
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-text-primary text-2xl font-bold">Backtesting</h1>
          <p className="text-text-muted text-sm mt-1">Track wins and losses across backtesting sessions</p>
        </div>
        {!activeSession && !showStartForm && !hasReachedSessionLimit && (
          <button className={btnPrimary} onClick={() => setShowStartForm(true)}>
            + Start Session
          </button>
        )}
      </div>

      {/* Pro session limit banner */}
      {hasReachedSessionLimit && (
        <div className="flex items-center gap-3 bg-yellow-500/10 border border-yellow-500/30 rounded-lg px-4 py-3">
          <Icons.AlertCircle className="w-5 h-5 text-yellow-500 flex-shrink-0" />
          <p className="text-text-primary text-sm font-medium">Upgrade to Elite to unlock Unlimited Backtesting Sessions</p>
          <button className="ml-auto px-4 py-1.5 bg-yellow-500 text-black text-xs font-semibold rounded-lg hover:brightness-110 transition-all whitespace-nowrap" onClick={() => { window.location.href = '/upgrade'; }}>
            Upgrade
          </button>
        </div>
      )}

      {/* Start Session Form */}
      {showStartForm && (
        <div className="bg-bg-surface border border-border rounded-xl p-5">
          <h2 className="text-text-primary font-semibold mb-4">Start New Session</h2>
          <form onSubmit={handleStartSession} className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className={labelClass}>Ticker *</label>
              <input className={inputClass} placeholder="NQ, ES, MNQ..." value={newTicker} onChange={e => setNewTicker(e.target.value)} required />
            </div>
            <div>
              <label className={labelClass}>Session Name (optional)</label>
              <input className={inputClass} placeholder="e.g. Morning breakout v2" value={newName} onChange={e => setNewName(e.target.value)} />
            </div>
            <div>
              <label className={labelClass}>Start Date</label>
              <input type="date" className={inputClass} value={newStartDate} onChange={e => setNewStartDate(e.target.value)} required />
            </div>
            <div className="flex items-end gap-3">
              <button type="submit" className={btnPrimary}>Start</button>
              <button type="button" className={btnSecondary} onClick={() => setShowStartForm(false)}>Cancel</button>
            </div>
          </form>
        </div>
      )}

      {/* Active Session Panel */}
      {activeSession && (
        <div className="bg-bg-surface border border-accent/30 rounded-xl p-5">
          <div className="flex gap-6">
            {/* Left column: header + controls + add trade form */}
            <div className="flex-1 min-w-0 space-y-4">
              <div className="flex items-start justify-between flex-wrap gap-3">
                <div>
                  <div className="flex items-center gap-2 mb-1">
                    <span className="w-2 h-2 rounded-full bg-positive animate-pulse"></span>
                    <span className="text-xs font-semibold uppercase tracking-wider text-positive">Active Session</span>
                  </div>
                  <h2 className="text-text-primary font-semibold text-lg">
                    {activeSession.name || activeSession.ticker}
                    {activeSession.name && <span className="text-text-muted font-normal ml-2 text-sm">({activeSession.ticker})</span>}
                  </h2>
                  <p className="text-text-muted text-xs mt-0.5">Started {activeSession.startDate}</p>
                </div>
                <div className="flex gap-2">
                  {!showStartForm && (
                    <button className={btnPrimary} onClick={() => setShowStartForm(true)}>+ New Session</button>
                  )}
                  <button
                    className="px-4 py-2 bg-negative/10 border border-negative/30 text-negative text-sm font-medium rounded-lg hover:bg-negative/20 transition-colors"
                    onClick={openEndForm}
                  >
                    End Session
                  </button>
                </div>
              </div>

              {/* End session inline form */}
              {showEndForm && (
                <form onSubmit={handleEndSession} className="flex items-end gap-3 pt-2 border-t border-border">
                  <div>
                    <label className={labelClass}>End Date</label>
                    <input type="date" className={`${inputClass} w-auto`} value={endDate} onChange={e => setEndDate(e.target.value)} required />
                  </div>
                  <button type="submit" className="px-4 py-2 bg-negative/10 border border-negative/30 text-negative text-sm font-medium rounded-lg hover:bg-negative/20 transition-colors">
                    Confirm End
                  </button>
                  <button type="button" className={btnSecondary} onClick={() => setShowEndForm(false)}>Cancel</button>
                </form>
              )}

              {/* Add Trade Form */}
              <form onSubmit={handleAddTrade} className="border-t border-border pt-4">
                <p className="text-text-tertiary text-xs font-semibold uppercase tracking-wider mb-3">Log Trade</p>
                <div className="flex flex-wrap items-end gap-3">
                  <div>
                    <label className={labelClass}>Result</label>
                    <div className="flex rounded-lg overflow-hidden border border-border">
                      <button
                        type="button"
                        onClick={() => setTradeResult('win')}
                        className={`px-4 py-2 text-sm font-semibold transition-colors ${tradeResult === 'win' ? 'bg-positive text-white' : 'bg-bg-input text-text-muted hover:text-text-primary'}`}
                      >
                        Win
                      </button>
                      <button
                        type="button"
                        onClick={() => setTradeResult('loss')}
                        className={`px-4 py-2 text-sm font-semibold transition-colors ${tradeResult === 'loss' ? 'bg-negative text-white' : 'bg-bg-input text-text-muted hover:text-text-primary'}`}
                      >
                        Loss
                      </button>
                    </div>
                  </div>
                  <div className="flex-1 min-w-[100px]">
                    <label className={labelClass}>Risk-Reward</label>
                    <input
                      type="number" step="0.01" min="0"
                      className={inputClass}
                      placeholder="e.g. 2.5"
                      value={tradePF}
                      onChange={e => setTradePF(e.target.value)}
                      required
                    />
                  </div>
                  <div>
                    <label className={labelClass}>Time of Trade</label>
                    <input
                      type="time"
                      className={inputClass}
                      value={tradeTime}
                      onChange={e => setTradeTime(e.target.value)}
                      required
                    />
                  </div>
                  <button type="submit" className={btnPrimary} disabled={tradeSubmitting}>
                    {tradeSubmitting ? 'Adding...' : 'Add Trade'}
                  </button>
                </div>
              </form>
            </div>

            {/* Right column: order book — most recent trade at top */}
            <div className="w-48 flex-shrink-0 border-l border-border pl-5">
              <p className="text-text-tertiary text-xs font-semibold uppercase tracking-wider mb-2">
                Trade Log {activeTrades.length > 0 && <span className="text-text-muted font-normal normal-case">({activeTrades.length})</span>}
              </p>
              {activeTrades.length === 0 ? (
                <p className="text-text-muted text-xs mt-4">No trades yet</p>
              ) : (
                <div className="space-y-1 max-h-64 overflow-y-auto pr-1">
                  {[...activeTrades].reverse().map((t) => (
                    <div
                      key={t._id}
                      className={`flex items-center justify-between gap-2 px-2 py-1.5 rounded border-l-2 text-xs ${
                        t.result === 'win'
                          ? 'border-positive bg-positive/5'
                          : 'border-negative bg-negative/5'
                      }`}
                    >
                      <div className="flex items-center gap-1.5 min-w-0">
                        <span className={`font-semibold w-3 ${t.result === 'win' ? 'text-positive' : 'text-negative'}`}>
                          {t.result === 'win' ? 'W' : 'L'}
                        </span>
                        <span className="font-mono text-text-primary">{t.profitFactor.toFixed(2)}R</span>
                        <span className="text-text-muted">{t.timeOfDay}</span>
                      </div>
                      <button
                        onClick={() => handleDeleteTrade(t._id)}
                        className="text-text-muted hover:text-negative transition-colors flex-shrink-0"
                      >
                        <Icons.X className="w-3 h-3" />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Stats Overview */}
      {sessions.length > 0 && (
        <div className="bg-bg-surface border border-border rounded-xl p-5 space-y-5">
          <div className="flex items-center justify-between flex-wrap gap-3">
            <h2 className="text-text-primary font-semibold">Stats Overview</h2>
            <select
              value={statsFilter}
              onChange={e => setStatsFilter(e.target.value)}
              className="bg-bg-input border border-border rounded-lg px-3 py-1.5 text-xs font-medium text-text-primary"
            >
              <option value="all">All Sessions</option>
              {sessions.map(s => (
                <option key={s._id} value={s._id}>
                  {s.name || s.ticker}{s.isActive ? ' (Active)' : ''} — {s.startDate}
                </option>
              ))}
            </select>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
            {[
              { label: 'Total Trades', value: aggregateStats.total },
              { label: 'Wins', value: aggregateStats.wins, color: 'text-positive' },
              { label: 'Losses', value: aggregateStats.losses, color: 'text-negative' },
              { label: 'Win Rate', value: `${aggregateStats.winRate.toFixed(1)}%`, color: aggregateStats.winRate >= 50 ? 'text-positive' : 'text-negative' },
              { label: 'Avg RR', value: aggregateStats.avgRR.toFixed(2)},
            ].map(stat => (
              <div key={stat.label} className="bg-bg-input rounded-lg p-3 text-center">
                <div className={`text-xl font-bold font-mono ${stat.color || 'text-text-primary'}`}>{stat.value}</div>
                <div className="text-text-muted text-xs mt-0.5">{stat.label}</div>
              </div>
            ))}
          </div>

          {/* Win Rate by R:R Range */}
          {filteredTrades.length > 0 && (
            <div>
              <h3 className="text-text-secondary text-xs font-semibold uppercase tracking-wider mb-3">Win Rate by Risk-Reward</h3>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                {rrBuckets.map(b => (
                  <div key={b.label} className="bg-bg-input rounded-lg p-3">
                    <div className="text-text-muted text-xs font-medium mb-1">{b.label}</div>
                    <div className={`text-lg font-bold font-mono ${b.count > 0 ? (b.winRate >= 50 ? 'text-positive' : 'text-negative') : 'text-text-muted'}`}>
                      {b.count > 0 ? `${b.winRate.toFixed(1)}%` : '—'}
                    </div>
                    <div className="text-text-muted text-xs mt-0.5">
                      {b.count > 0 ? `${b.wins}W / ${b.losses}L (${b.count})` : 'No trades'}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* R:R Distribution Bar */}
          {filteredTrades.length > 0 && (
            <div>
              <h3 className="text-text-secondary text-xs font-semibold uppercase tracking-wider mb-3">R:R Distribution</h3>
              <div className="space-y-2">
                {rrBuckets.map(b => {
                  const pct = filteredTrades.length > 0 ? (b.count / filteredTrades.length) * 100 : 0;
                  return (
                    <div key={b.label} className="flex items-center gap-3">
                      <span className="text-xs text-text-secondary w-10 text-right font-mono">{b.label}</span>
                      <div className="flex-1 bg-bg-input rounded-full h-4 overflow-hidden flex">
                        {b.wins > 0 && (
                          <div
                            className="h-full bg-positive/70"
                            style={{ width: `${(b.wins / filteredTrades.length) * 100}%` }}
                          />
                        )}
                        {b.losses > 0 && (
                          <div
                            className="h-full bg-negative/70"
                            style={{ width: `${(b.losses / filteredTrades.length) * 100}%` }}
                          />
                        )}
                      </div>
                      <span className="text-xs text-text-muted w-10 font-mono">{pct.toFixed(0)}%</span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Win Rate by Time of Day */}
          {timeBuckets.length > 0 && (
            <div>
              <h3 className="text-text-secondary text-xs font-semibold uppercase tracking-wider mb-3">Win Rate by Time of Day</h3>
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
                {timeBuckets.map(b => (
                  <div key={b.label} className="bg-bg-input rounded-lg p-3">
                    <div className="text-text-muted text-[10px] font-medium">{b.label}</div>
                    <div className="text-text-muted text-[9px] mb-1">{b.desc}</div>
                    <div className={`text-lg font-bold font-mono ${b.winRate >= 50 ? 'text-positive' : 'text-negative'}`}>
                      {b.winRate.toFixed(1)}%
                    </div>
                    <div className="text-text-muted text-xs mt-0.5">
                      {b.wins}W / {b.losses}L ({b.count})
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Sessions List */}
      <div className="bg-bg-surface border border-border rounded-xl overflow-hidden">
        <div className="px-5 py-4 border-b border-border flex items-center justify-between">
          <h2 className="text-text-primary font-semibold">Sessions</h2>
          {!activeSession && !showStartForm && !hasReachedSessionLimit && (
            <button className={btnPrimary} onClick={() => setShowStartForm(true)}>+ Start Session</button>
          )}
        </div>

        {sessions.length === 0 ? (
          <div className="px-5 py-12 text-center">
            <Icons.FlaskConical className="w-10 h-10 text-text-muted mx-auto mb-3" />
            <p className="text-text-muted text-sm">No sessions yet. Start your first backtesting session.</p>
            <button className={`${btnPrimary} mt-4`} onClick={() => setShowStartForm(true)}>+ Start Session</button>
          </div>
        ) : (
          <div className="divide-y divide-border">
            {sessions.map(session => (
              <div key={session._id} className="px-5 py-4 flex items-center gap-4 flex-wrap hover:bg-bg-input/30 transition-colors">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-text-primary font-medium">
                      {session.name || session.ticker}
                    </span>
                    {session.name && (
                      <span className="text-text-muted text-xs">({session.ticker})</span>
                    )}
                    {session.isActive && (
                      <span className="text-[10px] font-semibold uppercase tracking-wider px-2 py-0.5 rounded-full bg-positive/10 text-positive border border-positive/20">
                        Active
                      </span>
                    )}
                  </div>
                  <p className="text-text-muted text-xs mt-0.5">
                    {session.startDate}
                    {session.endDate ? ` → ${session.endDate}` : ' → now'}
                  </p>
                </div>

                <div className="flex items-center gap-4 text-sm flex-wrap">
                  <div className="text-center">
                    <div className="font-mono font-semibold text-text-primary">{session.tradeCount || 0}</div>
                    <div className="text-text-muted text-xs">trades</div>
                  </div>
                  <div className="text-center">
                    <div className={`font-mono font-semibold ${(session.winRate || 0) >= 50 ? 'text-positive' : 'text-negative'}`}>
                      {(session.winRate || 0).toFixed(1)}%
                    </div>
                    <div className="text-text-muted text-xs">win rate</div>
                  </div>
                  <div className="text-center">
                    <div className="font-mono font-semibold text-text-primary">{(session.avgProfitFactor || 0).toFixed(2)}R</div>
                    <div className="text-text-muted text-xs">avg R:R</div>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  {!session.isActive && (
                    <button
                      onClick={() => handleContinueSession(session._id)}
                      className={btnSecondary}
                    >
                      Continue
                    </button>
                  )}
                  <button
                    onClick={() => handleDeleteSession(session._id)}
                    className="p-2 text-text-muted hover:text-negative transition-colors rounded-lg hover:bg-negative/10"
                  >
                    <Icons.Trash className="w-4 h-4" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

// =====================================================
// TRIAL BANNER
// =====================================================
const FreeBanner = ({ subscriptionStatus, proPrice }) => {
  if (!subscriptionStatus) return null;
  const plan = subscriptionStatus.plan;
  if (plan === 'pro' || plan === 'elite') return null;

  if (plan === 'trial') {
    const trialEndsAt = subscriptionStatus.trialEndsAt ? new Date(subscriptionStatus.trialEndsAt) : null;
    const daysLeft = trialEndsAt ? Math.max(0, Math.ceil((trialEndsAt - new Date()) / (1000 * 60 * 60 * 24))) : null;
    const tradeCount = subscriptionStatus.tradeCount ?? null;
    const tradesLeft = tradeCount !== null ? Math.max(0, 50 - tradeCount) : null;
    return (
      <div className="bg-accent/10 border border-accent/30 rounded-lg px-4 py-3 mb-6">
        <p className="text-sm text-accent">
          <span className="font-semibold">You're on your free trial.</span>
          <span className="text-text-secondary ml-1">
            {daysLeft !== null && <span className="text-accent font-medium">{daysLeft} day{daysLeft !== 1 ? 's' : ''} left</span>}
            {daysLeft !== null && tradesLeft !== null && <span className="text-text-muted mx-1">·</span>}
            {tradesLeft !== null && <span className="text-accent font-medium">{tradesLeft} of 50 trades remaining</span>}
            {(daysLeft !== null || tradesLeft !== null) && <span>. </span>}
            Upgrade to Pro before your trial ends to keep unlimited access.
          </span>
        </p>
      </div>
    );
  }

  return (
    <div className="bg-accent/10 border border-accent/30 rounded-lg px-4 py-3 mb-6">
      <p className="text-sm text-accent">
        <span className="font-semibold">Your trial has ended.</span>
        <span className="text-text-secondary ml-1">Upgrade to Pro for just ${proPrice}/month to unlock unlimited trades, broker sync, CSV import, strategy tracking, and more.</span>
      </p>
    </div>
  );
};

// =====================================================
// MAIN APP
// =====================================================
const App = () => {
  const [currentPage, setCurrentPage] = useState(() => {
    const params = new URLSearchParams(window.location.search);
    return (params.get('tv_code') || params.get('tv_error')) ? 'settings' : 'dashboard';
  });
  const [reloadTrades, setReloadTrades] = useState(false);
  const [trades, setTrades] = useState([]);
  const [tags, setTags] = useState([]);
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingTrade, setEditingTrade] = useState(null);
  const [prefillDate, setPrefillDate] = useState(null);
  const [csvImportOpen, setCsvImportOpen] = useState(false);
  const [toast, setToast] = useState(null);
  const [subscriptionStatus, setSubscriptionStatus] = useState(null);
  const [syncNotification, setSyncNotification] = useState(null);
  const [showWelcome, setShowWelcome] = useState(false);
  const [theme, setTheme] = useState(() => localStorage.getItem('theme') || 'dark');
  const [customColors, setCustomColors] = useState(() => {
    try { return JSON.parse(localStorage.getItem('customColors')) || {}; } catch { return {}; }
  });
  const [dailyNotes, setDailyNotes] = useState([]);
  const [pricing, setPricing] = useState({ pro: '12', elite: '18' });
  const [strategyRules, setStrategyRules] = useState([]);
  const [sidePanelOffset, setSidePanelOffset] = useState(0);
  const [evalFilter, setEvalFilterState] = useState(() => {
    const stored = localStorage.getItem('evalFilter');
    return ['all', 'exclude', 'only'].includes(stored) ? stored : 'exclude';
  });

  const setEvalFilter = (val) => {
    setEvalFilterState(val);
    localStorage.setItem('evalFilter', val);
  };

  const triggerReload = () => setReloadTrades(!reloadTrades);

  // Apply theme to DOM and persist
  useEffect(() => {
    const root = document.documentElement;
    if (theme === 'custom') {
      // Start from dark base, then override with custom colors
      root.setAttribute('data-theme', 'dark');
      const hexToChannels = (hex) => {
        const r = parseInt(hex.slice(1, 3), 16), g = parseInt(hex.slice(3, 5), 16), b = parseInt(hex.slice(5, 7), 16);
        return [r, g, b];
      };
      const toRgbStr = (r, g, b) => `${r} ${g} ${b}`;
      const clamp = (v) => Math.min(255, Math.max(0, Math.round(v)));

      if (customColors.bgPage) {
        const [r, g, b] = hexToChannels(customColors.bgPage);
        root.style.setProperty('--bg-page', toRgbStr(r, g, b));
      }
      if (customColors.bgSurface) {
        const [r, g, b] = hexToChannels(customColors.bgSurface);
        root.style.setProperty('--bg-surface', toRgbStr(r, g, b));
        root.style.setProperty('--bg-input', toRgbStr(clamp(r + 15), clamp(g + 15), clamp(b + 15)));
        root.style.setProperty('--border', toRgbStr(clamp(r + 20), clamp(g + 20), clamp(b + 20)));
      }
      if (customColors.textPrimary) {
        const [tr, tg, tb] = hexToChannels(customColors.textPrimary);
        root.style.setProperty('--text-primary', toRgbStr(tr, tg, tb));
        const bgHex = customColors.bgPage || '#0B0E14';
        const [br, bg2, bb] = hexToChannels(bgHex);
        const blend = (fg, bg, a) => clamp(fg * a + bg * (1 - a));
        root.style.setProperty('--text-secondary', toRgbStr(blend(tr, br, 0.6), blend(tg, bg2, 0.6), blend(tb, bb, 0.6)));
        root.style.setProperty('--text-tertiary', toRgbStr(blend(tr, br, 0.43), blend(tg, bg2, 0.43), blend(tb, bb, 0.43)));
        root.style.setProperty('--text-muted', toRgbStr(blend(tr, br, 0.25), blend(tg, bg2, 0.25), blend(tb, bb, 0.25)));
      }
      if (customColors.accent) { const [r, g, b] = hexToChannels(customColors.accent); root.style.setProperty('--accent', toRgbStr(r, g, b)); }
      if (customColors.positive) { const [r, g, b] = hexToChannels(customColors.positive); root.style.setProperty('--positive', toRgbStr(r, g, b)); }
      if (customColors.negative) { const [r, g, b] = hexToChannels(customColors.negative); root.style.setProperty('--negative', toRgbStr(r, g, b)); }
    } else {
      root.setAttribute('data-theme', theme);
      ['--bg-page', '--bg-surface', '--bg-input', '--border', '--text-primary', '--text-secondary', '--text-tertiary', '--text-muted', '--accent', '--positive', '--negative'].forEach(p => root.style.removeProperty(p));
    }
    localStorage.setItem('theme', theme);
    localStorage.setItem('customColors', JSON.stringify(customColors));
  }, [theme, customColors]);

  // Fetch theme from account on mount
  useEffect(() => {
    const fetchAccountTheme = async () => {
      try {
        const response = await authFetch('/api/account');
        const data = await response.json();
        if (data.account && data.account.theme) {
          setTheme(data.account.theme);
          if (data.account.customColors) setCustomColors(data.account.customColors);
        }
      } catch (err) {
        console.error('Failed to fetch account theme:', err);
      }
    };
    fetchAccountTheme();
  }, []);

  const handleThemeChange = (newTheme, newCustomColors) => {
    setTheme(newTheme);
    if (newCustomColors) setCustomColors(newCustomColors);
    authFetch('/api/preferences/theme', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ theme: newTheme, customColors: newCustomColors || customColors }),
    }).catch(err => console.error('Failed to save theme:', err));
  };

  useEffect(() => {
    const loadTradesFromServer = async () => {
      const response = await authFetch('/api/getTrades');
      const data = await response.json();
      setTrades(data.trades);
      if (data.trades && data.trades.length === 0 && !localStorage.getItem('rrmetrics_onboarded')) {
        setShowWelcome(true);
      }
    };
    loadTradesFromServer();
  }, [reloadTrades]);

  const dismissWelcome = () => {
    setShowWelcome(false);
    localStorage.setItem('rrmetrics_onboarded', '1');
  };

  useEffect(() => {
    const loadTags = async () => {
      try {
        const response = await authFetch('/api/getTags');
        const data = await response.json();
        setTags(data.tags || []);
      } catch (err) {
        console.error('Failed to fetch tags:', err);
      }
    };
    loadTags();
  }, [reloadTrades]);

  useEffect(() => {
    const fetchSubscriptionStatus = async () => {
      try {
        const response = await authFetch('/api/subscriptionStatus');
        const data = await response.json();
        setSubscriptionStatus(data);
      } catch (err) {
        console.error('Failed to fetch subscription status:', err);
      }
    };
    fetchSubscriptionStatus();
    fetch('/api/pricing').then(r => r.json()).then(setPricing).catch(() => {});
    authFetch('/api/strategy/rules')
      .then(r => r.json())
      .then(data => { if (data.rules) setStrategyRules(data.rules); })
      .catch(() => {});
  }, []);

  useEffect(() => {
    const loadDailyNotes = async () => {
      try {
        const response = await authFetch('/api/getDailyNotes');
        const data = await response.json();
        setDailyNotes(data.notes || []);
      } catch (err) {
        console.error('Failed to fetch daily notes:', err);
      }
    };
    loadDailyNotes();
  }, [reloadTrades]);

  const handleSaveNote = async (date, content) => {
    try {
      const response = await authFetch('/api/saveDailyNote', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ date, content }),
      });
      const data = await response.json();
      if (!data.error) {
        setDailyNotes(prev => {
          const filtered = prev.filter(n => n.date !== date);
          return [...filtered, data.note];
        });
      }
    } catch (err) {
      console.error('Failed to save note:', err);
    }
  };

  const handleDeleteNote = async (date) => {
    try {
      await authFetch('/api/removeDailyNote', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ date }),
      });
      setDailyNotes(prev => prev.filter(n => n.date !== date));
    } catch (err) {
      console.error('Failed to delete note:', err);
    }
  };

  // Auto-sync Tradovate on mount
  useEffect(() => {
    const autoSync = async () => {
      try {
        const statusRes = await authFetch('/api/tradovate/status');
        const status = await statusRes.json();
        if (status.configured) {
          setSyncNotification('Syncing trades from Tradovate...');
          const syncRes = await authFetch('/api/tradovate/sync', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
          });
          const syncData = await syncRes.json();
          if (syncData.synced > 0) {
            setSyncNotification(`Synced ${syncData.synced} new trade${syncData.synced !== 1 ? 's' : ''} from Tradovate`);
            triggerReload();
          } else {
            setSyncNotification(null);
          }
          setTimeout(() => setSyncNotification(null), 4000);
        }
      } catch (err) {
        console.error('Auto-sync failed:', err);
      }

      // Auto-sync ProjectX
      try {
        const pxStatusRes = await authFetch('/api/projectx/status');
        const pxStat = await pxStatusRes.json();
        if (pxStat.configured && pxStat.selectedAccounts?.length > 0) {
          setSyncNotification('Syncing trades from Topstep...');
          const pxSyncRes = await authFetch('/api/projectx/sync', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
          });
          const pxSyncData = await pxSyncRes.json();
          if (pxSyncData.synced > 0) {
            setSyncNotification(`Synced ${pxSyncData.synced} new trade${pxSyncData.synced !== 1 ? 's' : ''} from Topstep`);
            triggerReload();
          } else {
            setSyncNotification(null);
          }
          setTimeout(() => setSyncNotification(null), 4000);
        }
      } catch (err) {
        console.error('ProjectX auto-sync failed:', err);
      }
    };
    autoSync();
  }, []);

  const openForm = () => setIsFormOpen(true);
  const openFormWithDate = (dateKey) => { setPrefillDate(dateKey); setIsFormOpen(true); };
  const openEditForm = (trade) => { setEditingTrade(trade); setIsFormOpen(true); };

  const renderPage = () => {
    switch (currentPage) {
      case 'dashboard':
        return <DashboardPage trades={trades} subscriptionStatus={subscriptionStatus} onOpenForm={openForm} onOpenImport={() => setCsvImportOpen(true)} onOpenAddTrade={openFormWithDate} onEditTrade={openEditForm} dailyNotes={dailyNotes} onSaveNote={handleSaveNote} onDeleteNote={handleDeleteNote} tags={tags} strategyRules={strategyRules} evalFilter={evalFilter} setEvalFilter={setEvalFilter} />;
      case 'trades':
        return (
          <TradeListPage
            trades={trades}
            triggerReload={triggerReload}
            onEdit={(trade) => { setEditingTrade(trade); setIsFormOpen(true); }}
            subscriptionStatus={subscriptionStatus}
            onOpenForm={openForm}
            onOpenImport={() => setCsvImportOpen(true)}
            tags={tags}
            strategyRules={strategyRules}
          />
        );
      case 'analytics':
        return <AnalyticsPage trades={trades} evalFilter={evalFilter} setEvalFilter={setEvalFilter} />;
      case 'strategy':
        return <StrategyPage subscriptionStatus={subscriptionStatus} trades={trades} evalFilter={evalFilter} setEvalFilter={setEvalFilter} />;
      case 'premarket':
        return <PreMarketPage subscriptionStatus={subscriptionStatus} trades={trades} />;
      case 'backtesting':
        return <BacktestingPage subscriptionStatus={subscriptionStatus} />;
      case 'settings':
        return <SettingsPage onSyncComplete={triggerReload} onNavigate={setCurrentPage} theme={theme} onThemeChange={handleThemeChange} customColors={customColors} tags={tags} triggerReload={triggerReload} subscriptionStatus={subscriptionStatus} />;
      case 'upgrade':
        return <UpgradePage pricing={pricing} />;
      case 'referral':
        return <ReferralPage />;
      default:
        return <DashboardPage trades={trades} subscriptionStatus={subscriptionStatus} onOpenForm={openForm} onOpenImport={() => setCsvImportOpen(true)} onOpenAddTrade={openFormWithDate} onEditTrade={openEditForm} dailyNotes={dailyNotes} onSaveNote={handleSaveNote} onDeleteNote={handleDeleteNote} tags={tags} strategyRules={strategyRules} evalFilter={evalFilter} setEvalFilter={setEvalFilter} />;
    }
  };

  return (
    <SidePanelContext.Provider value={setSidePanelOffset}>
    <div className="flex min-h-screen">
      <Sidebar currentPage={currentPage} onNavigate={setCurrentPage} subscriptionStatus={subscriptionStatus} />
      <main className="flex-1 lg:ml-60 min-h-screen transition-[padding] duration-300" style={{ paddingRight: sidePanelOffset }}>
        <div className="p-6 lg:p-8">
          <FreeBanner subscriptionStatus={subscriptionStatus} proPrice={pricing.pro} />
          {syncNotification && (
            <div className="flex items-center gap-2 bg-info/10 border border-info/30 rounded-lg px-4 py-3 mb-6 text-info text-sm">
              <Icons.RefreshCw className="w-4 h-4 animate-spin" />
              {syncNotification}
            </div>
          )}
          {renderPage()}
        </div>
      </main>

      <TradeFormPopup
        isOpen={isFormOpen}
        onClose={() => { setIsFormOpen(false); setEditingTrade(null); setPrefillDate(null); }}
        triggerReload={triggerReload}
        editingTrade={editingTrade}
        prefillDate={prefillDate}
        tags={tags}
        strategyRules={strategyRules}
        subscriptionStatus={subscriptionStatus}
        trades={trades}
      />
      <CSVImportModal isOpen={csvImportOpen} onClose={() => setCsvImportOpen(false)} triggerReload={triggerReload} onDuplicatesSkipped={(n) => setToast({ message: `${n} trade${n !== 1 ? 's were' : ' was'} already in your journal and ${n !== 1 ? 'were' : 'was'} not added again.` })} />
      <Toast toast={toast} onClose={() => setToast(null)} />

      {showWelcome && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-sm" onClick={dismissWelcome}>
          <div className="bg-bg-surface border border-border rounded-xl shadow-2xl max-w-sm w-full mx-4 px-6 py-5 text-center" onClick={e => e.stopPropagation()}>
            <h3 className="text-text-primary text-base font-semibold mb-2">Welcome to RR Metrics!</h3>
            <p className="text-text-secondary text-sm mb-4">New here? Check out our quick start guide to get up and running.</p>
            <a
              href="/guides/getting-started"
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-2 px-4 py-2 bg-accent text-black text-sm font-medium rounded-lg hover:opacity-90 transition-opacity no-underline"
            >
              <Icons.BookOpen className="w-4 h-4" />
              Quick Start Guide
            </a>
            <button onClick={dismissWelcome} className="text-text-muted text-xs hover:text-text-secondary transition-colors mt-4 cursor-pointer block mx-auto">Dismiss</button>
          </div>
        </div>
      )}
    </div>
    </SidePanelContext.Provider>
  );
};

const init = async () => {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) {
    window.location = '/login';
    return;
  }
  const root = createRoot(document.getElementById('app'));
  root.render(<App />);
};

window.onload = init;
