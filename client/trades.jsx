const helper = require('./helper.js');
const React = require('react');
const { useState, useEffect } = React;
const { createRoot } = require('react-dom/client');

// Resize image to 720p max to reduce payload size
const resizeImage = (dataUrl, maxWidth = 1280, maxHeight = 720) => {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      let { width, height } = img;

      // Only resize if image is larger than max dimensions
      if (width > maxWidth || height > maxHeight) {
        const ratio = Math.min(maxWidth / width, maxHeight / height);
        width = Math.floor(width * ratio);
        height = Math.floor(height * ratio);
      }

      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d');
      ctx.drawImage(img, 0, 0, width, height);
      // Use JPEG for better compression
      resolve(canvas.toDataURL('image/jpeg', 0.85));
    };
    img.src = dataUrl;
  });
};

// Setup sidebar toggle functionality
const setupSidebar = () => {
  const hamburgerBtn = document.getElementById('hamburgerBtn');
  const sidebar = document.getElementById('sidebar');
  const sidebarOverlay = document.getElementById('sidebarOverlay');
  const accountBtn = document.getElementById('accountBtn');
  const accountDropdown = document.getElementById('accountDropdown');

  const toggleSidebar = () => {
    if (hamburgerBtn && sidebar && sidebarOverlay) {
      hamburgerBtn.classList.toggle('active');
      sidebar.classList.toggle('open');
      sidebarOverlay.classList.toggle('active');
    }
  };

  if (hamburgerBtn) {
    hamburgerBtn.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      toggleSidebar();
    });
  }

  if (sidebarOverlay) {
    sidebarOverlay.addEventListener('click', toggleSidebar);
  }

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && sidebar && sidebar.classList.contains('open')) {
      toggleSidebar();
    }
  });

  if (accountBtn && accountDropdown) {
    accountBtn.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      accountDropdown.classList.toggle('open');
    });

    document.addEventListener('click', (e) => {
      if (!accountDropdown.contains(e.target)) {
        accountDropdown.classList.remove('open');
      }
    });
  }
};

//Calculates all the major stats for the dashboard from the user's trades array
const calculateAnalytics = (trades) => {
  if (!trades || trades.length === 0) {
    return {
      totalPL: 0,
      winRate: 0,
      avgWin: 0,
      avgLoss: 0,
      totalTrades: 0,
      wins: 0,
      losses: 0,
      avgDuration: 0,
      bestTrade: 0,
      worstTrade: 0,
    };
  }

  const tradesWithPL = trades.map(trade => ({
    ...trade,
    pl: trade.manualPL !== null && trade.manualPL !== undefined
      ? trade.manualPL
      : (trade.exitPrice - trade.enterPrice) * trade.quantity,
    duration: new Date(trade.exitTime) - new Date(trade.enterTime)
  }));

  const winningTrades = tradesWithPL.filter(trade => trade.pl > 0);
  const losingTrades = tradesWithPL.filter(trade => trade.pl < 0);

  const totalPL = tradesWithPL.reduce((sum, trade) => sum + trade.pl, 0);
  const avgWin = winningTrades.length > 0
    ? winningTrades.reduce((sum, trade) => sum + trade.pl, 0) / winningTrades.length
    : 0;
  const avgLoss = losingTrades.length > 0
    ? losingTrades.reduce((sum, trade) => sum + trade.pl, 0) / losingTrades.length
    : 0;
  const avgDuration = tradesWithPL.reduce((sum, trade) => sum + trade.duration, 0) / tradesWithPL.length;
  const winRate = (winningTrades.length / tradesWithPL.length) * 100;

  const allPLs = tradesWithPL.map(trade => trade.pl);
  const bestTrade = Math.max(...allPLs);
  const worstTrade = Math.min(...allPLs);

  return {
    totalPL,
    winRate,
    avgWin,
    avgLoss,
    totalTrades: trades.length,
    wins: winningTrades.length,
    losses: losingTrades.length,
    avgDuration,
    bestTrade,
    worstTrade,
  };
};

