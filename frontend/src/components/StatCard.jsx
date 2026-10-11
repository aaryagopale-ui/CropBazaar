import React from 'react';
import { TrendingUp, TrendingDown, Minus } from 'lucide-react';

/**
 * Metric card with title, primary value, trend indicators, and subtext.
 */
export default function StatCard({
  title,
  value,
  unit = '',
  change = null,
  isPositive = true,
  subtext = '',
  icon: Icon,
  badge = null,
}) {
  return (
    <div className="bg-white rounded-2xl border border-slate-200/90 p-5 shadow-xs hover:shadow-md transition-all duration-200 flex flex-col justify-between">
      <div>
        <div className="flex items-center justify-between gap-2 mb-3">
          <span className="text-xs font-semibold uppercase tracking-wider text-slate-500">
            {title}
          </span>
          {Icon && (
            <div className="w-9 h-9 rounded-xl bg-emerald-50 text-emerald-700 flex items-center justify-center shrink-0">
              <Icon className="w-5 h-5" />
            </div>
          )}
        </div>

        <div className="flex items-baseline gap-2 mb-2">
          <span className="text-2xl sm:text-3xl font-bold tracking-tight text-slate-900">
            {value}
          </span>
          {unit && <span className="text-xs sm:text-sm font-medium text-slate-500">{unit}</span>}
        </div>
      </div>

      <div className="pt-2 border-t border-slate-100 flex items-center justify-between text-xs">
        {change !== null ? (
          <div
            className={`flex items-center gap-1 font-semibold ${
              isPositive ? 'text-emerald-700' : 'text-rose-600'
            }`}
          >
            {isPositive ? (
              <TrendingUp className="w-3.5 h-3.5" />
            ) : (
              <TrendingDown className="w-3.5 h-3.5" />
            )}
            <span>{change}</span>
          </div>
        ) : (
          <div className="flex items-center gap-1 text-slate-400">
            <Minus className="w-3 h-3" />
            <span>Steady</span>
          </div>
        )}

        {subtext && <span className="text-slate-500 truncate max-w-[60%]">{subtext}</span>}
        {badge && <span className="text-[11px] font-medium text-emerald-800 bg-emerald-50 px-2 py-0.5 rounded-md">{badge}</span>}
      </div>
    </div>
  );
}

