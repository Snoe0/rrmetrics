const React = require('react');
const { useState, useEffect } = React;
const Papa = require('papaparse');
const helper = require('../../helper.js');
const { authFetch } = helper;
const { getESTOffset } = require('../../utils/dateUtils');
const Icons = require('../shared/Icons');

// =====================================================
// CSV IMPORT MODAL
// =====================================================

// Strip futures contract month+year suffix (e.g. NQH6 -> NQ, MNQH6 -> MNQ, ESZ25 -> ES)
const parseContractTicker = (name) => {
  if (!name) return name;
  return name.trim().replace(/[FGHJKMNQUVXZ]\d{1,2}$/, '').trim() || name.trim();
};

// Known broker CSV formats — matched by required header presence
const KNOWN_BROKER_FORMATS = [
  {
    name: 'Topstep',
    requiredHeaders: ['ContractName', 'EnteredAt', 'ExitedAt', 'EntryPrice', 'ExitPrice', 'PnL', 'Size', 'Type', 'Fees'],
    transform: (row) => {
      const isShort = row.Type && row.Type.toLowerCase() === 'short';
      const qty = Math.abs(parseFloat(row.Size) || 0);
      const pnl = parseFloat(row.PnL) || 0;
      const fees = parseFloat(row.Fees) || 0;
      return {
        ticker: parseContractTicker(row.ContractName),
        enterTime: row.EnteredAt,
        exitTime: row.ExitedAt,
        enterPrice: row.EntryPrice,
        exitPrice: row.ExitPrice,
        quantity: isShort ? -qty : qty,
        manualPL: pnl - fees,
        comments: '',
      };
    },
  },
  {
    name: 'Tradovate (Positions)',
    requiredHeaders: ['Product', 'Avg. Buy', 'Avg. Sell', 'Paired Qty', 'P/L', 'Buy Fill ID', 'Sell Fill ID', 'Bought Timestamp', 'Sold Timestamp'],
    transform: (row) => {
      const buyFillId = parseInt(row['Buy Fill ID']) || 0;
      const sellFillId = parseInt(row['Sell Fill ID']) || 0;
      const isLong = sellFillId > buyFillId;
      const qty = Math.abs(parseFloat(row['Paired Qty']) || 0);
      return {
        ticker: parseContractTicker(row.Product),
        enterTime: isLong ? row['Bought Timestamp'] : row['Sold Timestamp'],
        exitTime: isLong ? row['Sold Timestamp'] : row['Bought Timestamp'],
        enterPrice: isLong ? row['Avg. Buy'] : row['Avg. Sell'],
        exitPrice: isLong ? row['Avg. Sell'] : row['Avg. Buy'],
        quantity: isLong ? qty : -qty,
        manualPL: parseFloat(row['P/L']) || 0,
        comments: '',
      };
    },
  },
  {
    name: 'Tradovate (Fills)',
    requiredHeaders: ['symbol', 'buyFillId', 'sellFillId', 'qty', 'buyPrice', 'sellPrice', 'pnl', 'boughtTimestamp', 'soldTimestamp'],
    transform: (row) => {
      const buyFillId = parseInt(row.buyFillId) || 0;
      const sellFillId = parseInt(row.sellFillId) || 0;
      const isLong = sellFillId > buyFillId;
      const qty = Math.abs(parseFloat(row.qty) || 0);
      return {
        ticker: parseContractTicker(row.symbol),
        enterTime: isLong ? row.boughtTimestamp : row.soldTimestamp,
        exitTime: isLong ? row.soldTimestamp : row.boughtTimestamp,
        enterPrice: isLong ? row.buyPrice : row.sellPrice,
        exitPrice: isLong ? row.sellPrice : row.buyPrice,
        quantity: isLong ? qty : -qty,
        manualPL: parseFloat(row.pnl) || 0,
        comments: '',
      };
    },
  },
];