const formatDuration = (milliseconds) => {
  const totalSeconds = Math.floor(milliseconds / 1000);
  const days = Math.floor(totalSeconds / (24 * 60 * 60));
  const hours = Math.floor((totalSeconds % (24 * 60 * 60)) / (60 * 60));
  const minutes = Math.floor((totalSeconds % (60 * 60)) / 60);
  const seconds = totalSeconds % 60;

  if (days > 0) {
    return `${days}d ${hours}h ${minutes}m`;
  }
  if (hours > 0) {
    return `${hours}h ${minutes}m ${seconds}s`;
  }
  if (minutes > 0) {
    return `${minutes}m ${seconds}s`;
  }
  return `${seconds}s`;
};

const groupTradesByDate = (trades) => {
  const grouped = {};

  trades.forEach(trade => {
    const pl = trade.manualPL !== null && trade.manualPL !== undefined
      ? trade.manualPL
      : (trade.exitPrice - trade.enterPrice) * trade.quantity;

    const exitDate = new Date(trade.exitTime);
    const dateKey = `${exitDate.getFullYear()}-${String(exitDate.getMonth() + 1).padStart(2, '0')}-${String(exitDate.getDate()).padStart(2, '0')}`;

    if (!grouped[dateKey]) {
      grouped[dateKey] = 0;
    }
    grouped[dateKey] += pl;
  });

  return grouped;
};

const handleTrade = (e, onTradeAdded, screenshotData) => {
  e.preventDefault();
  helper.hideError();

  const ticker = e.target.querySelector('#ticker').value;
  const enterTime = e.target.querySelector('#enterTime').value;
  const exitTime = e.target.querySelector('#exitTime').value;
  const enterPrice = e.target.querySelector('#enterPrice').value;
  const exitPrice = e.target.querySelector('#exitPrice').value;
  const quantity = e.target.querySelector('#quantity').value;
  const manualPL = e.target.querySelector('#manualPL').value;
  const comments = e.target.querySelector('#comments').value;

  if (!ticker || !enterTime || !exitTime || !enterPrice || !exitPrice || !quantity) {
    helper.handleError('Ticker, enter time, exit time, enter price, exit price, and quantity are required');
    return false;
  }

  const tradeData = {
    ticker,
    enterTime,
    exitTime,
    enterPrice: parseFloat(enterPrice),
    exitPrice: parseFloat(exitPrice),
    quantity: parseFloat(quantity),
    comments
  };

  if (manualPL) {
    tradeData.manualPL = parseFloat(manualPL);
  }

  if (screenshotData) {
    tradeData.screenshot = screenshotData;
  }

  helper.sendPost(e.target.action, tradeData, onTradeAdded);
  return false;
};

const handleRemoveTrade = (id, onTradeRemoved) => {
  helper.hideError();

  if (!id) {
    helper.handleError('Trade ID is required to delete!');
    return false;
  }

  helper.sendPost('/removeTrade', { _id: id }, onTradeRemoved);
  return false;
};

const handleUpdateTrade = (e, tradeId, onTradeUpdated, screenshotData) => {
  e.preventDefault();
  helper.hideError();

  const ticker = e.target.querySelector('#ticker').value;
  const enterTime = e.target.querySelector('#enterTime').value;
  const exitTime = e.target.querySelector('#exitTime').value;
  const enterPrice = e.target.querySelector('#enterPrice').value;
  const exitPrice = e.target.querySelector('#exitPrice').value;
  const quantity = e.target.querySelector('#quantity').value;
  const manualPL = e.target.querySelector('#manualPL').value;
  const comments = e.target.querySelector('#comments').value;

  if (!ticker || !enterTime || !exitTime || !enterPrice || !exitPrice || !quantity) {
    helper.handleError('Ticker, enter time, exit time, enter price, exit price, and quantity are required');
    return false;
  }

  const tradeData = {
    _id: tradeId,
    ticker,
    enterTime,
    exitTime,
    enterPrice: parseFloat(enterPrice),
    exitPrice: parseFloat(exitPrice),
    quantity: parseFloat(quantity),
    comments
  };

  if (manualPL) {
    tradeData.manualPL = parseFloat(manualPL);
  }

  if (screenshotData) {
    tradeData.screenshot = screenshotData;
  }

  helper.sendPost('/updateTrade', tradeData, onTradeUpdated);
  return false;
};

