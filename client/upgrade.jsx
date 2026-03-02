const React = require('react');
const { useState, useEffect, useRef } = React;
const { createRoot } = require('react-dom/client');
const { authFetch, supabase } = require('./helper.js');
require('./styles/globals.css');

// =====================================================
// ICONS
// =====================================================
const Icons = {
  Check: (props) => (
    <svg className={props.className || "w-4 h-4"} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="20 6 9 17 4 12"></polyline>
    </svg>
  ),
  ArrowLeft: (props) => (
    <svg className={props.className || "w-5 h-5"} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <line x1="19" y1="12" x2="5" y2="12"></line>
      <polyline points="12 19 5 12 12 5"></polyline>
    </svg>
  ),
  CheckCircle: (props) => (
    <svg className={props.className || "w-5 h-5"} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"></path>
      <polyline points="22 4 12 14.01 9 11.01"></polyline>
    </svg>
  ),
  AlertCircle: (props) => (
    <svg className={props.className || "w-5 h-5"} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="10"></circle>
      <line x1="12" y1="8" x2="12" y2="12"></line>
      <line x1="12" y1="16" x2="12.01" y2="16"></line>
    </svg>
  ),
  Lock: (props) => (
    <svg className={props.className || "w-4 h-4"} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect>
      <path d="M7 11V7a5 5 0 0 1 10 0v4"></path>
    </svg>
  ),
  Settings: (props) => (
    <svg className={props.className || "w-4 h-4"} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="3"></circle>
      <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"></path>
    </svg>
  ),
  Zap: (props) => (
    <svg className={props.className || "w-4 h-4"} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"></polygon>
    </svg>
  ),
};

// =====================================================
// STRIPE CARD ELEMENT STYLE
// Hardcoded to match the app's dark theme CSS variables
// =====================================================
const CARD_STYLE = {
  base: {
    color: '#ffffff',
    fontFamily: '"Inter", sans-serif',
    fontSize: '14px',
    fontSmoothing: 'antialiased',
    '::placeholder': { color: '#6e6e6e' },
    iconColor: '#999999',
  },
  invalid: {
    color: '#ef4444',
    iconColor: '#ef4444',
  },
};

