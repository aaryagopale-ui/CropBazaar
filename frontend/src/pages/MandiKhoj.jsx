import React, { useState, useEffect } from 'react';
import {
  GitCompare,
  CheckCircle,
  Building,
  Calendar,
  AlertCircle,
  TrendingUp,
  RefreshCw,
  Info,
} from 'lucide-react';
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  Legend,
} from 'recharts';
import DisclaimerBanner from '../components/DisclaimerBanner';
import Badge from '../components/Badge';
import { fetchMandiCompare } from '../services/api';
import { useFarmerProfile } from '../context/FarmerProfileContext';
import { useMarket } from '../context/MarketContext';
import KisanTwinSummaryBanner from '../components/KisanTwinSummaryBanner';

export default function MandiKhoj() {
  const { profile } = useFarmerProfile();
  const {
    selectedCrop,
    selectedMandi,
    setSelectedCrop,
    setSelectedMandi,
    commodities,
  } = useMarket();

  const [comparisonResult, setComparisonResult] = useState(null);
  const [loading, setLoading] = useState(true);

  // Fetch comparison whenever selected crop changes
  useEffect(() => {
    async function loadCompare() {
      if (!selectedCrop) return;
      try {
        setLoading(true);
        const res = await fetchMandiCompare({
          commodity: selectedCrop,
          limit: 10,
        });
        setComparisonResult(res);
      } catch (err) {
        console.error('Failed to compare mandis:', err);
      } finally {
        setLoading(false);
      }
    }
    loadCompare();
  }, [selectedCrop]);

  const mandisData = comparisonResult?.data || [];
  const highestPriceMandi = mandisData.length > 0 ? mandisData[0] : null;

  const chartData = mandisData.map((m) => ({
    name: m.market.replace('APMC ', ''),
    ModalPrice: m.modal_price,
    date: m.date,
  }));

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <h1 className="text-2xl font-bold text-slate-900">Mandi Khoj Comparison</h1>
            <Badge variant="emerald" size="xs">
              Real Multi-Mandi Feed
            </Badge>
          </div>
          <p className="text-sm text-slate-500">
            Compare actual recorded modal prices across APMC mandis trading the same crop.
          </p>
        </div>

        <div className="flex items-center gap-2 bg-white px-3 py-1.5 rounded-xl border border-slate-200 text-xs">
          <label className="text-slate-500 font-medium">Select Crop:</label>
          <select
            value={selectedCrop}
            onChange={(e) => setSelectedCrop(e.target.value)}
            className="font-bold text-emerald-800 bg-transparent focus:outline-hidden"
          >
            {commodities.map((c) => (
              <option key={c.commodity} value={c.commodity}>
                {c.commodity} ({c.price_unit})
              </option>
            ))}
          </select>
        </div>
      </div>

      <KisanTwinSummaryBanner featureName="Mandi Khoj" />

      <DisclaimerBanner
        title="Verified Market Observations"
        description="Prices and arrivals below are extracted directly from actual recorded APMC auction data. Note that mandis may report on different days based on auction schedules and holidays."
      />

      {/* Observation Date Notice */}
      {comparisonResult && !comparisonResult.all_dates_identical && (
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-3.5 text-amber-900 text-xs flex items-center gap-2.5">
          <Info className="w-4 h-4 text-amber-600 shrink-0" />
          <span>
            <strong>Note on Observation Dates:</strong> Different APMC mandis hold auctions on
            differing calendar days. The latest observation dates for {selectedCrop} range across:{' '}
            <strong>{comparisonResult.observation_dates?.join(', ')}</strong>.
          </span>
        </div>
      )}

      {/* Highest Recorded Market Banner */}
      {highestPriceMandi && (
        <div className="bg-gradient-to-r from-emerald-50 via-green-50 to-teal-50 border-2 border-emerald-500/40 rounded-3xl p-6 shadow-xs">
          <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-6">
            <div className="space-y-2">
              <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-emerald-600 text-white text-xs font-bold shadow-xs">
                <CheckCircle className="w-4 h-4" />
                Highest Recorded Price in Dataset
              </div>
              <h2 className="text-2xl font-extrabold text-slate-900">
                {highestPriceMandi.market} — ₹{highestPriceMandi.modal_price.toLocaleString('en-IN')}{' '}
                {highestPriceMandi.price_unit}
              </h2>
              <p className="text-xs sm:text-sm text-slate-600 max-w-2xl leading-relaxed">
                Recorded on <strong>{highestPriceMandi.date}</strong> in{' '}
                {highestPriceMandi.district} District ({highestPriceMandi.state}) with an intake of{' '}
                <strong>
                  {highestPriceMandi.arrival_quantity.toLocaleString('en-IN')}{' '}
                  {highestPriceMandi.arrival_unit}
                </strong>
                .
              </p>
            </div>

            <div className="bg-white rounded-2xl border border-emerald-200 p-4 shadow-xs shrink-0 text-center min-w-[200px]">
              <div className="text-xs text-slate-500 font-medium mb-1">Observed Modal Rate</div>
              <div className="text-3xl font-black text-emerald-700">
                ₹{highestPriceMandi.modal_price.toLocaleString('en-IN')}
              </div>
              <div className="text-[11px] text-slate-400 mt-1">
                Unit: {highestPriceMandi.price_unit}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Bar Chart Comparing Actual Prices */}
      <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-xs">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4">
          <div>
            <h2 className="text-base font-bold text-slate-900">
              Latest Modal Price by APMC Mandi ({comparisonResult?.price_unit})
            </h2>
            <p className="text-xs text-slate-500">
              Showing top {mandisData.length} mandis with recorded auctions for {selectedCrop}
            </p>
          </div>
        </div>

        {loading ? (
          <div className="h-72 w-full flex items-center justify-center text-slate-400 text-xs gap-2">
            <RefreshCw className="w-4 h-4 animate-spin" />
            Loading real comparison records...
          </div>
        ) : mandisData.length === 0 ? (
          <div className="h-72 w-full flex items-center justify-center text-slate-400 text-xs">
            No records found for {selectedCrop}.
          </div>
        ) : (
          <div className="h-72 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={chartData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
                <XAxis dataKey="name" stroke="#94a3b8" fontSize={11} tickLine={false} />
                <YAxis
                  stroke="#94a3b8"
                  fontSize={11}
                  tickLine={false}
                  domain={['auto', 'auto']}
                  tickFormatter={(v) => `₹${v}`}
                />
                <Tooltip
                  contentStyle={{
                    backgroundColor: '#ffffff',
                    borderColor: '#e2e8f0',
                    borderRadius: '12px',
                    fontSize: '12px',
                  }}
                  formatter={(val, name, item) => [
                    `₹${val} (${comparisonResult?.price_unit}) [Date: ${item.payload.date}]`,
                    'Latest Modal Price',
                  ]}
                />
                <Bar
                  dataKey="ModalPrice"
                  name="Modal Price"
                  fill="#059669"
                  radius={[4, 4, 0, 0]}
                  barSize={32}
                />
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}
      </div>

      {/* Comparison Table */}
      <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-xs">
        <div className="p-4 sm:p-5 border-b border-slate-100 flex items-center justify-between">
          <div>
            <h3 className="font-bold text-sm text-slate-900">
              Verified Mandi Comparison Table ({selectedCrop})
            </h3>
            <p className="text-xs text-slate-500">
              {mandisData.length} regional mandis actively trading this crop
            </p>
          </div>
          <Badge variant="neutral" size="sm">
            {mandisData.length} Mandis
          </Badge>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-50 text-slate-500 font-semibold uppercase tracking-wider border-b border-slate-200">
              <tr>
                <th className="py-3.5 px-4">APMC Mandi</th>
                <th className="py-3.5 px-4">District & State</th>
                <th className="py-3.5 px-4">Observation Date</th>
                <th className="py-3.5 px-4">Modal Price</th>
                <th className="py-3.5 px-4">Arrival Volume</th>
                <th className="py-3.5 px-4">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 font-medium text-slate-700">
              {mandisData.map((m, idx) => {
                const isSelected = m.market.toLowerCase() === (selectedMandi || '').toLowerCase();
                return (
                  <tr
                    key={m.market}
                    className={`hover:bg-slate-50 transition-colors ${
                      isSelected
                        ? 'bg-emerald-50/80 font-semibold ring-1 ring-emerald-500/30'
                        : idx === 0
                        ? 'bg-emerald-50/30 font-semibold'
                        : ''
                    }`}
                  >
                    <td className="py-3.5 px-4 font-bold text-slate-900">
                      <div className="flex items-center gap-2">
                        {isSelected ? (
                          <span className="w-2.5 h-2.5 rounded-full bg-emerald-600 animate-pulse shrink-0" />
                        ) : idx === 0 ? (
                          <CheckCircle className="w-4 h-4 text-emerald-600 shrink-0" />
                        ) : null}
                        <span>{m.market}</span>
                        {isSelected && (
                          <span className="inline-flex items-center px-2 py-0.5 rounded-md bg-emerald-100 text-emerald-800 text-[10px] font-bold">
                            Reference Mandi
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="py-3.5 px-4">
                      {m.district}, {m.state}
                    </td>
                    <td className="py-3.5 px-4 text-slate-600">
                      <span className="inline-flex items-center gap-1 font-mono">
                        <Calendar className="w-3 h-3 text-slate-400" />
                        {m.date}
                      </span>
                    </td>
                    <td className="py-3.5 px-4 font-extrabold text-emerald-700 text-sm">
                      ₹{m.modal_price.toLocaleString('en-IN')}{' '}
                      <span className="text-[10px] font-normal text-slate-500">/ {m.price_unit}</span>
                    </td>
                    <td className="py-3.5 px-4 text-slate-700">
                      {m.arrival_quantity.toLocaleString('en-IN')} {m.arrival_unit}
                    </td>
                    <td className="py-3.5 px-4">
                      {isSelected ? (
                        <span className="inline-flex items-center px-2.5 py-0.5 rounded-full bg-emerald-200 text-emerald-900 font-bold text-[11px]">
                          ✓ Selected Market
                        </span>
                      ) : (
                        <button
                          type="button"
                          onClick={() => setSelectedMandi(m.market)}
                          className="px-2.5 py-1 rounded-lg border border-slate-200 text-slate-600 hover:border-emerald-500 hover:text-emerald-700 font-medium text-[11px] transition-colors"
                        >
                          Select Mandi
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