const CSV_TRADE_FIELDS = [
  { key: 'ticker', label: 'Ticker', required: true, aliases: ['ticker', 'symbol', 'instrument', 'name', 'asset'] },
  { key: 'enterTime', label: 'Enter Time', required: true, aliases: ['entertime', 'opendate', 'opentime', 'entrydate', 'entrytime', 'entry_time', 'open_date', 'entry date', 'entry time'] },
  { key: 'exitTime', label: 'Exit Time', required: true, aliases: ['exittime', 'closedate', 'closetime', 'exitdate', 'exit_time', 'close_date', 'close date', 'close time'] },
  { key: 'enterPrice', label: 'Enter Price', required: true, aliases: ['enterprice', 'openprice', 'entryprice', 'entry_price', 'open_price', 'entry price', 'open price'] },
  { key: 'exitPrice', label: 'Exit Price', required: true, aliases: ['exitprice', 'closeprice', 'exit_price', 'close_price', 'exit price', 'close price'] },
  { key: 'quantity', label: 'Quantity', required: true, aliases: ['quantity', 'qty', 'size', 'shares', 'contracts', 'lots', 'volume'] },
  { key: 'manualPL', label: 'P/L (Optional)', required: false, aliases: ['pl', 'pnl', 'profit', 'profitloss', 'profit_loss', 'profit/loss', 'net p/l', 'net profit', 'realized p/l'] },
  { key: 'comments', label: 'Comments (Optional)', required: false, aliases: ['comments', 'notes', 'comment', 'note', 'description'] },
];

