const React = require('react');
const { useState, useEffect, useRef } = React;
const { createRoot } = require('react-dom/client');
const { supabase } = require('./supabase.js');
require('./styles/globals.css');
const { ContainerScroll } = require('./components/ui/container-scroll-animation');
const { HeroSection } = require('./components/ui/hero-section');

const APP_URL = '';

// =====================================================
// SCROLL REVEAL HOOK + COMPONENT
// =====================================================
const useScrollReveal = (options = {}) => {
  const ref = useRef(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.classList.add('scroll-reveal');

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          el.classList.add('revealed');
          observer.unobserve(el);
        }
      },
      { threshold: options.threshold || 0.15 }
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  return ref;
};

const ScrollReveal = ({ children, className = '', delay = '' }) => {
  const ref = useScrollReveal();
  return (
    <div ref={ref} className={`${className} ${delay}`}>
      {children}
    </div>
  );
};

// =====================================================
// COUNT-UP HOOK
// =====================================================
const useCountUp = (target, suffix = '') => {
  const [display, setDisplay] = useState(`0${suffix}`);
  const ref = useRef(null);
  const hasRun = useRef(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting && !hasRun.current) {
          hasRun.current = true;
          observer.unobserve(el);
          const duration = 1200;
          const start = performance.now();
          const step = (now) => {
            const progress = Math.min((now - start) / duration, 1);
            const eased = 1 - Math.pow(1 - progress, 3);
            const value = Math.round(eased * target);
            setDisplay(`${value.toLocaleString()}${suffix}`);
            if (progress < 1) requestAnimationFrame(step);
          };
          requestAnimationFrame(step);
        }
      },
      { threshold: 0.3 }
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [target, suffix]);

  return { ref, display };
};

