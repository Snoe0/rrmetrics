const getCSSVar = (name) => {
  const val = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  if (/^\d+ \d+ \d+$/.test(val)) return `rgb(${val})`;
  return val;
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

module.exports = { getCSSVar, colorToRgba, drawTooltip };