// =====================================================
// CHECKOUT MODAL
// =====================================================
const CheckoutModal = ({ plan, stripeInstance, onClose, onSuccess }) => {
  const cardRef = useRef(null);
  const [cardEl, setCardEl] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const [cardError, setCardError] = useState(null);
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [addressLine1, setAddressLine1] = useState('');
  const [city, setCity] = useState('');
  const [stateProvince, setStateProvince] = useState('');
  const [postalCode, setPostalCode] = useState('');
  const [country, setCountry] = useState('US');
  const [couponCode, setCouponCode] = useState('');
  const [appliedCoupon, setAppliedCoupon] = useState(null);
  const [couponError, setCouponError] = useState(null);
  const [couponLoading, setCouponLoading] = useState(false);
  const [referralCode, setReferralCode] = useState('');
  const [appliedReferral, setAppliedReferral] = useState(false);
  const [referralChecking, setReferralChecking] = useState(true);
  const [referralError, setReferralError] = useState(null);
  const [referralLoading, setReferralLoading] = useState(false);

  // Mount the Stripe Card Element when modal opens
  useEffect(() => {
    if (!cardRef.current || !stripeInstance) return;
    const elements = stripeInstance.elements();
    const card = elements.create('card', { style: CARD_STYLE, hidePostalCode: true });
    card.mount(cardRef.current);
    card.on('change', (e) => setCardError(e.error ? e.error.message : null));
    setCardEl(card);
    return () => { card.unmount(); };
  }, [stripeInstance]);

  // Close on Escape key
  useEffect(() => {
    const handleKey = (e) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [onClose]);

  // Check DB for existing referral (source of truth)
  // Must filter by referred_id — the RLS also exposes rows where the user is the referrer,
  // which would falsely show the discount badge to users who have referred others.
  useEffect(() => {
    (async () => {
      try {
        const { data: { session } } = await supabase.auth.getSession();
        if (!session) return;
        const { data } = await supabase
          .from('referral_uses')
          .select('id')
          .eq('referred_id', session.user.id)
          .limit(1);
        if (data && data.length > 0) setAppliedReferral(true);
      } finally {
        setReferralChecking(false);
      }
    })();
  }, []);

  const handleApplyCoupon = async () => {
    const code = couponCode.trim();
    if (!code) return;
    setCouponLoading(true);
    setCouponError(null);
    try {
      const res = await authFetch(`/api/stripe/validate-coupon?code=${encodeURIComponent(code)}`);
      const data = await res.json();
      if (!res.ok) {
        setCouponError(data.error || 'Invalid coupon code.');
      } else {
        setAppliedCoupon(data);
        setCouponCode('');
      }
    } catch {
      setCouponError('Failed to validate coupon.');
    } finally {
      setCouponLoading(false);
    }
  };

  const handleApplyReferral = async () => {
    const code = referralCode.trim().toUpperCase();
    if (!code) return;
    setReferralLoading(true);
    setReferralError(null);
    try {
      const res = await authFetch('/api/referral/apply', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code }),
      });
      const data = await res.json();
      if (!res.ok) {
        setReferralError(data.error || 'Invalid referral code.');
      } else {
        setAppliedReferral(true);
        setReferralCode('');
      }
    } catch {
      setReferralError('Failed to apply referral code.');
    } finally {
      setReferralLoading(false);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!cardEl || submitting) return;
    setSubmitting(true);
    setCardError(null);

    try {
      // 1. Create the subscription on the backend — returns a clientSecret
      const res = await authFetch('/api/stripe/create-subscription', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ plan: plan.id, promoCodeId: appliedCoupon?.id || null, hasReferral: !appliedCoupon && appliedReferral }),
      });
      const data = await res.json();
      if (!res.ok) {
        setCardError(data.error || 'Something went wrong. Please try again.');
        setSubmitting(false);
        return;
      }

      // 2. Confirm the payment with the card element and billing details
      const { error: confirmError, paymentIntent } = await stripeInstance.confirmCardPayment(
        data.clientSecret,
        {
          payment_method: {
            card: cardEl,
            billing_details: {
              name: fullName,
              email,
              address: {
                line1: addressLine1,
                city,
                state: stateProvince,
                postal_code: postalCode,
                country,
              },
            },
          },
        },
      );

      if (confirmError) {
        setCardError(confirmError.message);
        setSubmitting(false);
        return;
      }

      if (paymentIntent.status === 'succeeded') {
        onSuccess(plan.id);
      }
    } catch (err) {
      setCardError('Payment failed. Please try again.');
      setSubmitting(false);
    }
  };

  const isElite = plan.style === 'elite';
  const inputClass = 'w-full bg-bg-input border border-border rounded-lg px-3 py-[11px] text-text-primary text-sm placeholder:text-text-tertiary focus:outline-none focus:border-accent/60 transition-colors';
  const labelClass = 'text-text-secondary text-xs font-medium uppercase tracking-wider block mb-1.5';

  return (
    <div
      className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-50 p-4"
      onClick={onClose}
    >
      <div
        className="bg-bg-surface border border-border rounded-xl w-full max-w-md shadow-2xl max-h-[90vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Modal header */}
        <div className="flex items-center justify-between px-6 pt-6 pb-5 border-b border-border flex-shrink-0">
          <div>
            <h2 className="text-text-primary font-semibold text-lg">Subscribe to {plan.name}</h2>
            <p className="text-text-secondary text-sm mt-0.5">Start your subscription today</p>
          </div>
          <button
            onClick={onClose}
            className="text-text-tertiary hover:text-text-primary transition-colors w-8 h-8 flex items-center justify-center rounded-lg hover:bg-bg-input"
            aria-label="Close"
          >
            <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <line x1="18" y1="6" x2="6" y2="18"></line>
              <line x1="6" y1="6" x2="18" y2="18"></line>
            </svg>
          </button>
        </div>

        <div className="px-6 py-5 overflow-y-auto flex-1">
          {/* Plan summary */}
          <div className={`rounded-lg p-4 mb-5 border ${
            isElite
              ? 'border-yellow-500/30 bg-yellow-500/5'
              : 'border-accent/30 bg-accent/5'
          }`}>
            <div className="flex items-center justify-between">
              <div>
                <p className={`font-semibold text-sm ${isElite ? 'text-yellow-400' : 'text-accent'}`}>
                  {plan.name}
                </p>
                <p className="text-text-secondary text-xs mt-0.5">
                  {plan.id.endsWith('_yearly') ? 'Billed annually' : 'Billed monthly'} · Cancel anytime
                </p>
              </div>
              <div className="text-right">
                <span className="text-text-primary font-mono font-bold text-2xl">{plan.price}</span>
                <span className="text-text-tertiary text-xs">{plan.id.endsWith('_yearly') ? '/yr' : '/mo'}</span>
              </div>
            </div>
          </div>

          <form onSubmit={handleSubmit}>
            {/* Full name */}
            <div className="mb-4">
              <label className={labelClass}>Full name</label>
              <input
                type="text"
                required
                placeholder="Jane Smith"
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                className={inputClass}
              />
            </div>

            {/* Email */}
            <div className="mb-4">
              <label className={labelClass}>Email</label>
              <input
                type="email"
                required
                placeholder="jane@example.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className={inputClass}
              />
            </div>

            {/* Card details */}
            <div className="mb-4">
              <label className={labelClass}>Card details</label>
              <div
                ref={cardRef}
                className="bg-bg-input border border-border rounded-lg px-3 py-[11px] min-h-[42px] transition-colors focus-within:border-accent/60"
              />
            </div>

            {/* Billing address */}
            <div className="mb-4">
              <label className={labelClass}>Billing address</label>
              <input
                type="text"
                required
                placeholder="Address line 1"
                value={addressLine1}
                onChange={(e) => setAddressLine1(e.target.value)}
                className={`${inputClass} mb-2`}
              />
              <div className="grid grid-cols-2 gap-2 mb-2">
                <input
                  type="text"
                  required
                  placeholder="City"
                  value={city}
                  onChange={(e) => setCity(e.target.value)}
                  className={inputClass}
                />
                <input
                  type="text"
                  required
                  placeholder="State / Province"
                  value={stateProvince}
                  onChange={(e) => setStateProvince(e.target.value)}
                  className={inputClass}
                />
              </div>
              <div className="grid grid-cols-2 gap-2">
                <input
                  type="text"
                  required
                  placeholder="ZIP / Postal code"
                  value={postalCode}
                  onChange={(e) => setPostalCode(e.target.value)}
                  className={inputClass}
                />
                <select
                  value={country}
                  onChange={(e) => setCountry(e.target.value)}
                  className={`${inputClass} cursor-pointer`}
                >
                  <option value="US">United States</option>
                  <option value="CA">Canada</option>
                  <option value="GB">United Kingdom</option>
                  <option value="AU">Australia</option>
                  <option value="NZ">New Zealand</option>
                  <option value="IE">Ireland</option>
                  <option value="DE">Germany</option>
                  <option value="FR">France</option>
                  <option value="NL">Netherlands</option>
                  <option value="CH">Switzerland</option>
                  <option value="SE">Sweden</option>
                  <option value="NO">Norway</option>
                  <option value="DK">Denmark</option>
                  <option value="SG">Singapore</option>
                  <option value="JP">Japan</option>
                </select>
              </div>
            </div>

            {/* Referral code */}
            {!plan.id.endsWith('_yearly') && (
              referralChecking ? null : !appliedReferral ? (
                <div className="mb-4">
                  <label className={labelClass}>
                    Referral Code
                    <span className="ml-2 normal-case text-positive font-normal text-[11px]">Get 15% off your first month!</span>
                  </label>
                  <div className="flex gap-2">
                    <input
                      type="text"
                      placeholder="RRM-XXXXXX"
                      value={referralCode}
                      onChange={(e) => { setReferralCode(e.target.value.toUpperCase()); setReferralError(null); }}
                      onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); handleApplyReferral(); } }}
                      className={`${inputClass} flex-1 font-mono`}
                    />
                    <button
                      type="button"
                      onClick={handleApplyReferral}
                      disabled={!referralCode.trim() || referralLoading}
                      className="px-4 py-[11px] text-sm font-medium bg-bg-input border border-border rounded-lg text-text-secondary hover:text-text-primary hover:border-accent/60 transition-colors disabled:opacity-40 disabled:cursor-not-allowed whitespace-nowrap"
                    >
                      {referralLoading ? '...' : 'Apply'}
                    </button>
                  </div>
                  {referralError && (
                    <p className="text-negative text-xs mt-1.5">{referralError}</p>
                  )}
                </div>
              ) : (
                <div className="mb-4">
                  <label className={labelClass}>Referral Code</label>
                  <div className="flex items-center justify-between bg-positive/10 border border-positive/30 rounded-lg px-3 py-2.5">
                    <div className="flex items-center gap-2">
                      <Icons.Check className="w-4 h-4 text-positive flex-shrink-0" />
                      <span className="text-positive text-sm font-medium">15% referral discount applied</span>
                    </div>
                  </div>
                </div>
              )
            )}

            {/* Coupon code */}
            {!plan.id.endsWith('_yearly') && (
              <div className="mb-4">
                <label className={labelClass}>Coupon code</label>
                {appliedCoupon ? (
                  <div className="flex items-center justify-between bg-positive/10 border border-positive/30 rounded-lg px-3 py-2.5">
                    <div className="flex items-center gap-2">
                      <Icons.Check className="w-4 h-4 text-positive flex-shrink-0" />
                      <span className="text-positive text-sm font-medium">{appliedCoupon.display}</span>
                    </div>
                    <button
                      type="button"
                      onClick={() => setAppliedCoupon(null)}
                      className="text-text-tertiary hover:text-text-primary transition-colors ml-2"
                      aria-label="Remove coupon"
                    >
                      <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <line x1="18" y1="6" x2="6" y2="18"></line>
                        <line x1="6" y1="6" x2="18" y2="18"></line>
                      </svg>
                    </button>
                  </div>
                ) : (
                  <>
                    <div className="flex gap-2">
                      <input
                        type="text"
                        placeholder="Enter code"
                        value={couponCode}
                        onChange={(e) => { setCouponCode(e.target.value.toUpperCase()); setCouponError(null); }}
                        onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); handleApplyCoupon(); } }}
                        className={`${inputClass} flex-1`}
                      />
                      <button
                        type="button"
                        onClick={handleApplyCoupon}
                        disabled={!couponCode.trim() || couponLoading}
                        className="px-4 py-[11px] text-sm font-medium bg-bg-input border border-border rounded-lg text-text-secondary hover:text-text-primary hover:border-accent/60 transition-colors disabled:opacity-40 disabled:cursor-not-allowed whitespace-nowrap"
                      >
                        {couponLoading ? '...' : 'Apply'}
                      </button>
                    </div>
                    {couponError && (
                      <p className="text-negative text-xs mt-1.5">{couponError}</p>
                    )}
                  </>
                )}
              </div>
            )}

            {cardError && (
              <div className="flex items-start gap-2 mb-4 p-3 bg-negative/10 border border-negative/20 rounded-lg">
                <Icons.AlertCircle className="w-4 h-4 text-negative flex-shrink-0 mt-0.5" />
                <p className="text-negative text-sm">{cardError}</p>
              </div>
            )}

            <button
              type="submit"
              disabled={submitting || !cardEl}
              className={`w-full py-3 text-sm font-semibold rounded-lg transition-all disabled:opacity-50 disabled:cursor-not-allowed ${
                isElite
                  ? 'bg-yellow-500 text-black hover:brightness-110'
                  : 'bg-accent text-accent-text hover:brightness-110'
              }`}
            >
              {submitting ? (
                <span className="flex items-center justify-center gap-2">
                  <svg className="w-4 h-4 animate-spin" viewBox="0 0 24 24" fill="none">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"></path>
                  </svg>
                  Processing...
                </span>
              ) : (
                `Subscribe — ${plan.price}/${plan.id.endsWith('_yearly') ? 'yr' : 'mo'}`
              )}
            </button>
          </form>
        </div>

        {/* Powered by Stripe footer */}
        <div className="flex items-center justify-center gap-2 px-6 py-4 border-t border-border flex-shrink-0">
          <Icons.Lock className="w-3.5 h-3.5 text-text-muted" />
          <span className="text-text-muted text-xs">Powered by</span>
          <svg className="h-[14px] text-text-muted" viewBox="0 0 468 222.5" fill="currentColor" aria-label="Stripe">
            <path fillRule="evenodd" clipRule="evenodd" d="M414,113.4c0-25.6-12.4-45.8-36.1-45.8c-23.8,0-38.2,20.2-38.2,45.6c0,30.1,17,45.3,41.4,45.3c11.9,0,20.9-2.7,27.7-6.5v-20c-6.8,3.4-14.6,5.5-24.5,5.5c-9.7,0-18.3-3.4-19.4-15.2h48.9C413.8,121,414,115.8,414,113.4z M364.6,103.9c0-11.3,6.9-16,13.2-16c6.1,0,12.6,4.7,12.6,16H364.6z" />
            <path fillRule="evenodd" clipRule="evenodd" d="M301.1,67.6c-9.8,0-16.1,4.6-19.6,7.8l-1.3-6.2h-22v116.6l25-5.3l0.1-28.3c3.6,2.6,8.9,6.3,17.7,6.3c17.9,0,34.2-14.4,34.2-46.1C335.1,83.4,318.6,67.6,301.1,67.6z M295.1,136.5c-5.9,0-9.4-2.1-11.8-4.7l-0.1-37.1c2.6-2.9,6.2-4.9,11.9-4.9c9.1,0,15.4,10.2,15.4,23.3C310.5,126.5,304.3,136.5,295.1,136.5z" />
            <polygon fillRule="evenodd" clipRule="evenodd" points="223.8,61.7 248.9,56.3 248.9,36 223.8,41.3" />
            <rect fillRule="evenodd" clipRule="evenodd" x="223.8" y="69.3" width="25.1" height="87.5" />
            <path fillRule="evenodd" clipRule="evenodd" d="M196.9,76.7l-1.6-7.4h-21.6v87.5h25V97.5c5.9-7.7,15.9-6.3,19-5.2v-23C214.5,68.1,202.8,65.9,196.9,76.7z" />
            <path fillRule="evenodd" clipRule="evenodd" d="M146.9,47.6l-24.4,5.2l-0.1,80.1c0,14.8,11.1,25.7,25.9,25.7c8.2,0,14.2-1.5,17.5-3.3V135c-3.2,1.3-19,5.9-19-8.9V90.6h19V69.3h-19L146.9,47.6z" />
            <path fillRule="evenodd" clipRule="evenodd" d="M79.3,94.7c0-3.9,3.2-5.4,8.5-5.4c7.6,0,17.2,2.3,24.8,6.4V72.2c-8.3-3.3-16.5-4.6-24.8-4.6C67.5,67.6,54,78.2,54,95.9c0,27.6,38,23.2,38,35.1c0,4.6-4,6.1-9.6,6.1c-8.3,0-18.9-3.4-27.3-8v23.8c9.3,4,18.7,5.7,27.3,5.7c20.8,0,35.1-10.3,35.1-28.2C117.4,100.6,79.3,105.9,79.3,94.7z" />
          </svg>
        </div>
      </div>
    </div>
  );
};