// =====================================================
// LOCAL ICONS
// =====================================================
const Icons = {
  Check: (props) => (
    <svg className={props.className || "w-4 h-4"} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="20 6 9 17 4 12"></polyline>
    </svg>
  ),
  ChevronRight: (props) => (
    <svg className={props.className || "w-5 h-5"} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="9 18 15 12 9 6"></polyline>
    </svg>
  ),
  ChevronDown: (props) => (
    <svg className={props.className || "w-5 h-5"} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="6 9 12 15 18 9"></polyline>
    </svg>
  ),
  BarChart: (props) => (
    <svg className={props.className || "w-6 h-6"} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <line x1="18" y1="20" x2="18" y2="10"></line>
      <line x1="12" y1="20" x2="12" y2="4"></line>
      <line x1="6" y1="20" x2="6" y2="14"></line>
    </svg>
  ),
  Sunrise: (props) => (
    <svg className={props.className || "w-6 h-6"} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
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
  CheckSquare: (props) => (
    <svg className={props.className || "w-6 h-6"} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="9 11 12 14 22 4"></polyline>
      <path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"></path>
    </svg>
  ),
  Zap: (props) => (
    <svg className={props.className || "w-6 h-6"} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"></polygon>
    </svg>
  ),
  Camera: (props) => (
    <svg className={props.className || "w-6 h-6"} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"></path>
      <circle cx="12" cy="13" r="4"></circle>
    </svg>
  ),
  Link: (props) => (
    <svg className={props.className || "w-6 h-6"} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"></path>
      <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"></path>
    </svg>
  ),
  Bell: (props) => (
    <svg className={props.className || "w-6 h-6"} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"></path>
      <path d="M13.73 21a2 2 0 0 1-3.46 0"></path>
    </svg>
  ),
  FlaskConical: (props) => (
    <svg className={props.className || "w-6 h-6"} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M10 2v7.527a2 2 0 0 1-.211.896L4.72 20.55a1 1 0 0 0 .9 1.45h12.76a1 1 0 0 0 .9-1.45l-5.069-10.127A2 2 0 0 1 14 9.527V2"></path>
      <path d="M8.5 2h7"></path>
      <path d="M7 16h10"></path>
    </svg>
  ),
  Calendar: (props) => (
    <svg className={props.className || "w-6 h-6"} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="4" width="18" height="18" rx="2" ry="2"></rect>
      <line x1="16" y1="2" x2="16" y2="6"></line>
      <line x1="8" y1="2" x2="8" y2="6"></line>
      <line x1="3" y1="10" x2="21" y2="10"></line>
    </svg>
  ),
  ArrowRight: (props) => (
    <svg className={props.className || "w-5 h-5"} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <line x1="5" y1="12" x2="19" y2="12"></line>
      <polyline points="12 5 19 12 12 19"></polyline>
    </svg>
  ),
  Target: (props) => (
    <svg className={props.className || "w-6 h-6"} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="10"></circle>
      <circle cx="12" cy="12" r="6"></circle>
      <circle cx="12" cy="12" r="2"></circle>
    </svg>
  ),
};

// =====================================================
// LOGO COMPONENT
// =====================================================
const Logo = ({ className }) => (
  <div className={`flex items-center gap-3 ${className || ''}`}>
    <img src="/assets/img/logo.svg" alt="RR Metrics" className="w-8 h-8 rounded-md" />
    <span className="text-text-primary font-semibold text-[15px] tracking-[3px] uppercase">RR Metrics</span>
  </div>
);

// =====================================================
// NAVBAR
// =====================================================
const Navbar = () => {
  const [scrolled, setScrolled] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 20);
    window.addEventListener('scroll', onScroll);
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  return (
    <nav className={`fixed top-0 left-0 right-0 z-50 transition-all duration-300 ${
      scrolled ? 'bg-bg-surface/95 backdrop-blur-md border-b border-border shadow-sm' : 'bg-transparent'
    }`}>
      <div className="max-w-6xl mx-auto px-6 h-16 flex items-center justify-between">
        <Logo />
        <div className="hidden md:flex items-center gap-8">
          <a href="#features" className="text-text-secondary hover:text-text-primary text-sm transition-colors">Features</a>
          <a href="#how-it-works" className="text-text-secondary hover:text-text-primary text-sm transition-colors">How It Works</a>
          <a href="#pricing" className="text-text-secondary hover:text-text-primary text-sm transition-colors">Pricing</a>
          <a href="#faq" className="text-text-secondary hover:text-text-primary text-sm transition-colors">FAQ</a>
        </div>
        <div className="flex items-center gap-3">
          <a href={`${APP_URL}/login`} className="text-text-secondary hover:text-text-primary text-sm font-medium transition-colors px-4 py-2">
            Sign In
          </a>
          <a href={`${APP_URL}/login?signup`} className="bg-accent text-accent-text text-sm font-semibold px-5 py-2 rounded-lg hover:brightness-110 transition-all hidden sm:inline-block">
            Start Free Trial
          </a>
        </div>
      </div>
    </nav>
  );
};

// HeroSection is now imported from ./components/ui/hero-section

// =====================================================
// SOCIAL PROOF BAR
// =====================================================
const CountUpStat = ({ value, suffix, label, className }) => {
  const { ref, display } = useCountUp(value, suffix);
  return (
    <div ref={ref} className={className}>
      <div className="text-accent font-mono text-3xl font-bold">{display}</div>
      <div className="text-text-muted text-sm mt-1">{label}</div>
    </div>
  );
};

const SocialProofBar = () => {
  const sectionRef = useScrollReveal();
  return (
    <section ref={sectionRef} className="py-16 px-6">
      <div className="max-w-4xl mx-auto">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-8 text-center">
          <CountUpStat value={12} suffix="K+" label="Trades Logged" />
          <CountUpStat value={500} suffix="+" label="Active Traders" />
          <CountUpStat value={99} suffix="%" label="Uptime" />
          <CountUpStat value={100} suffix="%" label="Secure" />
        </div>
      </div>
    </section>
  );
};

// =====================================================
// BENTO ITEM (mouse-tracking glow)
// =====================================================
const BentoItem = ({ className = '', children }) => {
  const itemRef = useRef(null);

  useEffect(() => {
    const item = itemRef.current;
    if (!item) return;

    const handleMouseMove = (e) => {
      const rect = item.getBoundingClientRect();
      item.style.setProperty('--mouse-x', `${e.clientX - rect.left}px`);
      item.style.setProperty('--mouse-y', `${e.clientY - rect.top}px`);
    };

    item.addEventListener('mousemove', handleMouseMove);
    return () => item.removeEventListener('mousemove', handleMouseMove);
  }, []);

  return (
    <div ref={itemRef} className={`bento-item ${className}`}>
      {children}
    </div>
  );
};

