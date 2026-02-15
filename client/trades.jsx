const helper = require('./helper.js');
const React = require('react');
const { useState, useEffect, useRef } = React;
const { createRoot } = require('react-dom/client');
const Papa = require('papaparse');
require('./styles/globals.css');

// =====================================================
// UTILITY FUNCTIONS
// =====================================================
const resizeImage = (dataUrl, maxWidth = 854, maxHeight = 480) => {
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
    pl: trade.manualPL !== null && trade.manualPL !== undefined
      ? trade.manualPL
      : (trade.exitPrice - trade.enterPrice) * trade.quantity,
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
    const pl = trade.manualPL !== null && trade.manualPL !== undefined
      ? trade.manualPL
      : (trade.exitPrice - trade.enterPrice) * trade.quantity;
    const exitDate = new Date(trade.exitTime);
    const dateKey = `${exitDate.getFullYear()}-${String(exitDate.getMonth() + 1).padStart(2, '0')}-${String(exitDate.getDate()).padStart(2, '0')}`;
    if (!grouped[dateKey]) grouped[dateKey] = { totalPL: 0, tradeCount: 0, trades: [] };
    grouped[dateKey].totalPL += pl;
    grouped[dateKey].tradeCount++;
    grouped[dateKey].trades.push(trade);
  });
  return grouped;
};

const getCSSVar = (name) => getComputedStyle(document.documentElement).getPropertyValue(name).trim();

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
  return trade.manualPL !== null && trade.manualPL !== undefined
    ? trade.manualPL
    : (trade.exitPrice - trade.enterPrice) * trade.quantity;
};

const handleTrade = (e, onTradeAdded, screenshotData, tags) => {
  e.preventDefault();
  helper.hideError();

  const ticker = e.target.querySelector('#ticker').value;
  const enterTime = e.target.querySelector('#enterTime').value;
  const exitTime = e.target.querySelector('#exitTime').value;
  const enterPrice = e.target.querySelector('#enterPrice').value;
  const exitPrice = e.target.querySelector('#exitPrice').value;
  const quantity = e.target.querySelector('#quantity').value;
  const manualPL = e.target.querySelector('#manualPL').value;
  const comments = e.target.querySelector('#comments').value;

  if (!ticker || !enterTime || !exitTime || !enterPrice || !exitPrice || !quantity) {
    helper.handleError('Ticker, enter time, exit time, enter price, exit price, and quantity are required');
    return false;
  }

  const tradeData = {
    ticker, enterTime, exitTime,
    enterPrice: parseFloat(enterPrice),
    exitPrice: parseFloat(exitPrice),
    quantity: parseFloat(quantity),
    comments
  };

  if (manualPL) tradeData.manualPL = parseFloat(manualPL);
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
  helper.sendPost('/removeTrade', { _id: id }, onTradeRemoved);
  return false;
};

const handleUpdateTrade = (e, tradeId, onTradeUpdated, screenshotData, tags) => {
  e.preventDefault();
  helper.hideError();

  const ticker = e.target.querySelector('#ticker').value;
  const enterTime = e.target.querySelector('#enterTime').value;
  const exitTime = e.target.querySelector('#exitTime').value;
  const enterPrice = e.target.querySelector('#enterPrice').value;
  const exitPrice = e.target.querySelector('#exitPrice').value;
  const quantity = e.target.querySelector('#quantity').value;
  const manualPL = e.target.querySelector('#manualPL').value;
  const comments = e.target.querySelector('#comments').value;

  if (!ticker || !enterTime || !exitTime || !enterPrice || !exitPrice || !quantity) {
    helper.handleError('Ticker, enter time, exit time, enter price, exit price, and quantity are required');
    return false;
  }

  const tradeData = {
    _id: tradeId, ticker, enterTime, exitTime,
    enterPrice: parseFloat(enterPrice),
    exitPrice: parseFloat(exitPrice),
    quantity: parseFloat(quantity),
    comments
  };

  if (manualPL) tradeData.manualPL = parseFloat(manualPL);
  if (screenshotData) tradeData.screenshot = screenshotData;
  if (tags) tradeData.tags = tags;

  helper.sendPost('/updateTrade', tradeData, onTradeUpdated);
  return false;
};

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
};

