export const money = value => new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(value || 0);
export const number = value => new Intl.NumberFormat('en-IN', {maximumFractionDigits: 1}).format(value || 0);
export const initialProfile = {
  name: 'My farm', crop: 'Onion', quantity: 20, state: 'Maharashtra', district: 'Pune',
  transport_rate: 3, loading_charges: 20, market_charges: 1, spoilage_percent: 1,
  storage_rate: 8, urgency: 'Flexible', language: 'English', horizon: 7,
  mandis: [{ name: 'Pune', distance: 25 }, { name: 'Nashik', distance: 185 }, { name: 'Mumbai', distance: 150 }],
};
export function calculateReturn(price, day, distance, profile) {
  const quantity = profile.quantity * (1 - profile.spoilage_percent / 100) ** day;
  const gross = price * quantity;
  const transport = distance * profile.transport_rate * profile.quantity;
  const loading = profile.loading_charges * profile.quantity;
  const market = gross * profile.market_charges / 100;
  const storage = profile.storage_rate * profile.quantity * day;
  return { quantity, gross, transport, loading, market, storage, net: gross - transport - loading - market - storage };
}
export function compareReturns(market, profile) {
  if (!market) return [];
  return profile.mandis.map((input, index) => {
    const quote = market.mandis.find(m => m.mandi === input.name);
    if (!quote || quote.unavailable) return { mandi: input.name, distance: input.distance, unavailable: true };
    const today = calculateReturn(quote.price, 0, input.distance, profile);
    const allowedDays = profile.urgency === 'Sell today' ? 0 : profile.urgency === 'Within 3 days' ? Math.min(3, profile.horizon) : profile.horizon;
    const options = [{day: 0, price: quote.price, ...today}, ...quote.forecast.filter(f => f.day <= allowedDays).map(f => ({day: f.day, price: f.price, ...calculateReturn(f.price, f.day, input.distance, profile)}))];
    const best = options.reduce((a,b) => b.net > a.net ? b : a);
    return {...quote, distance: input.distance, today, best, index};
  });
}
export function chooseRecommendation(rows) {
  const available = rows.filter(r => !r.unavailable);
  if (!available.length) return null;
  const best = available.reduce((a,b) => b.best.net > a.best.net ? b : a);
  return {...best, action: best.best.day > 0 ? 'Wait' : best.index === 0 ? 'Sell now' : 'Switch market'};
}
