/**
 * CropBazaar API Client Service
 *
 * Connects React frontend to FastAPI backend endpoints.
 * Uses VITE_API_BASE_URL when provided; local Vite development uses its proxy.
 */

const rawBaseUrl = import.meta.env.VITE_API_BASE_URL || '';
const API_BASE_URL = rawBaseUrl.endsWith('/') ? rawBaseUrl.slice(0, -1) : rawBaseUrl;

async function request(endpoint, options = {}) {
  const url = `${API_BASE_URL}${endpoint}`;
  try {
    const response = await fetch(url, {
      ...options,
      headers: {
        'Content-Type': 'application/json',
        ...(options.headers || {}),
      },
    });

    if (!response.ok) {
      const errorBody = await response.json().catch(() => ({}));
      const detail = errorBody.detail;
      let errorMsg;
      if (typeof detail === 'string') {
        errorMsg = detail;
      } else if (Array.isArray(detail)) {
        // FastAPI / Pydantic validation errors
        errorMsg = detail
          .map((err) => (err && typeof err === 'object' ? err.msg || JSON.stringify(err) : String(err)))
          .join('; ');
      } else if (detail?.message) {
        errorMsg = detail.message;
      } else {
        errorMsg = `HTTP ${response.status}: ${response.statusText}`;
      }
      throw new Error(errorMsg);
    }

    return await response.json();
  } catch (error) {
    console.error(`[API Error] ${endpoint}:`, error.message);
    throw error;
  }
}

/** Check backend health status */
export async function fetchHealth() {
  return request('/health');
}

/** Get the crop/market pairs evaluated by the forecasting pipeline */
export async function fetchForecastSupported() {
  return request('/api/forecast/supported');
}

/** Get separate ML or validated-baseline forecasts for each requested horizon */
export async function fetchForecast({ commodity, market = null, horizons = '1-7' }) {
  const params = new URLSearchParams({ horizons });
  if (market) params.append('market', market);
  return request(`/api/forecast/${encodeURIComponent(commodity)}?${params.toString()}`);
}

/** Get shared ML context for BechSmart without applying recommendation logic */
export async function fetchBechSmartRecommendation(payload) {
  return request('/api/bechsmart/recommend', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

/** Get scoped historical risk indicators and shared ML forecast context */
export async function fetchJokhimRiskData({ commodity, market }) {
  const params = new URLSearchParams({ commodity, market });
  return request(`/api/jokhim/risk-data?${params.toString()}`);
}

/** Analyze historical risk and shared ML context for a selected crop/mandi pair */
export async function analyzeJokhimRisk({ commodity, market }) {
  return request('/api/jokhim/analyze', {
    method: 'POST',
    body: JSON.stringify({ commodity, market }),
  });
}

/** Get dataset overview (total records, crops count, states, mandis, date range) */
export async function fetchMarketSummary() {
  return request('/api/market/summary');
}

/** Get list of available commodities and their pricing units */
export async function fetchCommodities(state = null) {
  const query = state ? `?state=${encodeURIComponent(state)}` : '';
  return request(`/api/market/commodities${query}`);
}

/** Get list of states and districts */
export async function fetchStates() {
  return request('/api/market/states');
}

/** Get list of mandis optionally filtered by state, crop, and/or district */
export async function fetchMandis({ state = null, commodity = null, district = null } = {}) {
  const params = new URLSearchParams();
  if (state) params.append('state', state);
  if (commodity) params.append('commodity', commodity);
  if (district) params.append('district', district);
  const query = params.toString() ? `?${params.toString()}` : '';
  return request(`/api/market/mandis${query}`);
}

/** Get paginated raw price records */
export async function fetchPrices({
  commodity = null,
  state = null,
  market = null,
  startDate = null,
  endDate = null,
  limit = 50,
  offset = 0,
} = {}) {
  const params = new URLSearchParams();
  if (commodity) params.append('commodity', commodity);
  if (state) params.append('state', state);
  if (market) params.append('market', market);
  if (startDate) params.append('start_date', startDate);
  if (endDate) params.append('end_date', endDate);
  params.append('limit', limit);
  params.append('offset', offset);
  return request(`/api/market/prices?${params.toString()}`);
}

/** Get historical modal price and arrival trend points */
export async function fetchMarketTrends({
  commodity,
  market,
  startDate = null,
  endDate = null,
  limit = 100,
}) {
  const params = new URLSearchParams({ commodity, market });
  if (startDate) params.append('start_date', startDate);
  if (endDate) params.append('end_date', endDate);
  if (limit) params.append('limit', limit);
  return request(`/api/market/trends?${params.toString()}`);
}

/** Get historical arrival volume points */
export async function fetchArrivals({
  commodity,
  market = null,
  startDate = null,
  endDate = null,
  limit = 100,
}) {
  const params = new URLSearchParams({ commodity });
  if (market) params.append('market', market);
  if (startDate) params.append('start_date', startDate);
  if (endDate) params.append('end_date', endDate);
  if (limit) params.append('limit', limit);
  return request(`/api/market/arrivals?${params.toString()}`);
}

/** Compare latest observed prices for a crop across APMC mandis */
export async function fetchMandiCompare({ commodity, state = null, limit = 10 }) {
  const params = new URLSearchParams({ commodity });
  if (state) params.append('state', state);
  if (limit) params.append('limit', limit);
  return request(`/api/market/compare?${params.toString()}`);
}

/** Get historical weather records */
export async function fetchWeatherHistory({
  market = null,
  startDate = null,
  endDate = null,
  limit = 100,
} = {}) {
  const params = new URLSearchParams();
  if (market) params.append('market', market);
  if (startDate) params.append('start_date', startDate);
  if (endDate) params.append('end_date', endDate);
  if (limit) params.append('limit', limit);
  const query = params.toString() ? `?${params.toString()}` : '';
  return request(`/api/weather/history${query}`);
}

/** Get aggregated historical weather statistics */
export async function fetchWeatherSummary({ market = null, startDate = null, endDate = null } = {}) {
  const params = new URLSearchParams();
  if (market) params.append('market', market);
  if (startDate) params.append('start_date', startDate);
  if (endDate) params.append('end_date', endDate);
  const query = params.toString() ? `?${params.toString()}` : '';
  return request(`/api/weather/summary${query}`);
}

/** Query Kisan Vaani Gemini AI assistant */
export async function fetchAssistantChat({ message, language = 'en', history = [], farmer_profile = null, token = null }) {
  const headers = {};
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  // Sanitize history to prevent validation issues
  const sanitizedHistory = Array.isArray(history)
    ? history.map((item) => ({
        sender: String(item?.sender || 'assistant'),
        text: String(item?.text || item?.message || ''),
      }))
    : [];

  // Sanitize farmer_profile
  const sanitizedProfile = farmer_profile && typeof farmer_profile === 'object' && !Array.isArray(farmer_profile)
    ? farmer_profile
    : null;

  return request('/api/assistant/chat', {
    method: 'POST',
    headers,
    body: JSON.stringify({
      message: String(message || '').trim(),
      language: language || 'en',
      history: sanitizedHistory,
      farmer_profile: sanitizedProfile,
    }),
  });
}