//Displays all the stats on the dashboard
const DashboardStats = ({ trades }) => {
  const stats = calculateAnalytics(trades);

  return (
    <div className="dashboardStats">
      <div className={`statCard ${stats.totalPL >= 0 ? 'positive' : 'negative'}`}>
        <div className="statLabel">Total P/L</div>
        <div className="statValue">${stats.totalPL.toFixed(2)}</div>
      </div>

      <div className="statCard">
        <div className="statLabel">Win Rate</div>
        <div className="statValue">{stats.winRate.toFixed(1)}%</div>
      </div>

      <div className="statCard positive">
        <div className="statLabel">Avg Win</div>
        <div className="statValue">${stats.avgWin.toFixed(2)}</div>
      </div>

      <div className="statCard negative">
        <div className="statLabel">Avg Loss</div>
        <div className="statValue">${stats.avgLoss.toFixed(2)}</div>
      </div>

      <div className="statCard">
        <div className="statLabel">Total Trades</div>
        <div className="statValue">{stats.totalTrades}</div>
      </div>

      <div className="statCard">
        <div className="statLabel">Wins</div>
        <div className="statValue">{stats.wins}</div>
      </div>

      <div className="statCard">
        <div className="statLabel">Losses</div>
        <div className="statValue">{stats.losses}</div>
      </div>

      <div className="statCard">
        <div className="statLabel">Avg Duration</div>
        <div className="statValue">{formatDuration(stats.avgDuration)}</div>
      </div>
    </div>
  );
};

//Displays the best and worst trades
const PerformanceDisplay = ({ trades }) => {
  const stats = calculateAnalytics(trades);

  if (trades.length === 0) {
    return null;
  }

  return (
    <div className="performanceMetrics">
      <div className="metricCard positive">
        <div className="metricLabel">Best Trade</div>
        <div className="metricValue">${stats.bestTrade.toFixed(2)}</div>
      </div>

      <div className="metricCard negative">
        <div className="metricLabel">Worst Trade</div>
        <div className="metricValue">${stats.worstTrade.toFixed(2)}</div>
      </div>
    </div>
  );
};

//CALENDAR VIEW -> Displays a calendar with daily P/L totals (may add winrate and # of trades in the future as well)
const CalendarView = ({ trades }) => {
  const [currentDate, setCurrentDate] = useState(new Date());
  const dailyPL = groupTradesByDate(trades);

  const year = currentDate.getFullYear();
  const month = currentDate.getMonth();

  const firstDay = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();

  const previousMonth = () => {
    setCurrentDate(new Date(year, month - 1, 1));
  };

  const nextMonth = () => {
    setCurrentDate(new Date(year, month + 1, 1));
  };

  const monthNames = [
    'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December'
  ];

  const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

  const renderDays = () => {
    const days = [];

    for (let i = 0; i < firstDay; i++) {
      days.push(<div key={`empty-${i}`} className="calendarDay empty"></div>);
    }

    for (let day = 1; day <= daysInMonth; day++) {
      const dateKey = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
      const pl = dailyPL[dateKey] || 0;
      const hasActivity = dailyPL[dateKey] !== undefined;

      let dayClass = 'calendarDay';
      if (hasActivity) {
        dayClass += pl >= 0 ? ' profitable' : ' loss';
      }

      days.push(
        <div key={day} className={dayClass}>
          <div className="dayNumber">{day}</div>
          {hasActivity && (
            <div className="dayPL">${pl.toFixed(0)}</div>
          )}
        </div>
      );
    }

    return days;
  };

  return (
    <div className="calendarView">
      <div className="calendarHeader">
        <button type="button" onClick={previousMonth} className="calendarNav">←</button>
        <h3 className="calendarTitle">{monthNames[month]} {year}</h3>
        <button type="button" onClick={nextMonth} className="calendarNav">→</button>
      </div>

      <div className="calendarGrid">
        {dayNames.map(day => (
          <div key={day} className="calendarDayName">{day}</div>
        ))}
        {renderDays()}
      </div>
    </div>
  );
};

