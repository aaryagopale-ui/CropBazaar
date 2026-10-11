import React, { useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  CheckCircle,
  Clock,
  Database,
  Lightbulb,
  RefreshCw,
  ShieldCheck,
  ShoppingBag,
} from 'lucide-react';
import Badge from '../components/Badge';
import { fetchBechSmartRecommendation, fetchForecastSupported } from '../services/api';
import { useFarmerProfile } from '../context/FarmerProfileContext';
import { useMarket } from '../context/MarketContext';
import KisanTwinSummaryBanner from '../components/KisanTwinSummaryBanner';

const initialInputs = {
  quantity: '10',
  transportCost: '0',
  storageCost: '0',
  spoilageRate: '0',
  maxWaitingDays: '7',
};

function formatRupees(value) {
  if (value === null || value === undefined) return 'Unavailable';
  return `₹${Number(value).toLocaleString('en-IN', { maximumFractionDigits: 2 })}`;
}

function actionLabel(option) {
  if (!option) return 'Unavailable';
  if (option.action === 'WAIT') return option.day > 0 ? `WAIT ${option.day} DAYS` : 'WAIT';
  if (option.action === 'SWITCH_MANDI') return 'SWITCH MANDI';
  return 'SELL TODAY';
}

function riskVariant(level) {
  if (level === 'LOW') return 'emerald';
  if (level === 'MEDIUM') return 'amber';
  return 'rose';
}

