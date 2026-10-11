import React, { createContext, useContext, useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { fetchCommodities, fetchMandis } from '../services/api';
import { useFarmerProfile } from './FarmerProfileContext';

const STORAGE_KEY = 'cropbazaar_global_market';

const DEFAULT_MARKET_STATE = {
  selectedCrop: 'Onion',
  selectedMandi: 'APMC Lasalgaon',
  selectedDistrict: 'Nashik',
  selectedState: 'Maharashtra',
};

const MarketContext = createContext({
  selectedCrop: DEFAULT_MARKET_STATE.selectedCrop,
  selectedMandi: DEFAULT_MARKET_STATE.selectedMandi,
  selectedDistrict: DEFAULT_MARKET_STATE.selectedDistrict,
  selectedState: DEFAULT_MARKET_STATE.selectedState,
  commodities: [],
  mandis: [],
  priceUnit: 'Rs./Quintal',
  arrivalUnit: 'Metric Tonnes',
  loadingMarket: false,
  loadingMandis: false,
  setSelectedCrop: () => {},
  setSelectedMandi: () => {},
  setSelectedDistrict: () => {},
  setSelectedState: () => {},
  setMarketSelection: () => {},
});

export function MarketProvider({ children }) {
  const { profile } = useFarmerProfile();

  // 1. Initial State from localStorage if available
  const [marketState, setMarketState] = useState(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) {
        const parsed = JSON.parse(saved);
        return {
          selectedCrop: parsed.selectedCrop || DEFAULT_MARKET_STATE.selectedCrop,
          selectedMandi: parsed.selectedMandi || DEFAULT_MARKET_STATE.selectedMandi,
          selectedDistrict: parsed.selectedDistrict || DEFAULT_MARKET_STATE.selectedDistrict,
          selectedState: parsed.selectedState || DEFAULT_MARKET_STATE.selectedState,
        };
      }
    } catch (e) {
      console.warn('[MarketContext] Failed to read localStorage:', e);
    }
    return DEFAULT_MARKET_STATE;
  });

  const [commodities, setCommodities] = useState([]);
  const [mandis, setMandis] = useState([]);
  const [priceUnit, setPriceUnit] = useState('Rs./Quintal');
  const [arrivalUnit, setArrivalUnit] = useState('Metric Tonnes');
  const [loadingMarket, setLoadingMarket] = useState(true);
  const [loadingMandis, setLoadingMandis] = useState(false);

  // Keep track of user's explicit interaction to prevent automatic overwriting
  const userHasExplicitSelection = useRef(false);

  // Check if localStorage had a saved preference
  useEffect(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) {
        userHasExplicitSelection.current = true;
      }
    } catch (_) {}
  }, []);

  // Save to localStorage whenever marketState changes
  const persistState = useCallback((newState) => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(newState));
      userHasExplicitSelection.current = true;
    } catch (e) {
      console.warn('[MarketContext] Failed to persist to localStorage:', e);
    }
  }, []);

  // 2. Fetch initial commodities list
  useEffect(() => {
    let isCancelled = false;
    async function loadComms() {
      try {
        setLoadingMarket(true);
        const comms = await fetchCommodities();
        if (!isCancelled && comms && comms.length > 0) {
          setCommodities(comms);
          const current = comms.find((c) => c.commodity === marketState.selectedCrop);
          if (current) {
            setPriceUnit(current.price_unit || 'Rs./Quintal');
            setArrivalUnit(current.arrival_unit || 'Metric Tonnes');
          }
        }
      } catch (err) {
        console.error('[MarketContext] Failed to load commodities:', err);
      } finally {
        if (!isCancelled) setLoadingMarket(false);
      }
    }
    loadComms();
    return () => { isCancelled = true; };
  }, []);

  // 3. Adopt Farmer Profile crop/district if user has no explicit saved market in localStorage
  useEffect(() => {
    if (!userHasExplicitSelection.current && profile && profile.crop && profile.crop.trim() !== '') {
      setMarketState((prev) => {
        const next = {
          ...prev,
          selectedCrop: profile.crop.trim(),
          selectedDistrict: profile.district ? profile.district.trim() : prev.selectedDistrict,
          selectedState: profile.state ? profile.state.trim() : prev.selectedState,
        };
        persistState(next);
        return next;
      });
    }
  }, [profile?.crop, profile?.district, profile?.state, persistState]);

  // 4. Load available mandis whenever selectedCrop or selectedState changes
  useEffect(() => {
    let isCancelled = false;
    async function loadMandisList() {
      if (!marketState.selectedCrop) return;
      try {
        setLoadingMandis(true);
        const res = await fetchMandis({
          commodity: marketState.selectedCrop,
          state: marketState.selectedState,
        });

        if (!isCancelled && res && res.length > 0) {
          setMandis(res);
          // Check if current selected mandi is valid for this crop
          const exists = res.some((m) => m.market === marketState.selectedMandi);
          if (!exists) {
            // Pick first available mandi for this crop
            const fallbackMandi = res[0].market;
            const fallbackDistrict = res[0].district || marketState.selectedDistrict;
            setMarketState((prev) => {
              const updated = {
                ...prev,
                selectedMandi: fallbackMandi,
                selectedDistrict: fallbackDistrict,
              };
              persistState(updated);
              return updated;
            });
          }
        } else if (!isCancelled) {
          setMandis([]);
        }
      } catch (err) {
        console.error('[MarketContext] Failed to load mandis:', err);
      } finally {
        if (!isCancelled) setLoadingMandis(false);
      }
    }

    loadMandisList();
    return () => { isCancelled = true; };
  }, [marketState.selectedCrop, marketState.selectedState, persistState]);

  // 5. Selectors & Handlers
  const setSelectedCrop = useCallback((cropName) => {
    if (!cropName || cropName === marketState.selectedCrop) return;
    const match = commodities.find((c) => c.commodity.toLowerCase() === cropName.toLowerCase());
    const canonicalCrop = match ? match.commodity : cropName;
    if (match) {
      setPriceUnit(match.price_unit || 'Rs./Quintal');
      setArrivalUnit(match.arrival_unit || 'Metric Tonnes');
    }
    setMarketState((prev) => {
      const updated = { ...prev, selectedCrop: canonicalCrop };
      persistState(updated);
      return updated;
    });
  }, [commodities, marketState.selectedCrop, persistState]);

  const setSelectedMandi = useCallback((mandiName) => {
    if (!mandiName || mandiName === marketState.selectedMandi) return;
    const match = mandis.find((m) => m.market.toLowerCase() === mandiName.toLowerCase());
    const canonicalMandi = match ? match.market : mandiName;
    const district = match?.district || marketState.selectedDistrict;

    setMarketState((prev) => {
      const updated = {
        ...prev,
        selectedMandi: canonicalMandi,
        selectedDistrict: district,
      };
      persistState(updated);
      return updated;
    });
  }, [mandis, marketState.selectedMandi, marketState.selectedDistrict, persistState]);

  const setSelectedDistrict = useCallback((districtName) => {
    setMarketState((prev) => {
      const updated = { ...prev, selectedDistrict: districtName };
      persistState(updated);
      return updated;
    });
  }, [persistState]);

  const setSelectedState = useCallback((stateName) => {
    setMarketState((prev) => {
      const updated = { ...prev, selectedState: stateName };
      persistState(updated);
      return updated;
    });
  }, [persistState]);

  const setMarketSelection = useCallback(({ crop, mandi, district, state }) => {
    setMarketState((prev) => {
      const updated = {
        ...prev,
        selectedCrop: crop || prev.selectedCrop,
        selectedMandi: mandi || prev.selectedMandi,
        selectedDistrict: district || prev.selectedDistrict,
        selectedState: state || prev.selectedState,
      };
      persistState(updated);
      return updated;
    });
  }, [persistState]);

  const contextValue = useMemo(() => ({
    selectedCrop: marketState.selectedCrop,
    selectedMandi: marketState.selectedMandi,
    selectedDistrict: marketState.selectedDistrict,
    selectedState: marketState.selectedState,
    commodities,
    mandis,
    priceUnit,
    arrivalUnit,
    loadingMarket,
    loadingMandis,
    setSelectedCrop,
    setSelectedMandi,
    setSelectedDistrict,
    setSelectedState,
    setMarketSelection,
  }), [
    marketState,
    commodities,
    mandis,
    priceUnit,
    arrivalUnit,
    loadingMarket,
    loadingMandis,
    setSelectedCrop,
    setSelectedMandi,
    setSelectedDistrict,
    setSelectedState,
    setMarketSelection,
  ]);

  return (
    <MarketContext.Provider value={contextValue}>
      {children}
    </MarketContext.Provider>
  );
}

export function useMarket() {
  const context = useContext(MarketContext);
  if (!context) {
    throw new Error('useMarket must be used within a MarketProvider');
  }
  return context;
}

