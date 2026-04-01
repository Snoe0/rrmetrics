const React = require('react');
const { useState, useEffect, useRef, useCallback } = React;
const { createRoot } = require('react-dom/client');
const { authFetch, supabase } = require('./helper.js');
const { CreditCardForm } = require('./components/ui/credit-card-form.jsx');
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
// CHECKOUT MODAL (2-step: Discounts → Payment)
// =====================================================
const CheckoutModal = ({ plan, stripeInstance, onClose, onSuccess }) => {
  // --- Step state ---
  const [step, setStep] = useState(1);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);
  const [paymentMethod, setPaymentMethod] = useState('card'); // 'card' | 'express'

  // --- Discount state ---
  const [couponCode, setCouponCode] = useState('');
  const [appliedCoupon, setAppliedCoupon] = useState(null);
  const [couponError, setCouponError] = useState(null);
  const [couponLoading, setCouponLoading] = useState(false);
  const [referralCode, setReferralCode] = useState('');
  const [appliedReferral, setAppliedReferral] = useState(false);
  const [referralChecking, setReferralChecking] = useState(true);
  const [referralError, setReferralError] = useState(null);
  const [referralLoading, setReferralLoading] = useState(false);

  // --- Card form state (Stripe Elements) ---
  const [cardData, setCardData] = useState(null);
  const handleCardChange = useCallback((data) => {
    setCardData(data);
  }, []);

  // --- Billing state ---
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [addressLine1, setAddressLine1] = useState('');
  const [city, setCity] = useState('');
  const [stateProvince, setStateProvince] = useState('');
  const [postalCode, setPostalCode] = useState('');
  const [country, setCountry] = useState('US');

  // --- Express checkout state ---
  const expressRef = useRef(null);
  const [expressReady, setExpressReady] = useState(false);
  const elementsRef = useRef(null);
  const expressElRef = useRef(null);

  // --- Computed pricing ---
  const isElite = plan.style === 'elite';
  const rawPrice = parseFloat(plan.price.replace('$', ''));
  const period = plan.id.endsWith('_yearly') ? '/yr' : '/mo';
  const fmt = (n) => Number.isInteger(n) ? `$${n}` : `$${n.toFixed(2)}`;

  // Coupon takes priority over referral
  let discountAmount = 0;
  let discountLabel = '';
  if (appliedCoupon) {
    if (appliedCoupon.percentOff) discountAmount = rawPrice * appliedCoupon.percentOff / 100;
    else if (appliedCoupon.amountOff) discountAmount = appliedCoupon.amountOff / 100;
    discountLabel = appliedCoupon.display;
  } else if (appliedReferral) {
    discountAmount = rawPrice * 0.15;
    discountLabel = '15% referral discount';
  }
  const finalPrice = Math.max(0, rawPrice - discountAmount);
  const finalCents = Math.round(finalPrice * 100);

  // Determine what discount params to send to the server
  const getDiscountParams = () => ({
    promoCodeId: appliedCoupon && !appliedCoupon.isCouponId ? appliedCoupon.id : null,
    couponId: appliedCoupon?.isCouponId ? appliedCoupon.id : null,
    hasReferral: !appliedCoupon && appliedReferral,
  });

  // --- Effects ---

  // Close on Escape
  useEffect(() => {
    const handleKey = (e) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [onClose]);

  // Check DB for existing referral on mount
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

  // Mount Express Checkout Element when entering step 2
  useEffect(() => {
    if (step !== 2 || !stripeInstance || !expressRef.current || finalCents <= 0) return;

    const elements = stripeInstance.elements({
      mode: 'subscription',
      amount: finalCents,
      currency: 'usd',
    });
    elementsRef.current = elements;

    const expressEl = elements.create('expressCheckout', {
      buttonType: { applePay: 'subscribe', googlePay: 'subscribe' },
      paymentMethods: { amazonPay: 'never' },
    });
    expressElRef.current = expressEl;
    expressEl.mount(expressRef.current);

    expressEl.on('ready', ({ availablePaymentMethods }) => {
      if (availablePaymentMethods) setExpressReady(true);
    });

    expressEl.on('confirm', async () => {
      setSubmitting(true);
      setError(null);
      try {
        const { error: submitError } = await elements.submit();
        if (submitError) { setError(submitError.message); setSubmitting(false); return; }

        // Create subscription with discount already locked in from step 1
        const res = await authFetch('/api/stripe/create-subscription', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ plan: plan.id, ...getDiscountParams() }),
        });
        const data = await res.json();
        if (!res.ok) { setError(data.error || 'Something went wrong.'); setSubmitting(false); return; }

        if (data.status === 'complete') { onSuccess(plan.id); return; }

        const { error: confirmError } = await stripeInstance.confirmPayment({
          elements,
          clientSecret: data.clientSecret,
          confirmParams: { return_url: window.location.href },
          redirect: 'if_required',
        });
        if (confirmError) { setError(confirmError.message); setSubmitting(false); return; }

        await authFetch('/api/stripe/confirm-subscription', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ subscriptionId: data.subscriptionId }),
        });
        onSuccess(plan.id);
      } catch {
        setError('Payment failed. Please try again.');
        setSubmitting(false);
      }
    });

    return () => {
      try { expressElRef.current?.unmount(); } catch {}
      expressElRef.current = null;
      elementsRef.current = null;
      setExpressReady(false);
    };
  }, [step, stripeInstance, finalCents]);

  // --- Handlers ---

  const handleApplyCoupon = async () => {
    const code = couponCode.trim();
    if (!code) return;
    setCouponLoading(true);
    setCouponError(null);
    try {
      const res = await authFetch(`/api/stripe/validate-coupon?code=${encodeURIComponent(code)}`);
      let data;
      try { data = await res.json(); } catch {
        setCouponError('Unexpected server response.'); return;
      }
      if (!res.ok) {
        setCouponError(data.error || 'Invalid coupon code.');
      } else {
        setAppliedCoupon(data);
        setCouponCode('');
      }
    } catch (err) {
      setCouponError(err?.message || 'Network error.');
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
      if (!res.ok) setReferralError(data.error || 'Invalid referral code.');
      else { setAppliedReferral(true); setReferralCode(''); }
    } catch {
      setReferralError('Failed to apply referral code.');
    } finally {
      setReferralLoading(false);
    }
  };

  const handleCardSubmit = async (e) => {
    e.preventDefault();
    if (!cardData?.complete || !cardData?.cardNumberElement || submitting) return;
    setSubmitting(true);
    setError(null);

    const billingDetails = {
      name: fullName || cardData.holder,
      email,
      address: { line1: addressLine1, city, state: stateProvince, postal_code: postalCode, country },
    };

    try {
      // 1. Create PaymentMethod client-side via Stripe.js (PCI compliant)
      const { paymentMethod: pm, error: pmError } = await stripeInstance.createPaymentMethod({
        type: 'card',
        card: cardData.cardNumberElement,
        billing_details: billingDetails,
      });
      if (pmError) { setError(pmError.message); setSubmitting(false); return; }
      const pmId = pm.id;

      // 2. Create subscription with locked-in discounts
      const res = await authFetch('/api/stripe/create-subscription', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ plan: plan.id, ...getDiscountParams() }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error || 'Something went wrong.'); setSubmitting(false); return; }

      // 3a. $0 invoice — save card for future billing
      if (data.status === 'complete') {
        if (data.setupIntentSecret) {
          const { error: setupErr } = await stripeInstance.confirmCardSetup(
            data.setupIntentSecret, { payment_method: pmId }
          );
          if (setupErr) { setError(setupErr.message); setSubmitting(false); return; }
          await authFetch('/api/stripe/confirm-payment-method', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ paymentMethodId: pmId }),
          });
        }
        onSuccess(plan.id);
        return;
      }

      // 3b. Payment required — confirm with card
      const { error: confirmErr, paymentIntent } = await stripeInstance.confirmPayment({
        clientSecret: data.clientSecret,
        confirmParams: { payment_method: pmId, return_url: window.location.href },
        redirect: 'if_required',
      });
      if (confirmErr) { setError(confirmErr.message); setSubmitting(false); return; }

      if (paymentIntent?.status === 'succeeded') {
        await authFetch('/api/stripe/confirm-subscription', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ subscriptionId: data.subscriptionId }),
        });
        onSuccess(plan.id);
      }
    } catch {
      setError('Payment failed. Please try again.');
      setSubmitting(false);
    }
  };

  // --- Shared styles ---
  const inputClass = 'w-full bg-bg-input border border-border rounded-lg px-3 py-[11px] text-text-primary text-sm placeholder:text-text-tertiary focus:outline-none focus:border-accent/60 transition-colors';
  const labelClass = 'text-text-secondary text-xs font-medium uppercase tracking-wider block mb-1.5';
  const accentBtn = isElite ? 'bg-yellow-500 text-black hover:brightness-110' : 'bg-accent text-accent-text hover:brightness-110';

  // --- Render ---
  return (
    <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div className="bg-bg-surface border border-border rounded-xl w-full max-w-md shadow-2xl max-h-[90vh] flex flex-col" onClick={(e) => e.stopPropagation()}>

        {/* Header */}
        <div className="flex items-center justify-between px-6 pt-6 pb-5 border-b border-border flex-shrink-0">
          <div className="flex items-center gap-3">
            {step === 2 && (
              <button onClick={() => { setStep(1); setError(null); }} className="text-text-tertiary hover:text-text-primary transition-colors w-8 h-8 flex items-center justify-center rounded-lg hover:bg-bg-input" aria-label="Back">
                <Icons.ArrowLeft className="w-4 h-4" />
              </button>
            )}
            <div>
              <h2 className="text-text-primary font-semibold text-lg">
                {step === 1 ? `Subscribe to ${plan.name}` : 'Payment'}
              </h2>
              <p className="text-text-secondary text-sm mt-0.5">
                {step === 1 ? 'Apply discounts before checkout' : `${plan.name} — ${fmt(finalPrice)}${period}`}
              </p>
            </div>
          </div>
          <button onClick={onClose} className="text-text-tertiary hover:text-text-primary transition-colors w-8 h-8 flex items-center justify-center rounded-lg hover:bg-bg-input" aria-label="Close">
            <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
          </button>
        </div>

        {/* Body */}
        <div className="px-6 py-5 overflow-y-auto flex-1">

          {/* =================== STEP 1: DISCOUNTS =================== */}
          {step === 1 && (
            <>
              {/* Plan summary */}
              <div className={`rounded-lg p-4 mb-5 border ${isElite ? 'border-yellow-500/30 bg-yellow-500/5' : 'border-accent/30 bg-accent/5'}`}>
                <div className="flex items-center justify-between">
                  <div>
                    <p className={`font-semibold text-sm ${isElite ? 'text-yellow-400' : 'text-accent'}`}>{plan.name}</p>
                    <p className="text-text-secondary text-xs mt-0.5">{plan.id.endsWith('_yearly') ? 'Billed annually' : 'Billed monthly'} · Cancel anytime</p>
                  </div>
                  <div className="text-right">
                    <span className="text-text-primary font-mono font-bold text-2xl">{plan.price}</span>
                    <span className="text-text-tertiary text-xs">{period}</span>
                  </div>
                </div>
              </div>

              {/* Coupon code (first — takes priority) */}
              <div className="mb-4">
                <label className={labelClass}>Discount Code</label>
                {appliedCoupon ? (
                  <div className="flex items-center justify-between bg-positive/10 border border-positive/30 rounded-lg px-3 py-2.5">
                    <div className="flex items-center gap-2">
                      <Icons.Check className="w-4 h-4 text-positive flex-shrink-0" />
                      <span className="text-positive text-sm font-medium">{appliedCoupon.display}</span>
                    </div>
                    <button type="button" onClick={() => setAppliedCoupon(null)} className="text-text-tertiary hover:text-text-primary transition-colors ml-2" aria-label="Remove coupon">
                      <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
                    </button>
                  </div>
                ) : (
                  <>
                    <div className="flex gap-2">
                      <input
                        type="text" placeholder="Enter coupon code" value={couponCode}
                        onChange={(e) => { setCouponCode(e.target.value); setCouponError(null); }}
                        onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); handleApplyCoupon(); } }}
                        className={`${inputClass} flex-1`}
                      />
                      <button type="button" onClick={handleApplyCoupon} disabled={!couponCode.trim() || couponLoading}
                        className="px-4 py-[11px] text-sm font-medium bg-bg-input border border-border rounded-lg text-text-secondary hover:text-text-primary hover:border-accent/60 transition-colors disabled:opacity-40 disabled:cursor-not-allowed whitespace-nowrap">
                        {couponLoading ? '...' : 'Apply'}
                      </button>
                    </div>
                    {couponError && <p className="text-negative text-xs mt-1.5">{couponError}</p>}
                  </>
                )}
              </div>

              {/* Referral code (only visible if no coupon applied — coupon overrides) */}
              {!appliedCoupon && (
                referralChecking ? null : !appliedReferral ? (
                  <div className="mb-4">
                    <label className={labelClass}>
                      Referral Code
                      <span className="ml-2 normal-case text-positive font-normal text-[11px]">15% off your first month!</span>
                    </label>
                    <div className="flex gap-2">
                      <input
                        type="text" placeholder="RRM-XXXXXX" value={referralCode}
                        onChange={(e) => { setReferralCode(e.target.value.toUpperCase()); setReferralError(null); }}
                        onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); handleApplyReferral(); } }}
                        className={`${inputClass} flex-1 font-mono`}
                      />
                      <button type="button" onClick={handleApplyReferral} disabled={!referralCode.trim() || referralLoading}
                        className="px-4 py-[11px] text-sm font-medium bg-bg-input border border-border rounded-lg text-text-secondary hover:text-text-primary hover:border-accent/60 transition-colors disabled:opacity-40 disabled:cursor-not-allowed whitespace-nowrap">
                        {referralLoading ? '...' : 'Apply'}
                      </button>
                    </div>
                    {referralError && <p className="text-negative text-xs mt-1.5">{referralError}</p>}
                  </div>
                ) : (
                  <div className="mb-4">
                    <label className={labelClass}>Referral Code</label>
                    <div className="flex items-center gap-2 bg-positive/10 border border-positive/30 rounded-lg px-3 py-2.5">
                      <Icons.Check className="w-4 h-4 text-positive flex-shrink-0" />
                      <span className="text-positive text-sm font-medium">15% referral discount applied</span>
                    </div>
                  </div>
                )
              )}

              {/* If coupon applied, show referral as overridden */}
              {appliedCoupon && appliedReferral && (
                <p className="text-text-tertiary text-xs mb-4">Referral discount not combined — coupon code takes priority.</p>
              )}

              {/* Cost breakdown */}
              <div className="mb-5 rounded-lg border border-border divide-y divide-border text-sm overflow-hidden">
                <div className="flex justify-between items-center px-3 py-2.5 text-text-secondary">
                  <span>{plan.name}</span>
                  <span className="font-mono">{plan.price}{period}</span>
                </div>
                {discountAmount > 0 && (
                  <div className="flex justify-between items-center px-3 py-2.5 text-positive">
                    <span>{discountLabel}</span>
                    <span className="font-mono">-{fmt(discountAmount)}</span>
                  </div>
                )}
                <div className="flex justify-between items-center px-3 py-2.5 text-text-primary font-semibold bg-bg-input/30">
                  <span>Total</span>
                  <span className="font-mono text-lg">{fmt(finalPrice)}{period}</span>
                </div>
              </div>

              <button type="button" onClick={() => setStep(2)} className={`w-full py-3 text-sm font-semibold rounded-lg transition-all ${accentBtn}`}>
                Continue to Payment
              </button>
            </>
          )}

          {/* =================== STEP 2: PAYMENT =================== */}
          {step === 2 && (
            <>
              {/* Compact price badge */}
              <div className="flex items-center justify-between mb-5 px-3 py-2.5 rounded-lg border border-border text-sm">
                <div className="flex items-center gap-2">
                  <span className="text-text-secondary">{plan.name}</span>
                  {discountAmount > 0 && (
                    <span className="text-positive text-xs bg-positive/10 px-1.5 py-0.5 rounded">{discountLabel}</span>
                  )}
                </div>
                <span className="text-text-primary font-mono font-bold">{fmt(finalPrice)}{period}</span>
              </div>

              {/* Express Checkout (Link, Apple Pay, Google Pay — no Amazon Pay) */}
              <div ref={expressRef} className={`transition-all ${expressReady ? 'mb-0' : 'h-0 overflow-hidden'}`} />
              {expressReady && (
                <div className="flex items-center gap-3 my-4">
                  <div className="flex-1 border-t border-border" />
                  <span className="text-text-tertiary text-xs uppercase tracking-wider">or pay with card</span>
                  <div className="flex-1 border-t border-border" />
                </div>
              )}

              {/* Card payment form */}
              <form onSubmit={handleCardSubmit}>
                <div className="mb-4">
                  <label className={labelClass}>Full name</label>
                  <input type="text" required placeholder="Jane Smith" value={fullName} onChange={(e) => setFullName(e.target.value)} className={inputClass} autoComplete="name" />
                </div>

                <div className="mb-4">
                  <label className={labelClass}>Email</label>
                  <input type="email" required placeholder="jane@example.com" value={email} onChange={(e) => setEmail(e.target.value)} className={inputClass} autoComplete="email" />
                </div>

                <div className="mb-4">
                  <CreditCardForm stripeInstance={stripeInstance} defaultHolder={fullName} onChange={handleCardChange} />
                </div>

                <div className="mb-4">
                  <label className={labelClass}>Billing address</label>
                  <input type="text" required placeholder="Address line 1" value={addressLine1} onChange={(e) => setAddressLine1(e.target.value)} className={`${inputClass} mb-2`} autoComplete="address-line1" />
                  <div className="grid grid-cols-2 gap-2 mb-2">
                    <input type="text" required placeholder="City" value={city} onChange={(e) => setCity(e.target.value)} className={inputClass} autoComplete="address-level2" />
                    <input type="text" required placeholder="State / Province" value={stateProvince} onChange={(e) => setStateProvince(e.target.value)} className={inputClass} autoComplete="address-level1" />
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <input type="text" required placeholder="ZIP / Postal code" value={postalCode} onChange={(e) => setPostalCode(e.target.value)} className={inputClass} autoComplete="postal-code" />
                    <select value={country} onChange={(e) => setCountry(e.target.value)} className={`${inputClass} cursor-pointer`} autoComplete="country">
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

                {error && (
                  <div className="flex items-start gap-2 mb-4 p-3 bg-negative/10 border border-negative/20 rounded-lg">
                    <Icons.AlertCircle className="w-4 h-4 text-negative flex-shrink-0 mt-0.5" />
                    <p className="text-negative text-sm">{error}</p>
                  </div>
                )}

                <button type="submit" disabled={submitting || !cardData?.complete}
                  className={`w-full py-3 text-sm font-semibold rounded-lg transition-all disabled:opacity-50 disabled:cursor-not-allowed ${accentBtn}`}>
                  {submitting ? (
                    <span className="flex items-center justify-center gap-2">
                      <svg className="w-4 h-4 animate-spin" viewBox="0 0 24 24" fill="none"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/></svg>
                      Processing...
                    </span>
                  ) : `Subscribe — ${fmt(finalPrice)}${period}`}
                </button>
              </form>
            </>
          )}
        </div>

        {/* Stripe footer */}
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
// SUBSCRIPTION MANAGER
// =====================================================
const CARD_BRANDS = {
  visa: 'Visa',
  mastercard: 'Mastercard',
  amex: 'American Express',
  discover: 'Discover',
  diners: 'Diners Club',
  jcb: 'JCB',
  unionpay: 'UnionPay',
};

