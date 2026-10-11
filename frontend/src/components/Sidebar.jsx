import React from 'react';
import { NavLink } from 'react-router-dom';
import {
  LayoutDashboard,
  LineChart,
  TrendingUp,
  GitCompare,
  ShoppingBag,
  Calculator,
  ShieldAlert,
  UserCheck,
  HelpCircle,
  MessageSquare,
  Sparkles,
} from 'lucide-react';

const NAV_ITEMS = [
  { to: '/', label: 'Home / Dashboard', icon: LayoutDashboard, tag: 'Overview' },
  { to: '/mandisense', label: 'MandiSense', icon: LineChart, tag: 'Intelligence' },
  { to: '/bhavishya', label: 'Bhavishya Forecast', icon: TrendingUp, tag: '1-7 Days' },
  { to: '/mandi-khoj', label: 'Mandi Khoj', icon: GitCompare, tag: 'Comparison' },
  { to: '/bechsmart', label: 'BechSmart', icon: ShoppingBag, tag: 'Advisory' },
  { to: '/munafa-meter', label: 'Munafa Meter', icon: Calculator, tag: 'Calculator' },
  { to: '/jokhim', label: 'Jokhim Engine', icon: ShieldAlert, tag: 'Risk radar' },
  { to: '/kisantwin', label: 'KisanTwin', icon: UserCheck, tag: 'Profile' },
  { to: '/kyun-nahi', label: 'Kyun Nahi AI', icon: HelpCircle, tag: 'Explainable' },
  { to: '/kisan-vaani', label: 'Kisan Vaani', icon: MessageSquare, tag: 'Multilingual' },
];

export default function Sidebar({ isMobileMenuOpen, onCloseMobileMenu }) {
  return (
    <>
      {/* Mobile Backdrop */}
      {isMobileMenuOpen && (
        <div
          onClick={onCloseMobileMenu}
          className="fixed inset-0 z-40 bg-slate-900/40 backdrop-blur-xs lg:hidden transition-opacity"
        />
      )}

      {/* Sidebar container */}
      <aside
        className={`fixed lg:static top-16 bottom-0 left-0 z-40 w-72 bg-white border-r border-slate-200 flex flex-col justify-between transition-transform duration-300 ease-in-out ${
          isMobileMenuOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'
        }`}
      >
        {/* Navigation Links */}
        <div className="flex-1 overflow-y-auto px-4 py-5 space-y-1">
          <div className="px-3 pb-2 text-[11px] font-bold uppercase tracking-wider text-slate-400">
            Market Intelligence Suite
          </div>

          {NAV_ITEMS.map((item) => {
            const Icon = item.icon;
            return (
              <NavLink
                key={item.to}
                to={item.to}
                onClick={onCloseMobileMenu}
                className={({ isActive }) =>
                  `group flex items-center justify-between px-3.5 py-2.5 rounded-xl text-sm font-medium transition-all duration-150 ${
                    isActive
                      ? 'bg-emerald-50 text-emerald-800 font-semibold shadow-xs'
                      : 'text-slate-600 hover:text-slate-900 hover:bg-slate-50'
                  }`
                }
              >
                {({ isActive }) => (
                  <>
                    <div className="flex items-center gap-3">
                      <Icon
                        className={`w-4 h-4 transition-colors ${
                          isActive
                            ? 'text-emerald-700'
                            : 'text-slate-400 group-hover:text-slate-600'
                        }`}
                      />
                      <span>{item.label}</span>
                    </div>

                    <span
                      className={`text-[10px] px-2 py-0.5 rounded-full font-medium ${
                        isActive
                          ? 'bg-emerald-100 text-emerald-800'
                          : 'bg-slate-100 text-slate-500 group-hover:bg-slate-200/70'
                      }`}
                    >
                      {item.tag}
                    </span>
                  </>
                )}
              </NavLink>
            );
          })}
        </div>

        {/* Bottom helper card */}
        <div className="p-4 border-t border-slate-100">
          <div className="bg-gradient-to-br from-emerald-900 to-green-950 text-white rounded-2xl p-4 shadow-xs">
            <div className="flex items-center gap-1.5 text-emerald-300 text-xs font-semibold mb-1">
              <Sparkles className="w-3.5 h-3.5" />
              <span>Smart Mandi Advisory</span>
            </div>
            <p className="text-[12px] text-emerald-100/90 leading-relaxed mb-3">
              Empowering Indian farmers with net margin discovery before loading the truck.
            </p>
            <div className="text-[10px] text-emerald-300/80 font-mono">
              College Hackathon 2026 Build
            </div>
          </div>
        </div>
      </aside>
    </>
  );
}

