const React = require('react');
const { useEffect, useRef } = React;

const DotGrid = () => {
  const canvasRef = useRef(null);
  const mouseRef = useRef({ x: -1000, y: -1000 });
  const rafRef = useRef(null);
  const sizeRef = useRef({ w: 0, h: 0 });

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');

    const GAP = 32;
    const BASE_RADIUS = 1;
    const GLOW_RADIUS = 120;
    const BASE_ALPHA = 0.08;
    const MAX_ALPHA = 0.35;

    const resize = () => {
      const dpr = window.devicePixelRatio || 1;
      const w = window.innerWidth;
      const h = window.innerHeight;
      canvas.width = w * dpr;
      canvas.height = h * dpr;
      canvas.style.width = w + 'px';
      canvas.style.height = h + 'px';
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      sizeRef.current = { w, h };
    };

    const getAccentColor = () => {
      const style = getComputedStyle(document.documentElement);
      const raw = style.getPropertyValue('--accent').trim();
      if (raw) {
        const parts = raw.split(/\s+/).map(Number);
        if (parts.length === 3) return parts;
      }
      return [191, 255, 0];
    };

    const draw = () => {
      rafRef.current = null;
      const { w, h } = sizeRef.current;
      ctx.clearRect(0, 0, w, h);

      const [ar, ag, ab] = getAccentColor();
      const mx = mouseRef.current.x;
      const my = mouseRef.current.y;

      const startX = GAP / 2;
      const startY = GAP / 2;
      const glowR2 = GLOW_RADIUS * GLOW_RADIUS;

      for (let x = startX; x < w; x += GAP) {
        for (let y = startY; y < h; y += GAP) {
          const dx = x - mx;
          const dy = y - my;
          const dist2 = dx * dx + dy * dy;

          let alpha = BASE_ALPHA;
          let radius = BASE_RADIUS;

          if (dist2 < glowR2) {
            const dist = Math.sqrt(dist2);
            const t = 1 - dist / GLOW_RADIUS;
            const ease = t * t;
            alpha = BASE_ALPHA + (MAX_ALPHA - BASE_ALPHA) * ease;
            radius = BASE_RADIUS + 0.5 * ease;
          }

          ctx.beginPath();
          ctx.arc(x, y, radius, 0, Math.PI * 2);
          ctx.fillStyle = `rgba(${ar}, ${ag}, ${ab}, ${alpha})`;
          ctx.fill();
        }
      }
    };

    const scheduleRedraw = () => {
      if (!rafRef.current) {
        rafRef.current = requestAnimationFrame(draw);
      }
    };

    const onMouseMove = (e) => {
      mouseRef.current = { x: e.clientX, y: e.clientY };
      scheduleRedraw();
    };

    const onMouseLeave = () => {
      mouseRef.current = { x: -1000, y: -1000 };
      scheduleRedraw();
    };

    const onResize = () => {
      resize();
      scheduleRedraw();
    };

    resize();
    draw();

    window.addEventListener('resize', onResize);
    document.addEventListener('mousemove', onMouseMove);
    document.addEventListener('mouseleave', onMouseLeave);

    return () => {
      window.removeEventListener('resize', onResize);
      document.removeEventListener('mousemove', onMouseMove);
      document.removeEventListener('mouseleave', onMouseLeave);
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      className="fixed top-0 left-0 pointer-events-none"
      style={{ zIndex: 0 }}
      aria-hidden="true"
    />
  );
};

module.exports = DotGrid;
