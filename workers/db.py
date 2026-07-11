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


def get_findings_by_run(run_id: str) -> list[dict[str, Any]]:
    conn = _get_conn()
    with conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:
        cur.execute(
            """SELECT id, "tenantId", "runId", source, content, embedding
               FROM "Finding" WHERE "runId" = %s""",
            (run_id,),
        )
        rows = cur.fetchall()
    results = []
    for row in rows:
        embedding = None
        if row["embedding"]:
            embedding = [float(v) for v in str(row["embedding"]).strip("[]").split(",")]
        results.append({
            "id": row["id"],
            "tenant_id": row["tenantId"],
            "run_id": row["runId"],
            "source": row["source"],
            "content": json.loads(row["content"]) if isinstance(row["content"], str) else row["content"],
            "embedding": embedding,
        })
    return results


def cosine_similarity(a: list[float], b: list[float]) -> float:
    if not a or not b or len(a) != len(b):
        return 0.0
    dot = sum(x * y for x, y in zip(a, b))
    norm_a = sum(x * x for x in a) ** 0.5
    norm_b = sum(x * x for x in b) ** 0.5
    if norm_a == 0 or norm_b == 0:
        return 0.0
    return dot / (norm_a * norm_b)


def ensure_tenant(tenant_id: str, business_description: str) -> None:
    conn = _get_conn()
    with conn.cursor() as cur:
        cur.execute(
            'INSERT INTO "Tenant" (id, name, "businessDescription") VALUES (%s, %s, %s) ON CONFLICT (id) DO NOTHING',
            (tenant_id, tenant_id, business_description),
        )
