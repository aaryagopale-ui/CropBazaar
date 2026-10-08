import logging
from fastapi import Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from starlette.exceptions import HTTPException
from sqlalchemy.exc import SQLAlchemyError
from .schemas import ErrorEnvelope, ErrorInfo, Meta
logger = logging.getLogger('cropbazaar')
class ApiError(Exception):
    def __init__(self, status: int, code: str, message: str):
        self.status, self.code, self.message = status, code, message

def error_response(request, status, code, message, details=None):
    body = ErrorEnvelope(error=ErrorInfo(code=code,message=message,details=details or []),meta=Meta(request_id=getattr(request.state,'request_id','unknown')))
    return JSONResponse(status_code=status,content=body.model_dump(mode='json'),headers={'X-Request-ID':body.meta.request_id})
def install_handlers(app):
    @app.exception_handler(ApiError)
    async def domain_error(request: Request, exc: ApiError):
        return error_response(request,exc.status,exc.code,exc.message)
    @app.exception_handler(RequestValidationError)
    async def validation_error(request: Request, exc: RequestValidationError):
        details=[{'field':'.'.join(map(str,e['loc'])),'message':e['msg'],'type':e['type']} for e in exc.errors()]
        return error_response(request,422,'VALIDATION_ERROR','The request contains invalid values.',details)
    @app.exception_handler(HTTPException)
    async def http_error(request: Request, exc: HTTPException):
        return error_response(request,exc.status_code,'HTTP_ERROR',str(exc.detail))
    @app.exception_handler(SQLAlchemyError)
    async def database_error(request: Request, exc: SQLAlchemyError):
        logger.error('Database operation failed request_id=%s',request.state.request_id)
        return error_response(request,503,'DATABASE_UNAVAILABLE','Database unavailable. Please try again.')
    @app.exception_handler(Exception)
    async def unexpected_error(request: Request, exc: Exception):
        # Never log provider URLs/exception strings: URLs can contain credentials.
        logger.error('Unhandled error type=%s request_id=%s',type(exc).__name__,request.state.request_id)
        return error_response(request,500,'INTERNAL_ERROR','An unexpected error occurred. Please try again.')