// =====================================================
// BENTO FEATURE VISUALS
// =====================================================
const ChecklistVisual = () => {
  const rules = [
    { label: 'Review pre-market levels', checked: true },
    { label: 'Check key support/resistance levels', checked: true },
    { label: 'Set stop-loss before entry', checked: true },
    { label: 'Max 3 trades per session', checked: false },
    { label: 'No revenge trading', checked: false },
  ];
  return (
    <div className="mt-4 space-y-2.5">
      {rules.map((rule) => (
        <div key={rule.label} className="flex items-center gap-3 px-3 py-2 rounded-lg bg-bg-input/50">
          <div className={`w-5 h-5 rounded flex items-center justify-center flex-shrink-0 ${
            rule.checked ? 'bg-accent' : 'border border-text-muted'
          }`}>
            {rule.checked && <Icons.Check className="w-3 h-3 text-accent-text" />}
          </div>
          <span className={`text-sm ${rule.checked ? 'text-text-primary' : 'text-text-secondary'}`}>{rule.label}</span>
        </div>
      ))}
    </div>
  );
};

const BrokerOrbitVisual = () => {
  const brokers = [
    { name: 'Tradovate', src: '/assets/img/tradovate.png', color: '#3b82f6' },
    { name: 'NinjaTrader', src: '/assets/img/ninjatrader.jpeg', color: '#f59e0b' },
    { name: 'TopstepX', src: '/assets/img/topstep.png', color: '#8b5cf6' },
    { name: 'Webull', src: '/assets/img/webull.png', color: '#10b981' },
  ];
  return (
    <div className="mt-6 flex items-center justify-center gap-5 flex-wrap">
      {brokers.map((broker) => (
        <div key={broker.name} className="flex flex-col items-center gap-2">
          <div
            className="w-16 h-16 rounded-full bg-bg-input border border-border flex items-center justify-center overflow-hidden shadow-lg"
            style={{ boxShadow: `0 0 20px ${broker.color}20` }}
          >
            <img src={broker.src} alt={broker.name} className="w-10 h-10 object-contain rounded" />
          </div>
          <span className="text-text-muted text-xs">{broker.name}</span>
        </div>
      ))}
    </div>
  );
};

const AnalyticsVisual = () => (
  <div className="mt-4 space-y-3">
    <div className="flex items-center justify-between">
      <span className="text-text-secondary text-xs">Win Rate</span>
      <span className="text-accent font-mono text-xs font-bold">68.4%</span>
    </div>
    <div className="w-full h-2 bg-bg-input rounded-full overflow-hidden">
      <div className="h-full bg-accent rounded-full" style={{ width: '68.4%' }}></div>
    </div>
    <div className="grid grid-cols-2 gap-3 mt-3">
      <div className="bg-bg-input/50 rounded-lg p-3">
        <p className="text-text-muted text-xs mb-1">Profit Factor</p>
        <p className="text-text-primary font-mono font-bold">2.41</p>
      </div>
      <div className="bg-bg-input/50 rounded-lg p-3">
        <p className="text-text-muted text-xs mb-1">Avg R:R</p>
        <p className="text-text-primary font-mono font-bold">1.87</p>
      </div>
      <div className="bg-bg-input/50 rounded-lg p-3">
        <p className="text-text-muted text-xs mb-1">Max DD</p>
        <p className="text-negative font-mono font-bold">-$1,240</p>
      </div>
      <div className="bg-bg-input/50 rounded-lg p-3">
        <p className="text-text-muted text-xs mb-1">Net P&L</p>
        <p className="text-positive font-mono font-bold">+$8,320</p>
      </div>
    </div>
  </div>
);