//TRIAL BANNER COMPONENT -> If user isn't a premium user, shows trial status (countdown or expired)
const TrialBanner = ({ subscriptionStatus }) => {
  if (!subscriptionStatus) return null;

  if (subscriptionStatus.isPremium) return null;

  const { isTrialActive, trialDaysRemaining } = subscriptionStatus;

  if (isTrialActive) {
    return (
      <div className="trialBanner active">
        <p>
          <b>Free Trial Active!</b> You have <b>{trialDaysRemaining} day{trialDaysRemaining !== 1 ? 's' : ''}</b> remaining.
          Upgrade now for just <b>$7/month</b> to keep full access!
        </p>
      </div>
    );
  } else {
    return (
      <div className="trialBanner expired">
        <p>
          <b>Trial Expired!</b> Upgrade now for just <b>$7/month</b> to continue adding trades and unlock all features!
        </p>
      </div>
    );
  }
}

// Screenshot Markup Modal Component
const ScreenshotMarkupModal = ({ isOpen, onClose, onSave, initialImage }) => {
  const canvasRef = React.useRef(null);
  const [currentTool, setCurrentTool] = useState('pen');
  const [currentColor, setCurrentColor] = useState('#ef4444');
  const [isDrawing, setIsDrawing] = useState(false);
  const [history, setHistory] = useState([]);
  const [historyStep, setHistoryStep] = useState(-1);

  useEffect(() => {
    if (!isOpen || !canvasRef.current) return;

    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    const img = new Image();

    img.onload = () => {
      // Set canvas size to match image
      const maxWidth = 900;
      const maxHeight = 700;
      let width = img.width;
      let height = img.height;

      if (width > maxWidth) {
        height = (height * maxWidth) / width;
        width = maxWidth;
      }
      if (height > maxHeight) {
        width = (width * maxHeight) / height;
        height = maxHeight;
      }

      canvas.width = width;
      canvas.height = height;
      ctx.drawImage(img, 0, 0, width, height);

      // Save initial state
      saveState();
    };

    img.src = initialImage;
  }, [isOpen, initialImage]);

  const saveState = () => {
    if (!canvasRef.current) return;
    const canvas = canvasRef.current;
    const newHistory = history.slice(0, historyStep + 1);
    newHistory.push(canvas.toDataURL());
    setHistory(newHistory);
    setHistoryStep(newHistory.length - 1);
  };

  const undo = () => {
    if (historyStep > 0) {
      const canvas = canvasRef.current;
      const ctx = canvas.getContext('2d');
      const img = new Image();
      img.onload = () => {
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        ctx.drawImage(img, 0, 0);
      };
      img.src = history[historyStep - 1];
      setHistoryStep(historyStep - 1);
    }
  };

  const clearCanvas = () => {
    if (!canvasRef.current) return;
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    const img = new Image();
    img.onload = () => {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      saveState();
    };
    img.src = initialImage;
  };

  const startDrawing = (e) => {
    const canvas = canvasRef.current;
    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    setIsDrawing(true);
    const ctx = canvas.getContext('2d');
    ctx.strokeStyle = currentColor;
    ctx.lineWidth = 3;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';

    if (currentTool === 'pen') {
      ctx.beginPath();
      ctx.moveTo(x, y);
    } else if (currentTool === 'arrow') {
      canvas.dataset.startX = x;
      canvas.dataset.startY = y;
    } else if (currentTool === 'text') {
      const text = prompt('Enter text:');
      if (text) {
        ctx.font = '16px Inter, sans-serif';
        ctx.fillStyle = currentColor;
        ctx.fillText(text, x, y);
        saveState();
      }
      setIsDrawing(false);
    }
  };

  const draw = (e) => {
    if (!isDrawing) return;
    const canvas = canvasRef.current;
    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    const ctx = canvas.getContext('2d');

    if (currentTool === 'pen') {
      ctx.lineTo(x, y);
      ctx.stroke();
    }
  };

  const stopDrawing = (e) => {
    if (!isDrawing) return;
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');

    if (currentTool === 'arrow') {
      const rect = canvas.getBoundingClientRect();
      const endX = e.clientX - rect.left;
      const endY = e.clientY - rect.top;
      const startX = parseFloat(canvas.dataset.startX);
      const startY = parseFloat(canvas.dataset.startY);

      // Draw arrow
      const angle = Math.atan2(endY - startY, endX - startX);
      const headLength = 15;

      ctx.beginPath();
      ctx.moveTo(startX, startY);
      ctx.lineTo(endX, endY);
      ctx.lineTo(
        endX - headLength * Math.cos(angle - Math.PI / 6),
        endY - headLength * Math.sin(angle - Math.PI / 6)
      );
      ctx.moveTo(endX, endY);
      ctx.lineTo(
        endX - headLength * Math.cos(angle + Math.PI / 6),
        endY - headLength * Math.sin(angle + Math.PI / 6)
      );
      ctx.stroke();
    }

    setIsDrawing(false);
    saveState();
  };

  const handleSave = async () => {
    if (!canvasRef.current) return;
    const canvas = canvasRef.current;
    const screenshotData = canvas.toDataURL('image/png');
    // Resize to 720p max before saving
    const resizedData = await resizeImage(screenshotData);
    onSave(resizedData);
    onClose();
  };

  if (!isOpen) return null;

  return (
    <div className="markupBackdrop" onClick={onClose}>
      <div className="markupModal" onClick={(e) => e.stopPropagation()}>
        <div className="markupHeader">
          <h3>Annotate Screenshot</h3>
          <button className="closeButton" onClick={onClose}>×</button>
        </div>

        <div className="markupToolbar">
          <div className="toolGroup">
            <button
              className={`toolBtn ${currentTool === 'pen' ? 'active' : ''}`}
              onClick={() => setCurrentTool('pen')}
              title="Freehand Pen"
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M12 19l7-7 3 3-7 7-3-3z"></path>
                <path d="M18 13l-1.5-7.5L2 2l3.5 14.5L13 18l5-5z"></path>
                <path d="M2 2l7.586 7.586"></path>
              </svg>
            </button>
            <button
              className={`toolBtn ${currentTool === 'arrow' ? 'active' : ''}`}
              onClick={() => setCurrentTool('arrow')}
              title="Arrow"
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <line x1="5" y1="12" x2="19" y2="12"></line>
                <polyline points="12 5 19 12 12 19"></polyline>
              </svg>
            </button>
            <button
              className={`toolBtn ${currentTool === 'text' ? 'active' : ''}`}
              onClick={() => setCurrentTool('text')}
              title="Text"
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <polyline points="4 7 4 4 20 4 20 7"></polyline>
                <line x1="9" y1="20" x2="15" y2="20"></line>
                <line x1="12" y1="4" x2="12" y2="20"></line>
              </svg>
            </button>
          </div>

          <div className="colorGroup">
            {['#ef4444', '#10b981', '#3d7dff', '#ffffff'].map(color => (
              <button
                key={color}
                className={`colorBtn ${currentColor === color ? 'active' : ''}`}
                style={{ backgroundColor: color }}
                onClick={() => setCurrentColor(color)}
                title={color}
              />
            ))}
          </div>

          <div className="actionGroup">
            <button className="actionBtn" onClick={undo} disabled={historyStep <= 0} title="Undo">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M3 7v6h6"></path>
                <path d="M21 17a9 9 0 00-9-9 9 9 0 00-6 2.3L3 13"></path>
              </svg>
            </button>
            <button className="actionBtn" onClick={clearCanvas} title="Clear All">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <polyline points="3 6 5 6 21 6"></polyline>
                <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
              </svg>
            </button>
          </div>
        </div>

        <div className="canvasContainer">
          <canvas
            ref={canvasRef}
            onMouseDown={startDrawing}
            onMouseMove={draw}
            onMouseUp={stopDrawing}
            onMouseLeave={stopDrawing}
          />
        </div>

        <div className="markupActions">
          <button className="markupCancel" onClick={onClose}>Cancel</button>
          <button className="markupSave" onClick={handleSave}>Save Screenshot</button>
        </div>
      </div>
    </div>
  );
};

