const React = require('react');
const { useState, useEffect, useMemo, useRef } = React;
require('../../styles/credit-card-form.css');

// Card brand SVG logos
const CardLogos = {
  visa: () => (
    <svg xmlns="http://www.w3.org/2000/svg" width="60" height="40" viewBox="0 0 780 500">
      <path d="M293.2 348.7l33.4-195.8h53.4l-33.4 195.8zM540.7 157.3c-10.6-4-27.2-8.3-47.9-8.3-52.8 0-90 26.6-90.2 64.7-.3 28.2 26.5 43.9 46.8 53.3 20.8 9.6 27.8 15.8 27.7 24.4-.1 13.2-16.6 19.2-32 19.2-21.4 0-32.7-3-50.3-10.2l-6.9-3.1-7.5 44c12.5 5.5 35.6 10.2 59.6 10.5 56.2 0 92.6-26.3 93-67-.2-22.3-14-39.3-44.8-53.3-18.6-9.1-30.1-15.1-30-24.3 0-8.1 9.7-16.8 30.6-16.8 17.4-.3 30.1 3.5 39.9 7.5l4.8 2.3 7.2-42.9" fill="#1a1f71"/>
      <path d="M615.4 152.9h-41.3c-12.8 0-22.4 3.5-28 16.3l-79.4 179.5h56.2l11.2-29.4h68.6l6.5 29.4h49.6l-43.4-195.8zm-65.8 126.4c4.4-11.4 21.5-55.2 21.5-55.2-.3.5 4.4-11.5 7.2-18.9l3.6 17.1s10.4 47.2 12.5 57h-44.8z" fill="#1a1f71"/>
      <path d="M232.8 152.9L180.5 287l-5.6-27.1c-9.7-31.2-40-65.1-73.9-82l47.9 170.6h56.6l84.2-195.6h-56.9" fill="#1a1f71"/>
      <path d="M131.9 152.9H46.5l-.7 4c67.2 16.3 111.7 55.5 130.1 102.7L157.5 170c-3.2-12.5-12.6-16.5-25.6-17.1" fill="#f7a600"/>
    </svg>
  ),
  mastercard: () => (
    <svg xmlns="http://www.w3.org/2000/svg" height="40" width="60" viewBox="-96 -98.908 832 593.448">
      <path fill="#ff5f00" d="M224.833 42.298h190.416v311.005H224.833z" />
      <path d="M244.446 197.828a197.448 197.448 0 0175.54-155.475 197.777 197.777 0 100 311.004 197.448 197.448 0 01-75.54-155.53z" fill="#eb001b" />
      <path d="M621.101 320.394v-6.372h2.747v-1.319h-6.537v1.319h2.582v6.373zm12.691 0v-7.69h-1.978l-2.307 5.493-2.308-5.494h-1.977v7.691h1.428v-5.823l2.143 5h1.483l2.143-5v5.823z" fill="#f79e1b" />
      <path d="M640 197.828a197.777 197.777 0 01-320.015 155.474 197.777 197.777 0 000-311.004A197.777 197.777 0 01640 197.773z" fill="#f79e1b" />
    </svg>
  ),
  amex: () => (
    <svg xmlns="http://www.w3.org/2000/svg" width="60" height="40" viewBox="0 0 780 500">
      <rect width="780" height="500" rx="40" fill="#2557D6"/>
      <text x="390" y="280" textAnchor="middle" fill="#fff" fontFamily="Arial,sans-serif" fontWeight="bold" fontSize="120">AMEX</text>
    </svg>
  ),
  discover: () => (
    <svg xmlns="http://www.w3.org/2000/svg" width="60" height="40" viewBox="0 0 780 500">
      <rect width="780" height="500" rx="40" fill="#f1f1f1"/>
      <circle cx="500" cy="250" r="100" fill="#f76e11"/>
      <text x="280" y="290" fill="#1a1a2e" fontFamily="Arial,sans-serif" fontWeight="bold" fontSize="100">D</text>
    </svg>
  ),
};

const GenericCardLogo = () => (
  <svg xmlns="http://www.w3.org/2000/svg" width="60" height="40" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.4)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
    <rect x="1" y="4" width="22" height="16" rx="2" ry="2"/>
    <line x1="1" y1="10" x2="23" y2="10"/>
  </svg>
);

// Stripe Element style — white text on transparent background
const ELEMENT_STYLE = {
  base: {
    color: '#ffffff',
    fontSize: '16px',
    fontFamily: '"JetBrains Mono", "SF Mono", "Fira Code", monospace',
    fontSmoothing: 'antialiased',
    '::placeholder': { color: 'rgba(255,255,255,0.25)' },
  },
  invalid: { color: '#ef4444' },
};

const NUMBER_STYLE = {
  ...ELEMENT_STYLE,
  base: { ...ELEMENT_STYLE.base, fontSize: '20px', letterSpacing: '2px' },
};

/**
 * CreditCardForm — uses Stripe Elements (cardNumber, cardExpiry, cardCvc)
 * mounted directly on a visual card face. PCI compliant.
 *
 * Props:
 *   stripeInstance - initialized Stripe.js instance
 *   defaultHolder - prefill holder name
 *   ring1, ring2  - accent gradient colors
 *   onChange({ cardNumberElement, holder, complete, error })
 */