const PropFirmVisual = () => (
  <div className="mt-4">
    <div className="flex items-center justify-between mb-2">
      <span className="text-text-secondary text-xs">Pass Probability</span>
      <span className="text-accent font-mono text-sm font-bold">72.4%</span>
    </div>
    <div className="w-full h-3 bg-bg-input rounded-full overflow-hidden mb-4">
      <div className="h-full bg-gradient-to-r from-accent to-[#8b5cf6] rounded-full" style={{ width: '72.4%' }}></div>
    </div>
    <div className="flex items-center gap-2 mb-3">
      <span className="text-text-muted text-[10px] uppercase tracking-wider">10,000 simulations</span>
      <div className="flex-1 h-px bg-border"></div>
    </div>
    <div className="space-y-2">
      <div className="flex items-center justify-between px-3 py-2 rounded-lg bg-bg-input/50">
        <span className="text-text-secondary text-xs">Avg Days to Pass</span>
        <span className="text-text-primary text-xs font-mono">14.2</span>
      </div>
      <div className="flex items-center justify-between px-3 py-2 rounded-lg bg-bg-input/50">
        <span className="text-text-secondary text-xs">Bust Probability</span>
        <span className="text-negative text-xs font-mono">27.6%</span>
      </div>
    </div>
  </div>
);

const PremarketVisual = () => (
  <div className="mt-4 space-y-3">
    <div className="bg-bg-input/50 rounded-lg p-3 flex items-start gap-3">
      <div className="w-8 h-8 rounded-lg bg-accent/10 flex items-center justify-center flex-shrink-0 mt-0.5">
        <Icons.Check className="w-4 h-4 text-accent" />
      </div>
      <div>
        <p className="text-text-primary text-sm font-medium">Custom Checklist</p>
        <p className="text-text-muted text-xs mt-0.5">Build your own pre-session routine</p>
      </div>
    </div>
    <div className="bg-bg-input/50 rounded-lg p-3 flex items-start gap-3">
      <div className="w-8 h-8 rounded-lg bg-accent/10 flex items-center justify-center flex-shrink-0 mt-0.5">
        <Icons.BarChart2 className="w-4 h-4 text-accent" />
      </div>
      <div>
        <p className="text-text-primary text-sm font-medium">Prep Consistency Stats</p>
        <p className="text-text-muted text-xs mt-0.5">Track completion over time</p>
      </div>
    </div>
    <div className="bg-bg-input/50 rounded-lg p-3 flex items-start gap-3">
      <div className="w-8 h-8 rounded-lg bg-accent/10 flex items-center justify-center flex-shrink-0 mt-0.5">
        <Icons.Sunrise className="w-4 h-4 text-accent" />
      </div>
      <div>
        <p className="text-text-primary text-sm font-medium">Stay Accountable</p>
        <p className="text-text-muted text-xs mt-0.5">Never skip your prep again</p>
      </div>
    </div>
  </div>
);

