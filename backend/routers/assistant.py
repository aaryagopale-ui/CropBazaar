"""FastAPI router for Kisan Vaani multilingual chat assistant."""

import json
import logging
from typing import List, Dict, Optional, Any
from pydantic import BaseModel, Field, ConfigDict
from fastapi import APIRouter, HTTPException, Header, Request
from services import assistant_service

logger = logging.getLogger("cropbazaar.assistant_router")

router = APIRouter(prefix="/api/assistant", tags=["Kisan Vaani Assistant"])


class ChatRequest(BaseModel):
    model_config = ConfigDict(extra="allow")

    message: Optional[str] = Field(default=None, description="Farmer message or query")
    query: Optional[str] = Field(default=None, description="Alternative message field")
    prompt: Optional[str] = Field(default=None, description="Alternative message field")
    text: Optional[str] = Field(default=None, description="Alternative message field")
    language: Optional[str] = Field(default="en", description="Language code: en, hi, mr, en-IN, hi-IN, mr-IN")
    history: Optional[List[Any]] = Field(default_factory=list, description="Previous conversation turns")
    farmer_profile: Optional[Any] = Field(default=None, description="Optional KisanTwin farmer profile context")


class ChatResponse(BaseModel):
    reply: str
    language: str
    source_information: Optional[str] = None
    data_observation_date: Optional[str] = None
    model_used: Optional[str] = None


@router.post("/chat", response_model=ChatResponse)
async def assistant_chat(
    raw_request: Request,
    authorization: Optional[str] = Header(None),
):
    """Chat endpoint for Kisan Vaani multilingual assistant powered by Google Gemini.
    
    Accepts messages in English, Hindi, and Marathi, with optional conversation history
    and optional KisanTwin farmer profile details. Robust against Content-Type variations.
    """
    # 0. Extract and validate ChatRequest payload safely
    if isinstance(raw_request, ChatRequest):
        request = raw_request
    else:
        try:
            body_bytes = await raw_request.body()
            if not body_bytes or not body_bytes.strip():
                raise HTTPException(status_code=400, detail="Empty request body.")
            try:
                body_dict = json.loads(body_bytes.decode("utf-8"))
                if isinstance(body_dict, str):
                    body_dict = json.loads(body_dict)
                request = ChatRequest.model_validate(body_dict)
            except Exception:
                request = ChatRequest.model_validate_json(body_bytes)
        except HTTPException:
            raise
        except Exception as parse_err:
            raise HTTPException(
                status_code=400,
                detail=f"Invalid request format: {parse_err}"
            ) from parse_err

    # 1. Resolve message text from supported field aliases
    resolved_message = (
        request.message or request.query or request.prompt or request.text or ""
    )
    if not isinstance(resolved_message, str) or not resolved_message.strip():
        raise HTTPException(
            status_code=400,
            detail="Message cannot be empty. Please enter your agricultural query."
        )

    # 2. Resolve language code safely
    resolved_lang = "en"
    if request.language and isinstance(request.language, str):
        clean_lang = request.language.strip().lower()
        if "hi" in clean_lang:
            resolved_lang = "hi"
        elif "mr" in clean_lang:
            resolved_lang = "mr"
        else:
            resolved_lang = "en"

    # 3. Sanitize farmer profile safely (never reject missing fields)
    sanitized_profile = None
    if isinstance(request.farmer_profile, dict):
        sanitized_profile = {
            k: str(v).strip() if v is not None else ""
            for k, v in request.farmer_profile.items()
        }

    # 4. Sanitize history list safely
    sanitized_history = []
    if isinstance(request.history, list):
        for item in request.history:
            if isinstance(item, dict):
                sanitized_history.append({
                    "sender": str(item.get("sender") or item.get("role") or "user"),
                    "text": str(item.get("text") or item.get("content") or ""),
                })

    # 5. Optional Firebase ID token verification for authenticated sessions
    if authorization and authorization.startswith("Bearer "):
        token = authorization.split(" ")[1].strip()
        if token and token not in ("null", "undefined"):
            try:
                from google.oauth2 import id_token
                from google.auth.transport import requests as google_requests
                id_token.verify_firebase_token(token, google_requests.Request())
            except Exception as auth_err:
                logger.debug(f"[Kisan Vaani] Optional Firebase token verification notice: {auth_err}")

    # 6. Execute Gemini response generation with granular exception handling
    try:
        result = assistant_service.generate_chat_response(
            message=resolved_message.strip(),
            language=resolved_lang,
            history=sanitized_history,
            farmer_profile=sanitized_profile,
        )
        return result
    except assistant_service.GeminiAuthError as auth_err:
        logger.error(f"[Kisan Vaani] Authentication Error: {auth_err}")
        raise HTTPException(
            status_code=401,
            detail="Gemini API authentication failed. Please verify your GEMINI_API_KEY configuration."
        ) from auth_err
    except assistant_service.GeminiQuotaError as quota_err:
        logger.warning(f"[Kisan Vaani] Quota/Rate Limit: {quota_err}")
        raise HTTPException(
            status_code=429,
            detail="Gemini API rate limit or quota exceeded. Please wait a moment and try again."
        ) from quota_err
    except assistant_service.GeminiTimeoutError as time_err:
        logger.warning(f"[Kisan Vaani] Timeout: {time_err}")
        raise HTTPException(
            status_code=504,
            detail="Gemini API request timed out. Please try again."
        ) from time_err
    except ValueError as val_err:
        raise HTTPException(status_code=400, detail=str(val_err)) from val_err
    except RuntimeError as run_err:
        logger.error(f"[Kisan Vaani] Runtime Error: {run_err}")
        raise HTTPException(status_code=503, detail=str(run_err)) from run_err
    except Exception as exc:
        logger.error(f"[Kisan Vaani] Unexpected Error: {exc}", exc_info=True)
        raise HTTPException(
            status_code=500,
            detail="The AI assistant is temporarily unavailable. Please try again in a few moments."
        ) from exc
