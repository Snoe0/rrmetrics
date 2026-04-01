const React = require('react');
const { useState, useEffect, useMemo } = React;
require('../../styles/credit-card-form.css');

function formatNumberSpaces(num) {
  return num.replace(/\s+/g, '').replace(/(\d{4})(?=\d)/g, '$1 ');
}

function clampDigits(value, maxLen) {
  return value.replace(/\D/g, '').slice(0, maxLen);
}

const CreditCardForm = ({
  defaultNumber = '',
  defaultHolder = '',
  defaultMonth = '',
  defaultYear = '',
  defaultCVV = '',
  maskMiddle = true,
  ring1 = '#ff6be7',
  ring2 = '#7288ff',
  onChange,
  className = '',
}) => {
  const [number, setNumber] = useState(clampDigits(defaultNumber, 19));
  const [holder, setHolder] = useState(defaultHolder.toUpperCase());
  const [month, setMonth] = useState(defaultMonth);
  const [year, setYear] = useState(defaultYear);
  const [cvv, setCVV] = useState(clampDigits(defaultCVV, 4));
  const [focusField, setFocusField] = useState(null);

  const flip = focusField === 'cvv';

  const years = useMemo(() => {
    const start = new Date().getFullYear();
    return Array.from({ length: 10 }, (_, i) => String(start + i));
  }, []);

  // Validation
  const validity = useMemo(() => {
    const numberValid = number.length >= 13;
    const holderValid = holder.trim().length >= 2;
    const monthValid = !!month && +month >= 1 && +month <= 12;
    const yearValid = !!year && +year >= new Date().getFullYear();
    const cvvValid = /^\d{3,4}$/.test(cvv);
    return {
      number: numberValid,
      holder: holderValid,
      month: monthValid,
      year: yearValid,
      cvv: cvvValid,
      allValid: numberValid && holderValid && monthValid && yearValid && cvvValid,
    };
  }, [number, holder, month, year, cvv]);

  // Sync holder with defaultHolder changes (e.g. from parent name field)
  useEffect(() => {
    if (defaultHolder) setHolder(defaultHolder.toUpperCase());
  }, [defaultHolder]);

  // Notify parent on change
  useEffect(() => {
    onChange?.({ number, holder, month, year, cvv }, validity);
  }, [number, holder, month, year, cvv, validity, onChange]);

  // Display slots for 16 digits
  const displayDigits = useMemo(() => number.slice(0, 16).split(''), [number]);
  const displayedSlots = useMemo(() => {
    const arr = [];
    for (let i = 0; i < 16; i++) {
      let content = '#';
      if (i < displayDigits.length) {
        const d = displayDigits[i];
        const shouldMask = maskMiddle && i >= 4 && i <= 11;
        content = shouldMask ? '*' : d;
      }
      arr.push({ textTop: content, filed: i < displayDigits.length });
    }
    return arr;
  }, [displayDigits, maskMiddle]);

  const highlightClass = (() => {
    switch (focusField) {
      case 'number': return 'hl-number';
      case 'holder': return 'hl-holder';
      case 'expire': return 'hl-expire';
      case 'cvv':    return 'hl-cvv';
      default:       return 'hl-hidden';
    }
  })();

  return (
    <div className={`cc-wrap ${className}`}>
      {/* VISUAL CARD */}
      <div className={`cc-card ${flip ? 'flip' : ''}`}>
        <div className={`cc-highlight ${highlightClass}`} />

        {/* FRONT */}
        <div className="cc-card__front" style={{ '--ring1': ring1, '--ring2': ring2 }}>
          <div className="cc-card__header">
            <div>CreditCard</div>
            <svg xmlns="http://www.w3.org/2000/svg" height="40" width="60" viewBox="-96 -98.908 832 593.448">
              <path fill="#ff5f00" d="M224.833 42.298h190.416v311.005H224.833z" />
              <path d="M244.446 197.828a197.448 197.448 0 0175.54-155.475 197.777 197.777 0 100 311.004 197.448 197.448 0 01-75.54-155.53z" fill="#eb001b" />
              <path d="M621.101 320.394v-6.372h2.747v-1.319h-6.537v1.319h2.582v6.373zm12.691 0v-7.69h-1.978l-2.307 5.493-2.308-5.494h-1.977v7.691h1.428v-5.823l2.143 5h1.483l2.143-5v5.823z" fill="#f79e1b" />
              <path d="M640 197.828a197.777 197.777 0 01-320.015 155.474 197.777 197.777 0 000-311.004A197.777 197.777 0 01640 197.773z" fill="#f79e1b" />
            </svg>
          </div>

          <div className="cc-card__number" aria-label="Card number">
            {displayedSlots.map((slot, idx) => (
              <span key={idx} className="cc-slot">
                <span className={`cc-digit ${slot.filed ? 'filed' : ''}`}>
                  <span className="cc-row">#</span>
                  <span className="cc-row">{slot.textTop}</span>
                </span>
              </span>
            ))}
          </div>

          <div className="cc-card__footer">
            <div className="cc-card__holder">
              <div className="cc-card__section-title">Card Holder</div>
              <div>{holder || 'NAME ON CARD'}</div>
            </div>
            <div>
              <div className="cc-card__section-title">Expires</div>
              <span>{month || 'MM'}</span>/<span>{year ? year.slice(-2) : 'YY'}</span>
            </div>
          </div>
        </div>

        {/* BACK */}
        <div className="cc-card__back" style={{ '--ring1': ring1, '--ring2': ring2 }}>
          <div className="cc-hide-line" />
          <div className="cc-cvv-area">
            <span>CVV</span>
            <div className="cc-cvv-field">{'*'.repeat(cvv.length)}</div>
          </div>
        </div>
      </div>

      {/* FORM INPUTS */}
      <div className="cc-form">
        <div>
          <label htmlFor="cc-number">Card Number</label>
          <input
            id="cc-number"
            inputMode="numeric"
            autoComplete="cc-number"
            placeholder="1234 5678 9012 3456"
            value={formatNumberSpaces(number)}
            onChange={(e) => setNumber(clampDigits(e.target.value, 19))}
            onFocus={() => setFocusField('number')}
            onBlur={() => setFocusField(null)}
          />
        </div>

        <div>
          <label htmlFor="cc-holder">Card Holder</label>
          <input
            id="cc-holder"
            type="text"
            autoComplete="cc-name"
            placeholder="JANE DOE"
            value={holder}
            onChange={(e) => setHolder(e.target.value.toUpperCase())}
            onFocus={() => setFocusField('holder')}
            onBlur={() => setFocusField(null)}
          />
        </div>

        <div className="cc-filed-group">
          <div>
            <label>Expiration Date</label>
            <div className="cc-filed-date">
              <select
                value={month || ''}
                onChange={(e) => setMonth(e.target.value)}
                onFocus={() => setFocusField('expire')}
                onBlur={() => setFocusField(null)}
              >
                <option value="" disabled>Month</option>
                {Array.from({ length: 12 }, (_, i) => String(i + 1).padStart(2, '0')).map((m) => (
                  <option key={m} value={m}>{m}</option>
                ))}
              </select>
              <select
                value={year || ''}
                onChange={(e) => setYear(e.target.value)}
                onFocus={() => setFocusField('expire')}
                onBlur={() => setFocusField(null)}
              >
                <option value="" disabled>Year</option>
                {years.map((y) => (
                  <option key={y} value={y}>{y}</option>
                ))}
              </select>
            </div>
          </div>

          <div>
            <label htmlFor="cc-cvv">CVV</label>
            <input
              id="cc-cvv"
              inputMode="numeric"
              autoComplete="cc-csc"
              placeholder="***"
              value={cvv}
              onChange={(e) => setCVV(clampDigits(e.target.value, 4))}
              onFocus={() => setFocusField('cvv')}
              onBlur={() => setFocusField(null)}
            />
          </div>
        </div>
      </div>
    </div>
  );
};

module.exports = { CreditCardForm };
