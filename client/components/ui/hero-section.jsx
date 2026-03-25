const React = require('react');
const { ArrowRight } = require('lucide-react');
const { Button } = require('./button');

const APP_URL = '';

const HeroSection = () => (
  <section className="relative overflow-hidden">
    {/* Decorative gradient blobs */}
    <div
      aria-hidden
      className="z-[2] absolute inset-0 pointer-events-none isolate opacity-50 contain-strict hidden lg:block"
    >
      <div className="w-[35rem] h-[80rem] -translate-y-[87.5%] absolute left-0 top-0 -rotate-45 rounded-full bg-[radial-gradient(68.54%_68.72%_at_55.02%_31.46%,rgba(191,255,0,.08)_0,rgba(191,255,0,.02)_50%,transparent_80%)]" />
      <div className="h-[80rem] absolute left-0 top-0 w-56 -rotate-45 rounded-full bg-[radial-gradient(50%_50%_at_50%_50%,rgba(191,255,0,.06)_0,rgba(191,255,0,.02)_80%,transparent_100%)] [translate:5%_-50%]" />
      <div className="h-[80rem] -translate-y-[87.5%] absolute left-0 top-0 w-56 -rotate-45 bg-[radial-gradient(50%_50%_at_50%_50%,rgba(191,255,0,.04)_0,rgba(191,255,0,.02)_80%,transparent_100%)]" />
    </div>

    {/* Hero content */}
    <div className="relative mx-auto max-w-5xl px-6 py-28 lg:py-24">
      <div className="relative z-10 mx-auto max-w-2xl text-center">
        <h1 className="text-balance text-4xl font-semibold text-text-primary md:text-5xl lg:text-6xl">
          Ditch the Spreadsheet.{' '}
          <span className="bg-gradient-to-r from-accent to-[#8b5cf6] bg-clip-text text-transparent">
            Find Your Edge Automatically.
          </span>
        </h1>

        <p className="mx-auto my-8 max-w-2xl text-lg text-text-secondary sm:text-xl leading-relaxed">
          Stop losing trades to messy notebooks and dead spreadsheets. RR Metrics auto-syncs your broker, tracks your stats, and shows you exactly where you make (and lose) money. Starting at just $12/mo.
        </p>

        <Button asChild size="lg" className="bg-accent text-accent-text hover:bg-accent/90 shadow-lg shadow-accent/20 font-semibold">
          <a href={`${APP_URL}/login?signup`}>
            <span className="btn-label">Start Free Trial</span>
            <ArrowRight className="ml-2 w-4 h-4" />
          </a>
        </Button>
      </div>
    </div>

    {/* Perspective dashboard preview */}
    <div className="-mt-16 [mask-image:linear-gradient(to_right,black_60%,transparent_100%)]">
      <div className="mx-auto max-w-7xl [mask-image:linear-gradient(to_bottom,black_50%,transparent_100%)]">
        <div className="[perspective:1200px] -mr-16 pl-16 lg:-mr-56 lg:pl-56">
        <div className="[transform:rotateX(20deg)]">
          <div className="lg:h-[44rem] relative skew-x-[.36rad]">
            <div className="relative z-[2] rounded-xl border border-border overflow-hidden bg-bg-surface shadow-2xl shadow-black/30">
              <div className="bg-bg-input border-b border-border px-4 py-3 flex items-center gap-2">
                <div className="flex gap-1.5">
                  <div className="w-3 h-3 rounded-full bg-[#ff5f57]"></div>
                  <div className="w-3 h-3 rounded-full bg-[#febc2e]"></div>
                  <div className="w-3 h-3 rounded-full bg-[#28c840]"></div>
                </div>
                <div className="flex-1 ml-4">
                  <div className="bg-bg-page rounded-md px-4 py-1.5 text-text-muted text-xs font-mono max-w-xs">
                    rrmetrics.com/trades
                  </div>
                </div>
              </div>
              <img
                src="/assets/img/dashboard-preview.png"
                alt="RR Metrics Dashboard"
                className="w-full object-contain object-top"
              />
            </div>
          </div>
        </div>
        </div>
      </div>
    </div>

  </section>
);

module.exports = { HeroSection };