const TradeFormPopup = ({ isOpen, onClose, triggerReload, editingTrade }) => {
  const [screenshot, setScreenshot] = useState(null);
  const [pastedImage, setPastedImage] = useState(null);
  const [isMarkupOpen, setIsMarkupOpen] = useState(false);

  useEffect(() => {
    const handleEscape = (e) => {
      if (e.key === 'Escape') onClose();
    };
    if (isOpen) {
      document.addEventListener('keydown', handleEscape);
      document.body.style.overflow = 'hidden';
    }
    return () => {
      document.removeEventListener('keydown', handleEscape);
      document.body.style.overflow = 'unset';
    };
  }, [isOpen, onClose]);

  useEffect(() => {
    if (!isOpen) {
      setScreenshot(null);
      setPastedImage(null);
      return;
    }

    // Load existing screenshot if editing
    if (editingTrade && editingTrade.screenshot) {
      setScreenshot(editingTrade.screenshot);
    }

    // Handle paste event for screenshots
    const handlePaste = (e) => {
      const items = e.clipboardData?.items;
      if (!items) return;

      for (let i = 0; i < items.length; i++) {
        if (items[i].type.indexOf('image') !== -1) {
          const blob = items[i].getAsFile();
          const reader = new FileReader();
          reader.onload = (event) => {
            setPastedImage(event.target.result);
          };
          reader.readAsDataURL(blob);
          e.preventDefault();
          break;
        }
      }
    };

    document.addEventListener('paste', handlePaste);
    return () => {
      document.removeEventListener('paste', handlePaste);
    };
  }, [isOpen, editingTrade]);

  if (!isOpen) return null;

  const isEditing = editingTrade !== null;

  const handleSubmit = (e) => {
    if (isEditing) {
      handleUpdateTrade(e, editingTrade._id, () => {
        triggerReload();
        onClose();
      }, screenshot);
    } else {
      handleTrade(e, () => {
        triggerReload();
        onClose();
      }, screenshot);
    }
  };

  const formatDateTimeForInput = (dateString) => {
    if (!dateString) return '';
    const date = new Date(dateString);
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    const hours = String(date.getHours()).padStart(2, '0');
    const minutes = String(date.getMinutes()).padStart(2, '0');
    const seconds = String(date.getSeconds()).padStart(2, '0');
    return `${year}-${month}-${day}T${hours}:${minutes}:${seconds}`;
  };

  const handleOpenMarkup = () => {
    if (pastedImage) {
      setIsMarkupOpen(true);
    }
  };

  const handleSaveScreenshot = async (annotatedImage) => {
    // Image is already resized in ScreenshotMarkupModal.handleSave
    setScreenshot(annotatedImage);
    setPastedImage(null);
  };

  const handleRemoveScreenshot = () => {
    setScreenshot(null);
    setPastedImage(null);
  };

  return (
    <>
      <div className="formBackdrop" onClick={onClose}>
        <div className="formContent" onClick={(e) => e.stopPropagation()}>
          <button className="closeButton" onClick={onClose}>×</button>
          <h2>{isEditing ? 'Edit Trade' : 'Journal New Trade'}</h2>
          <form id="tradeForm"
            onSubmit={(e) => handleSubmit(e)}
            name="tradeForm"
            action={isEditing ? "/updateTrade" : "/trades"}
            method="POST"
            className="tradeForm"
          >
            <label htmlFor="ticker">Ticker</label>
            <input
              id="ticker"
              type="text"
              name="ticker"
              placeholder="AAPL"
              defaultValue={isEditing ? editingTrade.ticker : ''}
            />

            <label htmlFor="enterTime">Enter Time</label>
            <input
              id="enterTime"
              type="datetime-local"
              name="enterTime"
              step="1"
              defaultValue={isEditing ? formatDateTimeForInput(editingTrade.enterTime) : ''}
            />

            <label htmlFor="exitTime">Exit Time</label>
            <input
              id="exitTime"
              type="datetime-local"
              name="exitTime"
              step="1"
              defaultValue={isEditing ? formatDateTimeForInput(editingTrade.exitTime) : ''}
            />

            <label htmlFor="enterPrice">Enter Price</label>
            <input
              id="enterPrice"
              type="number"
              step="0.01"
              min="0"
              name="enterPrice"
              placeholder="0.00"
              defaultValue={isEditing ? editingTrade.enterPrice : ''}
            />

            <label htmlFor="exitPrice">Exit Price</label>
            <input
              id="exitPrice"
              type="number"
              step="0.01"
              min="0"
              name="exitPrice"
              placeholder="0.00"
              defaultValue={isEditing ? editingTrade.exitPrice : ''}
            />

            <label htmlFor="quantity">Quantity</label>
            <input
              id="quantity"
              type="number"
              step="0.01"
              name="quantity"
              placeholder="1"
              defaultValue={isEditing ? editingTrade.quantity : ''}
            />

            <label htmlFor="manualPL">P/L (Optional)</label>
            <input
              id="manualPL"
              type="number"
              step="0.01"
              name="manualPL"
              placeholder="Leave blank to auto-calculate"
              defaultValue={isEditing && editingTrade.manualPL ? editingTrade.manualPL : ''}
            />

            <label htmlFor="comments">Comments</label>
            <textarea
              id="comments"
              name="comments"
              placeholder="Trade notes..."
              rows="3"
              defaultValue={isEditing ? editingTrade.comments : ''}
            ></textarea>

            <label>Screenshot</label>
            <div className="screenshotSection">
              {!screenshot && !pastedImage && (
                <div className="screenshotPlaceholder">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect>
                    <circle cx="8.5" cy="8.5" r="1.5"></circle>
                    <polyline points="21 15 16 10 5 21"></polyline>
                  </svg>
                  <p>Paste screenshot (Ctrl+V)</p>
                </div>
              )}

              {pastedImage && !screenshot && (
                <div className="screenshotPreview">
                  <img src={pastedImage} alt="Pasted screenshot" />
                  <div className="screenshotActions">
                    <button type="button" className="annotateBtn" onClick={handleOpenMarkup}>
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <path d="M12 19l7-7 3 3-7 7-3-3z"></path>
                        <path d="M18 13l-1.5-7.5L2 2l3.5 14.5L13 18l5-5z"></path>
                      </svg>
                      Annotate Screenshot
                    </button>
                    <button type="button" className="usePlainBtn" onClick={async () => {
                      const resized = await resizeImage(pastedImage);
                      setScreenshot(resized);
                      setPastedImage(null);
                    }}>
                      Use Without Annotation
                    </button>
                    <button type="button" className="removeBtn" onClick={handleRemoveScreenshot}>
                      Remove
                    </button>
                  </div>
                </div>
              )}

              {screenshot && (
                <div className="screenshotPreview">
                  <img src={screenshot} alt="Trade screenshot" />
                  <div className="screenshotActions">
                    <button type="button" className="removeBtn" onClick={handleRemoveScreenshot}>
                      Remove Screenshot
                    </button>
                  </div>
                </div>
              )}
            </div>

            <div id="errorDiv" className='hidden'>
              <h3><span id="errorMessage"></span></h3>
            </div>

            <input
              className="makeTradeSubmit"
              type="submit"
              value={isEditing ? "Update Trade" : "Add Trade"}
            />
          </form>
        </div>
      </div>

      <ScreenshotMarkupModal
        isOpen={isMarkupOpen}
        onClose={() => setIsMarkupOpen(false)}
        onSave={handleSaveScreenshot}
        initialImage={pastedImage}
      />
    </>
  );
}

