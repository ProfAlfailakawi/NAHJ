# NAHJ (نهج) — Database & Domain Schema

## Core Relational Entities
All primary models enforce mandatory multi-tenant isolation via `organization_id`.

```sql
-- Organizations & Tenancy
CREATE TABLE organizations (
  id VARCHAR(64) PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  slug VARCHAR(128) UNIQUE NOT NULL,
  industry VARCHAR(64) NOT NULL, -- e.g. 'education', 'healthcare'
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Users & RBAC
CREATE TABLE users (
  id VARCHAR(64) PRIMARY KEY,
  organization_id VARCHAR(64) REFERENCES organizations(id),
  name VARCHAR(255) NOT NULL,
  email VARCHAR(255) NOT NULL,
  role VARCHAR(64) NOT NULL, -- 'owner', 'admin', 'manager', 'employee', 'auditor'
  department VARCHAR(64)
);

-- Company Brain: Knowledge Sources
CREATE TABLE knowledge_sources (
  id VARCHAR(64) PRIMARY KEY,
  organization_id VARCHAR(64) REFERENCES organizations(id),
  title VARCHAR(255) NOT NULL,
  source_type VARCHAR(64) NOT NULL, -- 'system_sis', 'approved_policy', 'document', 'sop'
  authority_level VARCHAR(32) NOT NULL, -- 'live_authoritative', 'approved_policy', 'observed'
  freshness_date TIMESTAMP WITH TIME ZONE,
  status VARCHAR(32) DEFAULT 'active',
  content JSONB NOT NULL
);

-- Company Brain: Policies
CREATE TABLE policies (
  id VARCHAR(64) PRIMARY KEY,
  organization_id VARCHAR(64) REFERENCES organizations(id),
  code VARCHAR(64) NOT NULL,
  title VARCHAR(255) NOT NULL,
  description TEXT,
  risk_level VARCHAR(32) NOT NULL, -- 'low', 'medium', 'high', 'critical'
  rules JSONB NOT NULL,
  version INT DEFAULT 1,
  effective_from TIMESTAMP WITH TIME ZONE,
  effective_to TIMESTAMP WITH TIME ZONE,
  approved_by VARCHAR(64)
);

-- Company Brain: Skills (Core Operating Units)
CREATE TABLE skills (
  id VARCHAR(64) PRIMARY KEY,
  organization_id VARCHAR(64) REFERENCES organizations(id),
  name VARCHAR(255) NOT NULL,
  slug VARCHAR(128) NOT NULL,
  category VARCHAR(64) NOT NULL,
  purpose TEXT NOT NULL,
  autonomy_level INT DEFAULT 0, -- 0 (Observe) to 6 (Autopilot)
  status VARCHAR(32) NOT NULL, -- 'draft', 'proposed', 'approved', 'practicing', 'shadow', 'active', 'paused'
  reliability_score FLOAT DEFAULT 0.0,
  reliability_tier VARCHAR(32) DEFAULT 'low', -- 'low', 'medium', 'high', 'verified'
  active_version INT DEFAULT 1,
  owner_user_id VARCHAR(64),
  risk_level VARCHAR(32) DEFAULT 'medium',
  single_point_of_failure BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Skill Versions
CREATE TABLE skill_versions (
  id VARCHAR(64) PRIMARY KEY,
  skill_id VARCHAR(64) REFERENCES skills(id),
  version INT NOT NULL,
  steps JSONB NOT NULL,
  decisions JSONB NOT NULL,
  exceptions JSONB NOT NULL,
  required_inputs JSONB NOT NULL,
  allowed_actions JSONB NOT NULL,
  approvals_required JSONB NOT NULL,
  change_summary TEXT,
  approved_by VARCHAR(64),
  approved_at TIMESTAMP WITH TIME ZONE
);

-- Learning Sessions (Teach Mode & Observation)
CREATE TABLE learning_sessions (
  id VARCHAR(64) PRIMARY KEY,
  organization_id VARCHAR(64) REFERENCES organizations(id),
  teacher_user_id VARCHAR(64),
  title VARCHAR(255),
  status VARCHAR(32), -- 'in_progress', 'synthesized', 'clarifying', 'codified'
  captured_events JSONB DEFAULT '[]',
  transcript JSONB DEFAULT '[]',
  discovered_steps JSONB DEFAULT '[]',
  discovered_rules JSONB DEFAULT '[]',
  clarifications JSONB DEFAULT '[]',
  synthesized_skill_id VARCHAR(64),
  started_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Work Items (Live Executions)
CREATE TABLE work_items (
  id VARCHAR(64) PRIMARY KEY,
  organization_id VARCHAR(64) REFERENCES organizations(id),
  skill_id VARCHAR(64) REFERENCES skills(id),
  skill_version INT,
  title VARCHAR(255),
  contact_id VARCHAR(64),
  state VARCHAR(64) NOT NULL, -- 'queued', 'collecting_data', 'waiting_documents', 'waiting_approval', 'executing', 'completed'
  risk_level VARCHAR(32),
  assigned_mode VARCHAR(32), -- 'ai', 'human_takeover'
  data JSONB DEFAULT '{}',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Approvals Engine
CREATE TABLE approval_requests (
  id VARCHAR(64) PRIMARY KEY,
  organization_id VARCHAR(64) REFERENCES organizations(id),
  work_item_id VARCHAR(64) REFERENCES work_items(id),
  skill_id VARCHAR(64),
  action_name VARCHAR(128) NOT NULL,
  payload JSONB NOT NULL,
  reason_code VARCHAR(128) NOT NULL,
  risk_level VARCHAR(32) NOT NULL,
  required_role VARCHAR(64) NOT NULL,
  status VARCHAR(32) DEFAULT 'pending', -- 'pending', 'approved', 'rejected'
  decided_by VARCHAR(64),
  decided_at TIMESTAMP WITH TIME ZONE,
  comments TEXT
);

-- Immutable Audit Log
CREATE TABLE audit_events (
  id VARCHAR(64) PRIMARY KEY,
  organization_id VARCHAR(64) REFERENCES organizations(id),
  work_item_id VARCHAR(64),
  actor_type VARCHAR(32) NOT NULL, -- 'ai', 'human', 'system'
  actor_id VARCHAR(64),
  action_name VARCHAR(128) NOT NULL,
  policy_id VARCHAR(64),
  provenance_source VARCHAR(255),
  details JSONB NOT NULL,
  latency_ms INT,
  risk_level VARCHAR(32),
  timestamp TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
```
