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
        _conn.autocommit = True
    return _conn


def create_run(tenant_id: str) -> str:
    run_id = str(uuid.uuid4())
    conn = _get_conn()
    with conn.cursor() as cur:
        cur.execute(
            "INSERT INTO \"PipelineRun\" (id, \"tenantId\", status, \"triggeredBy\", \"startedAt\") VALUES (%s, %s, 'running', 'manual', now())",
            (run_id, tenant_id),
        )
    return run_id


def update_run(run_id: str, status: str) -> None:
    conn = _get_conn()
    with conn.cursor() as cur:
        cur.execute(
            'UPDATE "PipelineRun" SET status = %s, "completedAt" = now() WHERE id = %s',
            (status, run_id),
        )


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
            """INSERT INTO "Finding" (id, "tenantId", "runId", source, content, embedding)
               VALUES (%s, %s, %s, %s, %s::jsonb, %s::vector)""",
            (finding_id, tenant_id, run_id, agent_type, json.dumps(content), embedding_str),
        )
    return finding_id


def ensure_tenant(tenant_id: str, business_description: str) -> None:
    conn = _get_conn()
    with conn.cursor() as cur:
        cur.execute(
            'INSERT INTO "Tenant" (id, name, "businessDescription") VALUES (%s, %s, %s) ON CONFLICT (id) DO NOTHING',
            (tenant_id, tenant_id, business_description),
        )