const TradeList = (props) => {
  const { trades } = props;

  if (trades.length === 0) {
    return (
      <div className="tradeList">
        <h3 className="emptyTrade">No Trades yet</h3>
      </div>
    );
  }

  const tradeNodes = trades.map(trade => {
    const profitLoss = trade.manualPL !== null && trade.manualPL !== undefined
      ? trade.manualPL
      : (trade.exitPrice - trade.enterPrice) * trade.quantity;
    const profitLossClass = profitLoss >= 0 ? 'profit' : 'loss';

    const formatDateTime = (dateString) => {
      const date = new Date(dateString);
      return date.toLocaleString('en-US', {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit'
      });
    };

    return (
      <div key={trade._id} className="trade">
        <div className="tradeHeader">
          <h3 className="tradeTicker">{trade.ticker}</h3>
          <h3 className="tradeDate">
            {formatDateTime(trade.enterTime)} → {formatDateTime(trade.exitTime)}
          </h3>
          <div className="tradeActions">
            <img
              src="/assets/img/pencil-edit-button.svg"
              alt="edit trade"
              className="tradeEdit"
              onClick={() => props.onEdit(trade)}
            />
            <img
              src="/assets/img/trash.png"
              alt="delete trade"
              className="tradeDelete"
              onClick={() => handleRemoveTrade(trade._id, props.triggerReload)}
            />
          </div>
        </div>
        <div className="tradeDetails">
          <div className="tradePrice">
            <span className="label">Entry:</span> ${trade.enterPrice.toFixed(2)}
          </div>
          <div className="tradePrice">
            <span className="label">Exit:</span> ${trade.exitPrice.toFixed(2)}
          </div>
          <div className="tradeQuantity">
            <span className="label">Qty:</span> {trade.quantity}
          </div>
          <div className={`tradeProfitLoss ${profitLossClass}`}>
            <span className="label">P/L:</span> ${profitLoss.toFixed(2)}
            {trade.manualPL !== null && trade.manualPL !== undefined && (
              <span className="manualIndicator"> (manual)</span>
            )}
          </div>
        </div>
        {trade.comments && (
          <div className="tradeComments">
            <span className="label">Notes:</span> {trade.comments}
          </div>
        )}
      </div>
    );
  });

  return (
    <div className="tradeList">
      {tradeNodes}
    </div>
  );
};

