"use strict";
(function () {
  const config = window.IRIS_RUNTIME_CONFIG || {};
  const STORAGE_KEY = "iris.session";
  const REFRESH_MARGIN_MS = 60 * 1000;

  function configured() {
    return /^https:\/\/[a-z0-9-]+\.supabase\.co$/i.test(config.supabaseUrl || "")
      && /^sb_publishable_/i.test(config.supabasePublishableKey || "");
  }

  function redirectTarget() {
    const base = config.githubPagesBasePath || "/";
    return `${location.origin}${base}`;
  }

  const listeners = new Set();
  let session = null;
  let refreshTimer = null;

  function announce() {
    for (const fn of listeners) { try { fn(currentUser()); } catch { /* a listener must not break the session */ } }
  }

  function store(next) {
    session = next;
    try {
      if (next) localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
      else localStorage.removeItem(STORAGE_KEY);
    } catch { /* private mode: the session simply does not outlive the tab */ }
    scheduleRefresh();
    announce();
  }

  function restore() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) session = JSON.parse(raw);
    } catch { session = null; }
    if (session && session.expires_at && session.expires_at * 1000 < Date.now()) session = null;
    scheduleRefresh();
  }

  function scheduleRefresh() {
    if (refreshTimer) { clearTimeout(refreshTimer); refreshTimer = null; }
    if (!session || !session.expires_at || !session.refresh_token) return;
    const due = (session.expires_at * 1000) - Date.now() - REFRESH_MARGIN_MS;
    refreshTimer = setTimeout(() => { refresh().catch(() => signOut()); }, Math.max(5000, due));
  }

  function currentUser() {
    if (!session) return null;
    return { id: session.user_id || null, email: session.email || null, expiresAt: session.expires_at || null };
  }

  async function authFetch(path, body) {
    const response = await fetch(`${config.supabaseUrl}/auth/v1/${path}`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "apikey": config.supabasePublishableKey },
      body: JSON.stringify(body),
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      const error = new Error(data.error_description || data.msg || data.message || "Sign-in failed.");
      error.status = response.status;
      throw error;
    }
    return data;
  }

  function adopt(data) {
    if (!data || !data.access_token) return null;
    store({
      access_token: data.access_token,
      refresh_token: data.refresh_token || null,
      expires_at: data.expires_at || (Math.floor(Date.now() / 1000) + Number(data.expires_in || 3600)),
      user_id: data.user && data.user.id || null,
      email: data.user && data.user.email || null,
    });
    return currentUser();
  }

  async function signInWithEmail(email) {
    if (!configured()) throw Object.assign(new Error("Sign-in is not available in this build."), { code: "SECURITY_LOCKED" });
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(String(email || ""))) {
      throw Object.assign(new Error("Enter a valid email address."), { code: "INVALID_REQUEST" });
    }
    await authFetch("otp", { email, create_user: true, options: { email_redirect_to: redirectTarget() } });
    return { sent: true, redirectTo: redirectTarget() };
  }

  async function verifyOtp(email, code) {
    if (!configured()) throw Object.assign(new Error("Sign-in is not available in this build."), { code: "SECURITY_LOCKED" });
    return adopt(await authFetch("verify", { type: "email", email, token: String(code || "").trim() }));
  }

  function adoptFromUrl() {
    const hash = location.hash || "";
    if (!hash.includes("access_token")) return null;
    const params = new URLSearchParams(hash.replace(/^#/, ""));
    const adopted = adopt({
      access_token: params.get("access_token"),
      refresh_token: params.get("refresh_token"),
      expires_in: params.get("expires_in"),
    });
    try { history.replaceState(null, "", location.pathname + location.search); } catch { /* older browsers keep the fragment */ }
    if (adopted) loadUser().catch(() => {});
    return adopted;
  }

  async function loadUser() {
    if (!session) return null;
    const response = await fetch(`${config.supabaseUrl}/auth/v1/user`, {
      headers: { "apikey": config.supabasePublishableKey, "Authorization": `Bearer ${session.access_token}` },
    });
    if (!response.ok) return null;
    const user = await response.json().catch(() => null);
    if (user && user.id) store({ ...session, user_id: user.id, email: user.email || session.email });
    return currentUser();
  }

  async function refresh() {
    if (!session || !session.refresh_token) return null;
    const data = await authFetch("token?grant_type=refresh_token", { refresh_token: session.refresh_token });
    return adopt(data);
  }

  async function signOut() {
    const token = session && session.access_token;
    store(null);
    if (token && configured()) {
      await fetch(`${config.supabaseUrl}/auth/v1/logout`, {
        method: "POST",
        headers: { "apikey": config.supabasePublishableKey, "Authorization": `Bearer ${token}` },
      }).catch(() => {});
    }
    return true;
  }

  async function accessToken() {
    if (!session) return null;
    const expiring = session.expires_at && (session.expires_at * 1000 - Date.now()) < REFRESH_MARGIN_MS;
    if (expiring && session.refresh_token) {
      try { await refresh(); } catch { store(null); return null; }
    }
    return session ? session.access_token : null;
  }

  function functionUrl(name) {
    if (!configured()) return null;
    return `${config.supabaseUrl}/functions/v1/${encodeURIComponent(name)}`;
  }

  async function invoke(name, { body, idempotencyKey, signal } = {}) {
    const url = functionUrl(name);
    if (!url) throw Object.assign(new Error("This build is not connected to a project; nothing was sent."), { code: "SECURITY_LOCKED" });
    const token = await accessToken();
    if (!token) throw Object.assign(new Error("Please sign in to continue."), { code: "AUTH_REQUIRED" });
    const key = idempotencyKey || newIdempotencyKey();

    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "apikey": config.supabasePublishableKey,
        "Authorization": `Bearer ${token}`,
        "Idempotency-Key": key,
      },
      body: JSON.stringify(body || {}),
      signal,
    });
    const data = await response.json().catch(() => ({}));
    if (response.status === 401) {
      store(null);
      throw Object.assign(new Error(data.message || "Your session has expired. Please sign in again."), { code: "AUTH_REQUIRED", status: 401 });
    }
    if (!response.ok) {
      throw Object.assign(new Error(data.message || "That request could not be completed."), { code: data.error || "UPSTREAM_UNAVAILABLE", status: response.status });
    }
    return data;
  }

  function newIdempotencyKey() {
    const bytes = new Uint8Array(16);
    (window.crypto || {}).getRandomValues ? window.crypto.getRandomValues(bytes) : bytes.forEach((_, i) => { bytes[i] = Math.floor(Math.random() * 256); });
    return [...bytes].map(b => b.toString(16).padStart(2, "0")).join("");
  }

  restore();
  adoptFromUrl();

  window.IRIS_SUPABASE = Object.freeze({
    configured,
    mode: configured() ? "supabase" : "local-mock",
    functionUrl,
    invoke,
    newIdempotencyKey,
    redirectTarget,
    signInWithEmail,
    verifyOtp,
    signOut,
    refresh,
    accessToken,
    user: currentUser,
    onChange(fn) { listeners.add(fn); return () => listeners.delete(fn); },
  });
})();
