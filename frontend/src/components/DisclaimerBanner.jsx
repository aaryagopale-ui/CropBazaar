import React from 'react';
import { AlertCircle, Sparkles } from 'lucide-react';

/**
 * Top alert banner explaining that displayed data is illustrative sample data
 * for hackathon evaluation and prototype validation.
 */
export default function DisclaimerBanner({ title, description, badgeText = "Sample UI Preview" }) {
  return (
    <div className="bg-amber-50/80 border border-amber-200/80 rounded-xl p-3.5 sm:p-4 mb-6 text-amber-900 text-xs sm:text-sm flex items-start gap-3 shadow-xs">
      <div className="p-1 rounded-lg bg-amber-100 text-amber-800 shrink-0 mt-0.5">
        <AlertCircle className="w-4 h-4" />
      </div>
      <div className="flex-1">
        <div className="flex flex-wrap items-center gap-2 mb-1">
          <span className="font-semibold text-amber-950">
            {title || "Hackathon Prototype Notice"}
          </span>
          <span className="inline-flex items-center gap-1 text-[11px] font-medium px-2 py-0.5 rounded-full bg-amber-200/60 text-amber-900">
            <Sparkles className="w-3 h-3 text-amber-700" />
            {badgeText}
          </span>
        </div>
        <p className="text-amber-800 leading-relaxed">
          {description ||
            "Market rates, arrival metrics, and forecast figures shown here are illustrative sample representations for UI/UX validation. Real-time APMC/AGMARKNET APIs and machine learning models are scheduled for integration in upcoming steps."}
        </p>
      </div>
    </div>
  );
}

