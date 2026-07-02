import { sendJson, handleCors } from './lib/utils.js';

export default function handler(req, res) {
  if (handleCors(req, res)) return;
  sendJson(res, 200, { status: 'ok', timestamp: new Date().toISOString() });
}
