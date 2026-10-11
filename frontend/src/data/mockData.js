/**
 * Sample UI Data & Constants for CropBazaar Prototype
 *
 * NOTE: These are strictly illustrative placeholder datasets for the UI/UX prototype.
 * Real APMC mandi feeds, AGMARKNET integration, and ML models will be connected in future steps.
 */

export const CROPS = [
  { id: 'wheat', name: 'Wheat (गेहूं)', category: 'Cereal', defaultPrice: 2450, unit: '₹/quintal' },
  { id: 'soybean', name: 'Soybean (सोयाबीन)', category: 'Oilseed', defaultPrice: 4850, unit: '₹/quintal' },
  { id: 'onion', name: 'Onion (प्याज)', category: 'Vegetable', defaultPrice: 2150, unit: '₹/quintal' },
  { id: 'cotton', name: 'Cotton (कपास)', category: 'Fiber', defaultPrice: 7200, unit: '₹/quintal' },
  { id: 'potato', name: 'Potato (आलू)', category: 'Vegetable', defaultPrice: 1350, unit: '₹/quintal' },
  { id: 'gram', name: 'Gram / Chana (चना)', category: 'Pulse', defaultPrice: 5800, unit: '₹/quintal' },
  { id: 'maize', name: 'Maize (मक्का)', category: 'Cereal', defaultPrice: 2100, unit: '₹/quintal' },
  { id: 'tomato', name: 'Tomato (टमाटर)', category: 'Vegetable', defaultPrice: 1800, unit: '₹/quintal' },
];

export const STATES_AND_MANDIS = [
  {
    state: 'Madhya Pradesh',
    mandis: ['Indore Mandi', 'Ujjain APMC', 'Dewas Krishi Mandi', 'Neemuch Mandi', 'Mandsaur Mandi'],
  },
  {
    state: 'Maharashtra',
    mandis: ['Lasalgaon Mandi (Nashik)', 'Pune APMC', 'Jalgaon Krishi Mandi', 'Nagpur APMC', 'Solapur Mandi'],
  },
  {
    state: 'Rajasthan',
    mandis: ['Kota Mandi', 'Baran Krishi Mandi', 'Jaipur APMC', 'Jodhpur Mandi'],
  },
  {
    state: 'Gujarat',
    mandis: ['Rajkot APMC', 'Unjha Mandi', 'Gondal APMC', 'Surat APMC'],
  },
];

export const HISTORICAL_PRICE_TRENDS = [
  { date: 'Day -14', price: 2320, arrival: 4200, modalPrice: 2300 },
  { date: 'Day -12', price: 2360, arrival: 3950, modalPrice: 2340 },
  { date: 'Day -10', price: 2390, arrival: 4100, modalPrice: 2375 },
  { date: 'Day -8', price: 2420, arrival: 3600, modalPrice: 2400 },
  { date: 'Day -6', price: 2380, arrival: 4800, modalPrice: 2360 },
  { date: 'Day -4', price: 2410, arrival: 3850, modalPrice: 2390 },
  { date: 'Day -2', price: 2440, arrival: 3400, modalPrice: 2430 },
  { date: 'Today', price: 2480, arrival: 3100, modalPrice: 2470 },
];

export const FORECAST_HORIZON_DATA = {
  1: [
    { day: 'Day +1', expected: 2510, lower: 2470, upper: 2550, confidence: '92%' },
  ],
  3: [
    { day: 'Day +1', expected: 2510, lower: 2470, upper: 2550, confidence: '92%' },
    { day: 'Day +2', expected: 2535, lower: 2485, upper: 2585, confidence: '88%' },
    { day: 'Day +3', expected: 2560, lower: 2490, upper: 2630, confidence: '85%' },
  ],
  7: [
    { day: 'Day +1', expected: 2510, lower: 2470, upper: 2550, confidence: '92%' },
    { day: 'Day +2', expected: 2535, lower: 2485, upper: 2585, confidence: '88%' },
    { day: 'Day +3', expected: 2560, lower: 2490, upper: 2630, confidence: '85%' },
    { day: 'Day +4', expected: 2540, lower: 2460, upper: 2620, confidence: '81%' },
    { day: 'Day +5', expected: 2585, lower: 2490, upper: 2680, confidence: '77%' },
    { day: 'Day +6', expected: 2620, lower: 2510, upper: 2730, confidence: '74%' },
    { day: 'Day +7', expected: 2650, lower: 2530, upper: 2770, confidence: '71%' },
  ],
};

