import { SignJWT, jwtVerify } from 'jose';

function getSecret() {
  return new TextEncoder().encode(process.env.JWT_SECRET);
}

function getRefreshSecret() {
  return new TextEncoder().encode(process.env.JWT_REFRESH_SECRET);
}

export async function createTokens(payload) {
  const accessToken = await new SignJWT(payload)
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime('15m')
    .sign(getSecret());

  const refreshToken = await new SignJWT(payload)
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime('7d')
    .sign(getRefreshSecret());

  return { accessToken, refreshToken };
}

export async function verifyAccessToken(token) {
  const { payload } = await jwtVerify(token, getSecret(), { clockTolerance: 60 });
  return payload;
}

export async function verifyRefreshToken(token) {
  const { payload } = await jwtVerify(token, getRefreshSecret(), { clockTolerance: 60 });
  return payload;
}

export function getAuthUser(req) {
  const auth = req.headers.authorization || '';
  const token = auth.replace('Bearer ', '');
  if (!token) return null;
  try {
    return verifyAccessToken(token);
  } catch {
    return null;
  }
}

// Tenant-aware authorization helpers
export function requireTenantAccess(user, tenantId) {
  // Superadmin can access any tenant
  if (user.role === 'superadmin') {
    return true;
  }
  // Regular users can only access their own tenant
  return user.tenantId === tenantId;
}

export function getTenantFilter(user, tableAlias = '') {
  // Superadmin sees all data (no tenant filter)
  if (user.role === 'superadmin') {
    return { sql: '', params: [] };
  }
  // Regular users filtered by their tenant_id
  const prefix = tableAlias ? `${tableAlias}.` : '';
  return {
    sql: `AND ${prefix}tenant_id = $1`,
    params: [user.tenantId]
  };
}

export function canManageTenant(user) {
  // Only admin and superadmin can manage tenant settings/team
  return user.role === 'admin' || user.role === 'superadmin';
}

export function canManageData(user) {
  // Admin, manager, and superadmin can create/edit data
  return ['admin', 'manager', 'superadmin'].includes(user.role);
}
