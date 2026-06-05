import { sendJson, handleCors, requireAuth } from './lib/utils.js';

export default async function handler(req, res) {
  if (handleCors(req, res)) return;

  const user = await requireAuth(req, res);
  if (!user) return;

  sendJson(res, 200, {
    data: {
      id: user.userId,
      email: user.email,
      name: user.name,
      role: user.role,
    },
  });
}
