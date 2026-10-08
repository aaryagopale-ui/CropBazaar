from dataclasses import replace
import httpx
import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from backend.app.config import get_settings
from backend.app.db import get_db
from backend.app.dependencies import get_http_client
from backend.app.main import create_app

@pytest.fixture
def settings():
    return replace(get_settings(),groq_api_key='',data_gov_api_key='',data_gov_resource_id='',market_data_mode='demo')
@pytest.fixture
def client(tmp_path,settings):
    engine=create_engine(f'sqlite:///{tmp_path / "test.db"}',connect_args={'check_same_thread':False})
    factory=sessionmaker(engine,expire_on_commit=False)
    app=create_app(settings,engine)
    app.dependency_overrides[get_settings]=lambda: settings
    def sessions():
        with factory() as session: yield session
    app.dependency_overrides[get_db]=sessions
    with TestClient(app,raise_server_exceptions=False) as test_client:
        yield test_client
    engine.dispose()

@pytest.fixture
def provider_mock(client):
    def install(handler):
        async def http_client():
            async with httpx.AsyncClient(transport=httpx.MockTransport(handler)) as transport:
                yield transport
        client.app.dependency_overrides[get_http_client]=http_client
    return install
