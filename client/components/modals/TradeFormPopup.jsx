const React = require('react');
const { useState, useEffect, useRef } = React;
const helper = require('../../helper.js');
const { authFetch, supabase } = helper;
const Icons = require('../shared/Icons');
const TickerAutofill = require('../shared/TickerAutofill');
const ScreenshotMarkupModal = require('../shared/ScreenshotMarkupModal');
const RuleChecklist = require('../shared/RuleChecklist');
const { resizeImage } = require('../../utils/imageUtils');
const { toEST, getESTOffset } = require('../../utils/dateUtils');
const { SidePanelContext } = require('../../utils/contexts');
const { useWindowWidth } = require('../../utils/hooks');
const { TAG_COLOR_PRESETS } = require('../../utils/tagConstants');

// =====================================================
// TRADE FORM POPUP
// =====================================================

const TradeFormPopup = ({ isOpen, onClose, triggerReload, editingTrade, prefillDate, tags, strategyRules, subscriptionStatus, trades, sidebarCollapsed }) => {
  const [screenshot, setScreenshot] = useState(null);
  const [pastedImage, setPastedImage] = useState(null);
  const [isMarkupOpen, setIsMarkupOpen] = useState(false);
  const [markupSource, setMarkupSource] = useState(null);
  const [lightboxOpen, setLightboxOpen] = useState(false);
  const [selectedTags, setSelectedTags] = useState([]);
  const [showNewTag, setShowNewTag] = useState(false);
  const [quickTagName, setQuickTagName] = useState('');
  const [quickTagColor, setQuickTagColor] = useState(TAG_COLOR_PRESETS[0]);
  const [creatingTag, setCreatingTag] = useState(false);
  const [isEval, setIsEval] = useState(false);
  const [tradeRuleChecks, setTradeRuleChecks] = useState([]);
  const [pendingRuleChecks, setPendingRuleChecks] = useState([]);
  const [ruleChecksLoading, setRuleChecksLoading] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const fileInputRef = useRef(null);
  const windowWidth = useWindowWidth();
  const isUltrawide = windowWidth >= 2000;
  const isSidePanel = isUltrawide || (!!sidebarCollapsed && windowWidth >= 1280);
  const setSidePanelOffset = React.useContext(SidePanelContext);
  const tradeRules = strategyRules ? strategyRules.filter(r => r.type === 'trade') : [];
  const isElite = subscriptionStatus && subscriptionStatus.plan === 'elite';
  useEffect(() => {
    if (!isOpen) { setSidePanelOffset(0); return; }
    if (isSidePanel) setSidePanelOffset(520);
    else setSidePanelOffset(0);
    return () => setSidePanelOffset(0);
  }, [isOpen, isSidePanel, setSidePanelOffset]);

  const handleQuickCreateTag = async () => {
    if (!quickTagName.trim() || creatingTag) return;
    setCreatingTag(true);
    try {
      const response = await authFetch('/api/makeTag', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: quickTagName.trim(), color: quickTagColor }),
      });
      const data = await response.json();
      if (!data.error && data._id) {
        setSelectedTags(prev => [...prev, data._id]);
        setQuickTagName('');
        setQuickTagColor(TAG_COLOR_PRESETS[0]);
        setShowNewTag(false);
        triggerReload();
      }
    } catch (err) {
      console.error('Failed to create tag:', err);
    }
    setCreatingTag(false);
  };

  useEffect(() => {
    const handleEscape = (e) => { if (e.key === 'Escape') onClose(); };
    if (isOpen) {
      document.addEventListener('keydown', handleEscape);
      if (!isSidePanel) document.body.style.overflow = 'hidden';
    }
    return () => {
      document.removeEventListener('keydown', handleEscape);
      document.body.style.overflow = 'unset';
    };
  }, [isOpen, onClose, isSidePanel]);

  useEffect(() => {
    if (!isOpen) {
      setScreenshot(null); setPastedImage(null); setSelectedTags([]);
      setIsEval(false); setTradeRuleChecks([]); setPendingRuleChecks([]);
      return;
    }
    if (editingTrade && editingTrade.screenshot) setScreenshot(editingTrade.screenshot);
    if (editingTrade && editingTrade.tags) setSelectedTags(editingTrade.tags);
    else setSelectedTags([]);
    if (editingTrade) {
      setIsEval(editingTrade.isEval || false);
      if (editingTrade._id && tradeRules.length > 0) {
        authFetch(`/api/strategy/checks/trade/${editingTrade._id}`)
          .then(r => r.json())
          .then(data => { if (!data.error) setTradeRuleChecks(data.checks || []); })
          .catch(() => {});
      }
    } else {
      setIsEval(false);
    }

    const handlePaste = (e) => {
      const items = e.clipboardData?.items;
      if (!items) return;
      for (let i = 0; i < items.length; i++) {
        if (items[i].type.indexOf('image') !== -1) {
          const blob = items[i].getAsFile();
          const reader = new FileReader();
          reader.onload = (event) => setPastedImage(event.target.result);
          reader.readAsDataURL(blob);
          e.preventDefault();
          break;
        }
      }
    };
    document.addEventListener('paste', handlePaste);
    return () => document.removeEventListener('paste', handlePaste);
  }, [isOpen, editingTrade]);

  if (!isOpen) return null;

  const isEditing = editingTrade !== null;

  const uploadScreenshot = async (dataUrl) => {
    setIsUploading(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Not authenticated');
      const base64 = dataUrl.split(',')[1];
      const byteChars = atob(base64);
      const byteArr = new Uint8Array(byteChars.length);
      for (let i = 0; i < byteChars.length; i++) byteArr[i] = byteChars.charCodeAt(i);
      const blob = new Blob([byteArr], { type: 'image/jpeg' });
      const fileName = `${user.id}/${Date.now()}-${Math.random().toString(36).slice(2)}.jpg`;
      const { data, error } = await supabase.storage.from('trade-screenshots').upload(fileName, blob, { contentType: 'image/jpeg', upsert: false });
      if (error) throw new Error(error.message);
      const { data: urlData } = supabase.storage.from('trade-screenshots').getPublicUrl(data.path);
      return urlData.publicUrl;
    } finally {
      setIsUploading(false);
    }
  };

  const handleFileChange = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (event) => setPastedImage(event.target.result);
    reader.readAsDataURL(file);
    e.target.value = '';
  };

  const handleRuleToggle = async (ruleId, followed) => {
    if (isEditing && editingTrade?._id) {
      setRuleChecksLoading(true);
      try {
        const resp = await authFetch('/api/strategy/checks/trade', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ tradeId: editingTrade._id, ruleId, followed }),
        });
        const check = await resp.json();
        if (!check.error) {
          setTradeRuleChecks(prev => {
            const filtered = prev.filter(ch => ch.ruleId !== ruleId);
            return [...filtered, check];
          });
        }
      } catch (err) {
        console.error('Failed to toggle rule:', err);
      } finally {
        setRuleChecksLoading(false);
      }
    } else {
      setPendingRuleChecks(prev => {
        const filtered = prev.filter(ch => ch.ruleId !== ruleId);
        return [...filtered, { ruleId, followed }];
      });
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    helper.hideError();
    const ticker = e.target.querySelector('#ticker').value;
    const enterTimeRaw = e.target.querySelector('#enterTime').value;
    const exitTimeRaw = e.target.querySelector('#exitTime').value;
    const enterPrice = e.target.querySelector('#enterPrice').value;
    const exitPrice = e.target.querySelector('#exitPrice').value;
    const quantity = e.target.querySelector('#quantity').value;
    const manualPL = e.target.querySelector('#manualPL').value;
    const comments = e.target.querySelector('#comments').value;
    const hasPrices = enterPrice && exitPrice;
    const hasPL = manualPL;
    if (!ticker || !enterTimeRaw || !exitTimeRaw || !quantity) {
      helper.handleError('Ticker, enter time, exit time, and quantity are required');
      return;
    }
    if (!hasPrices && !hasPL) {
      helper.handleError('Either enter/exit prices or a manual P/L is required');
      return;
    }
    const enterTime = enterTimeRaw + getESTOffset(new Date(enterTimeRaw));
    const exitTime = exitTimeRaw + getESTOffset(new Date(exitTimeRaw));
    const tradeData = {
      ticker, enterTime, exitTime,
      enterPrice: enterPrice ? parseFloat(enterPrice) : 0,
      exitPrice: exitPrice ? parseFloat(exitPrice) : 0,
      quantity: parseFloat(quantity),
      comments, isEval,
    };
    if (hasPL) tradeData.manualPL = parseFloat(manualPL);
    if (screenshot) tradeData.screenshot = screenshot;
    if (selectedTags.length > 0) tradeData.tags = selectedTags;
    try {
      if (isEditing) {
        tradeData._id = editingTrade._id;
        const resp = await authFetch('/api/updateTrade', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(tradeData),
        });
        const result = await resp.json();
        if (result.error) { helper.handleError(result.error); return; }
      } else {
        const resp = await authFetch('/api/trades', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(tradeData),
        });
        const result = await resp.json();
        if (result.error) { helper.handleError(result.error); return; }
        if (result._id && pendingRuleChecks.length > 0) {
          await Promise.all(
            pendingRuleChecks.filter(ch => ch.followed).map(ch =>
              authFetch('/api/strategy/checks/trade', {
                method: 'POST', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ tradeId: result._id, ruleId: ch.ruleId, followed: ch.followed }),
              }).catch(() => {})
            )
          );
        }
      }
      triggerReload();
      onClose();
    } catch (err) {
      helper.handleError(err.message || 'An error occurred');
    }
  };

  const formatDateTimeForInput = (dateString) => {
    if (!dateString) return '';
    const e = toEST(dateString);
    return `${e.year}-${String(e.month).padStart(2, '0')}-${String(e.day).padStart(2, '0')}T${String(e.hours).padStart(2, '0')}:${String(e.minutes).padStart(2, '0')}:${String(e.seconds).padStart(2, '0')}`;
  };

  const inputClass = "w-full px-3 py-2.5 bg-bg-input border border-border rounded-lg text-text-primary text-sm placeholder-text-muted focus:outline-none focus:border-accent transition-colors";
  const labelClass = "block text-xs font-medium text-text-secondary mb-1.5";

  return (
    <>
      <div className={isSidePanel ? "fixed right-0 top-0 h-screen z-40 flex" : "fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4"} onClick={!isSidePanel ? onClose : undefined}>
        <div className={isSidePanel ? "w-[520px] h-full overflow-y-auto bg-bg-surface border-l border-border shadow-2xl" : "bg-bg-surface border border-border rounded-xl w-full max-w-lg max-h-[90vh] overflow-y-auto"} onClick={(e) => e.stopPropagation()}>
          {/* Header */}
          <div className="flex items-center justify-between px-6 py-4 border-b border-border sticky top-0 bg-bg-surface z-10">
            <h2 className="text-lg font-semibold text-text-primary">{isEditing ? 'Edit Trade' : 'New Trade'}</h2>
            <button className="text-text-secondary hover:text-text-primary transition-colors" onClick={onClose}>
              <Icons.X />
            </button>
          </div>

          <form
            id="tradeForm"
            onSubmit={handleSubmit}
            name="tradeForm"
            action={isEditing ? "/api/updateTrade" : "/api/trades"}
            method="POST"
            className="p-6 space-y-4"
          >
            <div>
              <label htmlFor="ticker" className={labelClass}>Ticker</label>
              <TickerAutofill id="ticker" name="ticker" placeholder="AAPL" defaultValue={isEditing ? editingTrade.ticker : ''} className={inputClass} trades={trades} />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label htmlFor="enterTime" className={labelClass}>Enter Time</label>
                <input id="enterTime" type="datetime-local" name="enterTime" step="1" defaultValue={isEditing ? formatDateTimeForInput(editingTrade.enterTime) : `${prefillDate || new Date().toISOString().split('T')[0]}T09:30:00`} className={inputClass} />
              </div>
              <div>
                <label htmlFor="exitTime" className={labelClass}>Exit Time</label>
                <input id="exitTime" type="datetime-local" name="exitTime" step="1" defaultValue={isEditing ? formatDateTimeForInput(editingTrade.exitTime) : `${prefillDate || new Date().toISOString().split('T')[0]}T09:30:00`} className={inputClass} />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label htmlFor="enterPrice" className={labelClass}>Enter Price <span className="text-text-muted font-normal normal-case">(or use P/L)</span></label>
                <input id="enterPrice" type="number" step="0.01" min="0" name="enterPrice" placeholder="0.00" defaultValue={isEditing ? editingTrade.enterPrice || '' : ''} className={inputClass} />
              </div>
              <div>
                <label htmlFor="exitPrice" className={labelClass}>Exit Price <span className="text-text-muted font-normal normal-case">(or use P/L)</span></label>
                <input id="exitPrice" type="number" step="0.01" min="0" name="exitPrice" placeholder="0.00" defaultValue={isEditing ? editingTrade.exitPrice || '' : ''} className={inputClass} />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label htmlFor="quantity" className={labelClass}>Quantity</label>
                <input id="quantity" type="number" step="0.01" name="quantity" placeholder="1" defaultValue={isEditing ? editingTrade.quantity : ''} className={inputClass} />
                <p className="text-text-muted text-xs mt-0.5">Use negative for short trades</p>
              </div>
              <div>
                <label htmlFor="manualPL" className={labelClass}>P/L <span className="text-text-muted font-normal normal-case">(or use prices)</span></label>
                <input id="manualPL" type="number" step="0.01" name="manualPL" placeholder="Required if no prices" defaultValue={isEditing && editingTrade.manualPL ? editingTrade.manualPL : ''} className={inputClass} />
              </div>
            </div>

            <div>
              <label htmlFor="comments" className={labelClass}>Comments</label>
              <textarea id="comments" name="comments" placeholder="Trade notes..." rows="3" defaultValue={isEditing ? editingTrade.comments : ''} className={`${inputClass} resize-none`}></textarea>
            </div>

            {/* Eval checkbox */}
            <div>
              <label className="flex items-center gap-2.5 cursor-pointer select-none group">
                <div
                  className={`w-4 h-4 rounded border flex items-center justify-center flex-shrink-0 transition-colors ${
                    isEval ? 'bg-accent border-accent' : 'border-border group-hover:border-accent/60'
                  }`}
                  onClick={() => setIsEval(prev => !prev)}
                >
                  {isEval && <Icons.Check className="w-3 h-3 text-accent-text" />}
                </div>
                <span className="text-sm text-text-secondary group-hover:text-text-primary transition-colors" onClick={() => setIsEval(prev => !prev)}>
                  Evaluation trade
                </span>
                {isEval && (
                  <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-bold uppercase bg-accent/15 text-accent">EVAL</span>
                )}
              </label>
              <p className="text-text-muted text-xs mt-1 ml-7">Mark this trade as taken on an evaluation account. Eval trades can be excluded from analytics.</p>
            </div>

            {/* Strategy rule checklist */}
            {tradeRules.length > 0 && (
              <div>
                <label className={labelClass}>Strategy Checklist</label>
                <RuleChecklist
                  rules={tradeRules}
                  checks={isEditing ? tradeRuleChecks : pendingRuleChecks.map(ch => ({ ruleId: ch.ruleId, followed: ch.followed }))}
                  onToggle={handleRuleToggle}
                  loading={ruleChecksLoading}
                />
              </div>
            )}

            {/* Tags section */}
            <div>
              <label className={labelClass}>Tags</label>
              <div className="flex flex-wrap gap-2">
                {tags && tags.map(tag => {
                  const isSelected = selectedTags.includes(tag._id);
                  return (
                    <button
                      key={tag._id}
                      type="button"
                      className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium border transition-colors ${
                        !isSelected ? 'bg-bg-input border-border text-text-secondary hover:text-text-primary' : ''
                      }`}
                      style={isSelected ? {
                        borderColor: tag.color,
                        backgroundColor: tag.color + '20',
                        color: tag.color,
                      } : undefined}
                      onClick={() => {
                        setSelectedTags(prev =>
                          prev.includes(tag._id)
                            ? prev.filter(id => id !== tag._id)
                            : [...prev, tag._id]
                        );
                      }}
                    >
                      <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: tag.color }}></span>
                      {tag.name}
                    </button>
                  );
                })}
                {!showNewTag && (
                  <button
                    type="button"
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium border border-dashed border-border text-text-tertiary hover:text-text-primary hover:border-accent transition-colors"
                    onClick={() => setShowNewTag(true)}
                  >
                    <Icons.Plus className="w-3 h-3" />
                    New Tag
                  </button>
                )}
              </div>
              {showNewTag && (
                <div className="flex flex-wrap items-center gap-2 mt-2 p-3 bg-bg-input border border-border rounded-lg">
                  <input
                    type="text"
                    value={quickTagName}
                    onChange={(e) => setQuickTagName(e.target.value)}
                    placeholder="Tag name"
                    className="px-2.5 py-1.5 bg-bg-surface border border-border rounded-md text-text-primary text-xs focus:outline-none focus:border-accent transition-colors w-28"
                    onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); handleQuickCreateTag(); } }}
                  />
                  <div className="flex gap-1">
                    {TAG_COLOR_PRESETS.slice(0, 4).map(color => (
                      <button
                        key={color}
                        type="button"
                        className={`w-5 h-5 rounded-full border-2 transition-all ${
                          quickTagColor === color ? 'border-white scale-110' : 'border-transparent'
                        }`}
                        style={{ backgroundColor: color }}
                        onClick={() => setQuickTagColor(color)}
                      />
                    ))}
                  </div>
                  <button
                    type="button"
                    className="px-2.5 py-1.5 bg-accent text-accent-text text-xs font-semibold rounded-md hover:brightness-110 transition-all disabled:opacity-50"
                    onClick={handleQuickCreateTag}
                    disabled={creatingTag || !quickTagName.trim()}
                  >
                    {creatingTag ? '...' : 'Add'}
                  </button>
                  <button
                    type="button"
                    className="px-2 py-1.5 text-text-tertiary text-xs hover:text-text-primary transition-colors"
                    onClick={() => { setShowNewTag(false); setQuickTagName(''); }}
                  >
                    Cancel
                  </button>
                </div>
              )}
            </div>

            {/* Screenshot section — Elite only */}
            <div>
              <div className="flex items-center gap-2 mb-1.5">
                <label className={labelClass + ' mb-0'}>Screenshot</label>
                {!isElite && (
                  <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-bold uppercase bg-yellow-500/15 text-yellow-400">Elite</span>
                )}
              </div>
              {isElite ? (
                <>
                  {!screenshot && !pastedImage && (
                    <div className="border-2 border-dashed border-border rounded-lg p-6 text-center">
                      <Icons.Download className="w-8 h-8 text-text-muted mx-auto mb-2" />
                      <p className="text-text-tertiary text-sm mb-3">Paste (Ctrl+V) or drag an image here, or</p>
                      <button
                        type="button"
                        className="px-3 py-1.5 bg-bg-input border border-border text-text-secondary text-xs rounded-lg hover:border-accent hover:text-text-primary transition-colors"
                        onClick={() => fileInputRef.current?.click()}
                      >
                        Choose File
                      </button>
                      <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={handleFileChange} />
                    </div>
                  )}

                  {pastedImage && !screenshot && (
                    <div className="space-y-3">
                      <img src={pastedImage} alt="Pasted screenshot" className="rounded-lg max-h-48 w-full object-contain bg-bg-input cursor-pointer hover:opacity-80 transition-opacity" onClick={() => setLightboxOpen(true)} />
                      <div className="flex gap-2">
                        <button type="button" className="flex-1 py-2 text-xs bg-accent text-accent-text font-semibold rounded-lg hover:brightness-110" onClick={() => { setMarkupSource(pastedImage); setIsMarkupOpen(true); }}>
                          Annotate
                        </button>
                        <button type="button" className="flex-1 py-2 text-xs bg-bg-input border border-border text-text-primary rounded-lg hover:border-accent disabled:opacity-50" disabled={isUploading} onClick={async () => {
                          try {
                            const resized = await resizeImage(pastedImage);
                            const url = await uploadScreenshot(resized);
                            setScreenshot(url);
                            setPastedImage(null);
                          } catch (err) {
                            helper.handleError('Failed to upload screenshot: ' + err.message);
                          }
                        }}>
                          {isUploading ? 'Uploading...' : 'Use As-Is'}
                        </button>
                        <button type="button" className="py-2 px-3 text-xs bg-bg-input border border-border text-text-secondary rounded-lg hover:text-negative hover:border-negative/50" onClick={() => { setScreenshot(null); setPastedImage(null); }}>
                          Remove
                        </button>
                      </div>
                    </div>
                  )}

                  {screenshot && (
                    <div className="space-y-3">
                      <img src={screenshot} alt="Trade screenshot" className="rounded-lg max-h-48 w-full object-contain bg-bg-input cursor-pointer hover:opacity-80 transition-opacity" onClick={() => setLightboxOpen(true)} />
                      <div className="flex gap-2">
                        <button type="button" className="flex-1 py-2 text-xs bg-accent text-accent-text font-semibold rounded-lg hover:brightness-110" onClick={() => { setMarkupSource(screenshot); setIsMarkupOpen(true); }}>
                          Annotate
                        </button>
                        <button type="button" className="py-2 px-3 text-xs bg-bg-input border border-border text-text-secondary rounded-lg hover:text-negative hover:border-negative/50" onClick={() => { setScreenshot(null); setPastedImage(null); }}>
                          Remove
                        </button>
                      </div>
                    </div>
                  )}
                </>
              ) : (
                <div className="border border-border rounded-lg p-4 flex items-center gap-3 bg-bg-input">
                  <Icons.Lock className="w-4 h-4 text-text-muted flex-shrink-0" />
                  <div className="flex-1 min-w-0">
                    <p className="text-text-secondary text-xs">Screenshot attachments are available on the <span className="text-yellow-400 font-medium">Elite</span> plan.</p>
                  </div>
                  <a href="/upgrade" className="flex-shrink-0 px-2.5 py-1.5 text-xs font-semibold bg-yellow-500 text-black rounded-lg hover:brightness-110 transition-all">
                    Upgrade
                  </a>
                </div>
              )}
            </div>

            {/* Image Lightbox */}
            {lightboxOpen && (screenshot || pastedImage) && (
              <div className="fixed inset-0 z-[60] bg-black/90 flex items-center justify-center p-4" onClick={() => setLightboxOpen(false)}>
                <button className="absolute top-4 right-4 text-white/70 hover:text-white transition-colors" onClick={() => setLightboxOpen(false)}>
                  <Icons.X />
                </button>
                <img src={screenshot || pastedImage} alt="Screenshot preview" className="max-w-[90vw] max-h-[90vh] object-contain rounded-lg" onClick={(e) => e.stopPropagation()} />
              </div>
            )}

            <div id="errorDiv" className="hidden">
              <div className="p-3 bg-negative/10 border border-negative/30 rounded-lg">
                <span id="errorMessage" className="text-negative text-sm"></span>
              </div>
            </div>

            <button
              type="submit"
              className="w-full py-3 bg-accent text-accent-text font-semibold rounded-lg hover:brightness-110 transition-all"
            >
              {isEditing ? 'Update Trade' : 'Add Trade'}
            </button>
          </form>
        </div>
      </div>

      <ScreenshotMarkupModal
        isOpen={isMarkupOpen}
        onClose={() => setIsMarkupOpen(false)}
        onSave={async (annotatedImage) => {
          try {
            const url = await uploadScreenshot(annotatedImage);
            setScreenshot(url);
            setPastedImage(null);
            setMarkupSource(null);
          } catch (err) {
            helper.handleError('Failed to upload screenshot: ' + err.message);
          }
        }}
        initialImage={markupSource}
      />
    </>
  );
};

module.exports = TradeFormPopup;
