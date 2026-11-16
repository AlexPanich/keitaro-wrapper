from app.core.config import Settings

ID_VARS = (
    "KEITARO_DEFAULT_DOMAIN_ID",
    "KEITARO_DEFAULT_GROUP_ID",
    "KEITARO_DEFAULT_TRAFFIC_SOURCE_ID",
)


def test_empty_default_ids_mean_not_selected(tmp_path, monkeypatch):
    """Пустые дефолты ID, как в .env.example, — «не выбрано», а не ошибка старта."""
    for var in ID_VARS:
        monkeypatch.delenv(var, raising=False)
    env = tmp_path / ".env"
    env.write_text("".join(f"{var}=\n" for var in ID_VARS))

    s = Settings(_env_file=env)

    assert s.keitaro_default_domain_id is None
    assert s.keitaro_default_group_id is None
    assert s.keitaro_default_traffic_source_id is None


def test_default_ids_are_parsed(monkeypatch):
    monkeypatch.setenv("KEITARO_DEFAULT_DOMAIN_ID", "3")
    monkeypatch.setenv("KEITARO_DEFAULT_GROUP_ID", "7")
    monkeypatch.setenv("KEITARO_DEFAULT_TRAFFIC_SOURCE_ID", "0")

    s = Settings(_env_file=None)

    assert s.keitaro_default_domain_id == 3
    assert s.keitaro_default_group_id == 7
    assert s.keitaro_default_traffic_source_id == 0
