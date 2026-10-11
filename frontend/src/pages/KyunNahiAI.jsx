import React from 'react';
import {
  HelpCircle,
  CheckCircle2,
  XCircle,
  Lightbulb,
  ArrowRight,
  TrendingDown,
  Info,
  Building,
} from 'lucide-react';
import DisclaimerBanner from '../components/DisclaimerBanner';
import Badge from '../components/Badge';
import { KYUN_NAHI_DATA } from '../data/mockData';
import { useFarmerProfile } from '../context/FarmerProfileContext';
import { useMarket } from '../context/MarketContext';
import KisanTwinSummaryBanner from '../components/KisanTwinSummaryBanner';

export default function KyunNahiAI() {
  const { profile, profileComplete } = useFarmerProfile();
  const { selectedMandi, selectedCrop } = useMarket();
  const data = KYUN_NAHI_DATA;

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <h1 className="text-2xl font-bold text-slate-900">Kyun Nahi AI (क्यों नहीं?)</h1>
            <Badge variant="emerald" size="xs">
              Explainable AI (XAI)
            </Badge>
            {profileComplete && (
              <Badge variant="emerald" size="xs">
                KisanTwin: {profile.name || 'Farmer'}
              </Badge>
            )}
            {selectedMandi && (
              <Badge variant="emerald" size="xs">
                Target: {selectedMandi}
              </Badge>
            )}
          </div>
          <p className="text-sm text-slate-500">
            Transparent explanations: Why you should avoid deceptively high distant mandi quotes.
          </p>
        </div>
      </div>

      <KisanTwinSummaryBanner featureName="Kyun Nahi AI" />

      <DisclaimerBanner
        title="Explainability Prototype Notice"
        description="Farmers often see high rates advertised 200 km away and regret the journey after transport costs eat up their money. 'Kyun Nahi AI' explains in simple terms why those options were filtered out. The case study below is an illustrative simulation."
      />

      {/* Recommended Mandi Section */}
      <div className="bg-gradient-to-r from-emerald-900 to-green-950 text-white rounded-3xl p-6 sm:p-8 shadow-sm">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-6">
          <div className="space-y-3 max-w-2xl">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-emerald-700/80 text-emerald-200 text-xs font-semibold">
              <CheckCircle2 className="w-4 h-4 text-emerald-300" />
              Optimal Chosen Destination
            </div>
            <h2 className="text-2xl sm:text-3xl font-extrabold tracking-tight">
              {selectedMandi || data.primaryChoice.mandi}
            </h2>
            <p className="text-emerald-100 text-sm leading-relaxed">
              Selected because it delivers maximum take-home cash after freight, lowest queue delays, and dependable buyer competition.
            </p>

            <div className="space-y-1.5 pt-2">
              {data.primaryChoice.reasons.map((r, i) => (
                <div key={i} className="flex items-start gap-2 text-xs text-emerald-100/90">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 mt-1.5 shrink-0"></span>
                  <span>{r}</span>
                </div>
              ))}
            </div>
          </div>

          <div className="bg-emerald-800/60 border border-emerald-600/40 rounded-2xl p-5 text-center min-w-[220px] shrink-0">
            <div className="text-xs text-emerald-200 font-medium">Net Realization ({selectedCrop || 'Produce'})</div>
            <div className="text-2xl font-black text-white my-1">
              {data.primaryChoice.netProfitTotal}
            </div>
            <div className="text-xs text-emerald-300 font-semibold">
              {data.primaryChoice.netPerQtl} net / quintal
            </div>
          </div>
        </div>
      </div>

      {/* Alternative Mandi Comparison Section - "Why NOT These Mandis?" */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <HelpCircle className="w-5 h-5 text-amber-600" />
            <h2 className="text-base font-bold text-slate-900">
              Why We Rejected These Alternatives
            </h2>
          </div>
          <span className="text-xs text-slate-500">Transparent comparison breakdown</span>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
          {data.rejectedAlternatives.map((alt, idx) => (
            <div
              key={idx}
              className="bg-white rounded-2xl border border-slate-200 p-5 shadow-xs flex flex-col justify-between"
            >
              <div>
                <div className="flex items-center justify-between gap-2 mb-3">
                  <div className="flex items-center gap-2">
                    <XCircle className="w-4 h-4 text-rose-500 shrink-0" />
                    <h3 className="font-bold text-sm text-slate-900">{alt.mandi}</h3>
                  </div>
                  <span className="text-[11px] font-bold text-rose-600 bg-rose-50 px-2 py-0.5 rounded-full">
                    {alt.netDifference}
                  </span>
                </div>

                <div className="mb-3 p-2.5 bg-slate-50 rounded-xl text-xs">
                  <span className="text-slate-500 block text-[11px]">Headline Advertised Quote:</span>
                  <span className="font-bold text-slate-800">{alt.quotedPrice}</span>
                </div>

                <h4 className="text-xs font-bold text-slate-900 mb-1.5 flex items-center gap-1.5">
                  <Lightbulb className="w-3.5 h-3.5 text-amber-500" />
                  {alt.whyNotReason}
                </h4>

                <p className="text-xs text-slate-600 leading-relaxed mb-4">{alt.explanation}</p>
              </div>

              <div className="pt-3 border-t border-slate-100 flex items-center justify-between text-[11px] text-slate-500">
                <span>Comparison verdict:</span>
                <span className="font-semibold text-rose-700">Sub-optimal Choice</span>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

