const helper = require('./helper.js');
const React = require('react');
const { useState, useEffect } = React;
const { createRoot } = require('react-dom/client');

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

const TradeForm = (props) => {
  return (
    <div id="tradeFormButton">
      <button className="journalNewTradeButton" onClick={() => setIsFormOpen(true)}>+ Journal New Trade</button>
    </div>
  );
};

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

  // Format datetime for input field (datetime-local requires specific format)
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

          <input
            className="makeTradeSubmit"
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

  useEffect(() => {
    const loadTradesFromServer = async () => {
      const response = await fetch('/getTrades');
      const data = await response.json();
      setTrades(data.trades);
    };
    loadTradesFromServer();
  }, [reloadTrades]);

  return (
    <div>
      <div id="makeTradeButtonContainer">
        <button
          className="journalNewTradeButton"
          onClick={() => setIsFormOpen(true)}
        >
          + Journal New Trade
        </button>
      </div>
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
};

window.onload = init;