const CANCEL_REASONS = [
  'Too expensive',
  'Not using it enough',
  'Missing features I need',
  'Switching to another tool',
  'Just testing it out',
  'Other',
];

const SubscriptionManager = ({ stripeInstance, pricing, onPlanChanged }) => {
  const [sub, setSub] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // Change plan
  const [showChangePlan, setShowChangePlan] = useState(false);
  const [selectedPlan, setSelectedPlan] = useState(null);
  const [preview, setPreview] = useState(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [changeLoading, setChangeLoading] = useState(false);
  const [changeError, setChangeError] = useState(null);

  // Cancel
  const [showCancel, setShowCancel] = useState(false);
  const [cancelReason, setCancelReason] = useState('');
  const [cancelFeedback, setCancelFeedback] = useState('');
  const [cancelLoading, setCancelLoading] = useState(false);
  const [cancelError, setCancelError] = useState(null);

  // Resume
  const [resumeLoading, setResumeLoading] = useState(false);

  // Payment method
  const [showPMModal, setShowPMModal] = useState(false);
  const [pmLoading, setPmLoading] = useState(false);
  const [pmError, setPmError] = useState(null);
  const pmCardRef = useRef(null);
  const pmCardElRef = useRef(null);

  // Invoices
  const [invoices, setInvoices] = useState(null);
  const [invoicesLoading, setInvoicesLoading] = useState(false);

  const fetchSubscription = async () => {
    try {
      const res = await authFetch('/api/stripe/subscription');
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to load subscription');
      setSub(data);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchSubscription(); }, []);

  // Mount card element for PM modal
  useEffect(() => {
    if (!showPMModal || !pmCardRef.current || !stripeInstance) return;
    const elements = stripeInstance.elements();
    const card = elements.create('card', { style: CARD_STYLE });
    card.mount(pmCardRef.current);
    pmCardElRef.current = card;
    return () => { card.unmount(); pmCardElRef.current = null; };
  }, [showPMModal, stripeInstance]);

  const formatCurrency = (cents, currency = 'usd') =>
    new Intl.NumberFormat('en-US', { style: 'currency', currency }).format(cents / 100);

  const handlePreview = async (planId) => {
    setSelectedPlan(planId);
    setPreviewLoading(true);
    setPreview(null);
    setChangeError(null);
    try {
      const res = await authFetch('/api/stripe/preview-plan-change', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ newPlan: planId }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to preview changes');
      setPreview(data);
    } catch (err) {
      setChangeError(err.message);
    } finally {
      setPreviewLoading(false);
    }
  };

  const handleChangePlan = async () => {
    if (!selectedPlan) return;
    setChangeLoading(true);
    setChangeError(null);
    try {
      const res = await authFetch('/api/stripe/update-subscription', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ newPlan: selectedPlan }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to change plan');

      // If upgrade requires payment confirmation
      if (data.clientSecret) {
        const { error: confirmError } = await stripeInstance.confirmPayment({
          clientSecret: data.clientSecret,
          confirmParams: { return_url: window.location.href },
          redirect: 'if_required',
        });
        if (confirmError) throw new Error(confirmError.message);
      }

      const newPlan = selectedPlan.replace('_yearly', '');
      onPlanChanged(newPlan);
      setShowChangePlan(false);
      setSelectedPlan(null);
      setPreview(null);
      await fetchSubscription();
    } catch (err) {
      setChangeError(err.message);
    } finally {
      setChangeLoading(false);
    }
  };

  const handleCancel = async () => {
    setCancelLoading(true);
    setCancelError(null);
    try {
      const res = await authFetch('/api/stripe/cancel-subscription', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ feedback: cancelReason, comment: cancelFeedback }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to cancel subscription');
      setShowCancel(false);
      await fetchSubscription();
    } catch (err) {
      setCancelError(err.message);
    } finally {
      setCancelLoading(false);
    }
  };

  const handleResume = async () => {
    setResumeLoading(true);
    try {
      const res = await authFetch('/api/stripe/resume-subscription', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to resume subscription');
      await fetchSubscription();
    } catch (err) {
      setError(err.message);
    } finally {
      setResumeLoading(false);
    }
  };

  const handleUpdatePaymentMethod = async () => {
    if (!pmCardElRef.current) return;
    setPmLoading(true);
    setPmError(null);
    try {
      // Create SetupIntent on server
      const res = await authFetch('/api/stripe/setup-payment-method', { method: 'POST' });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to create setup intent');

      const { setupIntent, error: setupError } = await stripeInstance.confirmCardSetup(data.clientSecret, {
        payment_method: { card: pmCardElRef.current },
      });
      if (setupError) throw new Error(setupError.message);

      // Set the new payment method as default on subscription and customer
      await authFetch('/api/stripe/confirm-payment-method', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ paymentMethodId: setupIntent.payment_method }),
      });

      setShowPMModal(false);
      await fetchSubscription();
    } catch (err) {
      setPmError(err.message);
    } finally {
      setPmLoading(false);
    }
  };

  const handleLoadInvoices = async () => {
    setInvoicesLoading(true);
    try {
      const res = await authFetch('/api/stripe/invoices');
      const data = await res.json();
      if (res.ok) setInvoices(data.invoices || []);
    } catch {
      // silent
    } finally {
      setInvoicesLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16">
        <svg className="w-6 h-6 animate-spin text-text-tertiary" viewBox="0 0 24 24" fill="none">
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
        </svg>
      </div>
    );
  }

  if (error && !sub) {
    return (
      <div className="p-4 bg-negative/10 border border-negative/20 rounded-lg flex items-center gap-2">
        <Icons.AlertCircle className="w-5 h-5 text-negative flex-shrink-0" />
        <p className="text-negative text-sm">{error}</p>
      </div>
    );
  }

  if (!sub || !sub.subscription) return null;

  const subscription = sub.subscription;
  const paymentMethod = sub.paymentMethod;
  const upcomingInvoice = sub.upcomingInvoice;

  const isElite = subscription.plan === 'elite';
  const planColor = isElite ? 'text-yellow-400' : 'text-accent';
  const planBorderColor = isElite ? 'border-yellow-500/30' : 'border-accent/30';
  const planBgColor = isElite ? 'bg-yellow-500/5' : 'bg-accent/5';

  // Build plan options for change plan section
  const planOptions = [];
  if (subscription.plan !== 'pro' || subscription.billingInterval !== 'month') {
    planOptions.push({ id: 'pro', label: `Pro Monthly — $${pricing.pro}/mo` });
  }
  if (subscription.plan !== 'pro' || subscription.billingInterval !== 'year') {
    planOptions.push({ id: 'pro_yearly', label: `Pro Yearly — $${pricing.proYearly}/yr` });
  }
  if (subscription.plan !== 'elite' || subscription.billingInterval !== 'month') {
    planOptions.push({ id: 'elite', label: `Elite Monthly — $${pricing.elite}/mo` });
  }
  if (subscription.plan !== 'elite' || subscription.billingInterval !== 'year') {
    planOptions.push({ id: 'elite_yearly', label: `Elite Yearly — $${pricing.eliteYearly}/yr` });
  }

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      {/* ── Plan Overview ── */}
      <div className={`bg-bg-surface border ${planBorderColor} rounded-xl p-6`}>
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            {isElite ? <Icons.Zap className="w-5 h-5 text-yellow-400" /> : <Icons.CheckCircle className="w-5 h-5 text-accent" />}
            <h2 className="text-text-primary font-semibold text-lg">
              {subscription.plan.charAt(0).toUpperCase() + subscription.plan.slice(1)} Plan
            </h2>
          </div>
          <span className={`text-xs font-semibold px-2.5 py-1 rounded-full ${
            subscription.cancelAtPeriodEnd
              ? 'bg-yellow-500/15 text-yellow-500'
              : subscription.status === 'active'
                ? 'bg-positive/15 text-positive'
                : 'bg-negative/15 text-negative'
          }`}>
            {subscription.cancelAtPeriodEnd ? 'Canceling' : subscription.status === 'active' ? 'Active' : subscription.status}
          </span>
        </div>

        <div className="grid grid-cols-2 gap-4 text-sm">
          <div>
            <p className="text-text-tertiary text-xs uppercase tracking-wider mb-1">Billing</p>
            <p className="text-text-primary">{subscription.billingInterval === 'year' ? 'Yearly' : 'Monthly'}</p>
          </div>
          <div>
            <p className="text-text-tertiary text-xs uppercase tracking-wider mb-1">Amount</p>
            <p className="text-text-primary font-mono">
              {upcomingInvoice ? `${formatCurrency(upcomingInvoice.amountDue, upcomingInvoice.currency)}/${subscription.billingInterval === 'year' ? 'yr' : 'mo'}` : '—'}
            </p>
          </div>
          <div>
            <p className="text-text-tertiary text-xs uppercase tracking-wider mb-1">
              {subscription.cancelAtPeriodEnd ? 'Access Until' : 'Next Billing'}
            </p>
            <p className="text-text-primary">
              {subscription.currentPeriodEnd ? new Date(subscription.currentPeriodEnd * 1000).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' }) : '—'}
            </p>
          </div>
        </div>

        {subscription.cancelAtPeriodEnd && (
          <div className="mt-4 p-3 bg-yellow-500/10 border border-yellow-500/20 rounded-lg flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Icons.AlertCircle className="w-4 h-4 text-yellow-500 flex-shrink-0" />
              <p className="text-text-secondary text-sm">Your plan will end at the end of the billing period.</p>
            </div>
            <button
              onClick={handleResume}
              disabled={resumeLoading}
              className="px-3 py-1.5 text-xs font-semibold bg-accent text-accent-text rounded-lg hover:brightness-110 transition-all disabled:opacity-50"
            >
              {resumeLoading ? 'Resuming...' : 'Resume'}
            </button>
          </div>
        )}
      </div>

      {/* ── Change Plan ── */}
      {!subscription.cancelAtPeriodEnd && planOptions.length > 0 && (
        <div className="bg-bg-surface border border-border rounded-xl overflow-hidden">
          <button
            onClick={() => { setShowChangePlan(!showChangePlan); setSelectedPlan(null); setPreview(null); setChangeError(null); }}
            className="w-full flex items-center justify-between px-6 py-4 text-left hover:bg-bg-input/50 transition-colors"
          >
            <span className="text-text-primary font-medium text-sm">Change Plan</span>
            <svg className={`w-4 h-4 text-text-tertiary transition-transform ${showChangePlan ? 'rotate-180' : ''}`} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <polyline points="6 9 12 15 18 9" />
            </svg>
          </button>
          {showChangePlan && (
            <div className="px-6 pb-5 border-t border-border pt-4 space-y-3">
              {planOptions.map(opt => (
                <button
                  key={opt.id}
                  onClick={() => handlePreview(opt.id)}
                  className={`w-full text-left px-4 py-3 rounded-lg border text-sm transition-colors ${
                    selectedPlan === opt.id
                      ? 'border-accent bg-accent/10 text-text-primary'
                      : 'border-border hover:border-accent/40 text-text-secondary hover:text-text-primary'
                  }`}
                >
                  {opt.label}
                </button>
              ))}

              {previewLoading && (
                <div className="flex items-center justify-center py-3">
                  <svg className="w-5 h-5 animate-spin text-text-tertiary" viewBox="0 0 24 24" fill="none">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                  </svg>
                </div>
              )}

              {preview && (
                <div className="rounded-lg border border-border divide-y divide-border text-sm overflow-hidden">
                  {preview.immediateCharge != null && (
                    <div className="flex justify-between items-center px-3 py-2">
                      <span className="text-text-secondary">Due now (prorated)</span>
                      <span className="text-text-primary font-mono">{formatCurrency(preview.immediateCharge, preview.currency)}</span>
                    </div>
                  )}
                  {preview.credit != null && preview.credit > 0 && (
                    <div className="flex justify-between items-center px-3 py-2">
                      <span className="text-text-secondary">Credit applied</span>
                      <span className="text-positive font-mono">-{formatCurrency(preview.credit, preview.currency)}</span>
                    </div>
                  )}
                  <div className="flex justify-between items-center px-3 py-2">
                    <span className="text-text-secondary">New recurring price</span>
                    <span className="text-text-primary font-mono font-semibold">{formatCurrency(preview.newAmount, preview.currency)}/{preview.interval === 'year' ? 'yr' : 'mo'}</span>
                  </div>
                </div>
              )}

              {changeError && (
                <div className="flex items-start gap-2 p-3 bg-negative/10 border border-negative/20 rounded-lg">
                  <Icons.AlertCircle className="w-4 h-4 text-negative flex-shrink-0 mt-0.5" />
                  <p className="text-negative text-sm">{changeError}</p>
                </div>
              )}

              {preview && (
                <button
                  onClick={handleChangePlan}
                  disabled={changeLoading}
                  className="w-full py-2.5 text-sm font-semibold rounded-lg bg-accent text-accent-text hover:brightness-110 transition-all disabled:opacity-50"
                >
                  {changeLoading ? 'Updating...' : 'Confirm Change'}
                </button>
              )}
            </div>
          )}
        </div>
      )}

      {/* ── Payment Method ── */}
      <div className="bg-bg-surface border border-border rounded-xl px-6 py-5">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-text-primary font-medium text-sm mb-1">Payment Method</p>
            {paymentMethod ? (
              <div>
                <p className="text-text-secondary text-sm">
                  {CARD_BRANDS[paymentMethod.brand] || paymentMethod.brand} ending in {paymentMethod.last4}
                  {paymentMethod.expMonth && (
                    <span className="text-text-tertiary ml-2">
                      Exp {String(paymentMethod.expMonth).padStart(2, '0')}/{paymentMethod.expYear}
                    </span>
                  )}
                </p>
                {paymentMethod.isExpired && (
                  <span className="inline-flex items-center gap-1 mt-1 px-2 py-0.5 text-xs font-semibold rounded-full bg-negative/15 text-negative">
                    <Icons.AlertCircle className="w-3 h-3" /> Expired
                  </span>
                )}
              </div>
            ) : (
              <p className="text-text-tertiary text-sm">No payment method on file</p>
            )}
          </div>
          <button
            onClick={() => { setShowPMModal(true); setPmError(null); }}
            className="px-3 py-1.5 text-xs font-medium border border-border rounded-lg text-text-secondary hover:text-text-primary hover:border-accent/60 transition-colors"
          >
            Update
          </button>
        </div>
      </div>

      {/* Payment Method Modal */}
      {showPMModal && (
        <div
          className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-50 p-4"
          onClick={() => setShowPMModal(false)}
        >
          <div
            className="bg-bg-surface border border-border rounded-xl w-full max-w-md shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between px-6 pt-6 pb-4 border-b border-border">
              <h3 className="text-text-primary font-semibold">Update Payment Method</h3>
              <button
                onClick={() => setShowPMModal(false)}
                className="text-text-tertiary hover:text-text-primary transition-colors w-8 h-8 flex items-center justify-center rounded-lg hover:bg-bg-input"
              >
                <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
                </svg>
              </button>
            </div>
            <div className="px-6 py-5 space-y-4">
              <div
                ref={pmCardRef}
                className="bg-bg-input border border-border rounded-lg px-3 py-[11px] min-h-[42px] transition-colors focus-within:border-accent/60"
              />
              {pmError && (
                <div className="flex items-start gap-2 p-3 bg-negative/10 border border-negative/20 rounded-lg">
                  <Icons.AlertCircle className="w-4 h-4 text-negative flex-shrink-0 mt-0.5" />
                  <p className="text-negative text-sm">{pmError}</p>
                </div>
              )}
              <button
                onClick={handleUpdatePaymentMethod}
                disabled={pmLoading}
                className="w-full py-2.5 text-sm font-semibold rounded-lg bg-accent text-accent-text hover:brightness-110 transition-all disabled:opacity-50"
              >
                {pmLoading ? 'Saving...' : 'Save Card'}
              </button>
            </div>
            <div className="flex items-center justify-center gap-2 px-6 py-3 border-t border-border">
              <Icons.Lock className="w-3.5 h-3.5 text-text-muted" />
              <span className="text-text-muted text-xs">Secured by Stripe</span>
            </div>
          </div>
        </div>
      )}

      {/* ── Cancel Subscription ── */}
      {!subscription.cancelAtPeriodEnd && (
        <div className="bg-bg-surface border border-border rounded-xl overflow-hidden">
          <button
            onClick={() => { setShowCancel(!showCancel); setCancelError(null); }}
            className="w-full flex items-center justify-between px-6 py-4 text-left hover:bg-bg-input/50 transition-colors"
          >
            <span className="text-negative font-medium text-sm">Cancel Subscription</span>
            <svg className={`w-4 h-4 text-text-tertiary transition-transform ${showCancel ? 'rotate-180' : ''}`} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <polyline points="6 9 12 15 18 9" />
            </svg>
          </button>
          {showCancel && (
            <div className="px-6 pb-5 border-t border-border pt-4 space-y-4">
              <p className="text-text-secondary text-sm">
                Your plan will remain active until the end of the current billing period. You won't be charged again.
              </p>
              <div>
                <label className="text-text-tertiary text-xs uppercase tracking-wider block mb-1.5">Reason for canceling</label>
                <select
                  value={cancelReason}
                  onChange={(e) => setCancelReason(e.target.value)}
                  className="w-full bg-bg-input border border-border rounded-lg px-3 py-2.5 text-text-primary text-sm focus:outline-none focus:border-accent/60 transition-colors cursor-pointer"
                >
                  <option value="">Select a reason...</option>
                  {CANCEL_REASONS.map(r => <option key={r} value={r}>{r}</option>)}
                </select>
              </div>
              <div>
                <label className="text-text-tertiary text-xs uppercase tracking-wider block mb-1.5">Additional feedback (optional)</label>
                <textarea
                  value={cancelFeedback}
                  onChange={(e) => setCancelFeedback(e.target.value)}
                  rows={2}
                  placeholder="Tell us how we can improve..."
                  className="w-full bg-bg-input border border-border rounded-lg px-3 py-2.5 text-text-primary text-sm placeholder:text-text-tertiary focus:outline-none focus:border-accent/60 transition-colors resize-none"
                />
              </div>
              {cancelError && (
                <div className="flex items-start gap-2 p-3 bg-negative/10 border border-negative/20 rounded-lg">
                  <Icons.AlertCircle className="w-4 h-4 text-negative flex-shrink-0 mt-0.5" />
                  <p className="text-negative text-sm">{cancelError}</p>
                </div>
              )}
              <button
                onClick={handleCancel}
                disabled={cancelLoading || !cancelReason}
                className="w-full py-2.5 text-sm font-semibold rounded-lg bg-negative/10 border border-negative/30 text-negative hover:bg-negative/20 transition-all disabled:opacity-40 disabled:cursor-not-allowed"
              >
                {cancelLoading ? 'Canceling...' : 'Confirm Cancellation'}
              </button>
            </div>
          )}
        </div>
      )}

      {/* ── Invoice History ── */}
      <div className="bg-bg-surface border border-border rounded-xl px-6 py-5">
        <div className="flex items-center justify-between mb-1">
          <p className="text-text-primary font-medium text-sm">Invoice History</p>
          {!invoices && (
            <button
              onClick={handleLoadInvoices}
              disabled={invoicesLoading}
              className="px-3 py-1.5 text-xs font-medium border border-border rounded-lg text-text-secondary hover:text-text-primary hover:border-accent/60 transition-colors disabled:opacity-50"
            >
              {invoicesLoading ? 'Loading...' : 'View Invoices'}
            </button>
          )}
        </div>
        {invoices && (
          invoices.length === 0 ? (
            <p className="text-text-tertiary text-sm mt-2">No invoices yet.</p>
          ) : (
            <div className="mt-3 divide-y divide-border">
              {invoices.map(inv => (
                <div key={inv.id} className="flex items-center justify-between py-2.5 text-sm">
                  <div>
                    <span className="text-text-primary">
                      {new Date(inv.date * 1000).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                    </span>
                    <span className="text-text-tertiary ml-2">{formatCurrency(inv.amount, inv.currency)}</span>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className={`text-xs px-2 py-0.5 rounded-full ${
                      inv.status === 'paid' ? 'bg-positive/15 text-positive' : 'bg-yellow-500/15 text-yellow-500'
                    }`}>
                      {inv.status}
                    </span>
                    {inv.pdfUrl && (
                      <a
                        href={inv.pdfUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-accent text-xs hover:underline"
                      >
                        PDF
                      </a>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )
        )}
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
  const [billing, setBilling] = useState('yearly');
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
      monthlyEquiv: billing === 'yearly' ? `$${Math.round(pricing.proYearly / 12)}` : null,
      originalMonthly: billing === 'yearly' ? `$${pricing.pro}` : null,
      period: billing === 'yearly' ? '/year' : '/month',
      features: (planDefs.pro && planDefs.pro.features) || ['Unlimited trades', '2 broker connections', 'CSV Import/Export', 'Strategy & rule tracking', 'Premarket prep', '1 Backtesting session'],
      style: 'accent',
      badge: 'Most Popular',
    },
    {
      id: billing === 'yearly' ? 'elite_yearly' : 'elite',
      name: (planDefs.elite && planDefs.elite.name) || 'Elite',
      price: billing === 'yearly' ? `$${pricing.eliteYearly}` : `$${pricing.elite}`,
      monthlyEquiv: billing === 'yearly' ? `$${Math.round(pricing.eliteYearly / 12)}` : null,
      originalMonthly: billing === 'yearly' ? `$${pricing.elite}` : null,
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
      return { label: normalizedPlan === 'trial' ? 'Current Plan' : 'Trial', disabled: true, action: null };
    }

    // Paid user — they use SubscriptionManager instead of buttons
    if (hasPaidSubscription) {
      return { label: 'Current Plan', disabled: true, action: null };
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
                billing === 'yearly' ? 'bg-black/15 text-accent-text' : 'bg-positive/15 text-positive'
              }`}>
                Save 2 months
              </span>
            </button>
          </div>

          {hasPaidSubscription && stripeInstance ? (
            <SubscriptionManager
              stripeInstance={stripeInstance}
              pricing={pricing}
              onPlanChanged={(newPlan) => {
                setCurrentPlan(newPlan);
                setSuccess(true);
                window.scrollTo({ top: 0, behavior: 'smooth' });
              }}
            />
          ) : (
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
          )}

          <p className="text-center text-text-muted text-xs mt-8">
            {hasPaidSubscription
              ? 'Manage your plan, payment method, and billing from this page.'
              : 'Cancel anytime — your membership stays active until the end of your billing period. Email us at info.rrmetrics@gmail.com for any questions.'}
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
