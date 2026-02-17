const { supabase } = require('./supabase.js');

/* Takes in an error message. Sets the error message up in html, and
   displays it to the user. Will be hidden by other events that could
   end in an error.
*/
const handleError = (message) => {
  document.getElementById('errorMessage').textContent = message;
  document.getElementById('errorDiv').classList.remove('hidden');
};

/**
 * Wraps fetch() to attach the Supabase JWT as Authorization header.
 * Falls back to regular fetch if no session exists.
 */
const authFetch = async (url, options = {}) => {
  const { data: { session } } = await supabase.auth.getSession();
  const headers = { ...options.headers };

  if (session?.access_token) {
    headers['Authorization'] = `Bearer ${session.access_token}`;
  }

  return fetch(url, { ...options, headers });
};

/* Sends post requests to the server using fetch with auth.
   Will look for various entries in the response JSON object,
   and will handle them appropriately.
*/
const sendPost = async (url, data, handler) => {
  const response = await authFetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(data),
  });

  const result = await response.json();
  document.getElementById('errorDiv').classList.add('hidden');

  if (result.redirect) {
    window.location = result.redirect;
  }

  if (result.error) {
    handleError(result.error);
  }

  if (handler) {
    handler(result);
  }
};

const hideError = () => {
  document.getElementById('errorDiv').classList.add('hidden');
};

module.exports = {
  handleError,
  sendPost,
  hideError,
  authFetch,
  supabase,
};
