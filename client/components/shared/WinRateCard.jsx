const React = require('react');
const ChangeIndicator = require('./ChangeIndicator');

const WinRateCard = ({ wins, losses, breakevens = 0, total, change }) => {
  const neutral = breakevens || Math.max(0, total - wins - losses);
  const decisive = wins + losses;
  const winRate = decisive > 0 ? (wins / decisive * 100) : 0;
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
    <div className="relative rounded-xl border border-border bg-gradient-to-t from-accent/[0.03] to-bg-surface p-5 shadow-sm">
      <div className="flex items-center justify-between mb-3">
        <div className="text-text-secondary text-xs font-medium tracking-wide">Win Rate</div>
        {change !== null && change !== undefined && <ChangeIndicator value={change} />}
      </div>
      <div className="font-mono text-2xl font-bold tracking-tight text-text-primary">{winRate.toFixed(1)}%</div>
      <div className="absolute right-4 top-14 flex flex-col items-center gap-1">
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
          <span className="inline-flex items-center justify-center w-5 h-5 rounded-full bg-positive/15 text-positive text-[9px] font-bold">{wins}</span>
          {neutral > 0 && <span className="inline-flex items-center justify-center w-5 h-5 rounded-full bg-accent/15 text-accent text-[9px] font-bold">{neutral}</span>}
          <span className="inline-flex items-center justify-center w-5 h-5 rounded-full bg-negative/15 text-negative text-[9px] font-bold">{losses}</span>
        </div>
      </div>
    </div>
  );
};

module.exports = WinRateCard;