export const MANDI_COMPARISON_DATA = [
  {
    id: 1,
    name: 'Indore Mandi',
    state: 'Madhya Pradesh',
    distanceKm: 24,
    currentPrice: 2480,
    transportRatePerQtl: 65,
    marketFeePerQtl: 25,
    unloadingPerQtl: 15,
    estimatedNetReturn: 2375,
    arrivalVolume: '3,100 Quintals',
    buyerActivity: 'Very High',
    isBest: true,
    recommendationReason: 'Highest net margin due to low transit cost & strong local buyer competition.',
  },
  {
    id: 2,
    name: 'Dewas Krishi Mandi',
    state: 'Madhya Pradesh',
    distanceKm: 58,
    currentPrice: 2490,
    transportRatePerQtl: 140,
    marketFeePerQtl: 25,
    unloadingPerQtl: 15,
    estimatedNetReturn: 2310,
    arrivalVolume: '1,800 Quintals',
    buyerActivity: 'Moderate',
    isBest: false,
    recommendationReason: 'Price is ₹10 higher, but extra transport distance reduces overall net income.',
  },
  {
    id: 3,
    name: 'Ujjain APMC',
    state: 'Madhya Pradesh',
    distanceKm: 68,
    currentPrice: 2440,
    transportRatePerQtl: 165,
    marketFeePerQtl: 24,
    unloadingPerQtl: 16,
    estimatedNetReturn: 2235,
    arrivalVolume: '2,400 Quintals',
    buyerActivity: 'High',
    isBest: false,
    recommendationReason: 'Lower spot rate combined with higher transport makes this less lucrative.',
  },
  {
    id: 4,
    name: 'Neemuch Mandi',
    state: 'Madhya Pradesh',
    distanceKm: 210,
    currentPrice: 2580,
    transportRatePerQtl: 390,
    marketFeePerQtl: 26,
    unloadingPerQtl: 18,
    estimatedNetReturn: 2146,
    arrivalVolume: '4,500 Quintals',
    buyerActivity: 'Extreme',
    isBest: false,
    recommendationReason: 'Highest headline price (+₹100), but long-haul freight wipes out profits.',
  },
];

export const BECH_SMART_RECOMMENDATIONS = {
  currentCrop: 'Wheat (गेहूं)',
  currentSpotPrice: 2480,
  recommendedAction: 'WAIT_AND_WATCH',
  actionTitle: 'Wait 3 Days Before Selling',
  confidenceScore: 84,
  badgeText: 'Expected Gain: +₹80/qtl',
  options: [
    {
      id: 'sell_now',
      action: 'Sell Today',
      mandi: 'Indore Mandi',
      expectedNetPerQtl: 2375,
      timing: 'Immediate liquidation',
      riskLevel: 'Low Risk',
      pros: 'Instant cash realization, zero storage risk',
      cons: 'Misses the predicted post-holiday price rally',
      isPrimary: false,
    },
    {
      id: 'wait_3_days',
      action: 'Wait 3 Days',
      mandi: 'Indore Mandi',
      expectedNetPerQtl: 2455,
      timing: 'Sell on Day +3',
      riskLevel: 'Moderate Risk',
      pros: 'Predicted supply shortage creates ₹80/qtl uplift',
      cons: 'Minor storage pest exposure if not bagged properly',
      isPrimary: true,
    },
    {
      id: 'switch_mandi',
      action: 'Switch Mandi',
      mandi: 'Dewas Krishi Mandi',
      expectedNetPerQtl: 2310,
      timing: 'Next morning dispatch',
      riskLevel: 'Elevated Cost',
      pros: 'Slightly higher bulk buyers',
      cons: 'Transport charges erode profit advantage',
      isPrimary: false,
    },
  ],
  aiAnalysisRationale: [
    'Mandi arrivals dropped by 22% over the last 3 days due to seasonal sowing labor shift.',
    'Flour mill processing orders from southern states jumped 15% this week.',
    'Weather forecast predicts dry conditions with zero rainfall risk to storage.',
  ],
};