// =====================================================
// BENTO FEATURES GRID
// =====================================================
const BentoFeaturesGrid = () => {
  const headerRef = useScrollReveal();

  return (
    <section id="features" className="py-20 px-6">
      <div className="max-w-6xl mx-auto">
        <div ref={headerRef} className="text-center mb-14">
          <p className="text-accent text-sm font-semibold uppercase tracking-wider mb-3">Features</p>
          <h2 className="text-3xl sm:text-4xl font-bold text-text-primary mb-4">Everything a Trader Needs</h2>
          <p className="text-text-secondary text-lg max-w-xl mx-auto">Powerful tools designed for futures and stock traders who are serious about improving.</p>
        </div>
        <div className="bento-grid">
          {/* Trade & Daily Rules — large card */}
          <BentoItem className="col-span-2 row-span-2 flex flex-col">
            <div>
              <div className="w-10 h-10 bg-accent/10 rounded-lg flex items-center justify-center mb-3 text-accent">
                <Icons.CheckSquare className="w-5 h-5" />
              </div>
              <h3 className="text-xl font-bold text-text-primary">Trade & Daily Rules</h3>
              <p className="mt-2 text-text-secondary text-sm">Build custom rule checklists that keep you disciplined. Track your adherence daily and see how following your rules impacts your P&L.</p>
            </div>
            <ChecklistVisual />
          </BentoItem>

          {/* Advanced Analytics */}
          <BentoItem className="col-span-2 row-span-2 flex flex-col">
            <div>
              <div className="w-10 h-10 bg-accent/10 rounded-lg flex items-center justify-center mb-3 text-accent">
                <Icons.BarChart className="w-5 h-5" />
              </div>
              <h3 className="text-xl font-bold text-text-primary">Advanced Analytics</h3>
              <p className="mt-2 text-text-secondary text-sm">Win rate, P&L curves, drawdown analysis, R-multiple tracking, and time-of-day breakdowns. Know exactly where your edge is.</p>
            </div>
            <AnalyticsVisual />
          </BentoItem>

          {/* Automatic Trade Syncing */}
          <BentoItem className="col-span-2 flex flex-col">
            <div>
              <div className="w-10 h-10 bg-accent/10 rounded-lg flex items-center justify-center mb-3 text-accent">
                <Icons.Zap className="w-5 h-5" />
              </div>
              <h3 className="text-xl font-bold text-text-primary">Automatic Trade Syncing</h3>
              <p className="mt-2 text-text-secondary text-sm">Connect your broker once and your trades import automatically. No manual entry. No CSV uploads. Just trade.</p>
            </div>
            <BrokerOrbitVisual />
          </BentoItem>

          {/* Premarket Rules */}
          <BentoItem className="flex flex-col">
            <div>
              <div className="w-10 h-10 bg-accent/10 rounded-lg flex items-center justify-center mb-3 text-accent">
                <Icons.Sunrise className="w-5 h-5" />
              </div>
              <h3 className="text-lg font-bold text-text-primary">Pre-Market Prep</h3>
              <p className="mt-2 text-text-secondary text-sm">Start every session with a plan. Build a custom checklist and track your prep consistency with stats over time.</p>
            </div>
            <PremarketVisual />
          </BentoItem>

          {/* Prop Firm Pass Rate */}
          <BentoItem className="flex flex-col">
            <div>
              <div className="w-10 h-10 bg-accent/10 rounded-lg flex items-center justify-center mb-3 text-accent">
                <Icons.Target className="w-5 h-5" />
              </div>
              <h3 className="text-lg font-bold text-text-primary">Prop Firm Calculator</h3>
              <p className="mt-2 text-text-secondary text-sm">Monte Carlo simulations calculate your probability of passing any prop firm evaluation based on your real trading stats.</p>
            </div>
            <PropFirmVisual />
          </BentoItem>
        </div>
      </div>
    </section>
  );
};

// =====================================================
// HOW IT WORKS
// =====================================================
const HowItWorks = () => {
  const steps = [
    { num: '01', title: 'Sign Up Free', desc: 'Create your account in seconds. No credit card needed to start your trial.' },
    { num: '02', title: 'Connect Your Broker', desc: 'Link Tradovate or import trades via CSV. Your data syncs automatically.' },
    { num: '03', title: 'Set Up Your Routine', desc: 'Build your pre-market checklist and customize your dashboard.' },
    { num: '04', title: 'Review & Improve', desc: 'Use analytics to spot patterns, fix mistakes, and grow your edge over time.' },
  ];

  const headerRef = useScrollReveal();
  const delays = ['', 'delay-100', 'delay-200', 'delay-300'];

  return (
    <section id="how-it-works" className="py-20 px-6">
      <div className="max-w-5xl mx-auto">
        <div ref={headerRef} className="text-center mb-14">
          <p className="text-accent text-sm font-semibold uppercase tracking-wider mb-3">How It Works</p>
          <h2 className="text-3xl sm:text-4xl font-bold text-text-primary mb-4">Get Started in Minutes</h2>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-8">
          {steps.map((step, i) => (
            <ScrollReveal key={step.num} className="text-center" delay={delays[i]}>
              <div className="w-12 h-12 bg-accent/10 rounded-full flex items-center justify-center mx-auto mb-4">
                <span className="text-accent font-mono font-bold text-sm">{step.num}</span>
              </div>
              <h3 className="text-text-primary font-semibold mb-2">{step.title}</h3>
              <p className="text-text-secondary text-sm leading-relaxed">{step.desc}</p>
            </ScrollReveal>
          ))}
        </div>
      </div>
    </section>
  );
};

