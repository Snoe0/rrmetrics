const React = require('react');
const { useState, useEffect } = React;
const { createRoot } = require('react-dom/client');
require('./styles/globals.css');

// =====================================================
// LOCAL ICONS (only what the landing page needs)
// =====================================================
const Icons = {
  TrendingUp: (props) => (
    <svg className={props.className || "w-5 h-5"} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="22 7 13.5 15.5 8.5 10.5 2 17"></polyline>
      <polyline points="16 7 22 7 22 13"></polyline>
    </svg>
  ),
  Check: (props) => (
    <svg className={props.className || "w-4 h-4"} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="20 6 9 17 4 12"></polyline>
    </svg>
  ),
  Star: (props) => (
    <svg className={props.className || "w-5 h-5"} viewBox="0 0 24 24" fill="currentColor" stroke="currentColor" strokeWidth="1">
      <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"></polygon>
    </svg>
  ),
  ChevronRight: (props) => (
    <svg className={props.className || "w-5 h-5"} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="9 18 15 12 9 6"></polyline>
    </svg>
  ),
  BarChart: (props) => (
    <svg className={props.className || "w-6 h-6"} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <line x1="18" y1="20" x2="18" y2="10"></line>
      <line x1="12" y1="20" x2="12" y2="4"></line>
      <line x1="6" y1="20" x2="6" y2="14"></line>
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
  Camera: (props) => (
    <svg className={props.className || "w-6 h-6"} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"></path>
      <circle cx="12" cy="13" r="4"></circle>
    </svg>
  ),
  Zap: (props) => (
    <svg className={props.className || "w-6 h-6"} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"></polygon>
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
          <a href="#pricing" className="text-text-secondary hover:text-text-primary text-sm transition-colors">Pricing</a>
        </div>
        <div className="flex items-center gap-3">
          <a href="/login" className="text-text-secondary hover:text-text-primary text-sm font-medium transition-colors px-4 py-2">
            Sign In
          </a>
          <a href="/login" className="bg-accent text-accent-text text-sm font-semibold px-5 py-2 rounded-lg hover:brightness-110 transition-all">
            Get Started
          </a>
        </div>
      </div>
    </nav>
  );
};

// =====================================================
// HERO SECTION
// =====================================================
const HeroSection = () => (
  <section className="pt-32 pb-16 px-6">
    <div className="max-w-4xl mx-auto text-center">
      <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-accent/10 border border-accent/20 mb-8">
        <span className="text-accent text-sm font-medium">Now with Auto Sync</span>
      </div>
      <h1 className="text-4xl sm:text-5xl lg:text-6xl font-bold text-text-primary leading-tight mb-6">
        Master Your<br />Trading Journey
      </h1>
      <p className="text-text-secondary text-lg sm:text-xl max-w-2xl mx-auto mb-10">
        Track, analyze, and improve your trades with powerful analytics and seamless broker integration.
      </p>
      <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
        <a href="/login" className="bg-accent text-accent-text font-semibold px-8 py-3.5 rounded-lg hover:brightness-110 transition-all text-base flex items-center gap-2">
          Start Free Trial
          <Icons.ChevronRight className="w-4 h-4" />
        </a>
        <a href="#features" className="text-text-secondary hover:text-text-primary font-medium px-8 py-3.5 rounded-lg border border-border hover:border-accent/50 transition-all text-base">
          Learn More
        </a>
      </div>
    </div>
  </section>
);

// =====================================================
// STATS BAR
// =====================================================
const StatsBar = () => {
  const stats = [
    { value: '12K+', label: 'Trades Tracked' },
    { value: '99%', label: 'User Satisfaction' },
    { value: '50+', label: 'Broker Integrations' },
  ];

  return (
    <section className="py-12 px-6">
      <div className="max-w-4xl mx-auto grid grid-cols-1 sm:grid-cols-3 gap-6">
        {stats.map(stat => (
          <div key={stat.label} className="bg-bg-surface rounded-xl p-6 border border-border text-center">
            <div className="text-accent font-mono text-3xl font-bold">{stat.value}</div>
            <div className="text-text-secondary text-sm mt-2">{stat.label}</div>
          </div>
        ))}
      </div>
    </section>
  );
};

// =====================================================
// FEATURES SECTION
// =====================================================
const FeaturesSection = () => {
  const features = [
    {
      icon: <Icons.Zap className="w-6 h-6 text-accent" />,
      title: 'Auto-Sync Trades',
      description: 'Connect your broker and automatically import trades. No manual entry needed.',
    },
    {
      icon: <Icons.BarChart className="w-6 h-6 text-accent" />,
      title: 'Advanced Analytics',
      description: 'Win rate, P&L curves, drawdown analysis, and more. Understand your edge.',
    },
    {
      icon: <Icons.Calendar className="w-6 h-6 text-accent" />,
      title: 'Calendar View',
      description: 'Visualize your trading history day by day. Spot patterns in your performance.',
    },
    {
      icon: <Icons.Camera className="w-6 h-6 text-accent" />,
      title: 'Trade Screenshots',
      description: 'Attach and annotate chart screenshots to every trade for visual review.',
    },
  ];

  return (
    <section id="features" className="py-20 px-6">
      <div className="max-w-6xl mx-auto">
        <div className="text-center mb-14">
          <h2 className="text-3xl font-bold text-text-primary mb-4">Everything You Need</h2>
          <p className="text-text-secondary text-lg max-w-xl mx-auto">Powerful tools designed specifically for active traders who want to improve.</p>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
          {features.map(feature => (
            <div key={feature.title} className="bg-bg-surface rounded-xl p-6 border border-border hover:border-accent/40 transition-colors">
              <div className="w-12 h-12 bg-accent/10 rounded-lg flex items-center justify-center mb-4">
                {feature.icon}
              </div>
              <h3 className="text-text-primary font-semibold mb-2">{feature.title}</h3>
              <p className="text-text-secondary text-sm leading-relaxed">{feature.description}</p>
            </div>
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
  const plans = [
    {
      name: 'Trial',
      price: '$0',
      period: '14 days',
      features: ['Up to 50 trades', 'Advanced analytics', 'Manual trade entry', 'Email support', 'Custom tags'],
      accent: false,
      popular: false,
    },
    {
      name: 'Pro',
      price: '$13',
      period: '/month',
      features: ['Unlimited trades', 'Advanced analytics', '5 broker connections', 'Priority support', 'Export to CSV'],
      accent: true,
      popular: true,
    },
    {
      name: 'Elite',
      price: '$20',
      period: '/month',
      features: ['All Pro features', 'Multiple screenshots per trade', 'Unlimited broker connections'],
      accent: false,
      popular: false,
    },
  ];

  return (
    <section id="pricing" className="py-20 px-6">
      <div className="max-w-6xl mx-auto">
        <div className="text-center mb-14">
          <h2 className="text-3xl font-bold text-text-primary mb-4">Simple, Affordable Pricing</h2>
          <p className="text-text-secondary text-lg max-w-lg mx-auto">Choose the plan that fits your trading style. All plans include a 14-day money-back guarantee.</p>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 max-w-4xl mx-auto">
          {plans.map(plan => (
            <div
              key={plan.name}
              className={`relative bg-bg-surface rounded-xl p-6 flex flex-col ${
                plan.accent ? 'border-2 border-accent' : 'border border-border'
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
              <a
                href="/login"
                className={`mt-6 w-full py-2.5 text-sm font-semibold rounded-lg transition-all text-center block ${
                  plan.accent
                    ? 'bg-accent text-accent-text hover:brightness-110'
                    : 'bg-bg-input border border-border text-text-primary hover:border-accent'
                }`}
              >
                Get Started
              </a>
            </div>
          ))}
        </div>
        <p className="text-center text-text-muted text-xs mt-8">14-day money-back guarantee on all paid plans. Cancel anytime.</p>
      </div>
    </section>
  );
};

// =====================================================
// CTA SECTION
// =====================================================
const CTASection = () => (
  <section className="py-20 px-6">
    <div className="max-w-3xl mx-auto text-center bg-bg-surface rounded-2xl p-12 border border-border">
      <h2 className="text-3xl font-bold text-text-primary mb-4">Ready to Level Up Your Trading?</h2>
      <p className="text-text-secondary text-lg mb-8 max-w-lg mx-auto">
        Join other traders already using RR Metrics to track, analyze, and improve their performance.
      </p>
      <a href="/login" className="inline-flex items-center gap-2 bg-accent text-accent-text font-semibold px-8 py-3.5 rounded-lg hover:brightness-110 transition-all text-base">
        Start Free Trial
        <Icons.ChevronRight className="w-4 h-4" />
      </a>
    </div>
  </section>
);

// =====================================================
// FOOTER
// =====================================================
const Footer = () => (
  <footer className="border-t border-border py-12 px-6">
    <div className="max-w-6xl mx-auto flex flex-col md:flex-row items-center justify-between gap-6">
      <Logo />
      <div className="flex items-center gap-6">
        <a href="#features" className="text-text-tertiary hover:text-text-secondary text-sm transition-colors">Features</a>
        <a href="#pricing" className="text-text-tertiary hover:text-text-secondary text-sm transition-colors">Pricing</a>
        <a href="/login" className="text-text-tertiary hover:text-text-secondary text-sm transition-colors">Sign In</a>
      </div>
      <p className="text-text-muted text-xs">&copy; 2026 RR Metrics. All rights reserved.</p>
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
    <StatsBar />
    <FeaturesSection />
    <PricingSection />
    <CTASection />
    <Footer />
  </div>
);

const init = () => {
  const root = createRoot(document.getElementById('content'));
  root.render(<App />);
};

window.onload = init;
