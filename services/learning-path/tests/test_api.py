import pytest
from fastapi.testclient import TestClient

from src.database import get_db
from src.main import app


class FakeResult:
    def __init__(self, scalar=None, items=None):
        self._scalar = scalar
        self._items = items or []

    def scalar(self):
        return self._scalar

    def scalar_one_or_none(self):
        return self._scalar

    def scalars(self):
        return self

    def all(self):
        return self._items


class FakeSession:
    """Fake DB session: returns queued results, or raises if told to."""

    def __init__(self, results=None, fail=False):
        self.results = list(results or [])
        self.fail = fail
        self.queries = 0

    async def execute(self, *_args, **_kwargs):
        self.queries += 1
        if self.fail:
            raise RuntimeError("db down")
        return self.results.pop(0) if self.results else FakeResult()


def client_with(session):
    async def override():
        yield session

    app.dependency_overrides[get_db] = override
    return TestClient(app)


@pytest.fixture(autouse=True)
def clean_overrides():
    yield
    app.dependency_overrides.clear()


def test_health_ok_when_database_answers():
    r = client_with(FakeSession()).get("/health/")
    assert r.status_code == 200
    body = r.json()
    assert body["status"] == "ok"
    assert body["service"] == "learning-path"
    assert body["database"] == "ok"


def test_health_degraded_when_database_is_down():
    r = client_with(FakeSession(fail=True)).get("/health/")
    assert r.status_code == 200
    assert r.json()["status"] == "degraded"
    assert r.json()["database"] == "error"


def test_list_paths_empty_returns_one_page():
    session = FakeSession([FakeResult(scalar=0), FakeResult(items=[])])
    r = client_with(session).get("/api/v1/paths/")
    assert r.status_code == 200
    body = r.json()
    assert body["paths"] == []
    assert body["total"] == 0
    assert body["page"] == 1
    assert body["pages"] == 1
    assert session.queries == 2


def test_list_paths_rejects_limit_above_48():
    session = FakeSession()
    r = client_with(session).get("/api/v1/paths/?limit=100")
    assert r.status_code == 422
    assert session.queries == 0


def test_list_paths_rejects_page_zero():
    r = client_with(FakeSession()).get("/api/v1/paths/?page=0")
    assert r.status_code == 422


def test_get_path_returns_404_when_not_found():
    session = FakeSession([FakeResult(scalar=None)])
    r = client_with(session).get("/api/v1/paths/3fa85f64-5717-4562-b3fc-2c963f66afa6")
    assert r.status_code == 404
    assert r.json()["detail"] == "Learning path not found"


def test_get_path_rejects_invalid_uuid():
    session = FakeSession()
    r = client_with(session).get("/api/v1/paths/not-a-uuid")
    assert r.status_code == 422
    assert session.queries == 0


def test_metrics_endpoint_exposes_http_request_metrics():
    client = client_with(FakeSession())
    client.get("/health/")
    r = client.get("/metrics")
    assert r.status_code == 200
    assert "http_request_duration_seconds" in r.text