export default function BechSmart() {
  const { profile } = useFarmerProfile();
  const { selectedCrop, selectedMandi, setSelectedCrop, setSelectedMandi } = useMarket();
  const [supportedOptions, setSupportedOptions] = useState([]);
  const [selectedCommodity, setSelectedCommodity] = useState('');
  const [selectedMarket, setSelectedMarket] = useState('');
  const [inputs, setInputs] = useState(initialInputs);
  const [result, setResult] = useState(null);
  const [loadingOptions, setLoadingOptions] = useState(true);
  const [loadingRecommendation, setLoadingRecommendation] = useState(false);
  const [apiError, setApiError] = useState('');
  const [formError, setFormError] = useState('');

  useEffect(() => {
    fetchForecastSupported()
      .then((response) => {
        const options = response.commodities || [];
        setSupportedOptions(options);
        if (options.length > 0) {
          const matchGlobal = options.find((opt) => opt.commodity.toLowerCase() === (selectedCrop || '').toLowerCase());
          const matchProfile = (profile?.crop && profile.crop.trim() !== '')
            ? options.find((opt) => opt.commodity.toLowerCase() === profile.crop.trim().toLowerCase())
            : null;
          const chosen = matchGlobal || matchProfile || options[0];
          setSelectedCommodity(chosen.commodity);
          const marketMatch = chosen.markets.find((m) => m.toLowerCase() === (selectedMandi || '').toLowerCase());
          setSelectedMarket(marketMatch || chosen.default_market);
        }
      })
      .catch((error) => setApiError(error.message || 'Unable to load supported ML options.'))
      .finally(() => setLoadingOptions(false));
  }, [profile?.crop, selectedCrop, selectedMandi]);

  // Pre-fill inputs only when profile has valid configured constraints
  useEffect(() => {
    if (profile && profile.crop && profile.crop.trim() !== '') {
      setInputs((prev) => ({
        ...prev,
        quantity: profile.lotSize && Number(profile.lotSize) > 0 ? String(profile.lotSize) : prev.quantity,
        maxWaitingDays:
          profile.cashUrgency === 'immediate' || profile.cashUrgency === 'urgent'
            ? '1'
            : profile.cashUrgency === 'moderate'
            ? '4'
            : profile.cashUrgency === 'flexible'
            ? '7'
            : prev.maxWaitingDays,
        transportCost:
          profile.transportAccess === 'own_tractor'
            ? '150'
            : profile.transportAccess === 'hired_trolley'
            ? '500'
            : profile.transportAccess === 'middleman_pickup'
            ? '0'
            : prev.transportCost,
        storageCost:
          profile.storageAccess === 'pucca_warehouse'
            ? '25'
            : profile.storageAccess === 'farm_shed'
            ? '10'
            : profile.storageAccess === 'none'
            ? '0'
            : prev.storageCost,
        spoilageRate:
          profile.storageAccess === 'pucca_warehouse'
            ? '0.01'
            : profile.storageAccess === 'farm_shed'
            ? '0.03'
            : profile.storageAccess === 'none'
            ? '0.06'
            : prev.spoilageRate,
      }));

      if (supportedOptions.length > 0 && profile.crop) {
        const match = supportedOptions.find(
          (opt) => opt.commodity.toLowerCase() === profile.crop.trim().toLowerCase()
        );
        if (match) {
          setSelectedCommodity(match.commodity);
          setSelectedMarket(match.default_market);
        }
      }
    }
  }, [profile, supportedOptions]);

  const selectedOption = supportedOptions.find((option) => option.commodity === selectedCommodity);

  useEffect(() => {
    if (!selectedOption) return;
    if (!selectedOption.markets.includes(selectedMarket)) {
      setSelectedMarket(selectedOption.default_market);
    }
  }, [selectedMarket, selectedOption]);

  const comparisonOptions = result?.comparison_options || [];
  const waitOptions = comparisonOptions.filter((option) => option.action === 'WAIT');
  const sellOption = comparisonOptions.find((option) => option.action === 'SELL_TODAY');
  const switchOption = comparisonOptions.find((option) => option.action === 'SWITCH_MANDI');
  const recommendedWait = waitOptions.find(
    (option) => option.eligible && option.day === result?.recommended_day,
  );

  const actionCards = useMemo(() => [
    sellOption,
    recommendedWait || waitOptions.find((option) => option.eligible) || waitOptions[0],
    switchOption,
  ], [recommendedWait, sellOption, switchOption, waitOptions]);

  function updateInput(name, value) {
    setInputs((current) => ({ ...current, [name]: value }));
  }

  async function submitRecommendation(event) {
    event.preventDefault();
    setFormError('');
    setApiError('');

    const numericValues = Object.entries(inputs).filter(([, value]) => value !== '');
    if (!selectedCommodity || !selectedMarket || numericValues.some(([, value]) => Number.isNaN(Number(value)))) {
      setFormError('Enter valid numeric values and select a supported crop and mandi.');
      return;
    }
    if (Number(inputs.quantity) <= 0 || Number(inputs.transportCost) < 0 || Number(inputs.storageCost) < 0 || Number(inputs.spoilageRate) < 0 || Number(inputs.spoilageRate) > 100) {
      setFormError('Quantity must be positive. Costs and spoilage must be non-negative; spoilage cannot exceed 100%.');
      return;
    }

    const payload = {
      commodity: selectedCommodity,
      market: selectedMarket,
      quantity_quintals: Number(inputs.quantity),
      transport_cost: Number(inputs.transportCost),
      storage_cost_per_day: Number(inputs.storageCost),
      spoilage_rate: Number(inputs.spoilageRate) / 100,
    };
    if (inputs.maxWaitingDays !== '') payload.max_holding_days = Number(inputs.maxWaitingDays);

    try {
      setLoadingRecommendation(true);
      const response = await fetchBechSmartRecommendation(payload);
      setResult(response);
    } catch (error) {
      setResult(null);
      setApiError(error.message || 'The recommendation service is unavailable.');
    } finally {
      setLoadingRecommendation(false);
    }
  }

  const isInsufficient = result?.recommended_action === 'INSUFFICIENT_DATA';
  const isStale = result?.warnings?.some((warning) => ['HISTORICAL_SELL_NOW', 'STALE_DATA'].includes(warning.code));

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <h1 className="text-2xl font-bold text-slate-900">BechSmart Advisory</h1>
            <Badge variant="emerald" size="xs">Live ML Engine</Badge>
          </div>
          <p className="text-sm text-slate-500">Compare model-backed selling, waiting, and supported mandi options using your actual costs.</p>
        </div>
      </div>

      <KisanTwinSummaryBanner featureName="BechSmart" />

      {apiError && (
        <div className="bg-rose-50 border border-rose-200 rounded-2xl p-4 text-rose-800 text-sm flex items-start gap-3">
          <AlertTriangle className="w-5 h-5 text-rose-600 shrink-0" />
          <span>{apiError}</span>
        </div>
      )}

      <form onSubmit={submitRecommendation} className="bg-white rounded-2xl border border-slate-200 p-5 shadow-xs">
        <div className="flex items-center gap-2 mb-4">
          <ShoppingBag className="w-5 h-5 text-emerald-600" />
          <h2 className="text-base font-bold text-slate-900">Advisory Inputs</h2>
          <Badge variant="slate" size="xs">Model-supported pairs only</Badge>
        </div>

        {loadingOptions ? (
          <div className="text-sm text-slate-500 flex items-center gap-2"><RefreshCw className="w-4 h-4 animate-spin" /> Loading supported vegetables...</div>
        ) : supportedOptions.length === 0 ? (
          <div className="text-sm text-amber-800">No supported vegetables are available from the ML service.</div>
        ) : (
          <>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <label className="text-xs font-semibold text-slate-600">
                Select Vegetable
                <select value={selectedCommodity} onChange={(event) => setSelectedCommodity(event.target.value)} className="mt-1.5 w-full px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm font-medium text-slate-800">
                  {supportedOptions.map((option) => <option key={option.commodity} value={option.commodity}>{option.commodity}</option>)}
                </select>
              </label>
              <label className="text-xs font-semibold text-slate-600">
                Select Mandi
                <select value={selectedMarket} onChange={(event) => setSelectedMarket(event.target.value)} className="mt-1.5 w-full px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm font-medium text-slate-800">
                  {(selectedOption?.markets || []).map((market) => <option key={market} value={market}>{market}</option>)}
                </select>
              </label>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4 mt-4">
              <label className="text-xs font-semibold text-slate-600">Quantity (quintals)<input type="number" min="0.01" step="0.01" value={inputs.quantity} onChange={(event) => updateInput('quantity', event.target.value)} className="mt-1.5 w-full px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm" /></label>
              <label className="text-xs font-semibold text-slate-600">Transport cost (₹)<input type="number" min="0" step="0.01" value={inputs.transportCost} onChange={(event) => updateInput('transportCost', event.target.value)} className="mt-1.5 w-full px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm" /></label>
              <label className="text-xs font-semibold text-slate-600">Storage / day (₹)<input type="number" min="0" step="0.01" value={inputs.storageCost} onChange={(event) => updateInput('storageCost', event.target.value)} className="mt-1.5 w-full px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm" /></label>
              <label className="text-xs font-semibold text-slate-600">Spoilage (%)<input type="number" min="0" max="100" step="0.1" value={inputs.spoilageRate} onChange={(event) => updateInput('spoilageRate', event.target.value)} className="mt-1.5 w-full px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm" /></label>
              <label className="text-xs font-semibold text-slate-600">Max waiting days (optional)<input type="number" min="0" max="7" step="1" value={inputs.maxWaitingDays} onChange={(event) => updateInput('maxWaitingDays', event.target.value)} className="mt-1.5 w-full px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm" /></label>
            </div>
            {formError && <div className="mt-3 text-sm text-rose-700">{formError}</div>}
            <button type="submit" disabled={loadingRecommendation || loadingOptions} className="mt-5 inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-emerald-700 text-white font-semibold text-sm hover:bg-emerald-800 disabled:opacity-50">
              {loadingRecommendation ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Lightbulb className="w-4 h-4" />}
              {loadingRecommendation ? 'Calculating...' : 'Get Recommendation'}
            </button>
          </>
        )}
      </form>

      {!result && !loadingRecommendation && <div className="bg-slate-50 border border-slate-200 rounded-2xl p-6 text-sm text-slate-600 flex items-center gap-3"><Database className="w-5 h-5 text-slate-500" /> Submit the farmer inputs to calculate a real advisory from the FastAPI engine.</div>}

      {result && (
        <>
          <div className="bg-gradient-to-r from-emerald-800 to-green-900 text-white rounded-3xl p-6 sm:p-8 shadow-sm">
            <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-6">
              <div className="space-y-2">
                <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-emerald-700/80 text-emerald-200 text-xs font-semibold"><Lightbulb className="w-3.5 h-3.5 text-yellow-300" /> Real backend recommendation</div>
                <h2 className="text-2xl sm:text-3xl font-extrabold tracking-tight">{result.recommended_action === 'INSUFFICIENT_DATA' ? 'Insufficient Data' : actionLabel({ action: result.recommended_action, day: result.recommended_day })}</h2>
                <p className="text-emerald-100/90 text-sm max-w-2xl">{selectedCommodity} at {selectedMarket} · {result.recommended_mandi || 'No mandi selected'}</p>
                {result.explanation_reasons?.map((reason) => <p key={reason} className="text-emerald-100/90 text-sm max-w-2xl">{reason}</p>)}
              </div>
              <div className="bg-emerald-950/60 border border-emerald-500/30 rounded-2xl p-4 min-w-[220px] shrink-0"><div className="text-xs text-emerald-300 font-medium">Estimated net revenue</div><div className="text-3xl font-black text-white my-1">{formatRupees(result.estimated_net_revenue)}</div><div className="text-xs text-emerald-300">Incremental gain: {formatRupees(result.estimated_incremental_gain)}</div></div>
            </div>
          </div>

          {isStale && <div className="bg-amber-50 border border-amber-200 rounded-2xl p-4 text-sm text-amber-900 flex items-start gap-3"><AlertTriangle className="w-5 h-5 shrink-0" />Historical price data is stale. Sell Today is shown as a historical scenario, not a live market recommendation.</div>}
          {isInsufficient && <div className="bg-amber-50 border border-amber-200 rounded-2xl p-4 text-sm text-amber-900">The engine could not find a feasible risk-adjusted action for these inputs.</div>}

          <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
            {actionCards.map((option, index) => (
              <div key={`${option?.action || 'missing'}-${index}`} className={`rounded-2xl border-2 p-5 bg-white ${option?.action === result.recommended_action ? 'border-emerald-500 shadow-sm' : 'border-slate-200'}`}>
                <div className="flex items-center justify-between gap-2 mb-3"><span className="text-xs font-bold uppercase tracking-wider px-2.5 py-1 rounded-full bg-slate-100 text-slate-700">{actionLabel(option)}</span>{option?.risk_level && <Badge variant={riskVariant(option.risk_level)} size="xs">{option.risk_level} RISK</Badge>}</div>
                {option ? <>
                  <div className="text-xs text-slate-500">{option.mandi || selectedMarket}</div>
                  <div className="text-2xl font-extrabold text-slate-900 mt-1">{formatRupees(option.estimated_net_revenue)}</div>
                  <div className="text-xs text-slate-500 mt-1">Risk-adjusted: {formatRupees(option.risk_adjusted_net_revenue)}</div>
                  <div className="mt-4 space-y-1 text-xs text-slate-600"><div>Price: {formatRupees(option.price)} {option.target_date && `· ${option.target_date}`}</div><div>Saleable quantity: {option.cost_breakdown?.saleable_quantity_quintals ?? 'Unavailable'} qtl</div><div>Costs: {formatRupees((option.cost_breakdown?.transport_cost || 0) + (option.cost_breakdown?.market_cost || 0) + (option.cost_breakdown?.handling_cost || 0) + (option.cost_breakdown?.storage_cost || 0))}</div></div>
                  {option.warnings?.map((warning) => <div key={warning.code} className="mt-3 text-xs text-amber-800">{warning.message}</div>)}
                  {option.eligible && option.action === result.recommended_action && <div className="pt-3 mt-3 border-t border-slate-100 flex items-center gap-1 text-xs font-semibold text-emerald-700"><CheckCircle className="w-3.5 h-3.5" /> Recommended</div>}
                </> : <div className="text-sm text-slate-500">No model-supported comparison is available.</div>}
              </div>
            ))}
          </div>

          <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-xs"><div className="flex items-center gap-2 mb-4"><ShieldCheck className="w-5 h-5 text-emerald-600" /><h2 className="text-base font-bold text-slate-900">Forecast and model metrics</h2></div><div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-2 mb-5">{result.forecast.map((item) => <div key={item.horizon_days} className="bg-slate-50 rounded-xl p-3"><div className="text-xs text-slate-500">{item.target_date}</div><div className="font-bold text-slate-900 mt-1">{formatRupees(item.prediction)}</div><div className="text-[11px] text-slate-500 mt-1">{item.status === 'validated_model' ? 'Validated model' : 'Baseline prediction'}</div></div>)}</div><div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs text-slate-600">{result.model_metrics.map((metric) => <div key={metric.horizon_days} className="border border-slate-100 rounded-xl p-3"><strong>Day {metric.horizon_days}</strong> · {metric.method} · validation MAE {formatRupees(metric.validation.selected_validation_mae)} · holdout MAE {formatRupees(metric.validation.selected_holdout_mae)}</div>)}</div></div>

          <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-xs"><div className="flex items-center gap-2 mb-4"><Clock className="w-5 h-5 text-emerald-600" /><h2 className="text-base font-bold text-slate-900">Data and freshness</h2></div><div className="grid grid-cols-1 sm:grid-cols-3 gap-4 text-sm"><div><span className="text-slate-500 block">Latest observed</span><strong>{formatRupees(result.latest_observed.price)}</strong> on {result.latest_observed.date}</div><div><span className="text-slate-500 block">Forecast origin</span><strong>{result.freshness.forecast_origin}</strong></div><div><span className="text-slate-500 block">Data as of</span><strong>{result.data_as_of}</strong> · {result.historical_coverage.record_count} records</div></div></div>
        </>
      )}
    </div>
  );
}