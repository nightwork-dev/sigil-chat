create table "apikey" (
  "id" text not null primary key,
  "configId" text not null default 'default',
  "name" text,
  "start" text,
  "prefix" text,
  "key" text not null,
  "referenceId" text not null,
  "refillInterval" integer,
  "refillAmount" integer,
  "lastRefillAt" date,
  "enabled" integer default true,
  "rateLimitEnabled" integer default true,
  "rateLimitTimeWindow" integer default 60000,
  "rateLimitMax" integer default 120,
  "requestCount" integer default 0,
  "remaining" integer,
  "lastRequest" date,
  "expiresAt" date,
  "createdAt" date not null,
  "updatedAt" date not null,
  "permissions" text,
  "metadata" text
);

create index "apikey_configId_idx" on "apikey" ("configId");
create index "apikey_referenceId_idx" on "apikey" ("referenceId");
create index "apikey_key_idx" on "apikey" ("key");

create table "external_mcp_grant" (
  "credential_id" text not null primary key references "apikey" ("id") on delete cascade,
  "principal_id" text not null references "user" ("id") on delete cascade,
  "resource_scope" text not null,
  "tool_allowlist" text not null,
  "operation" text not null check ("operation" in ('read', 'write')),
  "profile" text not null check ("profile" in ('observer', 'collaborator')),
  "key_suffix" text not null,
  "policy_version" integer not null default 1,
  "created_by_user_id" text not null references "user" ("id") on delete cascade,
  "created_at" text not null,
  "updated_at" text not null,
  "revoked_at" text,
  "revocation_reason" text
);

create index "external_mcp_grant_principal_idx"
  on "external_mcp_grant" ("principal_id", "created_at");

create table "external_mcp_audit" (
  "id" text not null primary key,
  "credential_id" text,
  "credential_start" text,
  "principal_id" text,
  "mcp_method" text not null,
  "tool_name" text,
  "resource_scope" text,
  "operation" text,
  "policy_version" integer,
  "outcome" text not null check ("outcome" in ('allow', 'deny')),
  "reason" text not null,
  "latency_ms" integer not null,
  "created_at" text not null
);

create index "external_mcp_audit_credential_idx"
  on "external_mcp_audit" ("credential_id", "created_at");