const CSVImportModal = ({ isOpen, onClose, triggerReload, onDuplicatesSkipped }) => {
  const [step, setStep] = useState(1);
  const [csvData, setCsvData] = useState([]);
  const [csvHeaders, setCsvHeaders] = useState([]);
  const [columnMap, setColumnMap] = useState({});
  const [mappedTrades, setMappedTrades] = useState([]);
  const [importing, setImporting] = useState(false);
  const [importResult, setImportResult] = useState(null);
  const [error, setError] = useState(null);
  const [detectedFormat, setDetectedFormat] = useState(null);

  useEffect(() => {
    if (!isOpen) {
      setStep(1); setCsvData([]); setCsvHeaders([]); setColumnMap({});
      setMappedTrades([]); setImporting(false); setImportResult(null);
      setError(null); setDetectedFormat(null);
    }
  }, [isOpen]);

  const handleFileUpload = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    setError(null);

    Papa.parse(file, {
      header: true,
      skipEmptyLines: true,
      complete: (results) => {
        if (results.errors.length > 0) {
          setError(`CSV parse error: ${results.errors[0].message}`);
          return;
        }
        if (results.data.length === 0) {
          setError('CSV file is empty');
          return;
        }

        const headers = results.meta.fields || [];

        // Check for a known broker format first
        const knownFormat = KNOWN_BROKER_FORMATS.find(fmt =>
          fmt.requiredHeaders.every(h => headers.includes(h))
        );

        if (knownFormat) {
          const trades = results.data
            .map(knownFormat.transform)
            .filter(t => t.ticker && t.enterTime && t.exitTime);
          setDetectedFormat(knownFormat.name);
          setMappedTrades(trades);
          setStep(3);
          return;
        }

        // Unknown format — fall through to manual column mapping
        setCsvData(results.data);
        setCsvHeaders(headers);
        const autoMap = {};
        CSV_TRADE_FIELDS.forEach(field => {
          const match = headers.find(h =>
            field.aliases.some(alias => h.toLowerCase().replace(/[^a-z0-9]/g, '').includes(alias.replace(/[^a-z0-9]/g, '')))
          );
          if (match) autoMap[field.key] = match;
        });
        setColumnMap(autoMap);
        setStep(2);
      },
    });
  };

  const handleMapConfirm = () => {
    setError(null);
    const missing = CSV_TRADE_FIELDS.filter(f => f.required && !columnMap[f.key]);
    if (missing.length > 0) {
      setError(`Missing required mappings: ${missing.map(f => f.label).join(', ')}`);
      return;
    }

    const trades = csvData.map(row => {
      const trade = {};
      CSV_TRADE_FIELDS.forEach(field => {
        if (columnMap[field.key]) {
          trade[field.key] = row[columnMap[field.key]];
        }
      });
      return trade;
    }).filter(t => t.ticker && t.enterTime && t.exitTime)
      .map(t => ({ ...t, ticker: parseContractTicker(t.ticker) }));

    setMappedTrades(trades);
    setStep(3);
  };

  const handleImport = async () => {
    setImporting(true);
    setError(null);
    try {
      // CSV timestamps are in EST with no timezone info. Append the EST offset so the
      // server stores the correct UTC value instead of treating them as UTC.
      const toESTIso = (ts) => {
        if (!ts) return ts;
        const s = String(ts).trim();
        const offset = getESTOffset(new Date(s));
        // Normalize "YYYY-MM-DD HH:MM:SS" → "YYYY-MM-DDTHH:MM:SS" for reliable parsing
        const normalized = s.replace(/^(\d{4}-\d{2}-\d{2}) (\d{2}:)/, '$1T$2');
        const d = new Date(normalized + offset);
        return isNaN(d.getTime()) ? s : d.toISOString();
      };
      const tradesToSend = mappedTrades.map(t => ({
        ...t,
        enterTime: toESTIso(t.enterTime),
        exitTime: toESTIso(t.exitTime),
      }));
      const response = await authFetch('/api/importTrades', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ trades: tradesToSend }),
      });
      const data = await response.json();
      if (data.error) {
        setError(data.error);
      } else {
        setImportResult(data);
        triggerReload();
        if (data.skipped > 0 && onDuplicatesSkipped) {
          onDuplicatesSkipped(data.skipped);
        }
      }
    } catch (err) {
      setError('Import failed. Please try again.');
    }
    setImporting(false);
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-bg-surface border border-border rounded-xl w-full max-w-2xl max-h-[85vh] flex flex-col" onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-border">
          <div>
            <h2 className="text-lg font-semibold text-text-primary">Import Trades from CSV</h2>
            <p className="text-text-tertiary text-xs mt-0.5">Step {importResult ? 3 : step} of 3</p>
          </div>
          <button className="text-text-secondary hover:text-text-primary transition-colors" onClick={onClose}>
            <Icons.X />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-6">
          {error && (
            <div className="mb-4 p-3 bg-negative/10 border border-negative/30 rounded-lg text-negative text-sm">{error}</div>
          )}

          {/* Step 1: Upload */}
          {step === 1 && (
            <div className="text-center py-8">
              <Icons.Download className="w-12 h-12 text-text-muted mx-auto mb-4" />
              <h3 className="text-text-primary font-semibold mb-2">Upload CSV File</h3>
              <p className="text-text-tertiary text-sm mb-6">Select a CSV file with your trade history. Headers should include ticker, dates, prices, and quantity.</p>
              <label className="inline-flex items-center gap-2 px-6 py-3 bg-accent text-accent-text font-semibold rounded-lg hover:brightness-110 transition-all cursor-pointer">
                <Icons.Plus className="w-4 h-4" />
                Choose File
                <input type="file" accept=".csv" onChange={handleFileUpload} className="hidden" />
              </label>
            </div>
          )}

          {/* Step 2: Map columns */}
          {step === 2 && (
            <div className="space-y-4">
              <p className="text-text-secondary text-sm">Map your CSV columns to trade fields. We auto-detected some matches.</p>
              <div className="space-y-3">
                {CSV_TRADE_FIELDS.map(field => (
                  <div key={field.key} className="flex items-center gap-3">
                    <div className="w-40 flex-shrink-0">
                      <span className="text-text-primary text-sm font-medium">{field.label}</span>
                      {field.required && <span className="text-negative text-xs ml-1">*</span>}
                    </div>
                    <select
                      value={columnMap[field.key] || ''}
                      onChange={(e) => setColumnMap(prev => ({ ...prev, [field.key]: e.target.value || undefined }))}
                      className="flex-1 px-3 py-2 bg-bg-input border border-border rounded-lg text-text-primary text-sm focus:outline-none focus:border-accent transition-colors"
                    >
                      <option value="">-- Skip --</option>
                      {csvHeaders.map(h => (
                        <option key={h} value={h}>{h}</option>
                      ))}
                    </select>
                  </div>
                ))}
              </div>
              <p className="text-text-muted text-xs">{csvData.length} rows found in CSV</p>
            </div>
          )}

          {/* Step 3: Preview & Confirm */}
          {step === 3 && !importResult && (
            <div className="space-y-4">
              {detectedFormat && (
                <div className="flex items-center gap-2 px-3 py-2 bg-positive/10 border border-positive/20 rounded-lg">
                  <span className="w-1.5 h-1.5 rounded-full bg-positive flex-shrink-0"></span>
                  <span className="text-positive text-xs font-medium">{detectedFormat} format detected — columns mapped automatically</span>
                </div>
              )}
              <p className="text-text-secondary text-sm">{mappedTrades.length} trades ready to import. Preview below (showing first 50):</p>
              <div className="overflow-x-auto border border-border rounded-lg">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="border-b border-border bg-bg-input">
                      <th className="px-3 py-2 text-left text-text-tertiary font-medium">#</th>
                      <th className="px-3 py-2 text-left text-text-tertiary font-medium">Ticker</th>
                      <th className="px-3 py-2 text-left text-text-tertiary font-medium">Enter Time</th>
                      <th className="px-3 py-2 text-left text-text-tertiary font-medium">Exit Time</th>
                      <th className="px-3 py-2 text-right text-text-tertiary font-medium">Entry $</th>
                      <th className="px-3 py-2 text-right text-text-tertiary font-medium">Exit $</th>
                      <th className="px-3 py-2 text-right text-text-tertiary font-medium">Qty</th>
                    </tr>
                  </thead>
                  <tbody>
                    {mappedTrades.slice(0, 50).map((t, i) => (
                      <tr key={i} className="border-b border-border/50">
                        <td className="px-3 py-1.5 text-text-muted">{i + 1}</td>
                        <td className="px-3 py-1.5 font-mono text-text-primary font-semibold">{t.ticker}</td>
                        <td className="px-3 py-1.5 text-text-secondary">{t.enterTime}</td>
                        <td className="px-3 py-1.5 text-text-secondary">{t.exitTime}</td>
                        <td className="px-3 py-1.5 text-right font-mono text-text-secondary">{t.enterPrice}</td>
                        <td className="px-3 py-1.5 text-right font-mono text-text-secondary">{t.exitPrice}</td>
                        <td className="px-3 py-1.5 text-right font-mono text-text-secondary">{t.quantity}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {mappedTrades.length > 50 && (
                <p className="text-text-muted text-xs">...and {mappedTrades.length - 50} more</p>
              )}
            </div>
          )}

          {/* Import success */}
          {importResult && (
            <div className="text-center py-8">
              <div className="w-16 h-16 bg-positive/20 rounded-full flex items-center justify-center mx-auto mb-4">
                <Icons.Check className="w-8 h-8 text-positive" />
              </div>
              <h3 className="text-text-primary font-semibold text-lg mb-2">Import Complete</h3>
              <p className="text-text-secondary text-sm">{importResult.imported} trade{importResult.imported !== 1 ? 's' : ''} imported successfully.{importResult.skipped > 0 ? ` ${importResult.skipped} duplicate${importResult.skipped !== 1 ? 's' : ''} skipped.` : ''}</p>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between px-6 py-4 border-t border-border">
          <div>
            {step > 1 && !importResult && (
              <button className="px-4 py-2 text-sm text-text-secondary hover:text-text-primary transition-colors" onClick={() => setStep(step - 1)}>
                Back
              </button>
            )}
          </div>
          <div className="flex gap-3">
            <button className="px-4 py-2 text-sm text-text-secondary hover:text-text-primary transition-colors" onClick={onClose}>
              {importResult ? 'Done' : 'Cancel'}
            </button>
            {step === 2 && (
              <button
                className="px-4 py-2 bg-accent text-accent-text text-sm font-semibold rounded-lg hover:brightness-110 transition-all"
                onClick={handleMapConfirm}
              >
                Preview Trades
              </button>
            )}
            {step === 3 && !importResult && (
              <button
                className="px-4 py-2 bg-accent text-accent-text text-sm font-semibold rounded-lg hover:brightness-110 transition-all disabled:opacity-50"
                onClick={handleImport}
                disabled={importing}
              >
                {importing ? 'Importing...' : `Import ${mappedTrades.length} Trades`}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

module.exports = CSVImportModal;