// =====================================================
// PRICING SECTION
// =====================================================
const PricingSection = () => {
  const [pricing, setPricing] = useState({ pro: '12', elite: '18', proYearly: '120', eliteYearly: '180', trialDays: '14' });
  const [billing, setBilling] = useState('yearly');

  useEffect(() => {
    fetch('/api/pricing').then(r => r.json()).then(setPricing).catch(() => {});
  }, []);

  const planDefs = pricing.plans || {};
  const plans = [
    {
      name: (planDefs.trial && planDefs.trial.name) || 'Trial',
      price: '$0',
      period: `${pricing.trialDays} days`,
      features: (planDefs.trial && planDefs.trial.features) || ['Most Pro features for 14 days', 'Up to 50 trades'],
      accent: false,
      popular: false,
    },
    {
      name: (planDefs.pro && planDefs.pro.name) || 'Pro',
      price: billing === 'yearly' ? `$${pricing.proYearly}` : `$${pricing.pro}`,
      monthlyEquiv: billing === 'yearly' ? `$${Math.round(pricing.proYearly / 12)}` : null,
      originalMonthly: billing === 'yearly' ? `$${pricing.pro}` : null,
      period: billing === 'yearly' ? '/year' : '/month',
      features: (planDefs.pro && planDefs.pro.features) || ['Unlimited trades', '2 broker connections', 'CSV Import/Export', 'Strategy & rule tracking', 'Premarket prep', '1 Backtesting session'],
      accent: true,
      popular: true,
    },
    {
      name: (planDefs.elite && planDefs.elite.name) || 'Elite',
      price: billing === 'yearly' ? `$${pricing.eliteYearly}` : `$${pricing.elite}`,
      monthlyEquiv: billing === 'yearly' ? `$${Math.round(pricing.eliteYearly / 12)}` : null,
      originalMonthly: billing === 'yearly' ? `$${pricing.elite}` : null,
      period: billing === 'yearly' ? '/year' : '/month',
      features: (planDefs.elite && planDefs.elite.features) || ['Everything in Pro', 'Attach and annotate screenshots', 'Unlimited broker connections', 'Custom themes', 'Unlimited Backtesting'],
      accent: false,
      popular: false,
    },
  ];

  const headerRef = useScrollReveal();
  const delays = ['', 'delay-100', 'delay-200'];

  return (
    <section id="pricing" className="py-20 px-6">
      <div className="max-w-6xl mx-auto">
        <div ref={headerRef} className="text-center mb-14">
          <p className="text-accent text-sm font-semibold uppercase tracking-wider mb-3">Pricing</p>
          <h2 className="text-3xl sm:text-4xl font-bold text-text-primary mb-4">Improving Shouldn't Be Expensive</h2>
          <p className="text-text-secondary text-lg max-w-lg mx-auto">Start with a free trial. Upgrade when you're ready.</p>
        </div>
        {/* Billing toggle */}
        <div className="flex items-center justify-center gap-3 mb-8">
          <button
            onClick={() => setBilling('monthly')}
            className={`px-4 py-1.5 rounded-full text-sm font-medium transition-colors ${
              billing === 'monthly'
                ? 'bg-accent text-accent-text'
                : 'text-text-secondary hover:text-text-primary'
            }`}
          >
            Monthly
          </button>
          <button
            onClick={() => setBilling('yearly')}
            className={`flex items-center gap-2 px-4 py-1.5 rounded-full text-sm font-medium transition-colors ${
              billing === 'yearly'
                ? 'bg-accent text-accent-text'
                : 'text-text-secondary hover:text-text-primary'
            }`}
          >
            Yearly
            <span className={`text-xs font-semibold px-1.5 py-0.5 rounded-full ${
              billing === 'yearly' ? 'bg-black/15 text-accent-text' : 'bg-positive/15 text-positive'
            }`}>
              Save 2 months
            </span>
          </button>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 max-w-4xl mx-auto">
          {plans.map((plan, i) => (
            <ScrollReveal
              key={plan.name}
              className={`relative bg-bg-surface rounded-xl p-6 flex flex-col ${
                plan.accent ? 'border-2 border-accent shadow-lg shadow-accent/10' : 'border border-border'
              }`}
              delay={delays[i]}
            >
              {plan.popular && (
                <div className="absolute -top-3 left-1/2 -translate-x-1/2 px-3 py-1 bg-accent text-accent-text text-xs font-bold rounded-full">
                  Most Popular
                </div>
              )}
              <h3 className="text-text-primary font-semibold text-lg">{plan.name}</h3>
              <div className="mt-4 mb-6">
                {plan.monthlyEquiv ? (
                  <>
                    <div className="flex items-baseline gap-2">
                      <span className="text-text-tertiary text-sm line-through">{plan.originalMonthly}</span>
                      <span className="text-text-primary font-mono text-4xl font-bold">{plan.monthlyEquiv}</span>
                      <span className="text-text-tertiary text-sm">/mo</span>
                    </div>
                    <p className="text-text-muted text-xs mt-0.5">billed annually</p>
                  </>
                ) : (
                  <>
                    <span className="text-text-primary font-mono text-4xl font-bold">{plan.price}</span>
                    <span className="text-text-tertiary text-sm ml-1">{plan.period}</span>
                  </>
                )}
              </div>
              <ul className="space-y-3 flex-1">
                {plan.features.map(feature => (
                  <li key={feature} className="flex items-center gap-2 text-sm text-text-secondary">
                    <Icons.Check className="w-4 h-4 text-accent flex-shrink-0" />
                    {feature}
                  </li>
                ))}
              </ul>
              <a
                href={`${APP_URL}/login?signup`}
                className={`mt-6 w-full py-2.5 text-sm font-semibold rounded-lg transition-all text-center block ${
                  plan.accent
                    ? 'bg-accent text-accent-text hover:brightness-110'
                    : 'bg-bg-input border border-border text-text-primary hover:border-accent'
                }`}
              >
                Get Started
              </a>
            </ScrollReveal>
          ))}
        </div>
        <p className="text-center text-text-muted text-xs mt-8">Cancel anytime.</p>
      </div>
    </section>
  );
};