export const JOKHIM_RISK_FACTORS = [
  {
    id: 'price_drop',
    name: 'Price Drop Risk',
    score: 28,
    level: 'Low',
    color: 'emerald',
    description: 'Demand remains robust with low probability of spot price collapsing this week.',
    factors: ['Flour mill procurement target active', 'Govt MSP floor cushion in effect'],
  },
  {
    id: 'arrival_spike',
    name: 'Arrival Spike Risk',
    score: 42,
    level: 'Moderate',
    color: 'amber',
    description: 'Harvest acceleration in neighboring districts could elevate truck arrivals by weekend.',
    factors: ['Nearby talukas finishing cutting', 'Mandi gate queue average: 2.1 hours'],
  },
  {
    id: 'volatility',
    name: 'Price Volatility Risk',
    score: 35,
    level: 'Moderate',
    color: 'amber',
    description: 'Intraday swings currently stay within ±2.5%, indicating steady market sentiment.',
    factors: ['Spread between min and max auction price: ₹110', 'Bidding consistency: Normal'],
  },
  {
    id: 'weather',
    name: 'Weather Disruption Risk',
    score: 18,
    level: 'Low',
    color: 'emerald',
    description: 'Open-Meteo radar predicts 0% rain probability; dry yards and transport corridors.',
    factors: ['Humidity: 48%', 'Clear skies forecast for next 5 days'],
  },
];

export const KYUN_NAHI_DATA = {
  primaryChoice: {
    mandi: 'Indore Mandi',
    netProfitTotal: '₹1,18,750 (50 Quintals)',
    netPerQtl: '₹2,375',
    headline: 'Optimal Market Selected for Your Farm',
    reasons: [
      'Shortest transport corridor (24 km), minimizing fuel and vehicle hire to ₹65/qtl.',
      'Active bidding from 42 licensed commission agents ensuring fair modal price realization.',
      'Quick gate turnaround time (avg 1.5 hrs), reducing crop moisture loss and waiting cost.',
    ],
  },
  rejectedAlternatives: [
    {
      mandi: 'Neemuch Mandi',
      quotedPrice: '₹2,580/qtl (+₹100 vs Indore)',
      whyNotReason: 'Why not Neemuch despite higher quotation?',
      explanation:
        'Even though Neemuch quotes ₹100 more per quintal, the 210 km distance increases transport freight by ₹325/quintal. Your total net payout would be ₹11,450 lower than Indore.',
      netDifference: '-₹11,450 Loss',
    },
    {
      mandi: 'Dewas Krishi Mandi',
      quotedPrice: '₹2,490/qtl (+₹10 vs Indore)',
      whyNotReason: 'Why not Dewas Mandi?',
      explanation:
        'Dewas offers ₹10 more spot rate, but the additional 34 km highway toll and diesel burn costs ₹75/quintal extra, completely eroding the ₹10 premium.',
      netDifference: '-₹3,250 Loss',
    },
    {
      mandi: 'Local Village Middleman (Kachha Arhatia)',
      quotedPrice: '₹2,280/qtl (Farmgate)',
      whyNotReason: 'Why not sell directly at farm gate?',
      explanation:
        'Selling to farmgate aggregator avoids transport, but costs you ₹95/quintal in lost value compared to taking your produce to Indore Mandi.',
      netDifference: '-₹4,750 Loss',
    },
  ],
};

export const KISAN_VAANI_STARTER_MESSAGES = {
  en: [
    {
      id: 1,
      sender: 'assistant',
      text: 'Namaste! I am Kisan Vaani, your CropBazaar AI advisor. Which crop are you harvesting, and what mandi decisions can I help you evaluate today?',
      timestamp: '10:00 AM',
    },
  ],
  hi: [
    {
      id: 1,
      sender: 'assistant',
      text: 'नमस्ते! मैं किसान वाणी हूँ, आपका क्रॉपबाज़ार AI सलाहकार। आप कौन सी फसल बेच रहे हैं और किस मंडी के बारे में जानकारी चाहते हैं?',
      timestamp: '10:00 AM',
    },
  ],
  mr: [
    {
      id: 1,
      sender: 'assistant',
      text: 'नमस्कार! मी किसान वाणी आहे, तुमचा क्रॉपबाझार AI मार्गदर्शक. तुम्ही कोणते पीक विकण्याचा विचार करत आहात आणि कोणत्या बाजार समितीबद्दल माहिती हवी आहे?',
      timestamp: '10:00 AM',
    },
  ],
};