const App = () => {
  const [reloadTrades, setReloadTrades] = useState(false);
  const [trades, setTrades] = useState([]);
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingTrade, setEditingTrade] = useState(null);
  const [subscriptionStatus, setSubscriptionStatus] = useState(null);

  useEffect(() => {
    const loadTradesFromServer = async () => {
      const response = await fetch('/getTrades');
      const data = await response.json();
      setTrades(data.trades);
    };
    loadTradesFromServer();
  }, [reloadTrades]);

  useEffect(() => {
    const fetchSubscriptionStatus = async () => {
      try {
        const response = await fetch('/subscriptionStatus');
        const data = await response.json();
        setSubscriptionStatus(data);
      } catch (err) {
        console.error('Failed to fetch subscription status:', err);
      }
    };

    fetchSubscriptionStatus();
  }, []);

  return (
    <div>
      <TrialBanner subscriptionStatus={subscriptionStatus} />
      {subscriptionStatus && (subscriptionStatus.isPremium || subscriptionStatus.isTrialActive) && (
        <div id="makeTradeButtonContainer">
          <button
            className="journalNewTradeButton"
            onClick={() => setIsFormOpen(true)}
          >
            + Journal New Trade
          </button>
        </div>
      )}
      <div id="dashboard">
        <h2 className="dashboardTitle">Trading Dashboard</h2>
        <DashboardStats trades={trades} />
        <PerformanceDisplay trades={trades} />
        <CalendarView trades={trades} />
      </div>
      <TradeFormPopup
        isOpen={isFormOpen}
        onClose={() => {
          setIsFormOpen(false);
          setEditingTrade(null);
        }}
        triggerReload={() => setReloadTrades(!reloadTrades)}
        editingTrade={editingTrade}
      />
      <div id="trades">
        <TradeList
          trades={trades}
          reloadTrades={reloadTrades}
          triggerReload={() => setReloadTrades(!reloadTrades)}
          onEdit={(trade) => {
            setEditingTrade(trade);
            setIsFormOpen(true);
          }}
        />
      </div>
    </div>
  );
};

const init = () => {
  const root = createRoot(document.getElementById('app'));
  root.render(<App />);
  setupSidebar();
};

window.onload = init;
