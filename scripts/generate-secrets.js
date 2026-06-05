import { randomBytes } from 'crypto';

const jwtSecret = randomBytes(64).toString('hex');
const jwtRefreshSecret = randomBytes(64).toString('hex');

console.log('\n=== Generated Secrets ===\n');
console.log('JWT_SECRET=' + jwtSecret);
console.log('JWT_REFRESH_SECRET=' + jwtRefreshSecret);
console.log('\n=========================\n');
console.log('Add these to your Vercel Environment Variables (Settings > Environment Variables):');
console.log('  - JWT_SECRET');
console.log('  - JWT_REFRESH_SECRET\n');
console.log('Keep these private. Do not commit them.\n');
