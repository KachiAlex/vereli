import { sendJson, handleCors, badRequest, requireAuth } from './lib/utils.js';

// Simple rule-based AI assistant (no external API needed)
// Can be swapped for OpenAI/Anthropic integration later

export default async function handler(req, res) {
  if (handleCors(req, res)) return;
  if (req.method !== 'POST') { badRequest(res, 'Method not allowed'); return; }

  const user = await requireAuth(req, res);
  if (!user) return;

  const { action, text, context } = req.body || {};
  if (!action) { badRequest(res, 'action is required'); return; }

  const tenantId = user.tenantId;
  let result = '';

  if (action === 'summarize') {
    // Simple extractive summary: first sentence + key phrases
    const sentences = text.split(/[.!?]+/).filter(s => s.trim().length > 10);
    result = sentences.slice(0, 2).join('. ') + (sentences.length > 2 ? '...' : '');
  }

  if (action === 'suggest-tasks') {
    // Extract action items from text
    const keywords = ['need to', 'should', 'must', 'prepare', 'send', 'review', 'create', 'update', 'schedule', 'follow up'];
    const lines = text.split(/\n|\. /);
    const tasks = lines.filter(line => keywords.some(kw => line.toLowerCase().includes(kw))).map(line => line.trim()).slice(0, 5);
    result = JSON.stringify(tasks);
  }

  if (action === 'overdue-followup') {
    // Generate a polite follow-up message
    const clientName = context?.clientName || 'there';
    result = `Hi ${clientName},\n\nI wanted to follow up on the outstanding items we discussed. Please let me know if you need anything from our side to move things forward.\n\nBest regards`;
  }

  if (action === 'generate-description') {
    // Expand a brief into a task description
    const brief = text || context?.brief || '';
    result = `Task: ${brief}\n\nObjective: Complete the above deliverable according to agreed specifications.\n\nSteps:\n1. Review requirements\n2. Draft initial version\n3. Internal review\n4. Deliver to client\n5. Incorporate feedback`;
  }

  sendJson(res, 200, { data: { result, action } });
}
