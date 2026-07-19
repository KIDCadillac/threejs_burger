from fastapi.testclient import TestClient

from app.main import app


client = TestClient(app)


def test_health() -> None:
    response = client.get("/health")

    assert response.status_code == 200
    assert response.json() == {"status": "ok"}


def test_home_page_contains_game_title() -> None:
    response = client.get("/")

    assert response.status_code == 200
    assert "女巫的毒药" in response.text
