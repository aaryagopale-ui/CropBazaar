import React, { useState, useEffect } from 'react';
import {
  TrendingUp,
  Clock,
  Sparkles,
  AlertTriangle,
  Info,
  Calendar,
  Layers,
  Thermometer,
  CloudRain,
  RefreshCw,
} from 'lucide-react';
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
} from 'recharts';
import DisclaimerBanner from '../components/DisclaimerBanner';
import Badge from '../components/Badge';
import {
  fetchForecast,
  fetchMarketTrends,
  fetchWeatherSummary,
} from '../services/api';
import { useFarmerProfile } from '../context/FarmerProfileContext';
import { useMarket } from '../context/MarketContext';
import KisanTwinSummaryBanner from '../components/KisanTwinSummaryBanner';

export default function BhavishyaForecast() {
  const { profile } = useFarmerProfile();
  const {
    selectedCrop,
    selectedMandi,
    setSelectedCrop,
    setSelectedMandi,
    commodities,
    mandis,
    priceUnit,
  } = useMarket();

  const [trendData, setTrendData] = useState([]);
  const [weatherSummary, setWeatherSummary] = useState(null);
  const [forecastResult, setForecastResult] = useState(null);
  const [forecastError, setForecastError] = useState('');

  const [chartLoading, setChartLoading] = useState(false);
  const [forecastLoading, setForecastLoading] = useState(false);

  useEffect(() => {
    async function loadTrends() {
      if (!selectedCrop || !selectedMandi) return;
      try {
        setChartLoading(true);
        const [trendRes, weatherRes] = await Promise.all([
          fetchMarketTrends({
            commodity: selectedCrop,
            market: selectedMandi,
            limit: 60,
          }),
          fetchWeatherSummary({ market: selectedMandi }),
        ]);

        if (trendRes?.found) {
          setTrendData(trendRes.data);
        } else {
          setTrendData([]);
        }

        if (weatherRes?.found) {
          setWeatherSummary(weatherRes);
        }
      } catch (err) {
        console.error('Failed to load trends/weather:', err);
      } finally {
        setChartLoading(false);
      }
    }
    loadTrends();
  }, [selectedCrop, selectedMandi]);

  useEffect(() => {
    async function loadForecast() {
      if (!selectedCrop || !selectedMandi) return;
      try {
        setForecastLoading(true);
        setForecastError('');
        const result = await fetchForecast({
          commodity: selectedCrop,
          market: selectedMandi,
        });
        setForecastResult(result);
      } catch (err) {
        setForecastResult(null);
        setForecastError(err.message || 'Forecast is unavailable for the selected mandi.');
      } finally {
        setForecastLoading(false);
      }
    }

    loadForecast();
  }, [selectedCrop, selectedMandi]);

  const latestPoint = trendData[trendData.length - 1];
  const staleWarning = forecastResult?.warnings?.find((warning) => warning.code === 'STALE_DATA');
  const forecastReferenceDate = forecastResult?.reference_date;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <h1 className="text-2xl font-bold text-slate-900">Bhavishya Forecast Readiness</h1>
            <Badge variant="amber" size="xs">
              ML Model Pipeline Next
            </Badge>
          </div>
          <p className="text-sm text-slate-500">
            Historical price foundation and station observations preparing for XGBoost forward forecasting.
          </p>
        </div>
      </div>

      <KisanTwinSummaryBanner featureName="Bhavishya Forecast" />

      {/* ML Forecast */}
      <div className="bg-emerald-50 border border-emerald-200 p-4 rounded-xl text-emerald-950 text-xs sm:text-sm">
        <div className="flex items-start gap-3">
          <Sparkles className="w-5 h-5 text-emerald-600 shrink-0 mt-0.5" />
          <div className="space-y-1">
            <h3 className="font-bold">ML Forecasting Engine Connected</h3>
            <p className="text-emerald-800 leading-relaxed">
              Forecasts are served by the backend ML pipeline for evaluated crop and mandi pairs.
              Historical observations below remain separate from predicted prices.
            </p>
          </div>
        </div>
        {forecastResult && (
          <div className="mt-3 text-slate-700 bg-white/70 border border-emerald-100 rounded-lg p-3">
            <div>
              Forecast origin: <strong>{forecastResult.forecast_origin}</strong> · Reference date:{' '}
              <strong>{forecastResult.reference_date}</strong> · Last observed price:{' '}
              <strong>₹{forecastResult.last_observed_price}</strong> on{' '}
              <strong>{forecastResult.last_observed_date}</strong>
            </div>
            {staleWarning && (
              <div className="mt-1 text-amber-800 flex items-start gap-2">
                <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
                <span>{staleWarning.message} This historical price is not today&apos;s live market price.</span>
              </div>
            )}
          </div>
        )}
        {forecastLoading ? (
          <div className="mt-4 text-emerald-700 flex items-center gap-2">
            <RefreshCw className="w-4 h-4 animate-spin" /> Loading seven-day forecast...
          </div>
        ) : forecastError ? (
          <div className="mt-4 text-amber-800 flex items-center gap-2">
            <AlertTriangle className="w-4 h-4" /> {forecastError}
          </div>
        ) : forecastResult ? (
          <div className="mt-4 grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-2">
            {forecastResult.forecasts.map((item) => (
              (() => {
                const isForwardForecast = item.target_date > forecastReferenceDate;
                return (
              <div key={item.horizon_days} className="bg-white border border-emerald-100 rounded-lg p-2">
                <div className="text-[11px] text-slate-500">Day {item.horizon_days}</div>
                <div className="font-bold text-slate-900">₹{item.prediction}</div>
                <div className="text-[10px] text-slate-500">{item.target_date}</div>
                <Badge variant={item.status === 'validated_model' ? 'emerald' : 'amber'} size="xs">
                  {isForwardForecast
                    ? item.status === 'validated_model' ? 'Forward forecast' : 'Baseline prediction'
                    : 'Past target'}
                </Badge>
              </div>
                );
              })()
            ))}
          </div>
        ) : null}
      </div>

      {/* Selectors */}
      <div className="bg-white rounded-2xl border border-slate-200 p-4 shadow-xs">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-semibold text-slate-600 mb-1.5">
              Select Crop
            </label>
            <select
              value={selectedCrop}
              onChange={(e) => setSelectedCrop(e.target.value)}
              className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-sm font-medium text-slate-800"
            >
              {commodities.map((c) => (
                <option key={c.commodity} value={c.commodity}>
                  {c.commodity} ({c.price_unit})
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-600 mb-1.5">
              Target APMC Mandi
            </label>
            <select
              value={selectedMandi}
              onChange={(e) => setSelectedMandi(e.target.value)}
              className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-sm font-medium text-slate-800"
            >
              {mandis.map((m) => (
                <option key={m.market} value={m.market}>
                  {m.market}
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {/* Historical Baseline Price Chart */}
      <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-xs">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4">
          <div>
            <h2 className="text-base font-bold text-slate-900">
              Observed Price Trajectory ({selectedCrop} @ {selectedMandi})
            </h2>
            <p className="text-xs text-slate-500">
              Historical observed prices only; not a live current-market quote ({priceUnit})
            </p>
          </div>
          {latestPoint && (
            <Badge variant={staleWarning ? 'amber' : 'emerald'} size="sm">
              Latest observed: ₹{latestPoint.modal_price} ({latestPoint.date})
            </Badge>
          )}
        </div>

        {chartLoading ? (
          <div className="h-72 w-full flex items-center justify-center text-slate-400 text-xs gap-2">
            <RefreshCw className="w-4 h-4 animate-spin" />
            Loading historical data...
          </div>
        ) : trendData.length === 0 ? (
          <div className="h-72 w-full flex items-center justify-center text-slate-400 text-xs">
            No price records available for {selectedCrop} at {selectedMandi}.
          </div>
        ) : (
          <div className="h-72 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={trendData}>
                <defs>
                  <linearGradient id="forecastFill" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#047857" stopOpacity={0.25} />
                    <stop offset="95%" stopColor="#047857" stopOpacity={0.0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
                <XAxis dataKey="date" stroke="#94a3b8" fontSize={11} tickLine={false} />
                <YAxis
                  domain={['auto', 'auto']}
                  stroke="#94a3b8"
                  fontSize={11}
                  tickLine={false}
                  tickFormatter={(val) => `₹${val}`}
                />
                <Tooltip
                  contentStyle={{
                    backgroundColor: '#ffffff',
                    borderColor: '#e2e8f0',
                    borderRadius: '12px',
                    fontSize: '12px',
                  }}
                  formatter={(val) => [`₹${val} (${priceUnit})`, 'Observed Modal Price']}
                />
                <Area
                  type="monotone"
                  dataKey="modal_price"
                  name="Observed Price"
                  stroke="#047857"
                  strokeWidth={2.5}
                  fill="url(#forecastFill)"
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        )}
      </div>

      {/* Historical Weather Drivers for this Mandi */}
      {weatherSummary && (
        <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-xs">
          <h2 className="text-sm font-bold text-slate-900 mb-3 flex items-center gap-2">
            <CloudRain className="w-4 h-4 text-emerald-600" />
            Historical Weather Drivers Available for Model Training
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
            <div className="p-3 bg-slate-50 rounded-xl">
              <span className="text-slate-500 block mb-0.5">Temperature Extremes:</span>
              <span className="font-bold text-slate-900">
                {weatherSummary.temperature.min_c}°C to {weatherSummary.temperature.max_c}°C
              </span>
              <span className="text-[11px] text-slate-400 block mt-0.5">
                Mean: {weatherSummary.temperature.mean_c}°C
              </span>
            </div>
            <div className="p-3 bg-slate-50 rounded-xl">
              <span className="text-slate-500 block mb-0.5">Cumulative Rainfall:</span>
              <span className="font-bold text-slate-900">
                {weatherSummary.rainfall.total_precipitation_mm} mm
              </span>
              <span className="text-[11px] text-slate-400 block mt-0.5">
                Across {weatherSummary.rainfall.rainy_days_count} recorded rainy days
              </span>
            </div>
            <div className="p-3 bg-slate-50 rounded-xl">
              <span className="text-slate-500 block mb-0.5">Mean Relative Humidity:</span>
              <span className="font-bold text-slate-900">
                {weatherSummary.humidity.mean_pct}%
              </span>
              <span className="text-[11px] text-slate-400 block mt-0.5">
                Range: {weatherSummary.humidity.min_pct}% – {weatherSummary.humidity.max_pct}%
              </span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
