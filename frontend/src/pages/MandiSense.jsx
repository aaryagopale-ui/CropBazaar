import React, { useState, useEffect } from 'react';
import {
  DollarSign,
  Truck,
  CloudRain,
  Thermometer,
  Droplets,
  Calendar,
  Layers,
  Building,
  RefreshCw,
} from 'lucide-react';
import {
  ResponsiveContainer,
  ComposedChart,
  LineChart,
  Line,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  Legend,
} from 'recharts';
import StatCard from '../components/StatCard';
import Badge from '../components/Badge';
import {
  fetchMarketTrends,
  fetchWeatherHistory,
  fetchWeatherSummary,
} from '../services/api';
import { useMarket } from '../context/MarketContext';

export default function MandiSense() {
  const {
    selectedCrop,
    selectedMandi,
    setSelectedCrop,
    setSelectedMandi,
    commodities,
    mandis,
    priceUnit,
    arrivalUnit,
  } = useMarket();

  const [limitPoints, setLimitPoints] = useState(30);
  const [marketTrends, setMarketTrends] = useState([]);
  const [weatherHistory, setWeatherHistory] = useState([]);
  const [weatherSummary, setWeatherSummary] = useState(null);

  const [chartLoading, setChartLoading] = useState(false);

  // Load market trends and weather for selected mandi
  useEffect(() => {
    async function loadData() {
      if (!selectedCrop || !selectedMandi) return;
      try {
        setChartLoading(true);

        const [trendRes, weatherHistRes, weatherSumRes] = await Promise.all([
          fetchMarketTrends({
            commodity: selectedCrop,
            market: selectedMandi,
            limit: limitPoints,
          }),
          fetchWeatherHistory({
            market: selectedMandi,
            limit: limitPoints,
          }),
          fetchWeatherSummary({
            market: selectedMandi,
          }),
        ]);

        if (trendRes?.found) {
          setMarketTrends(trendRes.data || []);
        } else {
          setMarketTrends([]);
        }

        if (weatherHistRes?.found) {
          setWeatherHistory(weatherHistRes.data);
        } else {
          setWeatherHistory([]);
        }

        if (weatherSumRes?.found) {
          setWeatherSummary(weatherSumRes);
        } else {
          setWeatherSummary(null);
        }
      } catch (err) {
        console.error('Failed to load market/weather trends:', err);
      } finally {
        setChartLoading(false);
      }
    }

    loadData();
  }, [selectedCrop, selectedMandi, limitPoints]);

  const latestTrend = marketTrends[marketTrends.length - 1];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <h1 className="text-2xl font-bold text-slate-900">MandiSense Intelligence</h1>
            <Badge variant="emerald" size="xs">
              Live Verified APMC Data
            </Badge>
          </div>
          <p className="text-sm text-slate-500">
            Real historical auction rate dynamics, arrival volume, and station weather observations.
          </p>
        </div>

        <div className="flex items-center gap-2">
          {[15, 30, 60, 100].map((pts) => (
            <button
              key={pts}
              type="button"
              onClick={() => setLimitPoints(pts)}
              className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition-colors ${
                limitPoints === pts
                  ? 'bg-emerald-700 text-white shadow-xs'
                  : 'bg-white border border-slate-200 text-slate-600 hover:bg-slate-50'
              }`}
            >
              Last {pts} Days
            </button>
          ))}
        </div>
      </div>

      {/* Filter Controls */}
      <div className="bg-white rounded-2xl border border-slate-200 p-4 shadow-xs">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">Commodity / Crop</label>
            <select
              value={selectedCrop}
              onChange={(e) => setSelectedCrop(e.target.value)}
              className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-medium text-slate-800"
            >
              {commodities.map((c) => (
                <option key={c.commodity} value={c.commodity}>
                  {c.commodity} ({c.price_unit})
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">APMC Mandi</label>
            <select
              value={selectedMandi}
              onChange={(e) => setSelectedMandi(e.target.value)}
              className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-medium text-slate-800"
            >
              {mandis.map((m) => (
                <option key={m.market} value={m.market}>
                  {m.market} ({m.district})
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {/* Metric Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          title="Latest Modal Price"
          value={latestTrend ? `₹${latestTrend.modal_price.toLocaleString('en-IN')}` : '—'}
          unit={priceUnit}
          subtext={latestTrend ? `Date: ${latestTrend.date}` : ''}
          icon={DollarSign}
        />
        <StatCard
          title="Recorded Arrival"
          value={latestTrend ? `${latestTrend.arrival_quantity.toLocaleString('en-IN')}` : '—'}
          unit={arrivalUnit}
          subtext="Gate intake volume"
          icon={Truck}
        />
        <StatCard
          title="Avg Station Temperature"
          value={weatherSummary?.temperature ? `${weatherSummary.temperature.mean_c}°C` : '—'}
          unit={weatherSummary?.temperature ? `Max: ${weatherSummary.temperature.max_c}°C` : ''}
          subtext="Station records"
          icon={Thermometer}
        />
        <StatCard
          title="Total Rainfall (Station)"
          value={weatherSummary?.rainfall ? `${weatherSummary.rainfall.total_precipitation_mm} mm` : '—'}
          unit={weatherSummary?.rainfall ? `${weatherSummary.rainfall.rainy_days_count} rainy days` : ''}
          subtext="Historical precipitation"
          icon={CloudRain}
        />
      </div>

      {/* Dual Axis Chart: Price vs Arrival Volume */}
      <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-xs">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4">
          <div>
            <h2 className="text-base font-bold text-slate-900">
              Price vs. Arrival Volume Correlation
            </h2>
            <p className="text-xs text-slate-500">
              Comparing modal auction rate ({priceUnit}) against arrival inflow ({arrivalUnit})
            </p>
          </div>
          <Badge variant="neutral" size="sm">
            {selectedCrop} @ {selectedMandi}
          </Badge>
        </div>

        {chartLoading ? (
          <div className="h-80 w-full flex items-center justify-center text-slate-400 text-xs gap-2">
            <RefreshCw className="w-4 h-4 animate-spin" />
            Loading real market series...
          </div>
        ) : marketTrends.length === 0 ? (
          <div className="h-80 w-full flex items-center justify-center text-slate-400 text-xs">
            No market arrivals recorded for {selectedCrop} at {selectedMandi}.
          </div>
        ) : (
          <div className="h-80 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart data={marketTrends}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
                <XAxis dataKey="date" stroke="#94a3b8" fontSize={11} tickLine={false} />
                <YAxis
                  yAxisId="left"
                  orientation="left"
                  stroke="#059669"
                  fontSize={11}
                  tickLine={false}
                  tickFormatter={(val) => `₹${val}`}
                  domain={['auto', 'auto']}
                />
                <YAxis
                  yAxisId="right"
                  orientation="right"
                  stroke="#94a3b8"
                  fontSize={11}
                  tickLine={false}
                  tickFormatter={(val) => `${val}`}
                />
                <Tooltip
                  contentStyle={{
                    backgroundColor: '#ffffff',
                    borderColor: '#e2e8f0',
                    borderRadius: '12px',
                    boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)',
                    fontSize: '12px',
                  }}
                  formatter={(val, name) => [
                    name === 'modal_price' ? `₹${val} (${priceUnit})` : `${val} (${arrivalUnit})`,
                    name === 'modal_price' ? 'Modal Price' : 'Arrival Volume',
                  ]}
                />
                <Legend wrapperStyle={{ fontSize: '12px', paddingTop: '10px' }} />
                <Bar
                  yAxisId="right"
                  dataKey="arrival_quantity"
                  name="Arrival Quantity"
                  fill="#cbd5e1"
                  radius={[4, 4, 0, 0]}
                  barSize={20}
                />
                <Line
                  yAxisId="left"
                  type="monotone"
                  dataKey="modal_price"
                  name="Modal Price"
                  stroke="#059669"
                  strokeWidth={2.5}
                  dot={{ r: 3, fill: '#059669' }}
                />
              </ComposedChart>
            </ResponsiveContainer>
          </div>
        )}
      </div>

      {/* Historical Weather Series Chart */}
      <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-xs">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4">
          <div>
            <h2 className="text-base font-bold text-slate-900">
              Historical Weather Observations ({selectedMandi})
            </h2>
            <p className="text-xs text-slate-500">
              Recorded temperature (°C) and daily precipitation (mm)
            </p>
          </div>
          <div className="flex items-center gap-3 text-xs">
            <span className="flex items-center gap-1.5 text-amber-700 font-medium">
              <span className="w-3 h-1.5 bg-amber-500 rounded-full inline-block"></span>
              Mean Temp (°C)
            </span>
            <span className="flex items-center gap-1.5 text-blue-600 font-medium">
              <span className="w-3 h-1.5 bg-blue-500 rounded-full inline-block"></span>
              Precipitation (mm)
            </span>
          </div>
        </div>

        {weatherHistory.length === 0 ? (
          <div className="h-64 w-full flex items-center justify-center text-slate-400 text-xs">
            No weather observations available.
          </div>
        ) : (
          <div className="h-64 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart data={weatherHistory}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
                <XAxis dataKey="date" stroke="#94a3b8" fontSize={11} tickLine={false} />
                <YAxis
                  yAxisId="temp"
                  orientation="left"
                  stroke="#f59e0b"
                  fontSize={11}
                  tickLine={false}
                  tickFormatter={(v) => `${v}°C`}
                  domain={['auto', 'auto']}
                />
                <YAxis
                  yAxisId="rain"
                  orientation="right"
                  stroke="#3b82f6"
                  fontSize={11}
                  tickLine={false}
                  tickFormatter={(v) => `${v}mm`}
                />
                <Tooltip
                  contentStyle={{
                    backgroundColor: '#ffffff',
                    borderColor: '#e2e8f0',
                    borderRadius: '12px',
                    fontSize: '12px',
                  }}
                  formatter={(val, name) => [
                    name === 'temperature_mean_c' ? `${val}°C` : `${val} mm`,
                    name === 'temperature_mean_c' ? 'Mean Temperature' : 'Precipitation',
                  ]}
                />
                <Legend wrapperStyle={{ fontSize: '12px', paddingTop: '10px' }} />
                <Bar
                  yAxisId="rain"
                  dataKey="precipitation_mm"
                  name="Precipitation (mm)"
                  fill="#93c5fd"
                  radius={[3, 3, 0, 0]}
                  barSize={16}
                />
                <Line
                  yAxisId="temp"
                  type="monotone"
                  dataKey="temperature_mean_c"
                  name="Mean Temp (°C)"
                  stroke="#f59e0b"
                  strokeWidth={2}
                  dot={false}
                />
              </ComposedChart>
            </ResponsiveContainer>
          </div>
        )}
      </div>
    </div>
  );
}