const CreditCardForm = ({
  stripeInstance,
  defaultHolder = '',
  ring1 = '#ff6be7',
  ring2 = '#7288ff',
  onChange,
  className = '',
}) => {
  const numberRef = useRef(null);
  const expiryRef = useRef(null);
  const cvcRef = useRef(null);
  const cardNumberElRef = useRef(null);

  const [holder, setHolder] = useState(defaultHolder.toUpperCase());
  const [brand, setBrand] = useState(null);
  const [fieldStatus, setFieldStatus] = useState({ number: false, expiry: false, cvc: false });
  const [fieldError, setFieldError] = useState(null);
  const [focusField, setFocusField] = useState(null);

  const holderValid = holder.trim().length >= 2;
  const allComplete = fieldStatus.number && fieldStatus.expiry && fieldStatus.cvc && holderValid;

  // Sync holder with parent's name
  useEffect(() => {
    if (defaultHolder) setHolder(defaultHolder.toUpperCase());
  }, [defaultHolder]);

  // Notify parent
  useEffect(() => {
    onChange?.({
      cardNumberElement: cardNumberElRef.current,
      holder,
      complete: allComplete,
      error: fieldError,
    });
  }, [holder, allComplete, fieldError, onChange]);

  // Mount Stripe Elements on card
  useEffect(() => {
    if (!stripeInstance || !numberRef.current) return;

    const elements = stripeInstance.elements();

    const cardNumber = elements.create('cardNumber', {
      style: NUMBER_STYLE,
      placeholder: '0000 0000 0000 0000',
    });
    cardNumber.mount(numberRef.current);
    cardNumberElRef.current = cardNumber;

    cardNumber.on('change', (e) => {
      setBrand(e.brand !== 'unknown' ? e.brand : null);
      setFieldStatus((prev) => ({ ...prev, number: e.complete }));
      setFieldError(e.error?.message || null);
    });
    cardNumber.on('focus', () => setFocusField('number'));
    cardNumber.on('blur', () => setFocusField(null));

    const cardExpiry = elements.create('cardExpiry', {
      style: ELEMENT_STYLE,
      placeholder: 'MM / YY',
    });
    cardExpiry.mount(expiryRef.current);

    cardExpiry.on('change', (e) => {
      setFieldStatus((prev) => ({ ...prev, expiry: e.complete }));
      if (e.error) setFieldError(e.error.message);
    });
    cardExpiry.on('focus', () => setFocusField('expiry'));
    cardExpiry.on('blur', () => setFocusField(null));

    const cardCvc = elements.create('cardCvc', {
      style: ELEMENT_STYLE,
      placeholder: '···',
    });
    cardCvc.mount(cvcRef.current);

    cardCvc.on('change', (e) => {
      setFieldStatus((prev) => ({ ...prev, cvc: e.complete }));
      if (e.error) setFieldError(e.error.message);
    });
    cardCvc.on('focus', () => setFocusField('cvc'));
    cardCvc.on('blur', () => setFocusField(null));

    return () => {
      cardNumber.unmount();
      cardExpiry.unmount();
      cardCvc.unmount();
      cardNumberElRef.current = null;
    };
  }, [stripeInstance]);

  const CardLogo = brand && CardLogos[brand] ? CardLogos[brand] : GenericCardLogo;

  return (
    <div className={`cc-wrap ${className}`}>
      <div className="cc-card">
        <div className="cc-card__front" style={{ '--ring1': ring1, '--ring2': ring2 }}>
          {/* Header: chip + brand logo */}
          <div className="cc-card__header">
            <div className="cc-chip" />
            <div className={`cc-logo ${brand ? 'cc-logo--detected' : ''}`}>
              <CardLogo />
            </div>
          </div>

          {/* Card number (Stripe Element) */}
          <div className="cc-card__number-row">
            <div ref={numberRef} className="cc-stripe-mount cc-stripe-mount--number" />
          </div>

          {/* CVV (Stripe Element) */}
          <div className="cc-card__cvv-row">
            <div className="cc-card__label">CVV</div>
            <div ref={cvcRef} className="cc-stripe-mount cc-stripe-mount--cvc" />
          </div>

          {/* Footer: holder (regular input) + expiry (Stripe Element) */}
          <div className="cc-card__footer">
            <div className="cc-card__holder-area">
              <div className="cc-card__label">Card Holder</div>
              <input
                className="cc-input cc-input--holder"
                name="ccname"
                type="text"
                autoComplete="cc-name"
                placeholder="NAME ON CARD"
                value={holder}
                onChange={(e) => setHolder(e.target.value.toUpperCase())}
                onFocus={() => setFocusField('holder')}
                onBlur={() => setFocusField(null)}
              />
            </div>
            <div className="cc-card__expires-area">
              <div className="cc-card__label">Expires</div>
              <div ref={expiryRef} className="cc-stripe-mount cc-stripe-mount--expiry" />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

module.exports = { CreditCardForm };
