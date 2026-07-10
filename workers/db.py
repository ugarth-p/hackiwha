import json
import uuid
from typing import Any

import psycopg2
import psycopg2.extras

from config import settings

_conn = None


def _get_conn():
    global _conn
    if _conn is None or _conn.closed:
        _conn = psycopg2.connect(settings.database_url)
    return _conn


def create_run(tenant_id: str) -> str:
    run_id = str(uuid.uuid4())
    conn = _get_conn()
    with conn.cursor() as cur:
        cur.execute(
            "INSERT INTO research_runs (id, tenant_id, status, started_at) VALUES (%s, %s, 'running', now())",
            (run_id, tenant_id),
        )
        conn.commit()
    return run_id


def update_run(run_id: str, status: str) -> None:
    conn = _get_conn()
    with conn.cursor() as cur:
        cur.execute(
            "UPDATE research_runs SET status = %s, completed_at = now() WHERE id = %s",
            (status, run_id),
        )
        conn.commit()


def store_finding(
    tenant_id: str,
    run_id: str,
    agent_type: str,
    content: dict[str, Any],
    embedding: list[float] | None = None,
) -> str:
    finding_id = str(uuid.uuid4())
    embedding_str = "[" + ",".join(str(v) for v in embedding) + "]" if embedding else None
    conn = _get_conn()
    with conn.cursor() as cur:
        cur.execute(
            """INSERT INTO findings (id, tenant_id, run_id, agent_type, content, embedding)
               VALUES (%s, %s, %s, %s, %s::jsonb, %s::vector)""",
            (finding_id, tenant_id, run_id, agent_type, json.dumps(content), embedding_str),
        )
        conn.commit()
    return finding_id


def ensure_tenant(tenant_id: str, business_description: str) -> None:
    conn = _get_conn()
    with conn.cursor() as cur:
        cur.execute(
            "INSERT INTO tenants (id, business_description) VALUES (%s, %s) ON CONFLICT (id) DO NOTHING",
            (tenant_id, business_description),
        )
        conn.commit()
