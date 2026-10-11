"""Kisan Vaani Multilingual AI Assistant Service using Google Gemini API.

Grounded in real APMC mandi observations (merged_mandi_weather.csv),
historical price records, forward ML forecasts, and authenticated
KisanTwin farmer profiles.
"""

import os
import re
import logging
from pathlib import Path
from typing import Dict, Any, List, Optional
from dotenv import load_dotenv
import pandas as pd
from data_loader import get_df

# Load environment variables early from backend/.env
_backend_dir = Path(__file__).resolve().parent.parent
for _env_path in [_backend_dir / ".env", _backend_dir.parent / ".env"]:
    if _env_path.is_file():
        load_dotenv(_env_path)

logger = logging.getLogger("cropbazaar.assistant")

# Supported ML forecasting crops & default evaluated markets
ML_SUPPORTED_CROPS = {
    "Onion": "Lasalgaon(Vinchur)",
    "Tomato": "APMC Pimpalgaon Baswant",
    "Brinjal": "APMC Nasik",
    "Cabbage": "APMC Nasik",
    "Cauliflower": "APMC Nasik",
}

_EXHAUSTED_MODELS: Dict[str, float] = {}


def mark_model_exhausted(model_name: str, cooldown_seconds: float = 600.0) -> None:
    """Mark a model temporarily exhausted due to 429 quota exhaustion to avoid retry lag."""
    import time
    _EXHAUSTED_MODELS[model_name] = time.time() + cooldown_seconds
    logger.info(f"[Kisan Vaani] Model {model_name} quota exhausted; cooling down for {cooldown_seconds}s")


def get_candidate_models() -> List[str]:
    """Return prioritized candidate Gemini models, reading GEMINI_MODEL dynamically.
    
    If a model recently reported 429 quota exhaustion, prioritize still-active candidate
    models first so user requests don't repeatedly suffer 10+ second timeout penalties.
    """
    import time
    now = time.time()
    primary_model = os.getenv("GEMINI_MODEL", "gemini-3.8-flash").strip()
    all_models = [primary_model]
    for fb in ["gemini-3.8-flash", "gemini-3.7-flash", "gemini-3.6-flash", "gemini-3.5-flash", "gemini-3.1-flash-lite"]:
        if fb not in all_models:
            all_models.append(fb)

    active = []
    cooling = []
    for m in all_models:
        if m in _EXHAUSTED_MODELS and now < _EXHAUSTED_MODELS[m]:
            cooling.append(m)
        else:
            active.append(m)
    return active + cooling


_GENAI_CLIENT = None


class GeminiAuthError(RuntimeError):
    """Raised when Gemini API authentication fails (401/403)."""
    pass


class GeminiQuotaError(RuntimeError):
    """Raised when Gemini API quota or rate limit is exceeded (429)."""
    pass


class GeminiTimeoutError(RuntimeError):
    """Raised when Gemini API request times out (504)."""
    pass


def get_gemini_client():
    """Lazily initialize Google GenAI Client with the workspace environment API key."""
    global _GENAI_CLIENT
    if _GENAI_CLIENT is not None:
        return _GENAI_CLIENT

    from dotenv import load_dotenv

    backend_dir = Path(__file__).resolve().parent.parent
    candidate_envs = [
        backend_dir / ".env",
        backend_dir.parent / ".env",
    ]
    for env_file in candidate_envs:
        if env_file.is_file():
            load_dotenv(env_file)

    api_key = os.getenv("GEMINI_API_KEY")
    if not api_key or not api_key.strip():
        logger.error("[Kisan Vaani] GEMINI_API_KEY is missing from environment")
        raise GeminiAuthError(
            "GEMINI_API_KEY is not configured in backend/.env. Please configure your API key."
        )

    # Clean up empty or broken proxy variables that can trigger [Errno 8] getaddrinfo socket failures
    for p_var in ("http_proxy", "https_proxy", "all_proxy", "HTTP_PROXY", "HTTPS_PROXY", "ALL_PROXY"):
        val = os.getenv(p_var)
        if val is not None and not val.strip():
            del os.environ[p_var]

    from google import genai
    _GENAI_CLIENT = genai.Client(api_key=api_key.strip(), vertexai=False)
    return _GENAI_CLIENT


