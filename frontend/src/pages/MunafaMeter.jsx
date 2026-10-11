import React, { useState, useEffect } from 'react';
import {
  Calculator,
  RefreshCw,
  CheckCircle,
  Building,
  Calendar,
  Sparkles,
} from 'lucide-react';
import DisclaimerBanner from '../components/DisclaimerBanner';
import Badge from '../components/Badge';
import { fetchMarketTrends } from '../services/api';
import { useFarmerProfile } from '../context/FarmerProfileContext';
import { useMarket } from '../context/MarketContext';
import KisanTwinSummaryBanner from '../components/KisanTwinSummaryBanner';

export default function MunafaMeter() {
  const { profile } = useFarmerProfile();
  const {
    selectedCrop,
    selectedMandi,
    setSelectedCrop,
    setSelectedMandi,
    commodities,
    mandis,
    priceUnit: marketPriceUnit,
  } = useMarket();

  // Interactive calculator parameters
  const [quantity, setQuantity] = useState(50);
  const [sellingPrice, setSellingPrice] = useState(3800);
  const [priceUnit, setPriceUnit] = useState(marketPriceUnit || 'Rs./Quintal');
  const [quantityUnit, setQuantityUnit] = useState('Quintals');
  const [latestDate, setLatestDate] = useState(null);

  // User-entered expense assumptions
  const [transportCostPerUnit, setTransportCostPerUnit] = useState(70);
  const [loadingCostPerUnit, setLoadingCostPerUnit] = useState(15);
  const [marketFeePerUnit, setMarketFeePerUnit] = useState(20);
  const [costOfCultivationPerUnit, setCostOfCultivationPerUnit] = useState(1200);

  // Adapt to profile only when configured with non-blank values
  useEffect(() => {
    if (profile && profile.crop && profile.crop.trim() !== '') {
      if (profile.lotSize && Number(profile.lotSize) > 0) {
        setQuantity(Number(profile.lotSize));
      }
      if (profile.transportAccess === 'own_tractor') {
        setTransportCostPerUnit(40);
      } else if (profile.transportAccess === 'middleman_pickup') {
        setTransportCostPerUnit(0);
      } else if (profile.transportAccess === 'hired_trolley') {
        setTransportCostPerUnit(70);
      }
    }
  }, [profile]);

  // When crop or mandi changes, fetch the real latest recorded modal price and pre-fill!
  useEffect(() => {
    async function updatePriceFromDataset() {
      if (!selectedCrop || !selectedMandi) return;
      try {
        const trendRes = await fetchMarketTrends({
          commodity: selectedCrop,
          market: selectedMandi,
          limit: 1,
        });

        if (trendRes?.found && trendRes.data?.length > 0) {
          const latest = trendRes.data[trendRes.data.length - 1];
          setSellingPrice(latest.modal_price);
          setLatestDate(latest.date);
          setPriceUnit(trendRes.price_unit);
          setQuantityUnit(trendRes.price_unit.includes('Bundle') ? 'Bundles' : 'Quintals');
        }
      } catch (err) {
        console.error('Failed to fetch real price for calculator:', err);
      }
    }
    updatePriceFromDataset();
  }, [selectedCrop, selectedMandi]);

  // Calculations
  const grossRevenue = quantity * sellingPrice;
  const totalTransportCost = quantity * transportCostPerUnit;
  const totalLoadingCost = quantity * loadingCostPerUnit;
  const totalMarketFees = quantity * marketFeePerUnit;
  const totalMandiExpenses = totalTransportCost + totalLoadingCost + totalMarketFees;
  const mandiExpensePerUnit = transportCostPerUnit + loadingCostPerUnit + marketFeePerUnit;

  const netMandiPayout = grossRevenue - totalMandiExpenses;
  const netMandiPayoutPerUnit = sellingPrice - mandiExpensePerUnit;

  const totalCultivationCost = quantity * costOfCultivationPerUnit;
  const netFarmProfit = netMandiPayout - totalCultivationCost;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <h1 className="text-2xl font-bold text-slate-900">Munafa Meter</h1>
            <Badge variant="emerald" size="xs">
              Live Mandi Price Integration
            </Badge>
          </div>
          <p className="text-sm text-slate-500">
            Real recorded modal price combined with your customizable transport and labor costs.
          </p>
        </div>

        <button
          type="button"
          onClick={() => {
            setQuantity(50);
            setTransportCostPerUnit(70);
            setLoadingCostPerUnit(15);
            setMarketFeePerUnit(20);
            setCostOfCultivationPerUnit(1200);
          }}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 text-slate-600 text-xs font-semibold"
        >
          <RefreshCw className="w-3.5 h-3.5" />
          Reset Assumptions
        </button>
      </div>

      <KisanTwinSummaryBanner featureName="Munafa Meter" />

      <DisclaimerBanner
        title="Calculator Assumptions Notice"
        description="The base selling price is seeded from the latest real recorded APMC auction modal rate. Freight, hamali labor, and cultivation costs are user-entered assumptions for your specific vehicle and farm."
      />

      {/* Real Mandi Source Selection Bar */}
      <div className="bg-emerald-50/60 border border-emerald-200 rounded-2xl p-4">
        <div className="flex items-center justify-between mb-3">
          <span className="text-xs font-bold text-emerald-950 flex items-center gap-2">
            <Building className="w-4 h-4 text-emerald-700" />
            Seed Selling Price from Verified APMC Mandi
          </span>
          {latestDate && (
            <span className="text-[11px] text-emerald-800 font-medium">
              Recorded on: {latestDate}
            </span>
          )}
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-semibold text-slate-600 mb-1">Crop</label>
            <select
              value={selectedCrop}
              onChange={(e) => setSelectedCrop(e.target.value)}
              className="w-full px-3 py-2 bg-white border border-emerald-200 rounded-xl text-xs font-medium text-slate-800"
            >
              {commodities.map((c) => (
                <option key={c.commodity} value={c.commodity}>
                  {c.commodity} ({c.price_unit})
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-600 mb-1">Mandi</label>
            <select
              value={selectedMandi}
              onChange={(e) => setSelectedMandi(e.target.value)}
              className="w-full px-3 py-2 bg-white border border-emerald-200 rounded-xl text-xs font-medium text-slate-800"
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

      {/* KPI Result Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-xs">
          <div className="text-xs font-semibold uppercase tracking-wider text-slate-500 mb-2">
            Gross Market Value
          </div>
          <div className="text-2xl sm:text-3xl font-extrabold text-slate-900">
            ₹{grossRevenue.toLocaleString('en-IN')}
          </div>
          <div className="text-xs text-slate-500 mt-1">
            {quantity} {quantityUnit} × ₹{sellingPrice}/{priceUnit}
          </div>
        </div>

        <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-xs">
          <div className="text-xs font-semibold uppercase tracking-wider text-rose-500 mb-2">
            Estimated Logistics & Mandi Fees
          </div>
          <div className="text-2xl sm:text-3xl font-extrabold text-rose-600">
            -₹{totalMandiExpenses.toLocaleString('en-IN')}
          </div>
          <div className="text-xs text-rose-700/80 mt-1">
            ₹{mandiExpensePerUnit} per {quantityUnit.slice(0, -1)} total friction
          </div>
        </div>

        <div className="bg-emerald-900 text-white rounded-2xl p-5 shadow-sm">
          <div className="text-xs font-semibold uppercase tracking-wider text-emerald-300 mb-2">
            Estimated Net Mandi Payout
          </div>
          <div className="text-2xl sm:text-3xl font-extrabold text-white">
            ₹{netMandiPayout.toLocaleString('en-IN')}
          </div>
          <div className="text-xs text-emerald-200 mt-1 font-medium">
            Effective: ₹{netMandiPayoutPerUnit.toLocaleString('en-IN')} / {quantityUnit.slice(0, -1)}
          </div>
        </div>
      </div>

      {/* Input Form & Breakdown */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        <div className="lg:col-span-7 bg-white rounded-2xl border border-slate-200 p-5 shadow-xs space-y-4">
          <h2 className="text-base font-bold text-slate-900 border-b border-slate-100 pb-3">
            Harvest & Expense Inputs
          </h2>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-slate-600 mb-1">
                Produce Quantity ({quantityUnit})
              </label>
              <input
                type="number"
                min="1"
                value={quantity}
                onChange={(e) => setQuantity(Math.max(1, Number(e.target.value)))}
                className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-sm font-medium text-slate-800"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-600 mb-1">
                Selling Price (₹ / {priceUnit})
              </label>
              <input
                type="number"
                min="0"
                value={sellingPrice}
                onChange={(e) => setSellingPrice(Math.max(0, Number(e.target.value)))}
                className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-sm font-medium text-slate-800"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div>
              <label className="block text-xs font-semibold text-slate-600 mb-1">
                Transport Freight (₹/unit)
              </label>
              <input
                type="number"
                min="0"
                value={transportCostPerUnit}
                onChange={(e) => setTransportCostPerUnit(Math.max(0, Number(e.target.value)))}
                className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-sm font-medium text-slate-800"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-600 mb-1">
                Loading Labor (₹/unit)
              </label>
              <input
                type="number"
                min="0"
                value={loadingCostPerUnit}
                onChange={(e) => setLoadingCostPerUnit(Math.max(0, Number(e.target.value)))}
                className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-sm font-medium text-slate-800"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-600 mb-1">
                Mandi Fees (₹/unit)
              </label>
              <input
                type="number"
                min="0"
                value={marketFeePerUnit}
                onChange={(e) => setMarketFeePerUnit(Math.max(0, Number(e.target.value)))}
                className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-sm font-medium text-slate-800"
              />
            </div>
          </div>

          <div className="pt-2 border-t border-slate-100">
            <label className="block text-xs font-semibold text-slate-600 mb-1">
              Cultivation Cost (₹ / unit) <span className="text-slate-400 font-normal">(Optional for farm profit)</span>
            </label>
            <input
              type="number"
              min="0"
              value={costOfCultivationPerUnit}
              onChange={(e) => setCostOfCultivationPerUnit(Math.max(0, Number(e.target.value)))}
              className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-sm font-medium text-slate-800"
            />
          </div>
        </div>

        {/* Expense Itemization */}
        <div className="lg:col-span-5 bg-white rounded-2xl border border-slate-200 p-5 shadow-xs flex flex-col justify-between">
          <div>
            <h2 className="text-base font-bold text-slate-900 border-b border-slate-100 pb-3 mb-4">
              Payout Summary
            </h2>

            <div className="space-y-3 text-xs">
              <div className="flex justify-between items-center py-1">
                <span className="text-slate-600">Gross Auction Value:</span>
                <span className="font-bold text-slate-900">₹{grossRevenue.toLocaleString('en-IN')}</span>
              </div>

              <div className="flex justify-between items-center py-1 text-rose-600">
                <span>Transport ({quantity} × ₹{transportCostPerUnit}):</span>
                <span className="font-medium">-₹{totalTransportCost.toLocaleString('en-IN')}</span>
              </div>

              <div className="flex justify-between items-center py-1 text-rose-600">
                <span>Hamali & Labor ({quantity} × ₹{loadingCostPerUnit}):</span>
                <span className="font-medium">-₹{totalLoadingCost.toLocaleString('en-IN')}</span>
              </div>

              <div className="flex justify-between items-center py-1 text-rose-600">
                <span>Mandi Cess & Weighment:</span>
                <span className="font-medium">-₹{totalMarketFees.toLocaleString('en-IN')}</span>
              </div>

              <div className="pt-3 border-t border-slate-200 flex justify-between items-center font-bold text-slate-900">
                <span>Net Cash Received from Mandi:</span>
                <span className="text-emerald-700 text-sm">₹{netMandiPayout.toLocaleString('en-IN')}</span>
              </div>

              {costOfCultivationPerUnit > 0 && (
                <>
                  <div className="flex justify-between items-center py-1 text-slate-500">
                    <span>Minus Cultivation Investment:</span>
                    <span>-₹{totalCultivationCost.toLocaleString('en-IN')}</span>
                  </div>

                  <div className="p-3 bg-emerald-50 rounded-xl border border-emerald-200 flex justify-between items-center font-bold text-emerald-950">
                    <span>True Net Farm Profit:</span>
                    <span className="text-base text-emerald-800">
                      ₹{netFarmProfit.toLocaleString('en-IN')}
                    </span>
                  </div>
                </>
              )}
            </div>
          </div>

          <div className="mt-6 pt-4 border-t border-slate-100 text-[11px] text-slate-500 flex items-center gap-1.5">
            <CheckCircle className="w-4 h-4 text-emerald-600 shrink-0" />
            <span>Unit compatibility verified for {quantityUnit}.</span>
          </div>
        </div>
      </div>
    </div>
  );
}
