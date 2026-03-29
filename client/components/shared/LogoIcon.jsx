const React = require('react');
const { useEffect } = React;

/**
 * Inline SVG logo that uses the current accent color.
 * Replaces <img src="logo.svg"> so the logo adapts to theme changes.
 */
const LogoIcon = ({ className = 'w-8 h-8' }) => (
  <svg viewBox="0 0 400 400" className={`${className} rounded-md`} xmlns="http://www.w3.org/2000/svg">
    <rect width="400" height="400" rx="64" className="fill-accent" />
    <g className="fill-accent-text">
      <path d="M62 310V90h76c42 0 68 24 68 60 0 28-16 48-42 56l50 104h-44l-46-98h-22v98H62zm40-134h32c20 0 32-12 32-30s-12-30-32-30h-32v60z" transform="translate(200,200) scale(-1,1) translate(-130,-200)" />
      <path d="M202 310V90h76c42 0 68 24 68 60 0 28-16 48-42 56l50 104h-44l-46-98h-22v98H202zm40-134h32c20 0 32-12 32-30s-12-30-32-30h-32v60z" />
    </g>
  </svg>
);

/**
 * Fetches /assets/img/logo.svg, replaces its fill colors with the current
 * accent color, and sets the result as the page favicon.
 */
const useThemeFavicon = (theme, customColors) => {
  useEffect(() => {
    const accent = customColors?.accent
      || (theme === 'light' ? '#10B981' : '#BFFF00');

    fetch('/assets/img/logo.svg')
      .then(r => r.text())
      .then(svgText => {
        // Replace all hex fill colors with the accent color
        const recolored = svgText.replace(/#[0-9a-fA-F]{6}/g, accent);
        const blob = new Blob([recolored], { type: 'image/svg+xml' });
        const url = URL.createObjectURL(blob);

        let link = document.querySelector("link[rel='icon']");
        if (!link) {
          link = document.createElement('link');
          link.rel = 'icon';
          document.head.appendChild(link);
        }
        link.type = 'image/svg+xml';
        link.href = url;

        const shortcut = document.querySelector("link[rel='shortcut icon']");
        if (shortcut) shortcut.href = url;

        return () => URL.revokeObjectURL(url);
      });
  }, [theme, customColors?.accent]);
};

module.exports = { LogoIcon, useThemeFavicon };
