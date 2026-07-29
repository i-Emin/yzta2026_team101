const BASE_URL = import.meta.env.VITE_API_URL || "http://localhost:8000";

function getToken() {
  return localStorage.getItem("fin101_token");
}

function authHeaders() {
  const token = getToken();
  return token
    ? { "Content-Type": "application/json", Authorization: `Bearer ${token}` }
    : { "Content-Type": "application/json" };
}

export async function registerUser(name, email, password, riskProfile = "Orta") {
  const res = await fetch(`${BASE_URL}/auth/register`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name, email, password, risk_profile: riskProfile }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail || `Kayıt hatası: ${res.status}`);
  }
  return res.json();
}

export async function loginUser(email, password) {
  const form = new URLSearchParams({ username: email, password });
  const res = await fetch(`${BASE_URL}/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: form.toString(),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail || `Giriş hatası: ${res.status}`);
  }
  const data = await res.json();
  localStorage.setItem("fin101_token", data.access_token);
  localStorage.setItem("fin101_user", JSON.stringify(data.user));
  return data;
}

export function logoutUser() {
  localStorage.removeItem("fin101_token");
  localStorage.removeItem("fin101_user");
}

export function getStoredUser() {
  try {
    return JSON.parse(localStorage.getItem("fin101_user"));
  } catch {
    return null;
  }
}

export function updateStoredUser(updates) {
  try {
    const current = getStoredUser() || {};
    const updated = { ...current, ...updates };
    localStorage.setItem("fin101_user", JSON.stringify(updated));
    return updated;
  } catch (err) {
    console.error("Failed to update stored user:", err);
  }
}

export async function getMe() {
  const res = await fetch(`${BASE_URL}/users/me`, { headers: authHeaders() });
  if (!res.ok) throw new Error(`Kullanıcı bilgisi alınamadı: ${res.status}`);
  return res.json();
}

export async function updateMe(payload) {
  const res = await fetch(`${BASE_URL}/users/me`, {
    method: "PUT",
    headers: authHeaders(),
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail || `Güncelleme hatası: ${res.status}`);
  }
  return res.json();
}

export async function sendChatMessage(message, sessionId = null, file_base64 = null, file_mime_type = null) {
  const response = await fetch(`${BASE_URL}/chat/`, {
    method: "POST",
    headers: authHeaders(),
    body: JSON.stringify({
      user_id: getStoredUser()?.id ?? "anonymous",
      session_id: sessionId,
      message,
      file_base64,
      file_mime_type,
    }),
  });

  if (!response.ok) {
    throw new Error(`Sunucu hatası: ${response.status}`);
  }

  const data = await response.json();
  return { reply: data.reply, sessionId: data.session_id };
}
export async function getStockData(symbol) {
  const response = await fetch(`${BASE_URL}/stocks/${symbol}`);
  if (!response.ok) {
    const err = await response.json().catch(() => ({}));
    throw new Error(err.detail || `Hisse verisi alınamadı: ${response.status}`);
  }
  return response.json();
}

export async function createTransaction(payload) {
  const response = await fetch(`${BASE_URL}/transactions/`, {
    method: "POST",
    headers: authHeaders(),
    body: JSON.stringify(payload),
  });
  if (!response.ok) {
    const err = await response.json().catch(() => ({}));
    throw new Error(err.detail || `İşlem hatası: ${response.status}`);
  }
  return response.json();
}

export async function getPortfolio() {
  const response = await fetch(`${BASE_URL}/portfolio/me`, { headers: authHeaders() });
  if (!response.ok) {
    throw new Error(`Portföy alınamadı: ${response.status}`);
  }
  return response.json();
}

export async function getMarketPrice(ticker) {
  const response = await fetch(`${BASE_URL}/market/price/${ticker}`);
  if (!response.ok) throw new Error(`Sunucu hatası: ${response.status}`);
  return response.json();
}

export async function getMarketHistory(ticker, start, end) {
  const response = await fetch(
    `${BASE_URL}/market/history/${ticker}?start=${start}&end=${end}`
  );
  if (!response.ok) throw new Error(`Sunucu hatası: ${response.status}`);
  return response.json();
}

export async function getMarketNews(category = "general") {
  const response = await fetch(`${BASE_URL}/news/market?category=${category}`);
  if (!response.ok) throw new Error(`Sunucu hatası: ${response.status}`);
  return response.json();
}

export async function getCompanyNews(symbol, fromDate, toDate) {
  const response = await fetch(
    `${BASE_URL}/news/company/${symbol}?from_date=${fromDate}&to_date=${toDate}`
  );
  if (!response.ok) throw new Error(`Sunucu hatası: ${response.status}`);
  return response.json();
}

export async function testTelegramBriefing() {
  const res = await fetch(`${BASE_URL}/test-telegram-briefing`, {
    method: "POST",
    headers: authHeaders(),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail || `Hata: ${res.status}`);
  }
  return res.json();
}