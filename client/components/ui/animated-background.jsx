const React = require('react');
const { useEffect, useRef } = React;

const AnimatedBackground = () => {
  const canvasRef = useRef(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');

    let animationId;
    let mouse = { x: -1000, y: -1000 };
    let time = 0;

    const DOT_SPACING = 40;
    const DOT_BASE_RADIUS = 1;
    const DOT_COLOR = [191, 255, 0]; // accent color
    const DOT_BASE_ALPHA = 0.12;
    const MOUSE_RADIUS = 180;
    const WAVE_SPEED = 0.008;
    const WAVE_AMPLITUDE = 0.15;

    const resize = () => {
      const dpr = window.devicePixelRatio || 1;
      const rect = canvas.parentElement.getBoundingClientRect();
      canvas.width = rect.width * dpr;
      canvas.height = rect.height * dpr;
      canvas.style.width = `${rect.width}px`;
      canvas.style.height = `${rect.height}px`;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };

    const handleMouseMove = (e) => {
      const rect = canvas.getBoundingClientRect();
      mouse.x = e.clientX - rect.left;
      mouse.y = e.clientY - rect.top;
    };

    const handleMouseLeave = () => {
      mouse.x = -1000;
      mouse.y = -1000;
    };

    const draw = () => {
      time += WAVE_SPEED;
      const { width, height } = canvas.parentElement.getBoundingClientRect();
      ctx.clearRect(0, 0, width, height);

      const cols = Math.ceil(width / DOT_SPACING) + 1;
      const rows = Math.ceil(height / DOT_SPACING) + 1;
      const offsetX = (width % DOT_SPACING) / 2;
      const offsetY = (height % DOT_SPACING) / 2;

      for (let row = 0; row < rows; row++) {
        for (let col = 0; col < cols; col++) {
          const x = offsetX + col * DOT_SPACING;
          const y = offsetY + row * DOT_SPACING;

          // Wave animation
          const wave = Math.sin(col * 0.3 + time) * Math.cos(row * 0.3 + time * 0.7);
          const waveAlpha = DOT_BASE_ALPHA + wave * WAVE_AMPLITUDE;

          // Mouse proximity glow
          const dx = mouse.x - x;
          const dy = mouse.y - y;
          const dist = Math.sqrt(dx * dx + dy * dy);
          const mouseFactor = Math.max(0, 1 - dist / MOUSE_RADIUS);
          const mouseGlow = mouseFactor * mouseFactor; // quadratic falloff

          const alpha = Math.min(1, waveAlpha + mouseGlow * 0.6);
          const radius = DOT_BASE_RADIUS + mouseGlow * 2;

          if (alpha <= 0.01) continue;

          ctx.beginPath();
          ctx.arc(x, y, radius, 0, Math.PI * 2);
          ctx.fillStyle = `rgba(${DOT_COLOR[0]}, ${DOT_COLOR[1]}, ${DOT_COLOR[2]}, ${alpha})`;
          ctx.fill();

          // Extra glow ring for close dots
          if (mouseGlow > 0.1) {
            ctx.beginPath();
            ctx.arc(x, y, radius + 3 * mouseGlow, 0, Math.PI * 2);
            ctx.fillStyle = `rgba(${DOT_COLOR[0]}, ${DOT_COLOR[1]}, ${DOT_COLOR[2]}, ${mouseGlow * 0.15})`;
            ctx.fill();
          }
        }
      }

      animationId = requestAnimationFrame(draw);
    };

    resize();
    draw();

    window.addEventListener('resize', resize);
    canvas.addEventListener('mousemove', handleMouseMove);
    canvas.addEventListener('mouseleave', handleMouseLeave);

    return () => {
      cancelAnimationFrame(animationId);
      window.removeEventListener('resize', resize);
      canvas.removeEventListener('mousemove', handleMouseMove);
      canvas.removeEventListener('mouseleave', handleMouseLeave);
    };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      className="absolute inset-0 w-full h-full pointer-events-auto"
      style={{ zIndex: 0 }}
      aria-hidden="true"
    />
  );
};

module.exports = { AnimatedBackground };