# Multilingual alias mappings for commodities in Nashik APMC dataset
CROP_ALIASES = {
    "onion": "Onion",
    "kanda": "Onion",
    "pyaz": "Onion",
    "कांदा": "Onion",
    "प्याज": "Onion",
    "tomato": "Tomato",
    "tamatar": "Tomato",
    "टोमॅटो": "Tomato",
    "टमाटर": "Tomato",
    "potato": "Potato",
    "aloo": "Potato",
    "batata": "Potato",
    "आलू": "Potato",
    "बटाटा": "Potato",
    "garlic": "Garlic",
    "lasun": "Garlic",
    "lehsun": "Garlic",
    "लसूण": "Garlic",
    "लहसुन": "Garlic",
    "coriander": "Coriander(Leaves)",
    "kothmir": "Coriander(Leaves)",
    "dhaniya": "Coriander(Leaves)",
    "कोथिंबीर": "Coriander(Leaves)",
    "धनिया": "Coriander(Leaves)",
    "cabbage": "Cabbage",
    "patta gobhi": "Cabbage",
    "kobi": "Cabbage",
    "पत्तागोभी": "Cabbage",
    "कोबी": "Cabbage",
    "cauliflower": "Cauliflower",
    "phool gobhi": "Cauliflower",
    "flower": "Cauliflower",
    "फूलगोभी": "Cauliflower",
    "brinjal": "Brinjal",
    "baingan": "Brinjal",
    "vangi": "Brinjal",
    "बैंगन": "Brinjal",
    "वांगे": "Brinjal",
    "ginger": "Ginger(Green)",
    "adrak": "Ginger(Green)",
    "ale": "Ginger(Green)",
    "अदरक": "Ginger(Green)",
    "आले": "Ginger(Green)",
    "green chilli": "Green Chilli",
    "mirchi": "Green Chilli",
    "मिरची": "Green Chilli",
    "मिर्च": "Green Chilli",
    "methi": "Methi(Leaves)",
    "मेथी": "Methi(Leaves)",
    "spinach": "Spinach",
    "palak": "Spinach",
    "पालक": "Spinach",
    "cucumber": "Cucumbar(Kheera)",
    "kheera": "Cucumbar(Kheera)",
    "kakdi": "Cucumbar(Kheera)",
    "काकडी": "Cucumbar(Kheera)",
    "खीरा": "Cucumbar(Kheera)",
}

# Multilingual alias mappings for mandis in Nashik APMC dataset
MANDI_ALIASES = {
    "lasalgaon": "APMC Lasalgaon",
    "लासलगाव": "APMC Lasalgaon",
    "nashik": "APMC Nasik",
    "nasik": "APMC Nasik",
    "नाशिक": "APMC Nasik",
    "pimpalgaon": "APMC Pimpalgaon Baswant",
    "पिंपळगाव": "APMC Pimpalgaon Baswant",
    "yeola": "APMC Yeola",
    "येवला": "APMC Yeola",
    "dindori": "APMC Dindori",
    "दिंडोरी": "APMC Dindori",
    "chandwad": "APMC Chandwad",
    "चांदवड": "APMC Chandwad",
    "ghoti": "APMC Ghoti",
    "घोटी": "APMC Ghoti",
    "manmad": "APMC Manmad",
    "मनमाड": "APMC Manmad",
    "sinner": "APMC Sinner",
    "सिन्नर": "APMC Sinner",
    "satana": "APMC Satana",
    "सटाणा": "APMC Satana",
    "kalvan": "APMC Kalvan",
    "कळवण": "APMC Kalvan",
    "devala": "APMC Devala",
    "देवळा": "APMC Devala",
}

GREETINGS_LIST = [
    "hi", "hello", "hey", "namaste", "namaskar", "namaskaram",
    "नमस्ते", "नमस्कार", "राम राम", "प्रणाम", "हाय", "हॅलो",
    "kem cho", "kaise ho", "kase ahat", "good morning", "good evening",
    "who are you", "what can you do", "help"
]


