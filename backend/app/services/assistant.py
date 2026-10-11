"""Kisan Vaani Gemini Assistant Service adapter module (backend/app/services/assistant.py).

Provides compatibility for imports accessing backend.app.services.assistant.
"""

from services.assistant_service import (
    generate_chat_response,
    extract_relevant_market_data,
    build_system_prompt,
    get_gemini_client,
    get_candidate_models,
    CANDIDATE_MODELS,
    ML_SUPPORTED_CROPS,
    CROP_ALIASES,
    GREETINGS_LIST,
    GeminiAuthError,
    GeminiQuotaError,
    GeminiTimeoutError,
)

__all__ = [
    "generate_chat_response",
    "extract_relevant_market_data",
    "build_system_prompt",
    "get_gemini_client",
    "get_candidate_models",
    "CANDIDATE_MODELS",
    "ML_SUPPORTED_CROPS",
    "CROP_ALIASES",
    "GREETINGS_LIST",
    "GeminiAuthError",
    "GeminiQuotaError",
    "GeminiTimeoutError",
]

