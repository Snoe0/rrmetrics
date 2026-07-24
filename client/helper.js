/* Takes in an error message. Sets the error message up in html, and
   displays it to the user. Will be hidden by other events that could
   end in an error.
*/
const handleError = (message) => {
  document.getElementById('errorMessage').textContent = message;
  document.getElementById('errorDiv').classList.remove('hidden');
};

/**
 * The app is local and single-user (no auth), so this is a thin fetch wrapper
 * kept as the app's single API entry point. Name retained to avoid churn across
 * call sites.
 */
const authFetch = async (url, options = {}) => fetch(url, options);

/**
 * Uploads a JPEG data URL to the local screenshot store and returns its public
 * URL. The server generates the stored filename, so none is sent.
 */
const postScreenshot = async (dataUrl) => {
  const base64 = dataUrl.split(',')[1];
  const byteChars = atob(base64);
  const bytes = new Uint8Array(byteChars.length);
  for (let i = 0; i < byteChars.length; i++) bytes[i] = byteChars.charCodeAt(i);
  const blob = new Blob([bytes], { type: 'image/jpeg' });

  const formData = new FormData();
  formData.append('file', blob, 'screenshot.jpg');

  const res = await fetch('/api/uploads', { method: 'POST', body: formData });
  if (!res.ok) {
    let message = 'Upload failed';
    try { message = (await res.json()).error || message; } catch (e) { /* keep default */ }
    throw new Error(message);
  }
  const { path } = await res.json();
  return `/uploads/${path}`;
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
  postScreenshot,
};