def extract_relevant_market_data(
    user_query: str,
    farmer_profile: Optional[Dict[str, Any]] = None,
) -> Dict[str, Any]:
    """Retrieve grounded historical records, mandi comparisons, and ML forecasts."""
    df = get_df()
    query_lower = user_query.lower()
    clean_q = user_query.strip(" !.?,\t\n").lower()

    # Normalize farmer profile if provided as invalid or non-dict
    profile_dict = farmer_profile if isinstance(farmer_profile, dict) else {}

    # Check if query is a simple greeting
    is_greeting = (
        clean_q in GREETINGS_LIST
        or any(clean_q == g or clean_q.startswith(g + " ") or clean_q.endswith(" " + g) for g in GREETINGS_LIST)
    )

    # 1. Detect crops
    detected_crops = []
    for alias, standard_name in CROP_ALIASES.items():
        if alias in query_lower and standard_name not in detected_crops:
            detected_crops.append(standard_name)

    for comm in df["commodity"].unique():
        if comm.lower() in query_lower and comm not in detected_crops:
            detected_crops.append(comm)

    # If no crop detected in query, check if saved in KisanTwin farmer profile
    if not detected_crops and profile_dict.get("crop"):
        profile_crop = str(profile_dict["crop"]).strip()
        matched_crop = next((c for c in df["commodity"].unique() if c.lower() == profile_crop.lower()), None)
        if matched_crop:
            detected_crops.append(matched_crop)

    # Fallback to Onion only if query asks generally about rates/prices/mandis and not a pure greeting
    if not detected_crops and not is_greeting and any(kw in query_lower for kw in ["rate", "price", "mandi", "भाव", "दर", "मार्केट", "बाजार"]):
        detected_crops = ["Onion"]

    # 2. Detect mandis
    detected_mandis = []
    for alias, standard_mandi in MANDI_ALIASES.items():
        if alias in query_lower and standard_mandi not in detected_mandis:
            detected_mandis.append(standard_mandi)

    for market in df["market"].unique():
        if market.lower() in query_lower and market not in detected_mandis:
            detected_mandis.append(market)

    # If no specific mandi detected in query, check farmer's selected mandi or district/location
    if not detected_mandis and profile_dict:
        sel_mandi = profile_dict.get("selected_mandi") or profile_dict.get("selectedMandi") or profile_dict.get("mandi") or profile_dict.get("market")
        if sel_mandi:
            for market in df["market"].unique():
                if market.casefold() == str(sel_mandi).strip().casefold():
                    detected_mandis.append(market)
                    break
        if not detected_mandis:
            district = str(profile_dict.get("district") or "").lower()
            if "nashik" in district or "nasik" in district:
                detected_mandis.append("APMC Lasalgaon")
                detected_mandis.append("APMC Nasik")

    target_crop = detected_crops[0] if detected_crops else None

    # If pure greeting with no crop asked, return greeting context
    if is_greeting and not detected_crops:
        return {
            "is_greeting": True,
            "target_crop": None,
            "detected_crops": [],
            "detected_mandis": [],
            "records_text": "",
            "comparison_text": "",
            "forecast_text": "",
            "profit_text": "",
            "weather_text": "",
            "latest_observation_date": None,
            "has_records": False,
        }

    # 3. Retrieve latest observed records
    records_context = []
    observation_dates = []

    active_crop = target_crop or "Onion"

    for crop in detected_crops[:2]:
        sub_df = df[df["commodity"].str.lower() == crop.lower()]
        if detected_mandis:
            matched_sub = sub_df[sub_df["market"].isin(detected_mandis)]
            if not matched_sub.empty:
                sub_df = matched_sub

        if not sub_df.empty:
            idx_latest = sub_df.groupby("market")["date"].idxmax()
            latest_rows = sub_df.loc[idx_latest].sort_values(by="modal_price", ascending=False).head(4)

            for _, row in latest_rows.iterrows():
                obs_date = str(row["date"])
                observation_dates.append(obs_date)
                records_context.append(
                    f"- Crop: {row['commodity']} | Mandi: {row['market']} (District: {row['district']}, {row['state']}) | "
                    f"Observation Date: {obs_date} | Modal Price: ₹{row['modal_price']} {row['price_unit']} | "
                    f"Arrival Quantity: {row['arrival_quantity']} {row['arrival_unit']}"
                )

    # 4. Multi-Mandi Comparison (Highest prices across mandis)
    comparison_context = []
    if target_crop:
        try:
            from services.market_service import get_compare
            compare_data = get_compare(active_crop, limit=6)
            comp_records = compare_data.get("data", [])
            if comp_records:
                comparison_context.append(f"LATEST RECORDED MODAL PRICES FOR {active_crop.upper()} ACROSS APMC MANDIS:")
                for rank, r in enumerate(comp_records, 1):
                    observation_dates.append(str(r["date"]))
                    comparison_context.append(
                        f"{rank}. {r['market']} ({r['district']}): ₹{r['modal_price']} {r['price_unit']} on {r['date']} "
                        f"(Arrivals: {r['arrival_quantity']} {r['arrival_unit']})"
                    )
        except Exception as exc:
            logger.warning(f"[Kisan Vaani] Compare error: {exc}")

    # 5. ML Forward Forecast (1–7 day predictions & sell/wait advice)
    forecast_context = []
    is_forecast_query = any(
        kw in query_lower
        for kw in [
            "forecast", "expected", "future", "next", "tomorrow", "7 days", "seven days",
            "wait", "sell", "holding", "should i", "भविष्य", "अपेक्षित", "सात दिन", "७ दिवस",
            "भाव वाढेल", "भाव गिरेल", "भाव बढ़ेगा", "बेचें या रुकें", "विकू की थांबू", "विकू का",
        ]
    )

    if (is_forecast_query or active_crop in ML_SUPPORTED_CROPS) and active_crop in ML_SUPPORTED_CROPS:
        supported_mandi = ML_SUPPORTED_CROPS.get(active_crop)
        if supported_mandi:
            try:
                import sys
                ml_dir = Path(__file__).resolve().parent.parent.parent / "ml" / "forecasting"
                if str(ml_dir) not in sys.path:
                    sys.path.insert(0, str(ml_dir))
                from src.forecasting.predict import forecast

                fc_res = forecast(active_crop, supported_mandi, "1-7")
                forecasts = fc_res.get("forecasts", [])
                if forecasts:
                    ref_date = fc_res.get("reference_date", "Recent")
                    last_price = fc_res.get("last_observed_price", "N/A")
                    forecast_context.append(
                        f"ML FORWARD FORECAST FOR {active_crop.upper()} at {supported_mandi} "
                        f"(Model: XGBoost / Evaluated Pipeline, Origin Date: {ref_date}, Last Observed Price: ₹{last_price}):"
                    )
                    for f in forecasts:
                        target_d = f.get("target_date")
                        pred_p = f.get("prediction")
                        h_day = f.get("horizon_days")
                        unit = f.get("price_unit", "Rs./Quintal")
                        forecast_context.append(
                            f"- Day +{h_day} ({target_d}): Predicted Modal Price ₹{pred_p:.2f} {unit}"
                        )
            except Exception as fc_err:
                logger.warning(f"[Kisan Vaani] Forecast retrieval error: {fc_err}")

    # 6. Financial & Profit Calculation Context
    profit_context = []
    is_profit_query = any(
        kw in query_lower
        for kw in [
            "profit", "revenue", "loss", "earn", "quintal", "make", "cash",
            "नफा", "फायदा", "कमाई", "रुपये", "कितना मिलेगा", "किती मिळतील",
        ]
    )

    if is_profit_query or profile_dict:
        lot_size = None
        match = re.search(r"(\d+(?:\.\d+)?)\s*(?:quintals?|q|क्विंटल|क्वि.)", query_lower)
        if match:
            lot_size = float(match.group(1))
        elif profile_dict and profile_dict.get("lotSize"):
            try:
                lot_size = float(profile_dict["lotSize"])
            except (ValueError, TypeError):
                lot_size = None

        if lot_size is None and is_profit_query:
            lot_size = 30.0

        if lot_size is not None and lot_size > 0:
            sub_crop_df = df[df["commodity"].str.lower() == active_crop.lower()]
            rep_price = sub_crop_df["modal_price"].iloc[-1] if not sub_crop_df.empty else 3800.0

            transport_type = str(profile_dict.get("transportAccess") or "") if profile_dict else ""
            if transport_type == "own_tractor":
                t_rate = 40.0
            elif transport_type == "middleman_pickup":
                t_rate = 0.0
            elif transport_type == "hired_trolley":
                t_rate = 70.0
            else:
                t_rate = 60.0

            gross_value = lot_size * rep_price
            est_transport = lot_size * t_rate
            est_hamali_market = lot_size * 35.0
            est_cultivation = lot_size * 1200.0
            net_profit = gross_value - est_transport - est_hamali_market - est_cultivation
            net_takehome_cash = gross_value - est_transport - est_hamali_market

            profit_context.append(
                f"FINANCIAL ESTIMATION BREAKDOWN FOR {lot_size:.1f} QUINTALS OF {active_crop.upper()} "
                f"(Based on Recorded Modal Price of ₹{rep_price:.2f}/Quintal):\n"
                f"- Gross Sale Value: ₹{gross_value:,.2f}\n"
                f"- Estimated Freight & Transport: ₹{est_transport:,.2f} ({transport_type or 'Standard Road Freight'})\n"
                f"- Estimated Mandi Fees & Handling (Hamali): ₹{est_hamali_market:,.2f}\n"
                f"- Net Take-Home Cash Realization (Pre-Cultivation): ₹{net_takehome_cash:,.2f}\n"
                f"- Estimated Net Farming Profit (After ₹1,200/q cultivation cost): ₹{net_profit:,.2f}"
            )

    # 7. Weather context
    weather_context = []
    if any(w in query_lower for w in ["weather", "rain", "temperature", "मौसम", "बारिश", "हवामान", "पाऊस"]):
        target_mandi = detected_mandis[0] if detected_mandis else "APMC Lasalgaon"
        w_df = df[df["market"].str.lower() == target_mandi.lower()].sort_values(by="date").tail(3)
        for _, row in w_df.iterrows():
            weather_context.append(
                f"- Date: {row['date']} at {row['market']}: Mean Temp: {row['temperature_mean_c']}°C "
                f"(Max: {row['temperature_max_c']}°C, Min: {row['temperature_min_c']}°C), "
                f"Precipitation: {row['precipitation_mm']} mm, Relative Humidity: {row['relative_humidity_mean_pct']}%"
            )

    return {
        "is_greeting": False,
        "target_crop": active_crop,
        "detected_crops": detected_crops,
        "detected_mandis": detected_mandis,
        "records_text": "\n".join(records_context) if records_context else "No direct commodity record matching query in dataset.",
        "comparison_text": "\n".join(comparison_context) if comparison_context else "",
        "forecast_text": "\n".join(forecast_context) if forecast_context else "",
        "profit_text": "\n".join(profit_context) if profit_context else "",
        "weather_text": "\n".join(weather_context) if weather_context else "",
        "latest_observation_date": max(observation_dates) if observation_dates else None,
        "has_records": bool(records_context or comparison_context),
    }


