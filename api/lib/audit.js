import { sql } from './neon.js';

export async function ensureAuditTable() {
  await sql`
    CREATE TABLE IF NOT EXISTS audit_log (
      id SERIAL PRIMARY KEY,
      tenant_id INTEGER REFERENCES tenants(id) ON DELETE CASCADE,
      user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
      user_email TEXT,
      action TEXT NOT NULL,
      entity_type TEXT NOT NULL,
      entity_id INTEGER,
      old_value JSONB,
      new_value JSONB,
      ip TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `;
}

export async function logAudit({ tenantId, userId, userEmail, action, entityType, entityId, oldValue, newValue, ip }) {
  try {
    await sql`
      INSERT INTO audit_log (tenant_id, user_id, user_email, action, entity_type, entity_id, old_value, new_value, ip)
      VALUES (${tenantId || null}, ${userId || null}, ${userEmail || null}, ${action}, ${entityType}, ${entityId || null}, ${oldValue ? JSON.stringify(oldValue) : null}, ${newValue ? JSON.stringify(newValue) : null}, ${ip || null})
    `;
  } catch (err) {
    console.error('Audit log error:', err);
  }
}
