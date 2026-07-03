import { sendJson, handleCors } from './lib/utils.js';

export default async function handler(req, res) {
  if (handleCors(req, res)) return;
  sendJson(res, 200, {
    jwt_secret_set: !!process.env.JWT_SECRET,
    jwt_refresh_secret_set: !!process.env.JWT_REFRESH_SECRET,
    database_url_set: !!process.env.DATABASE_URL,
    app_url: process.env.APP_URL || null,
  });
}
