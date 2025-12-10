const helper = require('./helper.js');
const React = require('react');
const { useState, useEffect } = React;
const { createRoot } = require('react-dom/client');

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

const handleTrade = (e, onTradeAdded) => {
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

const handleUpdateTrade = (e, tradeId, onTradeUpdated) => {
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

  helper.sendPost('/updateTrade', tradeData, onTradeUpdated);
  return false;
};

//Displays all the stats on the dashboard
const DashboardStats = ({ trades }) => {
  const stats = calculateAnalytics(trades);

  return (
    <div class="dashboardStats">
      <div class={`statCard ${stats.totalPL >= 0 ? 'positive' : 'negative'}`}>
        <div class="statLabel">Total P/L</div>
        <div class="statValue">${stats.totalPL.toFixed(2)}</div>
      </div>

      <div class="statCard">
        <div class="statLabel">Win Rate</div>
        <div class="statValue">{stats.winRate.toFixed(1)}%</div>
      </div>

      <div class="statCard positive">
        <div class="statLabel">Avg Win</div>
        <div class="statValue">${stats.avgWin.toFixed(2)}</div>
      </div>

      <div class="statCard negative">
        <div class="statLabel">Avg Loss</div>
        <div class="statValue">${stats.avgLoss.toFixed(2)}</div>
      </div>

      <div class="statCard">
        <div class="statLabel">Total Trades</div>
        <div class="statValue">{stats.totalTrades}</div>
      </div>

      <div class="statCard">
        <div class="statLabel">Wins</div>
        <div class="statValue">{stats.wins}</div>
      </div>

      <div class="statCard">
        <div class="statLabel">Losses</div>
        <div class="statValue">{stats.losses}</div>
      </div>

      <div class="statCard">
        <div class="statLabel">Avg Duration</div>
        <div class="statValue">{formatDuration(stats.avgDuration)}</div>
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
    <div class="performanceMetrics">
      <div class="metricCard positive">
        <div class="metricLabel">Best Trade</div>
        <div class="metricValue">${stats.bestTrade.toFixed(2)}</div>
      </div>

      <div class="metricCard negative">
        <div class="metricLabel">Worst Trade</div>
        <div class="metricValue">${stats.worstTrade.toFixed(2)}</div>
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
      days.push(<div key={`empty-${i}`} class="calendarDay empty"></div>);
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
        <div key={day} class={dayClass}>
          <div class="dayNumber">{day}</div>
          {hasActivity && (
            <div class="dayPL">${pl.toFixed(0)}</div>
          )}
        </div>
      );
    }

    return days;
  };

  return (
    <div class="calendarView">
      <div class="calendarHeader">
        <button type="button" onClick={previousMonth} class="calendarNav">←</button>
        <h3 class="calendarTitle">{monthNames[month]} {year}</h3>
        <button type="button" onClick={nextMonth} class="calendarNav">→</button>
      </div>

      <div class="calendarGrid">
        {dayNames.map(day => (
          <div key={day} class="calendarDayName">{day}</div>
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
      <div class="trialBanner active">
        <p>
          🎉 <b>Free Trial Active!</b> You have <b>{trialDaysRemaining} day{trialDaysRemaining !== 1 ? 's' : ''}</b> remaining.
          Upgrade now for just <b>$7/month</b> to keep full access!
        </p>
      </div>
    );
  } else {
    return (
      <div class="trialBanner expired">
        <p>
          ⏰ <b>Trial Expired!</b> Upgrade now for just <b>$7/month</b> to continue adding trades and unlock all features!
        </p>
      </div>
    );
  }
}

// const TradeForm = (props) => {
//   return (
//     <div id="tradeFormButton">
//       <button class="journalNewTradeButton" onClick={() => setIsFormOpen(true)}>+ Journal New Trade</button>
//     </div>
//   );
// };

const TradeFormPopup = ({ isOpen, onClose, triggerReload, editingTrade }) => {
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

  if (!isOpen) return null;

  const isEditing = editingTrade !== null;

  const handleSubmit = (e) => {
    if (isEditing) {
      handleUpdateTrade(e, editingTrade._id, () => {
        triggerReload();
        onClose();
      });
    } else {
      handleTrade(e, () => {
        triggerReload();
        onClose();
      });
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

  return (
    <div class="formBackdrop" onClick={onClose}>
      <div class="formContent" onClick={(e) => e.stopPropagation()}>
        <button class="closeButton" onClick={onClose}>×</button>
        <h2>{isEditing ? 'Edit Trade' : 'Journal New Trade'}</h2>
        <form id="tradeForm"
          onSubmit={(e) => handleSubmit(e)}
          name="tradeForm"
          action={isEditing ? "/updateTrade" : "/trades"}
          method="POST"
          class="tradeForm"
        >
          <label htmlFor="ticker">Ticker: </label>
          <input
            id="ticker"
            type="text"
            name="ticker"
            placeholder="AAPL"
            defaultValue={isEditing ? editingTrade.ticker : ''}
          />

          <label htmlFor="enterTime">Enter Time: </label>
          <input
            id="enterTime"
            type="datetime-local"
            name="enterTime"
            step="1"
            defaultValue={isEditing ? formatDateTimeForInput(editingTrade.enterTime) : ''}
          />

          <label htmlFor="exitTime">Exit Time: </label>
          <input
            id="exitTime"
            type="datetime-local"
            name="exitTime"
            step="1"
            defaultValue={isEditing ? formatDateTimeForInput(editingTrade.exitTime) : ''}
          />

          <label htmlFor="enterPrice">Enter Price: </label>
          <input
            id="enterPrice"
            type="number"
            step="0.01"
            min="0"
            name="enterPrice"
            placeholder="0.00"
            defaultValue={isEditing ? editingTrade.enterPrice : ''}
          />

          <label htmlFor="exitPrice">Exit Price: </label>
          <input
            id="exitPrice"
            type="number"
            step="0.01"
            min="0"
            name="exitPrice"
            placeholder="0.00"
            defaultValue={isEditing ? editingTrade.exitPrice : ''}
          />

          <label htmlFor="quantity">Quantity: </label>
          <input
            id="quantity"
            type="number"
            step="0.01"
            name="quantity"
            placeholder="1"
            defaultValue={isEditing ? editingTrade.quantity : ''}
          />

          <label htmlFor="manualPL">P/L (optional): </label>
          <input
            id="manualPL"
            type="number"
            step="0.01"
            name="manualPL"
            placeholder="Leave blank to auto-calculate"
            defaultValue={isEditing && editingTrade.manualPL ? editingTrade.manualPL : ''}
          />

          <label htmlFor="comments">Comments: </label>
          <textarea
            id="comments"
            name="comments"
            placeholder="Trade notes..."
            rows="3"
            defaultValue={isEditing ? editingTrade.comments : ''}
          ></textarea>

          <div id="errorDiv" class='hidden'>
            <h3><span id="errorMessage"></span></h3>
          </div>

          <input
            class="makeTradeSubmit"
            type="submit"
            value={isEditing ? "Update Trade" : "Add Trade"}
          />
        </form>
      </div>
    </div>
  );
}

const TradeList = (props) => {
  const { trades } = props;

  if (trades.length === 0) {
    return (
      <div class="tradeList">
        <h3 class="emptyTrade">No Trades yet</h3>
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
      <div key={trade._id} class="trade">
        <div class="tradeHeader">
          <h3 class="tradeTicker">{trade.ticker}</h3>
          <h3 class="tradeDate">
            {formatDateTime(trade.enterTime)} → {formatDateTime(trade.exitTime)}
          </h3>
          <div class="tradeActions">
            <img
              src="/assets/img/pencil-edit-button.svg"
              alt="edit trade"
              class="tradeEdit"
              onClick={() => props.onEdit(trade)}
            />
            <img
              src="/assets/img/trash.png"
              alt="delete trade"
              class="tradeDelete"
              onClick={() => handleRemoveTrade(trade._id, props.triggerReload)}
            />
          </div>
        </div>
        <div class="tradeDetails">
          <div class="tradePrice">
            <span class="label">Entry:</span> ${trade.enterPrice.toFixed(2)}
          </div>
          <div class="tradePrice">
            <span class="label">Exit:</span> ${trade.exitPrice.toFixed(2)}
          </div>
          <div class="tradeQuantity">
            <span class="label">Qty:</span> {trade.quantity}
          </div>
          <div class={`tradeProfitLoss ${profitLossClass}`}>
            <span class="label">P/L:</span> ${profitLoss.toFixed(2)}
            {trade.manualPL !== null && trade.manualPL !== undefined && (
              <span class="manualIndicator"> (manual)</span>
            )}
          </div>
        </div>
        {trade.comments && (
          <div class="tradeComments">
            <span class="label">Notes:</span> {trade.comments}
          </div>
        )}
      </div>
    );
  });

  return (
    <div class="tradeList">
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
            class="journalNewTradeButton"
            onClick={() => setIsFormOpen(true)}
          >
            + Journal New Trade
          </button>
        </div>
      )}
      <div id="dashboard">
        <h2 class="dashboardTitle">Trading Dashboard</h2>
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
};

window.onload = init;