// =====================================================
// FAQ SECTION
// =====================================================
const FAQItem = ({ question, answer }) => {
  const [open, setOpen] = useState(false);

  return (
    <div className="border-b border-border">
      <button
        onClick={() => setOpen(!open)}
        className="w-full py-5 flex items-center justify-between text-left gap-4"
      >
        <span className="text-text-primary font-medium text-sm sm:text-base">{question}</span>
        <Icons.ChevronDown className={`w-4 h-4 text-text-muted flex-shrink-0 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>
      {open && (
        <div className="pb-5 text-text-secondary text-sm leading-relaxed pr-8">
          {answer}
        </div>
      )}
    </div>
  );
};

const FAQSection = () => {
  const faqs = [
    {
      question: 'What brokers do you support?',
      answer: 'We currently support Tradovate for auto-sync. ProjectX and NinjaTrader integrations are coming soon. You can also import trades via CSV from any broker.',
    },
    {
      question: 'How does the free trial work?',
      answer: 'You get full access to trial features for 14 days with no credit card required. You can log up to 50 trades and access advanced analytics. Upgrade anytime to unlock unlimited trades and broker connections.',
    },
    {
      question: 'Can I cancel my subscription anytime?',
      answer: 'Yes, you can cancel at any time from your account settings. When you cancel, the remaining balance on your subscription will be refunded.',
    },
    {
      question: 'Is my trading data secure?',
      answer: 'Absolutely. All broker credentials are encrypted with AES-256-GCM. Your data is stored securely on Supabase with row-level security policies ensuring only you can access your trades.',
    },
    {
      question: 'What is the pre-market prep feature?',
      answer: 'Pre-market prep lets you create a custom daily checklist (e.g., "check futures", "review key levels") to keep yourself accountable before each session. It tracks your checklist completion stats over time so you can see how consistent your preparation is.',
    },
    {
      question: 'Do you support stocks or just futures?',
      answer: 'RR Metrics works for both futures and stock traders. You can manually log any trade regardless of asset class. Auto-sync currently supports futures brokers, with stock broker integrations planned.',
    },
  ];

  const headerRef = useScrollReveal();

  return (
    <section id="faq" className="py-20 px-6">
      <div className="max-w-3xl mx-auto">
        <div ref={headerRef} className="text-center mb-14">
          <p className="text-accent text-sm font-semibold uppercase tracking-wider mb-3">FAQ</p>
          <h2 className="text-3xl sm:text-4xl font-bold text-text-primary mb-4">Frequently Asked Questions</h2>
        </div>
        <div className="border-t border-border">
          {faqs.map(faq => (
            <FAQItem key={faq.question} {...faq} />
          ))}
        </div>
      </div>
    </section>
  );
};

// =====================================================
// FINAL CTA
// =====================================================
const FinalCTA = () => {
  const ref = useScrollReveal();
  return (
    <section className="py-20 px-6">
      <div ref={ref} className="max-w-3xl mx-auto text-center">
        <div className="bg-bg-surface rounded-2xl p-10 sm:p-14 border border-border relative overflow-hidden">
          <div className="absolute inset-0 bg-gradient-to-br from-accent/5 to-transparent pointer-events-none"></div>
          <div className="relative">
            <h2 className="text-3xl sm:text-4xl font-bold text-text-primary mb-4">Ready to Trade Smarter?</h2>
            <p className="text-text-secondary text-lg mb-8 max-w-lg mx-auto">
              Join traders who use RR Metrics to prepare, track, and improve every single day.
            </p>
            <a href={`${APP_URL}/login?signup`} className="inline-flex items-center gap-2 bg-accent text-accent-text font-semibold px-8 py-3.5 rounded-lg hover:brightness-110 transition-all text-base shadow-lg shadow-accent/20">
              Start Free Trial
              <Icons.ArrowRight className="w-4 h-4" />
            </a>
            <p className="text-text-muted text-sm mt-4">No credit card required</p>
          </div>
        </div>
      </div>
    </section>
  );
};

// =====================================================
// FOOTER
// =====================================================
const Footer = () => (
  <footer className="border-t border-border py-12 px-6">
    <div className="max-w-6xl mx-auto">
      <div className="flex flex-col md:flex-row items-start justify-between gap-10 mb-10">
        <div className="max-w-xs">
          <Logo className="mb-4" />
          <p className="text-text-muted text-sm leading-relaxed">
            The trading journal built for traders who want to improve. Track, analyze, and master your trading.
          </p>
        </div>
        <div className="flex gap-16">
          <div>
            <h4 className="text-text-primary text-sm font-semibold mb-4">Product</h4>
            <div className="space-y-3">
              <a href="#features" className="block text-text-muted hover:text-text-secondary text-sm transition-colors">Features</a>
              <a href="#pricing" className="block text-text-muted hover:text-text-secondary text-sm transition-colors">Pricing</a>
              <a href="#faq" className="block text-text-muted hover:text-text-secondary text-sm transition-colors">FAQ</a>
            </div>
          </div>
          <div>
            <h4 className="text-text-primary text-sm font-semibold mb-4">Legal</h4>
            <div className="space-y-3">
              <a href="/privacy" className="block text-text-muted hover:text-text-secondary text-sm transition-colors">Privacy Policy</a>
              <a href="/terms" className="block text-text-muted hover:text-text-secondary text-sm transition-colors">Terms of Service</a>
            </div>
          </div>
          <div>
            <h4 className="text-text-primary text-sm font-semibold mb-4">Account</h4>
            <div className="space-y-3">
              <a href={`${APP_URL}/login`} className="block text-text-muted hover:text-text-secondary text-sm transition-colors">Sign In</a>
              <a href={`${APP_URL}/login?signup`} className="block text-text-muted hover:text-text-secondary text-sm transition-colors">Create Account</a>
            </div>
          </div>
        </div>
      </div>
      <div className="border-t border-border pt-6 flex flex-col sm:flex-row items-center justify-between gap-4">
        <p className="text-text-muted text-xs">&copy; 2026 RR Metrics. All rights reserved.</p>
      </div>
    </div>
  </footer>
);

// =====================================================
// APP
// =====================================================
const App = () => (
  <div className="min-h-screen bg-bg-page">
    <Navbar />
    <HeroSection />
    <SocialProofBar />
    <BentoFeaturesGrid />
    <HowItWorks />
    <PricingSection />
    <FAQSection />
    <FinalCTA />
    <Footer />
  </div>
);

const init = async () => {
  const { data: { session } } = await supabase.auth.getSession();
  if (session) {
    window.location = `${APP_URL}/trades`;
    return;
  }
  const root = createRoot(document.getElementById('content'));
  root.render(<App />);
};

window.onload = init;
