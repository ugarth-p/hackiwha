CREATE EXTENSION IF NOT EXISTS vector;

CREATE TYPE agent_type AS ENUM ('market_intel', 'competitor_recon');
CREATE TYPE run_status AS ENUM ('pending', 'running', 'completed', 'failed');

CREATE TABLE tenants (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    business_description TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE research_runs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    status run_status NOT NULL DEFAULT 'pending',
    started_at TIMESTAMPTZ,
    completed_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE findings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    run_id UUID NOT NULL REFERENCES research_runs(id) ON DELETE CASCADE,
    agent_type agent_type NOT NULL,
    content JSONB NOT NULL,
    embedding VECTOR(1536),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_findings_tenant_id ON findings(tenant_id);
CREATE INDEX idx_findings_run_id ON findings(run_id);
CREATE INDEX idx_findings_agent_type ON findings(agent_type);
CREATE INDEX idx_research_runs_tenant_id ON research_runs(tenant_id);