// =====================================================
// SIDEBAR
// =====================================================
const Sidebar = ({ currentPage, onNavigate }) => {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [accountOpen, setAccountOpen] = useState(false);

  const navItems = [
    { id: 'dashboard', label: 'Dashboard', icon: Icons.Home },
    { id: 'trades', label: 'Trades', icon: Icons.List },
    { id: 'analytics', label: 'Analytics', icon: Icons.BarChart },
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

        {/* Upgrade box */}
        <div className="px-4 pb-3">
          <div className="bg-bg-surface border border-border rounded-xl p-4">
            <div className="flex items-center gap-2 mb-2">
              <Icons.Zap className="w-4 h-4 text-accent" />
              <span className="text-text-primary text-sm font-semibold">Upgrade to Pro</span>
            </div>
            <p className="text-text-tertiary text-xs mb-3">Get advanced analytics, unlimited trades, and priority support.</p>
            <button
              className="w-full py-2 bg-accent text-accent-text text-xs font-semibold rounded-lg hover:brightness-110 transition-all"
              onClick={() => handleNav('upgrade')}
            >
              Upgrade Now
            </button>
          </div>
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
                <a href="/logout" className="flex items-center gap-3 px-4 py-2.5 text-sm text-text-secondary hover:bg-bg-input hover:text-text-primary transition-colors no-underline">
                  <Icons.LogOut className="w-4 h-4" />
                  Log Out
                </a>
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
const StatCard = ({ label, value, subValue, color }) => (
  <div className="bg-bg-surface border border-border rounded-xl p-5">
    <div className="text-text-secondary text-xs font-medium uppercase tracking-wider mb-2">{label}</div>
    <div className={`font-mono text-2xl font-bold ${color || 'text-text-primary'}`}>{value}</div>
    {subValue && <div className="text-text-tertiary text-xs mt-1">{subValue}</div>}
  </div>
);

// =====================================================
// DASHBOARD PAGE
// =====================================================
const DashboardPage = ({ trades, subscriptionStatus, onOpenForm }) => {
  const stats = calculateAnalytics(trades);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-text-primary">Dashboard</h1>
          <p className="text-text-secondary text-sm mt-1">Overview of your trading performance</p>
        </div>
        {subscriptionStatus && (subscriptionStatus.isPremium || subscriptionStatus.isTrialActive) && (
          <button className="flex items-center gap-2 px-4 py-2.5 bg-accent text-accent-text text-sm font-semibold rounded-lg hover:brightness-110 transition-all" onClick={onOpenForm}>
            <Icons.Plus className="w-4 h-4" />
            New Trade
          </button>
        )}
      </div>

      {/* Stats grid */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <StatCard
          label="Total P/L"
          value={`$${stats.totalPL.toFixed(2)}`}
          color={stats.totalPL >= 0 ? 'text-positive' : 'text-negative'}
        />
        <StatCard label="Win Rate" value={`${stats.winRate.toFixed(1)}%`} color="text-text-primary" />
        <StatCard label="Total Trades" value={stats.totalTrades} color="text-text-primary" />
        <StatCard label="Avg Duration" value={formatDuration(stats.avgDuration)} color="text-text-primary" />
      </div>

      {/* Secondary stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <StatCard label="Avg Win" value={`$${stats.avgWin.toFixed(2)}`} color="text-positive" />
        <StatCard label="Avg Loss" value={`$${stats.avgLoss.toFixed(2)}`} color="text-negative" />
        <StatCard label="Best Trade" value={`$${stats.bestTrade.toFixed(2)}`} color="text-positive" />
        <StatCard label="Worst Trade" value={`$${stats.worstTrade.toFixed(2)}`} color="text-negative" />
      </div>

      {/* Calendar */}
      <CalendarView trades={trades} />
    </div>
  );
};

// =====================================================
// DAY DETAIL PANEL
// =====================================================
const DayDetailPanel = ({ dateKey, dayData, onClose }) => {
  const date = new Date(dateKey + 'T00:00:00');
  const formatted = date.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' });

  const trades = dayData.trades;
  const wins = trades.filter(t => getTradePL(t) > 0).length;
  const winRate = trades.length > 0 ? ((wins / trades.length) * 100).toFixed(0) : 0;
  const avgDuration = trades.length > 0
    ? trades.reduce((sum, t) => sum + (new Date(t.exitTime) - new Date(t.enterTime)), 0) / trades.length
    : 0;

  useEffect(() => {
    const handleEscape = (e) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', handleEscape);
    return () => document.removeEventListener('keydown', handleEscape);
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-bg-surface border border-border rounded-xl w-full max-w-lg max-h-[85vh] flex flex-col" onClick={(e) => e.stopPropagation()}>
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
            <div className={`font-mono text-sm font-bold ${dayData.totalPL >= 0 ? 'text-positive' : 'text-negative'}`}>
              ${dayData.totalPL.toFixed(2)}
            </div>
          </div>
          <div className="text-center">
            <div className="text-text-secondary text-xs mb-1">Win Rate</div>
            <div className="font-mono text-sm font-bold text-text-primary">{winRate}%</div>
          </div>
          <div className="text-center">
            <div className="text-text-secondary text-xs mb-1">Trades</div>
            <div className="font-mono text-sm font-bold text-text-primary">{dayData.tradeCount}</div>
          </div>
          <div className="text-center">
            <div className="text-text-secondary text-xs mb-1">Avg Duration</div>
            <div className="font-mono text-sm font-bold text-text-primary">{formatDuration(avgDuration)}</div>
          </div>
        </div>

        {/* Trade list */}
        <div className="flex-1 overflow-y-auto px-6 py-3">
          <div className="space-y-2">
            {trades.map(trade => {
              const pl = getTradePL(trade);
              const duration = new Date(trade.exitTime) - new Date(trade.enterTime);
              const entryTime = new Date(trade.enterTime).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
              const exitTime = new Date(trade.exitTime).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
              return (
                <div key={trade._id} className="flex items-center justify-between py-2.5 px-3 rounded-lg bg-bg-input border border-border">
                  <div className="flex items-center gap-3">
                    <span className="font-mono text-sm font-semibold text-text-primary">{trade.ticker}</span>
                    <span className="text-text-tertiary text-xs">{entryTime} - {exitTime}</span>
                    <span className="text-text-muted text-xs">{formatDuration(duration)}</span>
                  </div>
                  <span className={`font-mono text-sm font-semibold ${pl >= 0 ? 'text-positive' : 'text-negative'}`}>
                    {pl >= 0 ? '+' : ''}${pl.toFixed(2)}
                  </span>
                </div>
              );
            })}
          </div>
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

const CalendarView = ({ trades }) => {
  const [viewMode, setViewMode] = useState('daily'); // 'daily' | 'heatmap' | 'monthly'
  const [currentDate, setCurrentDate] = useState(new Date());
  const [selectedDay, setSelectedDay] = useState(null);
  const dailyData = groupTradesByDate(trades);

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
  if (viewMode === 'daily') {
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    for (let d = 1; d <= daysInMonth; d++) {
      const dk = `${year}-${String(month + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
      if (dailyData[dk]) {
        monthPL += dailyData[dk].totalPL;
        monthTrades += dailyData[dk].tradeCount;
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
            <span className={`ml-2 font-mono text-sm font-bold px-2.5 py-1 rounded-md ${
              monthTrades > 0
                ? monthPL >= 0 ? 'text-positive bg-positive/10' : 'text-negative bg-negative/10'
                : 'text-text-muted bg-bg-input'
            }`}>
              {monthTrades > 0 ? `$${monthPL.toFixed(2)}` : '--'}
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

      {selectedDay && dailyData[selectedDay] && (
        <DayDetailPanel
          dateKey={selectedDay}
          dayData={dailyData[selectedDay]}
          onClose={() => setSelectedDay(null)}
        />
      )}
    </div>
  );
};

// --- Daily Calendar (original view) ---
const DailyCalendar = ({ year, month, dailyData, onSelectDay }) => {
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

              let bgClass = 'bg-bg-input';
              if (hasActivity) {
                bgClass = pl >= 0 ? 'bg-positive/10 border-positive/30' : 'bg-negative/10 border-negative/30';
              }

              return (
                <div
                  key={slot.day}
                  className={`h-24 rounded-lg border border-border p-2 ${bgClass} ${hasActivity ? 'cursor-pointer hover:brightness-110 transition-all' : ''}`}
                  onClick={() => hasActivity && onSelectDay(slot.dateKey)}
                >
                  <div className="text-xs text-text-secondary">{slot.day}</div>
                  {hasActivity && (
                    <>
                      <div className={`font-mono text-sm font-semibold mt-1 ${pl >= 0 ? 'text-positive' : 'text-negative'}`}>
                        ${pl.toFixed(0)}
                      </div>
                      <div className="text-text-tertiary text-[10px] mt-0.5">
                        {data.tradeCount} trade{data.tradeCount !== 1 ? 's' : ''}
                      </div>
                    </>
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
      if (intensity < 0.25) return 'bg-positive/20';
      if (intensity < 0.5) return 'bg-positive/40';
      if (intensity < 0.75) return 'bg-positive/60';
      return 'bg-positive/80';
    }
    if (intensity < 0.25) return 'bg-negative/20';
    if (intensity < 0.5) return 'bg-negative/40';
    if (intensity < 0.75) return 'bg-negative/60';
    return 'bg-negative/80';
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

  return (
    <div className="relative">
      {/* Month labels */}
      <div className="flex ml-8 mb-1 text-[10px] text-text-tertiary" style={{ gap: 0 }}>
        {(() => {
          const labels = [];
          let lastIdx = -1;
          monthLabels.forEach(({ weekIndex, label }) => {
            const left = weekIndex * 15; // ~15px per column
            if (lastIdx === -1 || left - lastIdx > 28) {
              labels.push(<span key={label} style={{ position: 'absolute', left: `${32 + left}px` }}>{label}</span>);
              lastIdx = left;
            }
          });
          return labels;
        })()}
      </div>

      <div className="flex gap-0 mt-5">
        {/* Day-of-week labels */}
        <div className="flex flex-col gap-[3px] mr-1.5 text-[10px] text-text-tertiary pt-0">
          {['Sun', '', 'Tue', '', 'Thu', '', 'Sat'].map((label, i) => (
            <div key={i} className="h-[13px] flex items-center justify-end w-6">{label}</div>
          ))}
        </div>

        {/* Heatmap grid */}
        <div className="flex gap-[3px] overflow-x-auto">
          {weeks.map((week, wi) => (
            <div key={wi} className="flex flex-col gap-[3px]">
              {week.map((day, di) => {
                if (!day) return <div key={di} className="w-[13px] h-[13px]" />;
                const data = dailyData[day.dateKey];
                const hasActivity = !!data;
                return (
                  <div
                    key={di}
                    className={`w-[13px] h-[13px] rounded-[2px] ${getHeatColor(day.dateKey)} ${hasActivity ? 'cursor-pointer' : ''} transition-all`}
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
          <div className="w-[13px] h-[13px] rounded-[2px] bg-negative/80" />
          <div className="w-[13px] h-[13px] rounded-[2px] bg-negative/40" />
          <div className="w-[13px] h-[13px] rounded-[2px] bg-bg-input" />
          <div className="w-[13px] h-[13px] rounded-[2px] bg-positive/40" />
          <div className="w-[13px] h-[13px] rounded-[2px] bg-positive/80" />
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
  );
};

// --- Monthly Grid (P/L per month for the year) ---
const MonthlyGrid = ({ year, dailyData }) => {
  // Aggregate P/L and trades per month
  const monthlyData = MONTH_NAMES.map((name, mi) => {
    let totalPL = 0;
    let tradeCount = 0;
    let winDays = 0;
    let lossDays = 0;
    const daysInMonth = new Date(year, mi + 1, 0).getDate();
    for (let d = 1; d <= daysInMonth; d++) {
      const dk = `${year}-${String(mi + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
      if (dailyData[dk]) {
        totalPL += dailyData[dk].totalPL;
        tradeCount += dailyData[dk].tradeCount;
        if (dailyData[dk].totalPL > 0) winDays++;
        else if (dailyData[dk].totalPL < 0) lossDays++;
      }
    }
    return { name, shortName: MONTH_SHORT[mi], totalPL, tradeCount, winDays, lossDays };
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
                  <div className={`font-mono text-xl font-bold ${m.totalPL >= 0 ? 'text-positive' : 'text-negative'}`}>
                    ${m.totalPL.toFixed(2)}
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
// CSV IMPORT MODAL
// =====================================================
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

const CSVImportModal = ({ isOpen, onClose, triggerReload }) => {
  const [step, setStep] = useState(1);
  const [csvData, setCsvData] = useState([]);
  const [csvHeaders, setCsvHeaders] = useState([]);
  const [columnMap, setColumnMap] = useState({});
  const [mappedTrades, setMappedTrades] = useState([]);
  const [importing, setImporting] = useState(false);
  const [importResult, setImportResult] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!isOpen) {
      setStep(1); setCsvData([]); setCsvHeaders([]); setColumnMap({});
      setMappedTrades([]); setImporting(false); setImportResult(null); setError(null);
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
        setCsvData(results.data);
        setCsvHeaders(results.meta.fields || []);

        // Auto-detect column mapping
        const autoMap = {};
        CSV_TRADE_FIELDS.forEach(field => {
          const match = (results.meta.fields || []).find(h =>
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
    }).filter(t => t.ticker && t.enterTime && t.exitTime);

    setMappedTrades(trades);
    setStep(3);
  };

  const handleImport = async () => {
    setImporting(true);
    setError(null);
    try {
      const response = await fetch('/importTrades', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ trades: mappedTrades }),
      });
      const data = await response.json();
      if (data.error) {
        setError(data.error);
      } else {
        setImportResult(data);
        triggerReload();
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
              <p className="text-text-secondary text-sm">{importResult.imported} trades imported successfully.</p>
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
const TradeListPage = ({ trades, triggerReload, onEdit, subscriptionStatus, onOpenForm, tags }) => {
  const [searchTicker, setSearchTicker] = useState('');
  const [sortField, setSortField] = useState('exitTime');
  const [sortDir, setSortDir] = useState('desc');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [sideFilter, setSideFilter] = useState('all');
  const [filterTags, setFilterTags] = useState([]);
  const [csvImportOpen, setCsvImportOpen] = useState(false);
  const [showNewTagInline, setShowNewTagInline] = useState(false);
  const [inlineTagName, setInlineTagName] = useState('');
  const [inlineTagColor, setInlineTagColor] = useState(TAG_COLOR_PRESETS[0]);
  const [inlineTagCreating, setInlineTagCreating] = useState(false);

  const handleInlineCreateTag = async () => {
    if (!inlineTagName.trim() || inlineTagCreating) return;
    setInlineTagCreating(true);
    try {
      const response = await fetch('/makeTag', {
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

  const handleExportCSV = () => {
    if (filtered.length === 0) return;
    const headers = ['Ticker', 'Enter Time', 'Exit Time', 'Enter Price', 'Exit Price', 'Quantity', 'P/L', 'Comments'];
    const rows = filtered.map(t => {
      const pl = getTradePL(t);
      return [
        t.ticker,
        new Date(t.enterTime).toISOString(),
        new Date(t.exitTime).toISOString(),
        t.enterPrice,
        t.exitPrice,
        t.quantity,
        pl.toFixed(2),
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

  let filtered = trades;

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

  if (sideFilter !== 'all') {
    filtered = filtered.filter(t => {
      const pl = getTradePL(t);
      if (sideFilter === 'wins') return pl > 0;
      if (sideFilter === 'losses') return pl < 0;
      return true;
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

  const formatDateTime = (dateString) => {
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  };

  const formatTime = (dateString) => {
    const date = new Date(dateString);
    return date.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
  };

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
            onClick={() => setCsvImportOpen(true)}
          >
            <Icons.Download className="w-4 h-4" />
            Import CSV
          </button>
          {subscriptionStatus && (subscriptionStatus.isPremium || subscriptionStatus.isTrialActive) && (
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
            onChange={(e) => setSearchTicker(e.target.value)}
            className="w-full pl-9 pr-4 py-2.5 bg-bg-input border border-border rounded-lg text-text-primary text-sm placeholder-text-muted focus:outline-none focus:border-accent transition-colors"
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
        <select
          value={sideFilter}
          onChange={(e) => setSideFilter(e.target.value)}
          className="px-3 py-2.5 bg-bg-input border border-border rounded-lg text-text-primary text-sm focus:outline-none focus:border-accent transition-colors"
        >
          <option value="all">All Results</option>
          <option value="wins">Wins Only</option>
          <option value="losses">Losses Only</option>
        </select>
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
        <span className="text-text-tertiary text-sm">{filtered.length} trade{filtered.length !== 1 ? 's' : ''}</span>
      </div>

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
                  <th className="text-left px-4 py-3 text-xs font-medium text-text-tertiary uppercase tracking-wider cursor-pointer hover:text-text-primary" onClick={() => toggleSort('exitTime')}>
                    Date <SortIcon field="exitTime" />
                  </th>
                  <th className="text-left px-4 py-3 text-xs font-medium text-text-tertiary uppercase tracking-wider cursor-pointer hover:text-text-primary" onClick={() => toggleSort('ticker')}>
                    Ticker <SortIcon field="ticker" />
                  </th>
                  <th className="text-left px-4 py-3 text-xs font-medium text-text-tertiary uppercase tracking-wider">Tags</th>
                  <th className="text-left px-4 py-3 text-xs font-medium text-text-tertiary uppercase tracking-wider">Entry</th>
                  <th className="text-left px-4 py-3 text-xs font-medium text-text-tertiary uppercase tracking-wider">Exit</th>
                  <th className="text-left px-4 py-3 text-xs font-medium text-text-tertiary uppercase tracking-wider">Qty</th>
                  <th className="text-left px-4 py-3 text-xs font-medium text-text-tertiary uppercase tracking-wider cursor-pointer hover:text-text-primary" onClick={() => toggleSort('pl')}>
                    P/L <SortIcon field="pl" />
                  </th>
                  <th className="text-left px-4 py-3 text-xs font-medium text-text-tertiary uppercase tracking-wider">Duration</th>
                  <th className="text-right px-4 py-3 text-xs font-medium text-text-tertiary uppercase tracking-wider">Actions</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map(trade => {
                  const pl = getTradePL(trade);
                  const duration = new Date(trade.exitTime) - new Date(trade.enterTime);
                  return (
                    <tr key={trade._id} className="border-b border-border/50 hover:bg-bg-input/50 transition-colors">
                      <td className="px-4 py-3">
                        <div className="text-text-primary text-sm">{formatDateTime(trade.exitTime)}</div>
                        <div className="text-text-muted text-xs">{formatTime(trade.enterTime)} - {formatTime(trade.exitTime)}</div>
                      </td>
                      <td className="px-4 py-3">
                        <span className="font-mono text-sm font-semibold text-text-primary">{trade.ticker}</span>
                      </td>
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
                      <td className="px-4 py-3 font-mono text-sm text-text-secondary">${trade.enterPrice.toFixed(2)}</td>
                      <td className="px-4 py-3 font-mono text-sm text-text-secondary">${trade.exitPrice.toFixed(2)}</td>
                      <td className="px-4 py-3 font-mono text-sm text-text-secondary">{trade.quantity}</td>
                      <td className="px-4 py-3">
                        <span className={`font-mono text-sm font-semibold ${pl >= 0 ? 'text-positive' : 'text-negative'}`}>
                          {pl >= 0 ? '+' : ''}${pl.toFixed(2)}
                        </span>
                        {trade.manualPL !== null && trade.manualPL !== undefined && (
                          <span className="text-text-muted text-xs ml-1">(M)</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-sm text-text-secondary">{formatDuration(duration)}</td>
                      <td className="px-4 py-3">
                        <div className="flex items-center justify-end gap-2">
                          <button
                            className="p-1.5 rounded-lg text-text-tertiary hover:text-text-primary hover:bg-bg-input transition-colors"
                            onClick={() => onEdit(trade)}
                            title="Edit"
                          >
                            <Icons.Edit />
                          </button>
                          <button
                            className="p-1.5 rounded-lg text-text-tertiary hover:text-negative hover:bg-negative/10 transition-colors"
                            onClick={() => handleRemoveTrade(trade._id, triggerReload)}
                            title="Delete"
                          >
                            <Icons.Trash />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <CSVImportModal isOpen={csvImportOpen} onClose={() => setCsvImportOpen(false)} triggerReload={triggerReload} />
    </div>
  );
};

// =====================================================
// ANALYTICS PAGE
// =====================================================
const AnalyticsPage = ({ trades }) => {
  const canvasRef = useRef(null);
  const barCanvasRef = useRef(null);
  const timeCanvasRef = useRef(null);
  const dayBarRects = useRef([]);
  const timeBarRects = useRef([]);
  const [hoveredDayIndex, setHoveredDayIndex] = useState(null);
  const [hoveredTimeIndex, setHoveredTimeIndex] = useState(null);
  const stats = calculateAnalytics(trades);

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

      const lineColor = cumPL[cumPL.length - 1] >= 0 ? '#10B981' : '#EF4444';
      ctx.strokeStyle = lineColor;
      ctx.lineWidth = 2;
      ctx.stroke();

      // Fill gradient
      const lastX = padding.left + chartW;
      const zeroY = padding.top + ((maxPL - 0) / range) * chartH;
      ctx.lineTo(lastX, zeroY);
      ctx.lineTo(padding.left, zeroY);
      ctx.closePath();

      const gradient = ctx.createLinearGradient(0, padding.top, 0, h - padding.bottom);
      if (cumPL[cumPL.length - 1] >= 0) {
        gradient.addColorStop(0, 'rgba(16, 185, 129, 0.15)');
        gradient.addColorStop(1, 'rgba(16, 185, 129, 0)');
      } else {
        gradient.addColorStop(0, 'rgba(239, 68, 68, 0)');
        gradient.addColorStop(1, 'rgba(239, 68, 68, 0.15)');
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
      const day = new Date(t.exitTime).getDay();
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

    dayPL.forEach((val, i) => {
      const x = padding.left + barGap * i + (barGap - barWidth) / 2;
      const barH = (Math.abs(val) / maxVal) * (chartH / 2);
      const y = val >= 0 ? zeroY - barH : zeroY;

      const isHovered = hoveredDayIndex === i;
      ctx.fillStyle = val >= 0
        ? (isHovered ? '#34D399' : '#10B981')
        : (isHovered ? '#F87171' : '#EF4444');
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
        { label: 'Avg Win', value: `$${avgW}`, color: '#10B981' },
        { label: 'Avg Loss', value: `-$${avgL}`, color: '#EF4444' },
        { label: 'Total P/L', value: `$${dayPL[i].toFixed(2)}`, color: dayPL[i] >= 0 ? '#10B981' : '#EF4444' },
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
      const d = new Date(t.enterTime);
      const h = d.getHours();
      const m = d.getMinutes() < 30 ? 0 : 30;
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
    canvas.height = 280 * dpr;
    canvas.style.width = rect.width + 'px';
    canvas.style.height = '280px';
    ctx.scale(dpr, dpr);

    const w = rect.width;
    const h = 280;
    const padding = { top: 20, right: 20, bottom: 50, left: 60 };

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

    timeOfDayStats.forEach((stat, i) => {
      const x = padding.left + barGap * i + (barGap - barWidth) / 2;
      const barH = (Math.abs(stat.totalPL) / maxVal) * (chartH / 2);
      const y = stat.totalPL >= 0 ? zeroY - barH : zeroY;

      const isHovered = hoveredTimeIndex === i;
      ctx.fillStyle = stat.totalPL >= 0
        ? (isHovered ? '#34D399' : '#10B981')
        : (isHovered ? '#F87171' : '#EF4444');
      ctx.beginPath();
      ctx.roundRect(x, y, barWidth, barH, 3);
      ctx.fill();

      rects.push({ x, y, w: barWidth, h: barH, index: i });

      // Time label
      ctx.fillStyle = textTertiary;
      ctx.font = '10px JetBrains Mono, monospace';
      ctx.textAlign = 'center';
      ctx.save();
      ctx.translate(x + barWidth / 2, h - 5);
      ctx.rotate(-Math.PI / 4);
      ctx.fillText(stat.time, 0, 0);
      ctx.restore();
    });

    timeBarRects.current = rects;

    // Draw tooltip for hovered time bucket
    if (hoveredTimeIndex !== null && hoveredTimeIndex < timeOfDayStats.length) {
      const stat = timeOfDayStats[hoveredTimeIndex];
      const pf = (() => {
        const gw = stat.wins > 0 ? stat.totalPL > 0 ? stat.totalPL : 0 : 0;
        let grossW = 0, grossL = 0;
        trades.forEach(t => {
          const d = new Date(t.enterTime);
          const hh = d.getHours();
          const mm = d.getMinutes() < 30 ? 0 : 30;
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
        { label: 'Avg P/L', value: `$${stat.avgPL.toFixed(2)}`, color: stat.avgPL >= 0 ? '#10B981' : '#EF4444' },
        { label: 'Total P/L', value: `$${stat.totalPL.toFixed(2)}`, color: stat.totalPL >= 0 ? '#10B981' : '#EF4444' },
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

  if (trades.length === 0) {
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

      {/* Stat cards */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
        <StatCard label="Total P/L" value={`$${stats.totalPL.toFixed(2)}`} color={stats.totalPL >= 0 ? 'text-positive' : 'text-negative'} />
        <StatCard label="Win Rate" value={`${stats.winRate.toFixed(1)}%`} color="text-text-primary" />
        <StatCard label="Profit Factor" value={profitFactor.toFixed(2)} color="text-text-primary" />
        <StatCard label="Expectancy" value={`$${expectancy.toFixed(2)}`} color={expectancy >= 0 ? 'text-positive' : 'text-negative'} />
        <StatCard label="Max Drawdown" value={`$${maxDrawdown.toFixed(2)}`} color="text-negative" />
      </div>

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

const SettingsPage = ({ onSyncComplete, onNavigate, theme, onThemeChange, tags, triggerReload }) => {
  const [activeTab, setActiveTab] = useState('brokers');
  const [tvUsername, setTvUsername] = useState('');
  const [tvPassword, setTvPassword] = useState('');
  const [tvCid, setTvCid] = useState('');
  const [tvSecret, setTvSecret] = useState('');
  const [tvEnvironment, setTvEnvironment] = useState('demo');
  const [tvStatus, setTvStatus] = useState(null);
  const [saving, setSaving] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [message, setMessage] = useState(null);
  const [newTagName, setNewTagName] = useState('');
  const [newTagColor, setNewTagColor] = useState(TAG_COLOR_PRESETS[0]);
  const [editingTagId, setEditingTagId] = useState(null);
  const [editTagName, setEditTagName] = useState('');
  const [editTagColor, setEditTagColor] = useState('');

  useEffect(() => { fetchStatus(); }, []);

  const fetchStatus = async () => {
    try {
      const response = await fetch('/api/tradovate/status');
      const data = await response.json();
      setTvStatus(data);
      if (data.environment) setTvEnvironment(data.environment);
    } catch (err) {
      console.error('Failed to fetch Tradovate status:', err);
    }
  };

  const handleSaveCredentials = async (e) => {
    e.preventDefault();
    setSaving(true);
    setMessage(null);
    try {
      const response = await fetch('/api/tradovate/credentials', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          username: tvUsername, password: tvPassword,
          cid: tvCid, secret: tvSecret, environment: tvEnvironment,
        }),
      });
      const data = await response.json();
      if (data.error) {
        setMessage({ type: 'error', text: data.error });
      } else {
        setMessage({ type: 'success', text: data.message });
        setTvUsername(''); setTvPassword(''); setTvCid(''); setTvSecret('');
        fetchStatus();
      }
    } catch (err) {
      setMessage({ type: 'error', text: 'Failed to save credentials' });
    }
    setSaving(false);
  };

  const handleSync = async () => {
    setSyncing(true);
    setMessage(null);
    try {
      const response = await fetch('/api/tradovate/sync', {
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
      const response = await fetch('/api/tradovate/credentials', { method: 'DELETE' });
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

  const handleCreateTag = async () => {
    if (!newTagName.trim()) return;
    try {
      const response = await fetch('/makeTag', {
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
      const response = await fetch('/updateTag', {
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
      const response = await fetch('/removeTag', {
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

  const placeholderBrokers = [
    { name: 'Interactive Brokers', status: 'Coming Soon' },
    { name: 'TD Ameritrade', status: 'Coming Soon' },
    { name: 'Webull', status: 'Coming Soon' },
    { name: 'NinjaTrader', status: 'Coming Soon' },
  ];

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

          {/* Tradovate card */}
          <div className="bg-bg-surface border border-border rounded-xl p-6">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-info/20 rounded-lg flex items-center justify-center">
                  <Icons.TrendingUp className="w-5 h-5 text-info" />
                </div>
                <div>
                  <h3 className="text-text-primary font-semibold">Tradovate</h3>
                  <p className="text-text-tertiary text-xs">Futures trading platform</p>
                </div>
              </div>
              {tvStatus && (
                <div className={`flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-medium ${
                  tvStatus.configured
                    ? 'bg-positive/10 text-positive'
                    : 'bg-text-muted/10 text-text-secondary'
                }`}>
                  <div className={`w-2 h-2 rounded-full ${tvStatus.configured ? 'bg-positive' : 'bg-text-muted'}`}></div>
                  {tvStatus.configured ? 'Connected' : 'Not Connected'}
                </div>
              )}
            </div>

            {tvStatus && tvStatus.configured ? (
              <div className="space-y-4">
                <div className="flex items-center gap-4 text-sm">
                  {tvStatus.environment && (
                    <span className="px-2 py-1 bg-bg-input rounded text-text-secondary text-xs font-mono">{tvStatus.environment.toUpperCase()}</span>
                  )}
                  {tvStatus.lastSyncTime && (
                    <span className="text-text-tertiary text-xs">Last sync: {new Date(tvStatus.lastSyncTime).toLocaleString()}</span>
                  )}
                </div>
                <div className="flex gap-3">
                  <button
                    className="px-4 py-2 bg-accent text-accent-text text-sm font-semibold rounded-lg hover:brightness-110 transition-all disabled:opacity-50"
                    onClick={handleSync}
                    disabled={syncing}
                  >
                    {syncing ? 'Syncing...' : 'Sync Trades'}
                  </button>
                  <button
                    className="px-4 py-2 bg-bg-input border border-border text-text-secondary text-sm rounded-lg hover:text-negative hover:border-negative/50 transition-colors"
                    onClick={handleDeleteCredentials}
                  >
                    Disconnect
                  </button>
                </div>
              </div>
            ) : (
              <form onSubmit={handleSaveCredentials} className="space-y-4">
                <div className="flex gap-2">
                  <button
                    type="button"
                    className={`flex-1 py-2 text-sm font-medium rounded-lg border transition-colors ${
                      tvEnvironment === 'demo'
                        ? 'bg-accent/10 border-accent text-accent'
                        : 'bg-bg-input border-border text-text-secondary hover:text-text-primary'
                    }`}
                    onClick={() => setTvEnvironment('demo')}
                  >
                    Demo
                  </button>
                  <button
                    type="button"
                    className={`flex-1 py-2 text-sm font-medium rounded-lg border transition-colors ${
                      tvEnvironment === 'live'
                        ? 'bg-accent/10 border-accent text-accent'
                        : 'bg-bg-input border-border text-text-secondary hover:text-text-primary'
                    }`}
                    onClick={() => setTvEnvironment('live')}
                  >
                    Live
                  </button>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs text-text-secondary mb-1.5">Username</label>
                    <input type="text" value={tvUsername} onChange={(e) => setTvUsername(e.target.value)}
                      placeholder="Tradovate username" required
                      className="w-full px-3 py-2.5 bg-bg-input border border-border rounded-lg text-text-primary text-sm placeholder-text-muted focus:outline-none focus:border-accent transition-colors" />
                  </div>
                  <div>
                    <label className="block text-xs text-text-secondary mb-1.5">Password</label>
                    <input type="password" value={tvPassword} onChange={(e) => setTvPassword(e.target.value)}
                      placeholder="Tradovate password" required
                      className="w-full px-3 py-2.5 bg-bg-input border border-border rounded-lg text-text-primary text-sm placeholder-text-muted focus:outline-none focus:border-accent transition-colors" />
                  </div>
                  <div>
                    <label className="block text-xs text-text-secondary mb-1.5">Client ID (CID)</label>
                    <input type="text" value={tvCid} onChange={(e) => setTvCid(e.target.value)}
                      placeholder="API Client ID" required
                      className="w-full px-3 py-2.5 bg-bg-input border border-border rounded-lg text-text-primary text-sm placeholder-text-muted focus:outline-none focus:border-accent transition-colors" />
                  </div>
                  <div>
                    <label className="block text-xs text-text-secondary mb-1.5">API Secret</label>
                    <input type="password" value={tvSecret} onChange={(e) => setTvSecret(e.target.value)}
                      placeholder="API Secret" required
                      className="w-full px-3 py-2.5 bg-bg-input border border-border rounded-lg text-text-primary text-sm placeholder-text-muted focus:outline-none focus:border-accent transition-colors" />
                  </div>
                </div>
                <button
                  type="submit"
                  className="px-6 py-2.5 bg-accent text-accent-text text-sm font-semibold rounded-lg hover:brightness-110 transition-all disabled:opacity-50"
                  disabled={saving}
                >
                  {saving ? 'Validating & Saving...' : 'Connect Tradovate'}
                </button>
              </form>
            )}
          </div>

          {/* Placeholder broker cards */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {placeholderBrokers.map(broker => (
              <div key={broker.name} className="bg-bg-surface border border-border rounded-xl p-5 opacity-60">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 bg-bg-input rounded-lg flex items-center justify-center">
                      <Icons.Briefcase className="w-5 h-5 text-text-tertiary" />
                    </div>
                    <div>
                      <h3 className="text-text-primary font-semibold text-sm">{broker.name}</h3>
                      <p className="text-text-muted text-xs">{broker.status}</p>
                    </div>
                  </div>
                </div>
              </div>
            ))}
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
        <div className="bg-bg-surface border border-border rounded-xl p-6 space-y-4">
          <h3 className="text-text-primary font-semibold">Account Settings</h3>
          <div className="space-y-3">
            <a href="/changePass" className="flex items-center gap-3 px-4 py-3 bg-bg-input border border-border rounded-lg text-text-secondary hover:text-text-primary transition-colors no-underline">
              <Icons.Lock className="w-5 h-5" />
              <span className="text-sm">Change Password</span>
            </a>
            <a href="/logout" className="flex items-center gap-3 px-4 py-3 bg-bg-input border border-border rounded-lg text-text-secondary hover:text-negative transition-colors no-underline">
              <Icons.LogOut className="w-5 h-5" />
              <span className="text-sm">Log Out</span>
            </a>
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
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

// =====================================================
// UPGRADE PAGE
// =====================================================
const UpgradePage = () => {
  const plans = [
    {
      name: 'Trial',
      price: '$0',
      period: '14 days',
      features: ['Up to 50 trades', 'Basic analytics', 'Single broker connection', 'Email support'],
      accent: false,
      popular: false,
    },
    {
      name: 'Pro',
      price: '$19',
      period: '/month',
      features: ['Unlimited trades', 'Advanced analytics', 'All broker connections', 'Priority support', 'Export to CSV', 'Custom tags'],
      accent: true,
      popular: true,
    },
    {
      name: 'Elite',
      price: '$24',
      period: '/month',
      features: ['Everything in Pro', 'AI trade insights', 'Team collaboration', 'API access', 'Custom dashboards', 'Dedicated account manager'],
      accent: false,
      popular: false,
    },
  ];

  return (
    <div className="space-y-8">
      <div className="text-center">
        <h1 className="text-3xl font-bold text-text-primary">Upgrade Your Plan</h1>
        <p className="text-text-secondary mt-2 max-w-lg mx-auto">Choose the plan that fits your trading style. All plans include a 14-day money-back guarantee.</p>
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

      <p className="text-center text-text-muted text-xs">14-day money-back guarantee on all paid plans. Cancel anytime.</p>
    </div>
  );
};

// =====================================================
// SCREENSHOT MARKUP MODAL
// =====================================================
const ScreenshotMarkupModal = ({ isOpen, onClose, onSave, initialImage }) => {
  const canvasRef = useRef(null);
  const [currentTool, setCurrentTool] = useState('pen');
  const [currentColor, setCurrentColor] = useState('#ef4444');
  const [isDrawing, setIsDrawing] = useState(false);
  const [history, setHistory] = useState([]);
  const [historyStep, setHistoryStep] = useState(-1);

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

  const startDrawing = (e) => {
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
      const text = prompt('Enter text:');
      if (text) { ctx.font = '16px Inter, sans-serif'; ctx.fillStyle = currentColor; ctx.fillText(text, x, y); saveState(); }
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
          <canvas
            ref={canvasRef}
            className="cursor-crosshair rounded-lg"
            onMouseDown={startDrawing}
            onMouseMove={draw}
            onMouseUp={stopDrawing}
            onMouseLeave={stopDrawing}
          />
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
// TRADE FORM POPUP
// =====================================================
const TradeFormPopup = ({ isOpen, onClose, triggerReload, editingTrade, tags }) => {
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

  const handleQuickCreateTag = async () => {
    if (!quickTagName.trim() || creatingTag) return;
    setCreatingTag(true);
    try {
      const response = await fetch('/makeTag', {
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
      document.body.style.overflow = 'hidden';
    }
    return () => {
      document.removeEventListener('keydown', handleEscape);
      document.body.style.overflow = 'unset';
    };
  }, [isOpen, onClose]);

  useEffect(() => {
    if (!isOpen) { setScreenshot(null); setPastedImage(null); setSelectedTags([]); return; }
    if (editingTrade && editingTrade.screenshot) setScreenshot(editingTrade.screenshot);
    if (editingTrade && editingTrade.tags) setSelectedTags(editingTrade.tags);
    else setSelectedTags([]);

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

  const handleSubmit = (e) => {
    if (isEditing) {
      handleUpdateTrade(e, editingTrade._id, () => { triggerReload(); onClose(); }, screenshot, selectedTags);
    } else {
      handleTrade(e, () => { triggerReload(); onClose(); }, screenshot, selectedTags);
    }
  };

  const formatDateTimeForInput = (dateString) => {
    if (!dateString) return '';
    const d = new Date(dateString);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}T${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}:${String(d.getSeconds()).padStart(2, '0')}`;
  };

  const inputClass = "w-full px-3 py-2.5 bg-bg-input border border-border rounded-lg text-text-primary text-sm placeholder-text-muted focus:outline-none focus:border-accent transition-colors";
  const labelClass = "block text-xs font-medium text-text-secondary mb-1.5";

  return (
    <>
      <div className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4" onClick={onClose}>
        <div className="bg-bg-surface border border-border rounded-xl w-full max-w-lg max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
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
            action={isEditing ? "/updateTrade" : "/trades"}
            method="POST"
            className="p-6 space-y-4"
          >
            <div>
              <label htmlFor="ticker" className={labelClass}>Ticker</label>
              <input id="ticker" type="text" name="ticker" placeholder="AAPL" defaultValue={isEditing ? editingTrade.ticker : ''} className={inputClass} />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label htmlFor="enterTime" className={labelClass}>Enter Time</label>
                <input id="enterTime" type="datetime-local" name="enterTime" step="1" defaultValue={isEditing ? formatDateTimeForInput(editingTrade.enterTime) : ''} className={inputClass} />
              </div>
              <div>
                <label htmlFor="exitTime" className={labelClass}>Exit Time</label>
                <input id="exitTime" type="datetime-local" name="exitTime" step="1" defaultValue={isEditing ? formatDateTimeForInput(editingTrade.exitTime) : ''} className={inputClass} />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label htmlFor="enterPrice" className={labelClass}>Enter Price</label>
                <input id="enterPrice" type="number" step="0.01" min="0" name="enterPrice" placeholder="0.00" defaultValue={isEditing ? editingTrade.enterPrice : ''} className={inputClass} />
              </div>
              <div>
                <label htmlFor="exitPrice" className={labelClass}>Exit Price</label>
                <input id="exitPrice" type="number" step="0.01" min="0" name="exitPrice" placeholder="0.00" defaultValue={isEditing ? editingTrade.exitPrice : ''} className={inputClass} />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label htmlFor="quantity" className={labelClass}>Quantity</label>
                <input id="quantity" type="number" step="0.01" name="quantity" placeholder="1" defaultValue={isEditing ? editingTrade.quantity : ''} className={inputClass} />
              </div>
              <div>
                <label htmlFor="manualPL" className={labelClass}>P/L (Optional)</label>
                <input id="manualPL" type="number" step="0.01" name="manualPL" placeholder="Auto-calc" defaultValue={isEditing && editingTrade.manualPL ? editingTrade.manualPL : ''} className={inputClass} />
              </div>
            </div>

            <div>
              <label htmlFor="comments" className={labelClass}>Comments</label>
              <textarea id="comments" name="comments" placeholder="Trade notes..." rows="3" defaultValue={isEditing ? editingTrade.comments : ''} className={`${inputClass} resize-none`}></textarea>
            </div>

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

            {/* Screenshot section */}
            <div>
              <label className={labelClass}>Screenshot</label>
              {!screenshot && !pastedImage && (
                <div className="border-2 border-dashed border-border rounded-lg p-8 text-center">
                  <Icons.Download className="w-8 h-8 text-text-muted mx-auto mb-2" />
                  <p className="text-text-tertiary text-sm">Paste screenshot (Ctrl+V)</p>
                </div>
              )}

              {pastedImage && !screenshot && (
                <div className="space-y-3">
                  <img src={pastedImage} alt="Pasted screenshot" className="rounded-lg max-h-48 w-full object-contain bg-bg-input cursor-pointer hover:opacity-80 transition-opacity" onClick={() => setLightboxOpen(true)} />
                  <div className="flex gap-2">
                    <button type="button" className="flex-1 py-2 text-xs bg-accent text-accent-text font-semibold rounded-lg hover:brightness-110" onClick={() => { setMarkupSource(pastedImage); setIsMarkupOpen(true); }}>
                      Annotate
                    </button>
                    <button type="button" className="flex-1 py-2 text-xs bg-bg-input border border-border text-text-primary rounded-lg hover:border-accent" onClick={async () => {
                      const resized = await resizeImage(pastedImage);
                      setScreenshot(resized);
                      setPastedImage(null);
                    }}>
                      Use As-Is
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
        onSave={(annotatedImage) => { setScreenshot(annotatedImage); setPastedImage(null); setMarkupSource(null); }}
        initialImage={markupSource}
      />
    </>
  );
};

// =====================================================
// TRIAL BANNER
// =====================================================
const TrialBanner = ({ subscriptionStatus }) => {
  if (!subscriptionStatus) return null;
  if (subscriptionStatus.isPremium) return null;

  const { isTrialActive, trialDaysRemaining } = subscriptionStatus;

  if (isTrialActive) {
    return (
      <div className="bg-accent/10 border border-accent/30 rounded-lg px-4 py-3 mb-6">
        <p className="text-sm text-accent">
          <span className="font-semibold">Free Trial Active!</span> You have <span className="font-semibold">{trialDaysRemaining} day{trialDaysRemaining !== 1 ? 's' : ''}</span> remaining.
          <span className="text-text-secondary ml-1">Upgrade now for just $19/month to keep full access!</span>
        </p>
      </div>
    );
  }

  return (
    <div className="bg-negative/10 border border-negative/30 rounded-lg px-4 py-3 mb-6">
      <p className="text-sm text-negative">
        <span className="font-semibold">Trial Expired!</span>
        <span className="text-text-secondary ml-1">Upgrade now for just $19/month to continue adding trades and unlock all features!</span>
      </p>
    </div>
  );
};

// =====================================================
// MAIN APP
// =====================================================
const App = () => {
  const [currentPage, setCurrentPage] = useState('dashboard');
  const [reloadTrades, setReloadTrades] = useState(false);
  const [trades, setTrades] = useState([]);
  const [tags, setTags] = useState([]);
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingTrade, setEditingTrade] = useState(null);
  const [subscriptionStatus, setSubscriptionStatus] = useState(null);
  const [syncNotification, setSyncNotification] = useState(null);
  const [theme, setTheme] = useState(() => localStorage.getItem('theme') || 'dark');

  const triggerReload = () => setReloadTrades(!reloadTrades);

  // Apply theme to DOM and persist
  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
    localStorage.setItem('theme', theme);
  }, [theme]);

  // Fetch theme from account on mount
  useEffect(() => {
    const fetchAccountTheme = async () => {
      try {
        const response = await fetch('/api/account');
        const data = await response.json();
        if (data.account && data.account.theme) {
          setTheme(data.account.theme);
        }
      } catch (err) {
        console.error('Failed to fetch account theme:', err);
      }
    };
    fetchAccountTheme();
  }, []);

  const handleThemeChange = (newTheme) => {
    setTheme(newTheme);
    fetch('/api/preferences/theme', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ theme: newTheme }),
    }).catch(err => console.error('Failed to save theme:', err));
  };

  useEffect(() => {
    const loadTradesFromServer = async () => {
      const response = await fetch('/getTrades');
      const data = await response.json();
      setTrades(data.trades);
    };
    loadTradesFromServer();
  }, [reloadTrades]);

  useEffect(() => {
    const loadTags = async () => {
      try {
        const response = await fetch('/getTags');
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
        const response = await fetch('/subscriptionStatus');
        const data = await response.json();
        setSubscriptionStatus(data);
      } catch (err) {
        console.error('Failed to fetch subscription status:', err);
      }
    };
    fetchSubscriptionStatus();
  }, []);

  // Auto-sync Tradovate on mount
  useEffect(() => {
    const autoSync = async () => {
      try {
        const statusRes = await fetch('/api/tradovate/status');
        const status = await statusRes.json();
        if (status.configured) {
          setSyncNotification('Syncing trades from Tradovate...');
          const syncRes = await fetch('/api/tradovate/sync', {
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
    };
    autoSync();
  }, []);

  const openForm = () => setIsFormOpen(true);

  const renderPage = () => {
    switch (currentPage) {
      case 'dashboard':
        return <DashboardPage trades={trades} subscriptionStatus={subscriptionStatus} onOpenForm={openForm} />;
      case 'trades':
        return (
          <TradeListPage
            trades={trades}
            triggerReload={triggerReload}
            onEdit={(trade) => { setEditingTrade(trade); setIsFormOpen(true); }}
            subscriptionStatus={subscriptionStatus}
            onOpenForm={openForm}
            tags={tags}
          />
        );
      case 'analytics':
        return <AnalyticsPage trades={trades} />;
      case 'settings':
        return <SettingsPage onSyncComplete={triggerReload} onNavigate={setCurrentPage} theme={theme} onThemeChange={handleThemeChange} tags={tags} triggerReload={triggerReload} />;
      case 'upgrade':
        return <UpgradePage />;
      default:
        return <DashboardPage trades={trades} subscriptionStatus={subscriptionStatus} onOpenForm={openForm} />;
    }
  };

  return (
    <div className="flex min-h-screen">
      <Sidebar currentPage={currentPage} onNavigate={setCurrentPage} />
      <main className="flex-1 lg:ml-60 min-h-screen">
        <div className="p-6 lg:p-8 max-w-7xl">
          <TrialBanner subscriptionStatus={subscriptionStatus} />
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
        onClose={() => { setIsFormOpen(false); setEditingTrade(null); }}
        triggerReload={triggerReload}
        editingTrade={editingTrade}
        tags={tags}
      />
    </div>
  );
};

const init = () => {
  const root = createRoot(document.getElementById('app'));
  root.render(<App />);
};

window.onload = init;
