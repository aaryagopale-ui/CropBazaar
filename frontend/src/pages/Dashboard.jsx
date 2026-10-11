import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import {
  TrendingUp,
  MapPin,
  Truck,
  Sparkles,
  ArrowRight,
  LineChart,
  GitCompare,
  ShoppingBag,
  Calculator,
  ShieldAlert,
  HelpCircle,
  MessageSquare,
  Building2,
  Calendar,
  Database,
  AlertCircle,
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
import StatCard from '../components/StatCard';
import DisclaimerBanner from '../components/DisclaimerBanner';
import Badge from '../components/Badge';
import {
  fetchMarketSummary,
  fetchMarketTrends,
} from '../services/api';
import { useMarket } from '../context/MarketContext';

export default function Dashboard() {
  const {
    selectedCrop,
    selectedMandi,
    selectedState,
    setSelectedCrop,
    setSelectedMandi,
    setSelectedState,
    commodities,
    mandis,
    priceUnit,
    arrivalUnit,
  } = useMarket();

  const [summary, setSummary] = useState(null);
  const [trendData, setTrendData] = useState([]);
  const [latestPrice, setLatestPrice] = useState(null);
  const [latestDate, setLatestDate] = useState(null);
  const [latestArrival, setLatestArrival] = useState(null);

  const [loading, setLoading] = useState(true);
  const [chartLoading, setChartLoading] = useState(false);
  const [cardLoading, setCardLoading] = useState(true);
  const [apiError, setApiError] = useState(null);

  // Initial load of summary
  useEffect(() => {
    async function loadInitialData() {
      try {
        setLoading(true);
        setApiError(null);
        const summaryRes = await fetchMarketSummary();
        setSummary(summaryRes);
      } catch (err) {
        console.error('Failed to load market summary:', err);
        setApiError(
          `Unable to connect to CropBazaar backend${
            import.meta.env.VITE_API_BASE_URL ? ` (${import.meta.env.VITE_API_BASE_URL})` : ''
          }. If the free server is waking up from sleep, please wait a moment and click Retry.`
        );
      } finally {
        setLoading(false);
      }
    }

    loadInitialData();
  }, []);

  // Fetch trends when crop and mandi are selected
  useEffect(() => {
    let isCancelled = false;

    async function loadTrendData() {
      if (!selectedCrop || !selectedMandi) return;
      try {
        setChartLoading(true);
        setCardLoading(true);
        const res = await fetchMarketTrends({
          commodity: selectedCrop,
          market: selectedMandi,
          limit: 30,
        });

        if (isCancelled) return;

        if (res && res.found) {
          setTrendData(res.data || []);

          if (res.data && res.data.length > 0) {
            const latest = res.data[res.data.length - 1];
            setLatestPrice(latest.modal_price ?? null);
            setLatestDate(latest.date ?? null);
            setLatestArrival(latest.arrival_quantity ?? null);
          } else {
            setLatestPrice(null);
            setLatestDate(null);
            setLatestArrival(null);
          }
        } else {
          setTrendData([]);
          setLatestPrice(null);
          setLatestDate(null);
          setLatestArrival(null);
        }
      } catch (err) {
        console.error('Failed to load trend data:', err);
        if (!isCancelled) {
          setTrendData([]);
          setLatestPrice(null);
          setLatestDate(null);
          setLatestArrival(null);
        }
      } finally {
        if (!isCancelled) {
          setChartLoading(false);
          setCardLoading(false);
        }
      }
    }

    loadTrendData();

    return () => {
      isCancelled = true;
    };
  }, [selectedCrop, selectedMandi]);

  const quickFeatures = [
    {
      to: '/mandisense',
      title: 'MandiSense',
      desc: 'Real historical auction trends, arrival volume, & weather records',
      icon: LineChart,
      badge: 'Live Data',
    },
    {
      to: '/bhavishya',
      title: 'Bhavishya Forecast',
      desc: 'Price trajectory with ML model readiness',
      icon: TrendingUp,
      badge: 'Historical Baseline',
    },
    {
      to: '/mandi-khoj',
      title: 'Mandi Khoj',
      desc: 'Compare real recorded prices across APMC mandis',
      icon: GitCompare,
      badge: 'Real Comparison',
    },
    {
      to: '/munafa-meter',
      title: 'Munafa Meter',
      desc: 'Interactive net profit calculator seeded with actual mandi prices',
      icon: Calculator,
      badge: 'Real Rates',
    },
    {
      to: '/jokhim',
      title: 'Jokhim Engine',
      desc: 'Historical weather patterns & price volatility indicators',
      icon: ShieldAlert,
      badge: 'Historical Radar',
    },
    {
      to: '/bechsmart',
      title: 'BechSmart',
      desc: 'Selling decision framework (advisory engine connects next)',
      icon: ShoppingBag,
      badge: 'Advisory Suite',
    },
    {
      to: '/kisantwin',
      title: 'KisanTwin',
      desc: 'Personalized farmer profile & holding capacity simulation',
      icon: Building2,
      badge: 'Digital Twin',
    },
    {
      to: '/kisan-vaani',
      title: 'Kisan Vaani',
      desc: 'Multilingual conversational interface (English, Hindi, Marathi)',
      icon: MessageSquare,
      badge: 'Assistant UI',
    },
  ];

  return (
    <div className="space-y-6">
      {/* Backend connection banner if error */}
      {apiError && (
        <div className="bg-rose-50 border border-rose-200 rounded-2xl p-4 text-rose-800 text-sm flex items-start gap-3">
          <AlertCircle className="w-5 h-5 text-rose-600 shrink-0 mt-0.5" />
          <div className="flex-1">
            <span className="font-bold">Backend Connection Issue: </span>
            <span>{apiError}</span>
          </div>
          <button
            onClick={() => window.location.reload()}
            className="px-3 py-1 bg-white border border-rose-200 rounded-lg text-xs font-semibold hover:bg-rose-50"
          >
            Retry
          </button>
        </div>
      )}

      {/* Dataset Status Banner */}
      <div className="bg-emerald-50 border border-emerald-200/90 rounded-2xl p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-xl bg-emerald-600 text-white flex items-center justify-center shrink-0">
            <Database className="w-4 h-4" />
          </div>
          <div>
            <div className="font-bold text-emerald-950 flex items-center gap-2">
              Connected to Real Agricultural Dataset
              <Badge variant="emerald" size="xs">
                merged_mandi_weather.csv
              </Badge>
            </div>
            <p className="text-emerald-800">
              Serving{' '}
              <strong>{summary ? summary.total_records.toLocaleString('en-IN') : '36,023'}</strong>{' '}
              validated records across {summary?.unique_crops_count || 31} crops and{' '}
              {summary?.unique_mandis_count || 25} APMC mandis ({summary?.earliest_date} to{' '}
              {summary?.latest_date}).
            </p>
          </div>
        </div>
        <div className="text-emerald-900 font-semibold bg-emerald-100/70 px-3 py-1.5 rounded-lg shrink-0">
          Source: APMC Nashik Division & Weather Station
        </div>
      </div>

      {/* Hero Welcome Banner */}
      <div className="bg-gradient-to-r from-emerald-800 via-emerald-900 to-green-950 text-white rounded-3xl p-6 sm:p-8 shadow-sm relative overflow-hidden">
        <div className="relative z-10 max-w-2xl">
          <div className="inline-flex items-center gap-2 px-3 py-1 bg-emerald-700/60 border border-emerald-500/40 rounded-full text-xs font-semibold text-emerald-200 mb-4">
            <Sparkles className="w-3.5 h-3.5 text-emerald-300" />
            Live Market Intelligence
          </div>
          <h1 className="text-2xl sm:text-4xl font-extrabold tracking-tight mb-3">
            Your Crop, Right Mandi, Right Time.
          </h1>
          <p className="text-emerald-100/90 text-sm sm:text-base leading-relaxed mb-6">
            Compare real recorded prices across regional APMC mandis, examine historical arrival
            spikes, and calculate your true net margins with verified records.
          </p>

          <div className="flex flex-wrap items-center gap-3">
            <Link
              to="/mandi-khoj"
              className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-white text-emerald-900 hover:bg-emerald-50 font-semibold text-sm transition-colors shadow-xs"
            >
              <GitCompare className="w-4 h-4 text-emerald-700" />
              Compare Real Mandis
            </Link>
            <Link
              to="/munafa-meter"
              className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-emerald-800/80 hover:bg-emerald-700 text-white border border-emerald-600 font-semibold text-sm transition-colors"
            >
              <Calculator className="w-4 h-4 text-emerald-300" />
              Calculate Net Profit
            </Link>
          </div>
        </div>

        <div className="absolute -right-12 -bottom-12 w-80 h-80 rounded-full bg-emerald-600/10 pointer-events-none blur-2xl"></div>
      </div>

      {/* Dynamic Filter Controls */}
      <div className="bg-white rounded-2xl border border-slate-200 p-4 sm:p-5 shadow-xs">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 mb-4 pb-3 border-b border-slate-100">
          <div>
            <h2 className="text-base font-bold text-slate-900">Select Commodity & Market</h2>
            <p className="text-xs text-slate-500">
              Filter real records directly from the FastAPI backend
            </p>
          </div>
          {latestDate && (
            <Badge variant="neutral" size="sm">
              <Calendar className="w-3 h-3 text-slate-500" />
              Latest Observation: {latestDate}
            </Badge>
          )}
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div>
            <label className="block text-xs font-semibold text-slate-600 mb-1.5">
              Select Crop ({commodities.length} Available)
            </label>
            <select
              value={selectedCrop}
              onChange={(e) => setSelectedCrop(e.target.value)}
              className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-sm font-medium text-slate-800 focus:outline-hidden focus:ring-2 focus:ring-emerald-500"
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
              State & District
            </label>
            <select
              value={selectedState}
              onChange={(e) => setSelectedState(e.target.value)}
              className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-sm font-medium text-slate-800 focus:outline-hidden focus:ring-2 focus:ring-emerald-500"
            >
              <option value="Maharashtra">Maharashtra (Nashik District)</option>
            </select>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-600 mb-1.5">
              APMC Mandi ({mandis.length} Trade {selectedCrop})
            </label>
            <select
              value={selectedMandi}
              onChange={(e) => setSelectedMandi(e.target.value)}
              className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-sm font-medium text-slate-800 focus:outline-hidden focus:ring-2 focus:ring-emerald-500"
            >
              {mandis.map((m) => (
                <option key={m.market} value={m.market}>
                  {m.market} ({m.total_records} records)
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {/* Real Market Overview Stat Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          title="Latest Recorded Modal Price"
          value={
            cardLoading
              ? 'Loading...'
              : latestPrice !== null
              ? `₹${latestPrice.toLocaleString('en-IN')}`
              : 'No data available'
          }
          unit={priceUnit}
          change={latestDate ? `Date: ${latestDate}` : null}
          isPositive={true}
          subtext={`Observed at ${selectedMandi}`}
          icon={TrendingUp}
        />
        <StatCard
          title="Latest Recorded Arrival"
          value={
            cardLoading
              ? 'Loading...'
              : latestArrival !== null
              ? `${latestArrival.toLocaleString('en-IN')}`
              : 'No data available'
          }
          unit={arrivalUnit}
          subtext="Actual APMC gate volume"
          icon={Truck}
        />
        <StatCard
          title="Total Dataset Records"
          value={summary ? summary.total_records.toLocaleString('en-IN') : '36,023'}
          unit="Records"
          subtext="CSV validated records"
          icon={Database}
        />
        <StatCard
          title="Date Horizon"
          value={summary ? `${summary.unique_mandis_count} Mandis` : '25 Mandis'}
          unit={summary ? `${summary.earliest_date} → ${summary.latest_date}` : 'Historical'}
          subtext="Continuous daily series"
          icon={Building2}
        />
      </div>

      {/* Real Historical Price Trend Chart */}
      <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-xs">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 mb-4">
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-base font-bold text-slate-900">
                Historical Modal Price Movement
              </h2>
              <Badge variant="emerald" size="xs">
                {selectedCrop} @ {selectedMandi}
              </Badge>
            </div>
            <p className="text-xs text-slate-500">
              Actual recorded modal prices from the dataset ({priceUnit})
            </p>
          </div>
          <div className="flex items-center gap-3 text-xs">
            <span className="flex items-center gap-1.5 text-slate-600 font-medium">
              <span className="w-3 h-3 rounded-full bg-emerald-600 inline-block"></span>
              Modal Price ({priceUnit})
            </span>
          </div>
        </div>

        {chartLoading ? (
          <div className="h-72 w-full flex items-center justify-center text-slate-400 text-xs gap-2">
            <RefreshCw className="w-4 h-4 animate-spin" />
            Loading real price history...
          </div>
        ) : trendData.length === 0 ? (
          <div className="h-72 w-full flex items-center justify-center text-slate-400 text-xs">
            No historical price records found for {selectedCrop} at {selectedMandi}.
          </div>
        ) : (
          <div className="h-72 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={trendData}>
                <defs>
                  <linearGradient id="priceGradient" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#059669" stopOpacity={0.25} />
                    <stop offset="95%" stopColor="#059669" stopOpacity={0.0} />
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
                    boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)',
                    fontSize: '12px',
                  }}
                  formatter={(val) => [`₹${val} (${priceUnit})`, 'Modal Price']}
                />
                <Area
                  type="monotone"
                  dataKey="modal_price"
                  stroke="#059669"
                  strokeWidth={2.5}
                  fillOpacity={1}
                  fill="url(#priceGradient)"
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        )}
      </div>

      {/* Quick Access to Feature Modules */}
      <div>
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="text-base font-bold text-slate-900">Explore Intelligence Modules</h2>
            <p className="text-xs text-slate-500">
              Access specialized decision tools connected to verified data
            </p>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {quickFeatures.map((feat) => {
            const Icon = feat.icon;
            return (
              <Link
                key={feat.to}
                to={feat.to}
                className="group bg-white rounded-2xl border border-slate-200 p-5 hover:border-emerald-300 hover:shadow-md transition-all duration-200 flex flex-col justify-between"
              >
                <div>
                  <div className="flex items-center justify-between gap-2 mb-3">
                    <div className="w-10 h-10 rounded-xl bg-emerald-50 text-emerald-700 flex items-center justify-center group-hover:bg-emerald-600 group-hover:text-white transition-colors">
                      <Icon className="w-5 h-5" />
                    </div>
                    <span className="text-[10px] font-semibold text-emerald-800 bg-emerald-50 px-2 py-0.5 rounded-md">
                      {feat.badge}
                    </span>
                  </div>
                  <h3 className="font-bold text-slate-900 text-sm mb-1 group-hover:text-emerald-700 transition-colors">
                    {feat.title}
                  </h3>
                  <p className="text-xs text-slate-500 leading-relaxed mb-4">{feat.desc}</p>
                </div>

                <div className="pt-3 border-t border-slate-100 flex items-center justify-between text-xs font-semibold text-emerald-700 group-hover:text-emerald-800">
                  <span>Open Tool</span>
                  <ArrowRight className="w-3.5 h-3.5 transition-transform group-hover:translate-x-1" />
                </div>
              </Link>
            );
          })}
        </div>
      </div>
    </div>
  );
}