// =====================================================
// APP
// =====================================================
const App = () => {
  const [actionLoading, setActionLoading] = useState(null);
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(false);
  const [canceled, setCanceled] = useState(false);
  const [billing, setBilling] = useState('monthly');
  const [pricing, setPricing] = useState({ pro: '12', elite: '18', proYearly: '120', eliteYearly: '180', plans: {} });
  const [currentPlan, setCurrentPlan] = useState(null);
  const [statusLoading, setStatusLoading] = useState(true);
  const [publishableKey, setPublishableKey] = useState(null);
  const [stripeInstance, setStripeInstance] = useState(null);
  const [checkoutPlan, setCheckoutPlan] = useState(null); // plan object shown in modal

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get('success') === 'true') setSuccess(true);
    if (params.get('canceled') === 'true') setCanceled(true);
  }, []);

  useEffect(() => {
    fetch('/api/pricing').then(r => r.json()).then(setPricing).catch(() => {});
    fetch('/api/stripe/config').then(r => r.json()).then(d => setPublishableKey(d.publishableKey)).catch(() => {});
  }, []);

  useEffect(() => {
    authFetch('/api/subscriptionStatus')
      .then(r => r.json())
      .then(data => setCurrentPlan(data.plan || 'free'))
      .catch(() => setCurrentPlan('free'))
      .finally(() => setStatusLoading(false));
  }, []);

  // Initialize Stripe.js once the publishable key is available
  useEffect(() => {
    if (publishableKey && window.Stripe) {
      setStripeInstance(window.Stripe(publishableKey));
    }
  }, [publishableKey]);

  const handleOpenCheckout = (plan) => {
    setError(null);
    setCheckoutPlan(plan);
  };

  const handleCheckoutSuccess = (planId) => {
    setCheckoutPlan(null);
    setCurrentPlan(planId.replace('_yearly', ''));
    setSuccess(true);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleManageBilling = async () => {
    setActionLoading('billing');
    setError(null);
    try {
      const res = await authFetch('/api/stripe/billing-portal', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || 'Something went wrong.');
        setActionLoading(null);
        return;
      }
      window.location.href = data.url;
    } catch (err) {
      setError('Failed to open billing portal.');
      setActionLoading(null);
    }
  };

  // 'free' (expired trial) and 'trial' both map to the 'trial' card
  const normalizedPlan = !currentPlan ? null : (currentPlan === 'free' ? 'trial' : currentPlan);
  const hasPaidSubscription = normalizedPlan === 'pro' || normalizedPlan === 'elite';

  const planDefs = pricing.plans || {};
  const plans = [
    {
      id: 'trial',
      name: (planDefs.trial && planDefs.trial.name) || 'Trial',
      price: '$0',
      period: '14 days',
      features: (planDefs.trial && planDefs.trial.features) || ['Most Pro features for 14 days', 'Up to 50 trades'],
      style: 'default',
      badge: null,
    },
    {
      id: billing === 'yearly' ? 'pro_yearly' : 'pro',
      name: (planDefs.pro && planDefs.pro.name) || 'Pro',
      price: billing === 'yearly' ? `$${pricing.proYearly}` : `$${pricing.pro}`,
      period: billing === 'yearly' ? '/year' : '/month',
      features: (planDefs.pro && planDefs.pro.features) || ['Unlimited trades', '3 Broker connections', 'CSV Import/Export', 'Strategy & rule tracking', 'Premarket prep', '1 Backtesting session'],
      style: 'accent',
      badge: 'Most Popular',
    },
    {
      id: billing === 'yearly' ? 'elite_yearly' : 'elite',
      name: (planDefs.elite && planDefs.elite.name) || 'Elite',
      price: billing === 'yearly' ? `$${pricing.eliteYearly}` : `$${pricing.elite}`,
      period: billing === 'yearly' ? '/year' : '/month',
      features: (planDefs.elite && planDefs.elite.features) || ['Everything in Pro', 'Attach and annotate screenshots', 'Unlimited brokers', 'Custom themes', 'Unlimited Backtesting'],
      style: 'elite',
      badge: 'Best Value',
    },
  ];

  const getButtonProps = (plan) => {
    const isCurrent = plan.id.replace('_yearly', '') === normalizedPlan;

    if (statusLoading) return { label: '...', disabled: true, action: null };

    if (isCurrent) return { label: 'Current Plan', disabled: true, action: null };

    if (plan.id === 'trial') {
      // Trial card — can't "purchase" trial; paid users can manage via portal
      if (hasPaidSubscription) {
        return {
          label: actionLoading === 'billing' ? 'Redirecting...' : 'Manage Subscription',
          disabled: actionLoading !== null,
          action: handleManageBilling,
        };
      }
      return { label: 'Current Plan', disabled: true, action: null };
    }

    // Paid plan — existing subscriber goes to billing portal
    if (hasPaidSubscription) {
      const label = actionLoading === 'billing'
        ? 'Redirecting...'
        : plan.id.replace('_yearly', '') === 'elite' && normalizedPlan === 'pro'
          ? 'Upgrade to Elite'
          : 'Switch Plan';
      return { label, disabled: actionLoading !== null, action: handleManageBilling };
    }

    // Free user — open custom checkout
    return {
      label: `Get ${plan.name}`,
      disabled: actionLoading !== null || !stripeInstance,
      action: () => handleOpenCheckout(plan),
    };
  };

  return (
    <div className="min-h-screen bg-bg-page">
      {/* Checkout modal */}
      {checkoutPlan && stripeInstance && (
        <CheckoutModal
          plan={checkoutPlan}
          stripeInstance={stripeInstance}
          onClose={() => setCheckoutPlan(null)}
          onSuccess={handleCheckoutSuccess}
        />
      )}

      {/* Header */}
      <header className="border-b border-border bg-bg-surface">
        <div className="max-w-6xl mx-auto px-6 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <img src="/assets/img/logo.svg" alt="RR Metrics" className="w-8 h-8 rounded-md" />
            <span className="text-text-primary font-semibold text-[15px] tracking-[3px] uppercase">RR Metrics</span>
          </div>
          <div className="flex items-center gap-4">
            {hasPaidSubscription && (
              <button
                onClick={handleManageBilling}
                disabled={actionLoading !== null}
                className="flex items-center gap-1.5 text-text-secondary hover:text-text-primary text-sm transition-colors disabled:opacity-50"
              >
                <Icons.Settings className="w-4 h-4" />
                Manage Billing
              </button>
            )}
            <a href="/trades" className="flex items-center gap-2 text-text-secondary hover:text-text-primary text-sm transition-colors">
              <Icons.ArrowLeft className="w-4 h-4" />
              Back to Dashboard
            </a>
          </div>
        </div>
      </header>

      <main className="py-12 px-6">
        <div className="max-w-4xl mx-auto">
          {/* Success banner */}
          {success && (
            <div className="mb-8 p-4 bg-positive/10 border border-positive/30 rounded-lg flex items-center gap-3">
              <Icons.CheckCircle className="w-5 h-5 text-positive flex-shrink-0" />
              <div>
                <p className="text-text-primary font-semibold text-sm">Payment successful!</p>
                <p className="text-text-secondary text-sm">Your subscription is now active. Enjoy your upgraded plan.</p>
              </div>
            </div>
          )}

          {/* Canceled banner */}
          {canceled && !success && (
            <div className="mb-8 p-4 bg-yellow-500/10 border border-yellow-500/30 rounded-lg flex items-center gap-3">
              <Icons.AlertCircle className="w-5 h-5 text-yellow-500 flex-shrink-0" />
              <div>
                <p className="text-text-primary font-semibold text-sm">Payment canceled</p>
                <p className="text-text-secondary text-sm">No charges were made. You can try again whenever you're ready.</p>
              </div>
            </div>
          )}

          {/* Error banner */}
          {error && (
            <div className="mb-8 p-4 bg-negative/10 border border-negative/30 rounded-lg flex items-center gap-3">
              <Icons.AlertCircle className="w-5 h-5 text-negative flex-shrink-0" />
              <p className="text-text-primary text-sm">{error}</p>
            </div>
          )}

          <div className="text-center mb-10">
            <h1 className="text-3xl font-bold text-text-primary">
              {hasPaidSubscription ? 'Your Plan' : 'Upgrade Your Plan'}
            </h1>
            <p className="text-text-secondary mt-2">
              {hasPaidSubscription
                ? `You're on the ${normalizedPlan.charAt(0).toUpperCase() + normalizedPlan.slice(1)} plan.`
                : normalizedPlan === 'trial' && currentPlan === 'trial'
                  ? 'You\'re on your free trial. Upgrade anytime to keep unlimited access.'
                  : currentPlan === 'free'
                    ? 'Your trial has ended. Choose a plan to continue.'
                    : 'Choose the plan that fits your trading style.'}
            </p>
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
                billing === 'yearly' ? 'bg-white/20 text-white' : 'bg-positive/15 text-positive'
              }`}>
                Save 2 months
              </span>
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {plans.map(plan => {
              const isCurrent = plan.id.replace('_yearly', '') === normalizedPlan;
              const isElite = plan.style === 'elite';
              const isAccent = plan.style === 'accent';
              const btn = getButtonProps(plan);

              return (
                <div
                  key={plan.id}
                  className={`relative bg-bg-surface rounded-xl p-6 flex flex-col transition-all ${
                    isCurrent
                      ? isElite
                        ? 'border-2 border-yellow-500/70 shadow-lg shadow-yellow-500/10'
                        : isAccent
                          ? 'border-2 border-accent shadow-lg shadow-accent/10'
                          : 'border-2 border-border'
                      : isElite
                        ? 'border border-yellow-500/30 hover:border-yellow-500/60'
                        : isAccent
                          ? 'border-2 border-accent/60 hover:border-accent'
                          : 'border border-border'
                  }`}
                >
                  {/* Badge */}
                  {plan.badge && (
                    <div className={`absolute -top-3 left-1/2 -translate-x-1/2 px-3 py-1 text-xs font-bold rounded-full whitespace-nowrap ${
                      isElite ? 'bg-yellow-500 text-black' : 'bg-accent text-accent-text'
                    }`}>
                      {isCurrent ? 'Active' : plan.badge}
                    </div>
                  )}
                  {isCurrent && plan.id === 'trial' && (
                    <div className="absolute -top-3 left-1/2 -translate-x-1/2 px-3 py-1 bg-bg-input border border-border text-text-secondary text-xs font-bold rounded-full">
                      Active
                    </div>
                  )}

                  <div className="flex items-start justify-between mb-1">
                    <h3 className={`font-semibold text-lg ${isElite ? 'text-yellow-400' : 'text-text-primary'}`}>
                      {plan.name}
                    </h3>
                    {isElite && <Icons.Zap className="w-4 h-4 text-yellow-400 mt-0.5" />}
                  </div>

                  <div className="mt-3 mb-6">
                    <span className="text-text-primary font-mono text-4xl font-bold">{plan.price}</span>
                    <span className="text-text-tertiary text-sm ml-1">{plan.period}</span>
                  </div>

                  <ul className="space-y-3 flex-1">
                    {plan.features.map(feature => (
                      <li key={feature} className="flex items-start gap-2 text-sm text-text-secondary">
                        <Icons.Check className={`w-4 h-4 flex-shrink-0 mt-0.5 ${isElite ? 'text-yellow-400' : 'text-accent'}`} />
                        {feature}
                      </li>
                    ))}
                  </ul>

                  <button
                    onClick={btn.action || undefined}
                    disabled={btn.disabled}
                    className={`mt-6 w-full py-2.5 text-sm font-semibold rounded-lg transition-all disabled:opacity-40 disabled:cursor-not-allowed ${
                      isCurrent || plan.id === 'free'
                        ? 'bg-bg-input border border-border text-text-secondary hover:text-text-primary hover:border-accent'
                        : isElite
                          ? 'bg-yellow-500 text-black hover:brightness-110'
                          : 'bg-accent text-accent-text hover:brightness-110'
                    }`}
                  >
                    {btn.label}
                  </button>
                </div>
              );
            })}
          </div>

          <p className="text-center text-text-muted text-xs mt-8">
            {hasPaidSubscription
              ? 'Manage, upgrade, or cancel your subscription via the billing portal.'
              : 'Cancel anytime — your membership stays active until the end of your billing period. Email us at support@rrmetrics.com for any questions.'}
          </p>
        </div>
      </main>
    </div>
  );
};

const init = async () => {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) {
    window.location = '/login';
    return;
  }
  const root = createRoot(document.getElementById('content'));
  root.render(<App />);
};

window.onload = init;