def build_system_prompt(
    language: str,
    context_data: Dict[str, Any],
    farmer_profile: Optional[Dict[str, Any]] = None,
) -> str:
    """Build grounded, multilingual system prompt with KisanTwin farmer identity."""
    lang_code = (language or "en").lower()
    if "hi" in lang_code:
        target_lang = "Hindi (हिंदी) in clear Devanagari script"
        greeting = "नमस्ते किसान भाई / बहन"
    elif "mr" in lang_code:
        target_lang = "Marathi (मराठी) in clear Devanagari script"
        greeting = "नमस्कार शेतकरी बंधू / भगिनी"
    else:
        target_lang = "English (Indian Agricultural Context)"
        greeting = "Namaste Kisan brother / sister"

    profile_dict = farmer_profile if isinstance(farmer_profile, dict) else {}
    name = profile_dict.get("name") or "Farmer"
    has_profile = bool(profile_dict.get("crop") or profile_dict.get("name"))

    profile_block = ""
    if has_profile:
        village = profile_dict.get("village") or "Not specified"
        district = profile_dict.get("district") or "Nashik"
        state = profile_dict.get("state") or "Maharashtra"
        crop = profile_dict.get("crop") or "Not selected"
        lot_size = profile_dict.get("lotSize") or "Not specified"
        storage = profile_dict.get("storageAccess") or "Not specified"
        transport = profile_dict.get("transportAccess") or "Not specified"
        urgency = profile_dict.get("cashUrgency") or "Not specified"

        profile_block = f"""
AUTHENTICATED KISANTWIN FARMER PROFILE:
- Farmer Name: {name}
- Village / District / State: {village}, {district}, {state}
- Saved Crop: {crop}
- Lot Size: {lot_size} Quintals
- Storage Access: {storage}
- Transportation Mode: {transport}
- Cash Realization Urgency: {urgency}

PERSONALIZATION RULES:
- Address the farmer respectfully by name ({name}) when appropriate.
- When they ask "Where should I sell?", "Should I wait?", or "How much profit can I make?", AUTOMATICALLY use their saved crop ({crop}), lot size ({lot_size}q), location, transport, and cash urgency.
- NEVER ask the farmer to re-enter details already provided in this KisanTwin profile.
"""

    if context_data.get("is_greeting"):
        return f"""You are 'Kisan Vaani' (किसान वाणी), the official agricultural advisory AI assistant for CropBazaar.
LANGUAGE DIRECTIVE:
- Respond completely in {target_lang}.
- Use a warm, welcoming tone ({greeting}).
- Introduce yourself as Kisan Vaani, the farmer's CropBazaar advisor for APMC mandis and crop prices in Nashik Division.
- Ask how you can assist them today (e.g., checking latest mandi prices, arrival trends, forward ML price forecasts, or selling vs. holding advice).
{profile_block}
OUTPUT FORMAT: Output ONLY your direct answer to the farmer in the required language. Do NOT include thinking notes or prompt echoes. Format cleanly.
"""

    prompt = f"""You are 'Kisan Vaani' (किसान वाणी), the official agricultural advisory AI assistant for CropBazaar.
You help Indian farmers navigate APMC market decisions, compare recorded mandi prices, evaluate forward ML forecasts, and calculate net profits.

LANGUAGE DIRECTIVE:
- You MUST answer completely in {target_lang}.
- Use a respectful, warm, empathetic tone ({greeting}).
- Always keep numbers, currencies (₹), dates, weights, and mandi names accurate and legible.

{profile_block}

VERIFIED AGRICULTURAL DATASET (Nashik APMC Division & Weather Stations):
{context_data.get('records_text', '')}

{f"MANDI COMPARISON OBSERVATIONS:\n{context_data['comparison_text']}" if context_data.get('comparison_text') else ""}

{f"ML MODEL FORWARD FORECASTS:\n{context_data['forecast_text']}" if context_data.get('forecast_text') else ""}

{f"FINANCIAL & PROFIT ESTIMATION:\n{context_data['profit_text']}" if context_data.get('profit_text') else ""}

{f"STATION WEATHER OBSERVATIONS:\n{context_data['weather_text']}" if context_data.get('weather_text') else ""}

STRICT OPERATIONAL GUIDELINES:
1. TRUTHFULNESS & GROUNDING: Only cite prices, arrival volumes, and observation dates present in the context above.
2. DISTINGUISH DATES & ESTIMATES:
   - Historical prices MUST be clearly identified with their exact observation dates (e.g. "recorded on [date]").
   - If citing forward prices, clearly state that they are model forecasts (e.g. "our ML model projects...").
3. SELL VS WAIT DECISION: When asked whether to sell today or wait:
   - Factor in price trends, spoilage risk (compounded by storage type), and the farmer's cash urgency.
   - If cash urgency is immediate, recommend taking advantage of verified current prices rather than holding.
4. PROFIT QUESTIONS: Provide a clear breakdown showing Gross Value, deductions (freight and hamali), and estimated net realization.
5. MISSING DATA: If the user asks about an unsupported crop outside the dataset, politely explain that CropBazaar tracks major vegetables in Maharashtra (Nashik Division).
6. OUTPUT FORMAT: Output ONLY your direct answer to the farmer in the required language. Do NOT include meta-commentary, thinking notes, or prompt echoes. Format cleanly with bullet points.
"""
    return prompt


