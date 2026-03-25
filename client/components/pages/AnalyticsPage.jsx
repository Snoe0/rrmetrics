const React = require("react");
const { useState, useEffect, useRef, useMemo } = React;

const { getTradePL, calculateAnalytics, applyEvalFilter, calculateSharpeRatio, calculateSortinoRatio, runMonteCarloSimulation } = require("../../utils/analytics");
const { formatDuration, toEST } = require("../../utils/dateUtils");
const { getCSSVar, colorToRgba, drawTooltip } = require("../../utils/chartUtils");
const { getDateRange, getPreviousDateRange, filterTradesByDateRange, calcPercentChange } = require("../../utils/periodUtils");

const StatCard = require("../shared/StatCard");
const ChangeIndicator = require("../shared/ChangeIndicator");
const WinRateCard = require("../shared/WinRateCard");
const PeriodFilter = require("../shared/PeriodFilter");
const EvalFilterControl = require("../shared/EvalFilterControl");



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

    // Line — color green above zero, red below zero
    if (cumPL.length > 1) {
      const posColor = getCSSVar('--positive');
      const negColor = getCSSVar('--negative');
      const zeroY = padding.top + ((maxPL - 0) / range) * chartH;

      // Build point coordinates
      const points = cumPL.map((val, i) => ({
        x: padding.left + (chartW / (cumPL.length - 1)) * i,
        y: padding.top + ((maxPL - val) / range) * chartH,
      }));

      // Helper: trace the equity line path
      const traceLine = () => {
        ctx.beginPath();
        points.forEach((p, i) => {
          if (i === 0) ctx.moveTo(p.x, p.y);
          else ctx.lineTo(p.x, p.y);
        });
      };

      // Draw above-zero portion (green)
      ctx.save();
      ctx.beginPath();
      ctx.rect(padding.left, padding.top, chartW, zeroY - padding.top);
      ctx.clip();

      traceLine();
      ctx.strokeStyle = posColor;
      ctx.lineWidth = 2;
      ctx.stroke();

      // Fill above-zero
      traceLine();
      const lastX = points[points.length - 1].x;
      ctx.lineTo(lastX, zeroY);
      ctx.lineTo(points[0].x, zeroY);
      ctx.closePath();
      const posGrad = ctx.createLinearGradient(0, padding.top, 0, zeroY);
      posGrad.addColorStop(0, colorToRgba(posColor, 0.15));
      posGrad.addColorStop(1, colorToRgba(posColor, 0));
      ctx.fillStyle = posGrad;
      ctx.fill();
      ctx.restore();

      // Draw below-zero portion (red)
      ctx.save();
      ctx.beginPath();
      ctx.rect(padding.left, zeroY, chartW, h - padding.bottom - zeroY);
      ctx.clip();

      traceLine();
      ctx.strokeStyle = negColor;
      ctx.lineWidth = 2;
      ctx.stroke();

      // Fill below-zero
      traceLine();
      ctx.lineTo(lastX, zeroY);
      ctx.lineTo(points[0].x, zeroY);
      ctx.closePath();
      const negGrad = ctx.createLinearGradient(0, zeroY, 0, h - padding.bottom);
      negGrad.addColorStop(0, colorToRgba(negColor, 0));
      negGrad.addColorStop(1, colorToRgba(negColor, 0.15));
      ctx.fillStyle = negGrad;
      ctx.fill();
      ctx.restore();
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

  // Sharpe & Sortino ratios
  const sharpeRatio = calculateSharpeRatio(trades);
  const sortinoRatio = calculateSortinoRatio(trades);

  // Monte Carlo simulation (memoized to avoid re-running on every render)
  const monteCarloResults = useMemo(() => {
    if (trades.length < 5) return null;
    return runMonteCarloSimulation(trades);
  }, [trades]);

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
        <WinRateCard wins={stats.wins} losses={stats.losses} breakevens={stats.breakevens} total={stats.totalTrades}
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
              ['Breakeven Trades', `${stats.breakevens} (${stats.breakevenPct.toFixed(1)}%)`],
              ['Avg Win', `$${stats.avgWin.toFixed(2)}`],
              ['Avg Loss', `$${stats.avgLoss.toFixed(2)}`],
              ['Best Trade', `$${stats.bestTrade.toFixed(2)}`],
              ['Worst Trade', `$${stats.worstTrade.toFixed(2)}`],
              ['Best Win Streak', bestWinStreak],
              ['Worst Loss Streak', bestLossStreak],
              ['Avg Duration', formatDuration(stats.avgDuration)],
              ['Sharpe Ratio', sharpeRatio === Infinity ? '∞' : sharpeRatio.toFixed(2)],
              ['Sortino Ratio', sortinoRatio === Infinity ? '∞' : sortinoRatio.toFixed(2)],
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

      {/* Monte Carlo Simulation */}
      {monteCarloResults && (
        <div className="bg-bg-surface border border-border rounded-xl p-6">
          <h3 className="text-text-primary font-semibold mb-2">Monte Carlo Eval Simulation</h3>
          <p className="text-text-tertiary text-xs mb-4">
            {monteCarloResults.totalSimulations.toLocaleString()} simulations | $3,000 profit target | $2,000 EOD trailing drawdown
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="bg-bg-page rounded-lg p-4 text-center">
              <div className="text-text-secondary text-xs font-medium uppercase tracking-wider mb-1">Pass Rate</div>
              <div className={`font-mono text-2xl font-bold ${monteCarloResults.passRate >= 50 ? 'text-positive' : 'text-negative'}`}>
                {monteCarloResults.passRate.toFixed(1)}%
              </div>
            </div>
            <div className="bg-bg-page rounded-lg p-4 text-center">
              <div className="text-text-secondary text-xs font-medium uppercase tracking-wider mb-1">Avg Days to Pass</div>
              <div className="font-mono text-2xl font-bold text-text-primary">
                {monteCarloResults.avgDaysToPass > 0 ? monteCarloResults.avgDaysToPass.toFixed(1) : '—'}
              </div>
            </div>
            <div className="bg-bg-page rounded-lg p-4 text-center">
              <div className="text-text-secondary text-xs font-medium uppercase tracking-wider mb-1">Median Days to Pass</div>
              <div className="font-mono text-2xl font-bold text-text-primary">
                {monteCarloResults.medianDaysToPass > 0 ? monteCarloResults.medianDaysToPass : '—'}
              </div>
            </div>
          </div>
        </div>
      )}

      </>)}
    </div>
  );
};


module.exports = AnalyticsPage;
