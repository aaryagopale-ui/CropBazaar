import React, { useState, useEffect } from 'react';
import {
  ShieldAlert,
  AlertTriangle,
  CloudRain,
  TrendingDown,
  Activity,
  Truck,
  Thermometer,
  Droplets,
  Calendar,
  Building,
} from 'lucide-react';
import DisclaimerBanner from '../components/DisclaimerBanner';
import Badge from '../components/Badge';
import {
  analyzeJokhimRisk,
} from '../services/api';
import { useFarmerProfile } from '../context/FarmerProfileContext';
import { useMarket } from '../context/MarketContext';
import KisanTwinSummaryBanner from '../components/KisanTwinSummaryBanner';

export default function JokhimEngine() {
  const { profile } = useFarmerProfile();
  const {
    selectedCrop,
    selectedMandi,
    setSelectedCrop,
    setSelectedMandi,
    commodities,
    mandis,
  } = useMarket();

  const [riskData, setRiskData] = useState(null);
  const [priceUnit, setPriceUnit] = useState('Rs./Quintal');
  const [arrivalUnit, setArrivalUnit] = useState('Metric Tonnes');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!selectedCrop || !selectedMandi) return;
    setRiskData(null);
    setError('');
    setLoading(true);
    analyzeJokhimRisk({ commodity: selectedCrop, market: selectedMandi })
      .then((response) => {
        setRiskData(response);
        setPriceUnit(response.historical_coverage?.price_unit || 'Rs./Quintal');
        setArrivalUnit(response.historical_coverage?.arrival_unit || 'Metric Tonnes');
      })
      .catch((err) => setError(err.message || 'Unable to load risk indicators for the selected mandi.'))
      .finally(() => setLoading(false));
  }, [selectedCrop, selectedMandi]);

  const price30 = riskData?.price_indicators?.last_30_trading_days;
  const price7 = riskData?.price_indicators?.last_7_trading_days;
  const arrivals = riskData?.arrival_indicators;
  const weather = riskData?.weather_indicators;
  const forecast = riskData?.ml_forecast;
  const riskAnalysis = riskData?.risk_analysis;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <h1 className="text-2xl font-bold text-slate-900">Jokhim Risk Indicators</h1>
            <Badge variant="amber" size="xs">
              Historical Observations Only
            </Badge>
          </div>
          <p className="text-sm text-slate-500">
            Observed historical price volatility, arrival spikes, and station weather records.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2 bg-white px-3 py-1.5 rounded-xl border border-slate-200 text-xs">
          <label className="text-slate-500 font-medium">Select Crop:</label>
          <select
            value={selectedCrop}
            onChange={(e) => setSelectedCrop(e.target.value)}
            className="font-bold text-emerald-800 bg-transparent focus:outline-hidden"
          >
            {commodities.map((c) => <option key={c.commodity} value={c.commodity}>{c.commodity}</option>)}
          </select>
          <label className="text-slate-500 font-medium ml-2">Select Mandi:</label>
          <select
            value={selectedMandi}
            onChange={(e) => setSelectedMandi(e.target.value)}
            className="font-bold text-emerald-800 bg-transparent focus:outline-hidden"
          >
            {mandis.map((m) => (
              <option key={m.market} value={m.market}>
                {m.market}
              </option>
            ))}
          </select>
        </div>
      </div>

      <KisanTwinSummaryBanner featureName="Jokhim Engine" />

      {/* Model Status Notice */}
      <div className="bg-amber-50 border-l-4 border-amber-500 p-4 rounded-xl text-amber-900 text-xs sm:text-sm">
        <div className="flex items-start gap-3">
          <AlertTriangle className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
          <div className="space-y-1">
            <h3 className="font-bold text-amber-950">
              Historical Risk + Forecast Context
            </h3>
            <p className="text-amber-800 leading-relaxed">
              The panels below are scoped to the selected model-supported crop and mandi. Risk indicators are historical
              observations; the forecast dates and model status come from the same Bhavishya inference service.
            </p>
          </div>
        </div>
      </div>

      {error && (
        <div className="bg-rose-50 border border-rose-200 rounded-xl p-4 text-sm text-rose-800 flex items-start gap-2">
          <AlertTriangle className="w-5 h-5 shrink-0" />
          <span>{error}</span>
        </div>
      )}
      {loading || (selectedCrop && selectedMandi && !riskData && !error) ? (
        <div className="bg-white rounded-2xl border border-slate-200 p-5 text-sm text-slate-500">Loading scoped risk observations...</div>
      ) : null}
      {riskData?.freshness?.is_stale && (
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 text-sm text-amber-900 flex items-start gap-2">
          <AlertTriangle className="w-5 h-5 shrink-0" />
          <span>{riskData.freshness.warning} Latest observation: {riskData.freshness.latest_observed_date}; data as of {riskData.freshness.data_as_of}.</span>
        </div>
      )}
      {riskAnalysis && (
        <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-xs">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2"><ShieldAlert className="w-5 h-5 text-emerald-600" /><h2 className="text-base font-bold text-slate-900">Risk Analysis ({selectedCrop})</h2></div>
            {riskAnalysis.sufficient_data ? <Badge variant={riskAnalysis.overall_risk_level === 'HIGH' ? 'rose' : riskAnalysis.overall_risk_level === 'MODERATE' ? 'amber' : 'emerald'} size="sm">Overall {riskAnalysis.overall_risk_level} · {riskAnalysis.overall_risk_index}/100</Badge> : <Badge variant="amber" size="sm">Insufficient data</Badge>}
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
            {riskAnalysis.risk_cards.map((card) => (
              <div key={card.name} className="p-4 bg-slate-50 rounded-xl border border-slate-100">
                <div className="flex items-center justify-between gap-2"><span className="text-xs font-bold text-slate-700">{card.name}</span><Badge variant={card.level === 'HIGH' ? 'rose' : card.level === 'MODERATE' ? 'amber' : card.level === 'LOW' ? 'emerald' : 'neutral'} size="xs">{card.level === 'INSUFFICIENT_DATA' ? 'No score' : `${card.level} ${card.score}/100`}</Badge></div>
                <p className="text-[11px] text-slate-600 mt-2 leading-relaxed">{card.explanation}</p>
              </div>
            ))}
          </div>
          {riskAnalysis.warnings?.length > 0 && <div className="mt-3 text-xs text-amber-800">{riskAnalysis.warnings.length} model/data warning(s) apply to this analysis.</div>}
        </div>
      )}

      {/* Historical Weather Drivers Section */}
      <div className="bg-white rounded-3xl border border-slate-200 p-6 shadow-xs">
        <div className="flex items-center justify-between mb-4 pb-3 border-b border-slate-100">
          <div className="flex items-center gap-2">
            <CloudRain className="w-5 h-5 text-blue-600" />
            <h2 className="text-base font-bold text-slate-900">
              Station Weather Record History ({selectedMandi})
            </h2>
          </div>
          {weather && (
            <Badge variant="neutral" size="sm">
              <Calendar className="w-3 h-3 text-slate-500" />
              Observed {weather.date_start} → {weather.date_end}
            </Badge>
          )}
        </div>

        {weather ? (
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="p-4 bg-slate-50 rounded-2xl border border-slate-100">
              <div className="flex items-center gap-2 text-slate-500 text-xs font-semibold mb-2">
                <Thermometer className="w-4 h-4 text-amber-500" />
                Temperature Range
              </div>
              <div className="text-2xl font-extrabold text-slate-900">
                {weather.temperature_min_c}°C – {weather.temperature_max_c}°C
              </div>
              <p className="text-[11px] text-slate-500 mt-1">
                Historical mean: {weather.temperature_mean_c}°C · σ {weather.temperature_standard_deviation_c}°C
              </p>
            </div>

            <div className="p-4 bg-slate-50 rounded-2xl border border-slate-100">
              <div className="flex items-center gap-2 text-slate-500 text-xs font-semibold mb-2">
                <CloudRain className="w-4 h-4 text-blue-500" />
                Precipitation History
              </div>
              <div className="text-2xl font-extrabold text-slate-900">
                {weather.rainfall_total_mm} mm
              </div>
              <p className="text-[11px] text-slate-500 mt-1">
                {weather.rainy_days_count} rainy days (Peak: {weather.maximum_single_day_rainfall_mm} mm)
              </p>
            </div>

            <div className="p-4 bg-slate-50 rounded-2xl border border-slate-100">
              <div className="flex items-center gap-2 text-slate-500 text-xs font-semibold mb-2">
                <Droplets className="w-4 h-4 text-teal-500" />
                Relative Humidity Range
              </div>
              <div className="text-2xl font-extrabold text-slate-900">
                {weather.humidity_min_pct}% – {weather.humidity_max_pct}%
              </div>
              <p className="text-[11px] text-slate-500 mt-1">
                Historical mean: {weather.humidity_mean_pct}%
              </p>
            </div>
          </div>
        ) : (
          <div className="text-xs text-slate-400 py-4 text-center">
            No weather observations found for this market.
          </div>
        )}
      </div>

      {/* Historical Market Volatility Observations */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
        <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-xs">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <Activity className="w-4 h-4 text-emerald-600" />
              <h3 className="font-bold text-sm text-slate-900">
                30-Day Modal Price Spread ({selectedCrop})
              </h3>
            </div>
            <Badge variant="emerald" size="xs">
              Observed
            </Badge>
          </div>

          <div className="space-y-3 text-xs">
            <div className="flex justify-between py-1 border-b border-slate-100">
              <span className="text-slate-500">Minimum Recorded Price:</span>
              <span className="font-bold text-slate-800">₹{(price30?.min_price || 0).toLocaleString('en-IN')} {priceUnit}</span>
            </div>
            <div className="flex justify-between py-1 border-b border-slate-100">
              <span className="text-slate-500">Maximum Recorded Price:</span>
              <span className="font-bold text-slate-800">₹{(price30?.max_price || 0).toLocaleString('en-IN')} {priceUnit}</span>
            </div>
            <div className="flex justify-between py-1">
              <span className="text-slate-500">Total Price Variance Spread:</span>
              <span className="font-extrabold text-emerald-700">₹{((price30?.max_price || 0) - (price30?.min_price || 0)).toLocaleString('en-IN')} {priceUnit}</span>
            </div>
            <div className="flex justify-between py-1 border-t border-slate-100">
              <span className="text-slate-500">7-day volatility / drops:</span>
              <span className="font-semibold text-slate-600">{price7?.coefficient_of_variation_pct || 0}% CV · {price7?.price_drop_count || 0} drops</span>
            </div>
          </div>
        </div>

        <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-xs">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <Truck className="w-4 h-4 text-amber-600" />
              <h3 className="font-bold text-sm text-slate-900">
                Arrival Inflow Volume Variations
              </h3>
            </div>
            <Badge variant="neutral" size="xs">
              Recorded Inflow
            </Badge>
          </div>

          <div className="space-y-3 text-xs">
            <div className="flex justify-between py-1 border-b border-slate-100">
              <span className="text-slate-500">Lowest Daily Arrival:</span>
              <span className="font-bold text-slate-800">{(arrivals?.min_quantity || 0).toLocaleString('en-IN')} {arrivalUnit}</span>
            </div>
            <div className="flex justify-between py-1 border-b border-slate-100">
              <span className="text-slate-500">Peak Daily Arrival Surge:</span>
              <span className="font-bold text-slate-800">{(arrivals?.max_quantity || 0).toLocaleString('en-IN')} {arrivalUnit}</span>
            </div>
            <div className="flex justify-between py-1">
              <span className="text-slate-500">Observation Points:</span>
              <span className="font-semibold text-slate-600">{riskData?.historical_coverage?.observation_count || 0} recorded auction dates · {arrivals?.spike_count || 0} spikes</span>
            </div>
          </div>
        </div>
      </div>

      {forecast && (
        <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-xs">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <ShieldAlert className="w-4 h-4 text-emerald-600" />
              <h3 className="font-bold text-sm text-slate-900">Shared ML Forecast Context ({selectedCrop})</h3>
            </div>
            <Badge variant="neutral" size="xs">Origin {forecast.forecast_origin}</Badge>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-2">
            {forecast.forecasts.map((item) => (
              <div key={item.horizon_days} className="bg-slate-50 rounded-xl p-3 text-xs">
                <div className="text-slate-500">{item.target_date}</div>
                <div className="font-bold text-slate-900 mt-1">₹{item.prediction}</div>
                <div className="text-slate-500 mt-1">{riskAnalysis?.forecasted_price_movement?.find((movement) => movement.horizon_days === item.horizon_days)?.change_from_latest_observed_pct ?? 0}% vs observed</div>
                <div className="text-slate-500 mt-1">{item.status === 'validated_model' ? 'Validated model' : 'Baseline'}</div>
              </div>
            ))}
          </div>
          <p className="text-[11px] text-slate-500 mt-3">Forecasts are statistical estimates, not future weather observations or guaranteed prices.</p>
        </div>
      )}
    </div>
  );
}
