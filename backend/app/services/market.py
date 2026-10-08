from datetime import date, datetime, timedelta
from zoneinfo import ZoneInfo
from functools import lru_cache
import numpy as np
import pandas as pd
from sklearn.metrics import mean_absolute_error
from ..config import Settings
from ..errors import ApiError
from ..schemas import ForecastData, ForecastMandi, ForecastPoint, HistoryData, HistoryRecord, Provenance

MODEL = 'XGBoost with seven price lags; chronological 14-observation holdout MAE; recursive forecast. Bounds are illustrative error bands, not calibrated probabilities.'
class MarketService:
    def __init__(self, settings: Settings):
        self.settings = settings
    def frame(self):
        try:
            stat = self.settings.history_path.stat()
            return self._read(str(self.settings.history_path),stat.st_mtime_ns,stat.st_size)
        except (OSError, ValueError, pd.errors.ParserError, KeyError):
            raise ApiError(503,'HISTORY_UNAVAILABLE','Market history is missing or invalid. No market prices were invented.')
    @staticmethod
    @lru_cache(maxsize=4)
    def _read(path, mtime, size):
        frame = pd.read_csv(path)
        if not {'date','crop','mandi','price'}.issubset(frame.columns):
            raise ValueError('Missing historical columns')
        frame = frame[['date','crop','mandi','price']].copy()
        frame['date'] = pd.to_datetime(frame['date'],format='%Y-%m-%d',errors='raise').dt.date
        frame['price'] = pd.to_numeric(frame['price'],errors='raise')
        if frame.empty or frame.isna().any().any() or not np.isfinite(frame.price).all() or (frame.price<=0).any() or frame.duplicated(['date','crop','mandi']).any():
            raise ValueError('Invalid historical rows')
        if any(value>datetime.now(ZoneInfo('Asia/Kolkata')).date() for value in frame.date):
            raise ValueError('Future dates cannot be treated as observed history')
        if any(not isinstance(value,str) or not value.strip() for value in [*frame.crop,*frame.mandi]):
            raise ValueError('Empty crop or mandi')
        return frame.sort_values(['date','crop','mandi'])
    def provenance(self, frame=None):
        frame = self.frame() if frame is None else frame
        as_of = frame.date.max() if not frame.empty else None
        demo = self.settings.market_data_mode == 'demo'
        return Provenance(source=self.settings.history_source,is_demo=demo,history_as_of=as_of,stale=as_of is None or as_of<datetime.now(ZoneInfo('Asia/Kolkata')).date(),warning=('Synthetic observations; unsuitable for actual trading decisions.' if demo else 'Imported historical observations; no live freshness or provenance verification.')+' Forecasts start after each mandi’s last observation, not after today. Freight is farmer-entered; actual market availability is not verified.')
    def history(self, crop, mandi, start_date, end_date, offset, limit):
        if start_date and end_date and start_date>end_date:
            raise ApiError(422,'INVALID_DATE_RANGE','start_date must be on or before end_date.')
        frame=self.frame()
        if crop: frame=frame[frame.crop==crop]
        if mandi: frame=frame[frame.mandi==mandi]
        if start_date: frame=frame[frame.date>=start_date]
        if end_date: frame=frame[frame.date<=end_date]
        return HistoryData(records=[HistoryRecord(**r) for r in frame.iloc[offset:offset+limit].to_dict('records')],total=len(frame),offset=offset,limit=limit,provenance=self.provenance(frame))
    @staticmethod
    @lru_cache(maxsize=64)
    def _predict(prices):
        try:
            from xgboost import XGBRegressor
        except (ImportError, OSError, ValueError) as exc:
            raise ApiError(503,'MODEL_UNAVAILABLE','XGBoost runtime unavailable. On macOS install libomp.') from exc
        series=np.array(prices,dtype=float)
        if len(series)<45:
            raise ApiError(422,'INSUFFICIENT_HISTORY','At least 45 observations are required for a validated forecast.')
        X=np.array([series[i-7:i] for i in range(7,len(series))]); y=series[7:]
        split=len(y)-14
        model=XGBRegressor(n_estimators=80,max_depth=2,learning_rate=.06,random_state=42,n_jobs=1)
        model.fit(X[:split],y[:split]); mae=float(mean_absolute_error(y[split:],model.predict(X[split:])))
        model.fit(X,y); history=list(series); values=[]
        for day in range(1,8):
            price=max(.01,float(model.predict(np.array([history[-7:]]))[0])); history.append(price)
            values.append((round(price,2),round(max(0,price-2*mae*np.sqrt(day)),2),round(price+2*mae*np.sqrt(day),2)))
        return values,round(mae,2)
    def forecast(self,crop,names,horizon):
        frame=self.frame(); rows=[]
        for name in names:
            subset=frame[(frame.crop==crop)&(frame.mandi.str.casefold()==name.casefold())].sort_values('date')
            if subset.empty:
                rows.append(ForecastMandi(mandi=name,unavailable=True,reason='No historical quotes for this crop and mandi.'))
                continue
            as_of=subset.date.iloc[-1]
            if len(subset)<45:
                rows.append(ForecastMandi(mandi=name,unavailable=True,reason='Insufficient history: at least 45 observations are required.',history_as_of=as_of))
                continue
            values,mae=self._predict(tuple(subset.price.tolist()))
            rows.append(ForecastMandi(mandi=name,price=float(subset.price.iloc[-1]),mae=mae,history_as_of=as_of,forecast=[ForecastPoint(day=i+1,date=as_of+timedelta(days=i+1),price=p,low=low,high=high) for i,(p,low,high) in enumerate(values[:horizon])]))
        return ForecastData(crop=crop,horizon=horizon,mandis=rows,model=MODEL,provenance=self.provenance(frame[frame.crop==crop]))
