import { sendJson, handleCors } from './lib/utils.js';

export default async function handler(req, res) {
  if (handleCors(req, res)) return;
  const cookieHeader = req.headers.cookie || '';
  const cookies = Object.fromEntries(
    cookieHeader.split(';').map(c => {
      const [k, ...v] = c.trim().split('=');
      return [k, v.join('=')];
    }).filter(([k]) => k)
  );
  sendJson(res, 200, {
    cookie_header_present: !!cookieHeader,
    cookie_header_length: cookieHeader.length,
    access_token_present: !!cookies.access_token,
    access_token_length: cookies.access_token ? cookies.access_token.length : 0,
    refresh_token_present: !!cookies.refresh_token,
    all_cookie_names: Object.keys(cookies),
    authorization_header: req.headers.authorization || null,
  });
}
