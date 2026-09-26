CREATE TABLE plannet_user (
    id UUID PRIMARY KEY,
    provider VARCHAR(100) NOT NULL,
    subject VARCHAR(512) NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE (provider, subject)
);

CREATE TABLE planner_record (
    user_id UUID NOT NULL REFERENCES plannet_user(id),
    kind VARCHAR(16) NOT NULL CHECK (kind IN ('mandalart', 'block6', 'monthly', 'daily', 'recurring', 'holidays')),
    id VARCHAR(128) NOT NULL,
    schema_version INTEGER NOT NULL CHECK (schema_version = 1),
    version BIGINT NOT NULL CHECK (version > 0),
    data JSONB,
    deleted BOOLEAN NOT NULL,
    title TEXT,
    category VARCHAR(10) CHECK (category IN ('annual', 'monthly', 'weekly', 'daily')),
    plan_year INTEGER CHECK (plan_year BETWEEN 1 AND 9999),
    plan_month INTEGER CHECK (plan_month BETWEEN 1 AND 12),
    plan_week INTEGER CHECK (plan_week BETWEEN 1 AND 53),
    plan_day INTEGER CHECK (plan_day BETWEEN 1 AND 31),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (user_id, kind, id),
    CHECK ((deleted AND data IS NULL) OR (NOT deleted AND jsonb_typeof(data) = 'object')),
    CHECK (kind NOT IN ('recurring', 'holidays') OR id = 'default')
);

CREATE INDEX planner_record_owner_period_idx
    ON planner_record (user_id, category, plan_year, plan_month) WHERE NOT deleted;

-- Receipts are durable and kept with the account: pruning would break retry semantics.
CREATE TABLE planner_commit_receipt (
    user_id UUID NOT NULL REFERENCES plannet_user(id),
    request_id UUID NOT NULL,
    request_hash CHAR(64) NOT NULL,
    response JSONB NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (user_id, request_id)
);
