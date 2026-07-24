/**
 * Zero-dependency shim replacing @supabase/supabase-js.
 * Talks to the local Node API (/api/auth/*, /api/uploads) and mimics the
 * supabase-js return shapes ({ data, error }) for every call site in client/.
 *
 * - JWT stored in localStorage under `rr_token`
 * - User object cached in localStorage under `rr_user`
 */

const TOKEN_KEY = 'rr_token';
const USER_KEY = 'rr_user';

/* ------------------------------- storage ---------------------------------- */

const getToken = () => localStorage.getItem(TOKEN_KEY);

const getCachedUser = () => {
  try {
    return JSON.parse(localStorage.getItem(USER_KEY)) || null;
  } catch (e) {
    return null;
  }
};

const buildSession = () => {
  const token = getToken();
  return token ? { access_token: token, user: getCachedUser() } : null;
};

const storeSession = (user, accessToken) => {
  localStorage.setItem(TOKEN_KEY, accessToken);
  localStorage.setItem(USER_KEY, JSON.stringify(user));
};

const clearSession = () => {
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(USER_KEY);
};

/* --------------------------- auth state events ---------------------------- */

const listeners = [];

const notifyListeners = (event, session) => {
  [...listeners].forEach((cb) => {
    try {
      cb(event, session);
    } catch (e) { /* listener errors must not break auth flow */ }
  });
};

/* ---------------------------- token validation ---------------------------- */

// The client has no 401 handling on authFetch call sites, so a stale token is
// caught here instead: the first getSession() of a page load validates the
// token against the API and clears it if invalid. The result is memoized —
// authFetch calls getSession() before every request and must stay cheap.
let sessionPromise = null;

const validateStoredToken = () => {
  const token = getToken();
  if (!token) return Promise.resolve(null);

  if (!sessionPromise) {
    sessionPromise = fetch('/api/auth/session', {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then(async (res) => {
        if (!res.ok) {
          clearSession();
          return null;
        }
        const body = await res.json();
        if (body && body.user) {
          localStorage.setItem(USER_KEY, JSON.stringify(body.user));
        }
        return buildSession();
      })
      .catch(() => buildSession()); // network error: keep cached session
  }
  return sessionPromise;
};

const parseErrorMessage = async (res, fallback) => {
  try {
    const body = await res.json();
    return body.error || body.message || fallback;
  } catch (e) {
    return fallback;
  }
};

const authRequest = async (path, payload, token) => {
  const headers = { 'Content-Type': 'application/json' };
  if (token) headers.Authorization = `Bearer ${token}`;
  return fetch(path, {
    method: 'POST',
    headers,
    body: payload !== undefined ? JSON.stringify(payload) : undefined,
  });
};

const completeSignIn = (user, accessToken) => {
  storeSession(user, accessToken);
  const session = buildSession();
  sessionPromise = Promise.resolve(session);
  notifyListeners('SIGNED_IN', session);
  return session;
};

const signInOrUp = async (path, payload, fallbackError) => {
  try {
    const res = await authRequest(path, payload);
    if (!res.ok) {
      const message = await parseErrorMessage(res, fallbackError);
      return { data: { user: null, session: null }, error: { message } };
    }
    const body = await res.json();
    const session = completeSignIn(body.user, body.access_token);
    return { data: { user: body.user, session }, error: null };
  } catch (e) {
    return { data: { user: null, session: null }, error: { message: 'Could not reach the server. Is it running?' } };
  }
};

/* --------------------------------- auth ----------------------------------- */

const auth = {
  getSession: async () => ({ data: { session: await validateStoredToken() } }),

  getUser: async () => {
    const session = await validateStoredToken();
    if (!session || !session.user) {
      return { data: { user: null }, error: { message: 'Auth session missing!' } };
    }
    return { data: { user: session.user }, error: null };
  },

  signInWithPassword: ({ email, password }) => signInOrUp(
    '/api/auth/login',
    { email, password },
    'Invalid login credentials',
  ),

  signUp: ({ email, password, options }) => signInOrUp(
    '/api/auth/signup',
    { email, password, username: options && options.data && options.data.username },
    'Could not create account',
  ),

  signOut: async () => {
    const token = getToken();
    if (token) {
      try {
        await authRequest('/api/auth/logout', undefined, token);
      } catch (e) { /* stateless logout: discarding the token is enough */ }
    }
    clearSession();
    sessionPromise = Promise.resolve(null);
    notifyListeners('SIGNED_OUT', null);
    return { error: null };
  },

  updateUser: async ({ password }) => {
    const token = getToken();
    if (!token) {
      return { data: { user: null }, error: { message: 'Not authenticated' } };
    }
    if (!password) {
      return { data: { user: null }, error: { message: 'Nothing to update' } };
    }
    try {
      const res = await authRequest('/api/auth/change-password', { newPassword: password }, token);
      if (!res.ok) {
        const message = await parseErrorMessage(res, 'Could not update password');
        return { data: { user: null }, error: { message } };
      }
      return { data: { user: getCachedUser() }, error: null };
    } catch (e) {
      return { data: { user: null }, error: { message: 'Could not reach the server. Is it running?' } };
    }
  },

  resetPasswordForEmail: async () => ({
    data: {},
    error: { message: 'Password reset by email is not available in self-hosted mode. Run: npm run reset-password -- <email> <new-password>' },
  }),

  onAuthStateChange: (callback) => {
    listeners.push(callback);
    // Mimic supabase-js: fire INITIAL_SESSION asynchronously after subscribing.
    validateStoredToken().then((session) => callback('INITIAL_SESSION', session));
    return {
      data: {
        subscription: {
          unsubscribe: () => {
            const idx = listeners.indexOf(callback);
            if (idx !== -1) listeners.splice(idx, 1);
          },
        },
      },
    };
  },
};

/* -------------------------------- storage --------------------------------- */

const storage = {
  from: () => ({
    upload: async (name, blob) => {
      const token = getToken();
      if (!token) {
        return { data: null, error: { message: 'Not authenticated' } };
      }
      try {
        const formData = new FormData();
        const fileName = String(name).split('/').pop() || 'upload.jpg';
        formData.append('file', blob, fileName);
        const res = await fetch('/api/uploads', {
          method: 'POST',
          headers: { Authorization: `Bearer ${token}` },
          body: formData,
        });
        if (!res.ok) {
          const message = await parseErrorMessage(res, 'Upload failed');
          return { data: null, error: { message } };
        }
        const body = await res.json();
        return { data: { path: body.path }, error: null };
      } catch (e) {
        return { data: null, error: { message: 'Upload failed: could not reach the server' } };
      }
    },
    getPublicUrl: (path) => ({ data: { publicUrl: `/uploads/${path}` } }),
  }),
};

const supabase = { auth, storage };

module.exports = { supabase };
