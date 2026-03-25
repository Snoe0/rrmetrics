const React = require('react');
const { useState, useEffect, useRef } = React;

const useWindowWidth = () => {
  const [width, setWidth] = useState(() => window.innerWidth);
  useEffect(() => {
    const handler = () => setWidth(window.innerWidth);
    window.addEventListener('resize', handler);
    return () => window.removeEventListener('resize', handler);
  }, []);
  return width;
};

const useResizeObserver = (ref) => {
  const [size, setSize] = useState({ width: 0, height: 0 });
  useEffect(() => {
    const el = ref && ref.current;
    if (!el) return;
    const observer = new ResizeObserver(entries => {
      const entry = entries[0];
      if (entry) {
        setSize({ width: entry.contentRect.width, height: entry.contentRect.height });
      }
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, [ref]);
  return size;
};

module.exports = { useWindowWidth, useResizeObserver };
