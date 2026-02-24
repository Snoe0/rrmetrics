const formatDuration = (milliseconds) => {
  const totalSeconds = Math.floor(milliseconds / 1000);
  const days = Math.floor(totalSeconds / (24 * 60 * 60));
  const hours = Math.floor((totalSeconds % (24 * 60 * 60)) / (60 * 60));
  const minutes = Math.floor((totalSeconds % (60 * 60)) / 60);
  const seconds = totalSeconds % 60;

  if (days > 0) return `${days}d ${hours}h ${minutes}m`;
  if (hours > 0) return `${hours}h ${minutes}m ${seconds}s`;
  if (minutes > 0) return `${minutes}m ${seconds}s`;
  return `${seconds}s`;
};

const EST_TZ = 'America/New_York';

// Format a date in EST timezone - returns an object with EST components
const toEST = (date) => {
  const d = new Date(date);
  // Use Intl to get the parts in EST
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: EST_TZ,
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
    hour12: false,
  }).formatToParts(d);
  const get = (type) => parts.find(p => p.type === type).value;
  return {
    year: parseInt(get('year'), 10),
    month: parseInt(get('month'), 10),
    day: parseInt(get('day'), 10),
    hours: parseInt(get('hour'), 10) % 24,
    minutes: parseInt(get('minute'), 10),
    seconds: parseInt(get('second'), 10),
  };
};

const formatDateEST = (dateString) => {
  return new Date(dateString).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: EST_TZ });
};

const formatTimeEST = (dateString) => {
  return new Date(dateString).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', timeZone: EST_TZ });
};

const formatFullDateEST = (dateString) => {
  return new Date(dateString).toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric', timeZone: EST_TZ });
};

// Get EST offset string for the given date (handles EST/EDT)
const getESTOffset = (date) => {
  const d = new Date(date);
  const utcStr = d.toLocaleString('en-US', { timeZone: 'UTC' });
  const estStr = d.toLocaleString('en-US', { timeZone: EST_TZ });
  const diffMs = new Date(estStr) - new Date(utcStr);
  const diffHours = diffMs / 3600000;
  return diffHours === -4 ? '-04:00' : '-05:00';
};

module.exports = { formatDuration, EST_TZ, toEST, formatDateEST, formatTimeEST, formatFullDateEST, getESTOffset };