def generate_chat_response(
    message: str,
    language: str = "en",
    history: Optional[List[Any]] = None,
    farmer_profile: Optional[Dict[str, Any]] = None,
) -> Dict[str, Any]:
    """Query Google Gemini API with grounded agricultural dataset context."""
    if not message or not str(message).strip():
        raise ValueError("Message cannot be empty.")

    client = get_gemini_client()
    context = extract_relevant_market_data(str(message).strip(), farmer_profile=farmer_profile)
    system_instruction = build_system_prompt(language, context, farmer_profile=farmer_profile)

    # Format bounded conversation history safely
    bounded_history = (history or [])[-8:]
    contents = []

    for item in bounded_history:
        if isinstance(item, dict):
            role = item.get("sender") or item.get("role") or "user"
            text = item.get("text") or item.get("content") or ""
            if text and str(text).strip():
                gemini_role = "user" if role in ("user", "human") else "model"
                contents.append({"role": gemini_role, "parts": [{"text": str(text).strip()}]})

    # Append current message
    contents.append({"role": "user", "parts": [{"text": str(message).strip()}]})

    last_error = None
    response_text = None
    used_model = None

    for model_name in get_candidate_models():
        try:
            from google.genai import types
            config = types.GenerateContentConfig(
                system_instruction=system_instruction,
                temperature=0.3,
                max_output_tokens=1000,
            )

            resp = client.models.generate_content(
                model=model_name,
                contents=contents,
                config=config,
            )

            if resp and resp.text:
                response_text = resp.text.strip()
                used_model = model_name
                break
        except Exception as exc:
            last_error = exc
            exc_str = str(exc).lower()
            err_code = getattr(exc, "code", None)

            if err_code in (401, 403) or "unauthenticated" in exc_str or "api_key_invalid" in exc_str:
                logger.error(f"[Kisan Vaani] Authentication failed on model {model_name}: {exc}")
                raise GeminiAuthError(f"Gemini API authentication failed: {exc}") from exc

            if err_code == 429 or "resource_exhausted" in exc_str or "quota" in exc_str:
                logger.warning(f"[Kisan Vaani] Quota/Rate limit on model {model_name}: {exc}")
                mark_model_exhausted(model_name, cooldown_seconds=600.0)

            if "high demand" in exc_str or "temporarily" in exc_str or err_code == 503:
                logger.warning(f"[Kisan Vaani] Transient high demand on {model_name}, retrying after brief pause...")
                import time
                time.sleep(1.2)
                try:
                    resp = client.models.generate_content(
                        model=model_name,
                        contents=contents,
                        config=config,
                    )
                    if resp and resp.text:
                        response_text = resp.text.strip()
                        used_model = model_name
                        break
                except Exception as retry_exc:
                    logger.warning(f"[Kisan Vaani] Retry on {model_name} failed: {retry_exc}")

            if "timeout" in exc_str or isinstance(exc, (TimeoutError,)):
                logger.warning(f"[Kisan Vaani] Timeout on model {model_name}: {exc}")

            logger.warning(f"[Kisan Vaani] Model {model_name} failed: {exc}")
            continue

    if not response_text:
        err_msg = str(last_error) if last_error else "Failed to get response from Gemini API"
        exc_str = err_msg.lower()
        if "quota" in exc_str or "resource_exhausted" in exc_str or "429" in exc_str:
            raise GeminiQuotaError("Gemini API rate limit or quota exceeded. Please wait a moment before trying again.")
        if "timeout" in exc_str:
            raise GeminiTimeoutError("Gemini API request timed out. Please try again.")
        raise RuntimeError(f"Gemini service unavailable: {err_msg}")

    return {
        "reply": response_text,
        "language": language,
        "model_used": used_model,
        "source_information": "APMC Mandi Observation Records & ML Forecasting Pipeline" if context.get("has_records") else "CropBazaar AI Advisory",
        "data_observation_date": context.get("latest_observation_date"),
    }
