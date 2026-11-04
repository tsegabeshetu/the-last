import express from 'express';
import { config } from '../env.js';
import { rateLimit } from '../rate-limit.js';
import { badRequest } from '../http-error.js';

const router = express.Router();

const SESSION_PATTERN = /^[A-Za-z0-9_-]{8,64}$/;
const MAX_MESSAGE_CHARS = 1200;
const MAX_STORED_TURNS = 24;
const SESSION_TTL = 2 * 60 * 60 * 1000;

const sessions = new Map();

setInterval(() => {
  const now = Date.now();
  for (const [id, session] of sessions) {
    if (now - session.updatedAt > SESSION_TTL) sessions.delete(id);
  }
}, 10 * 60_000).unref?.();

function getSession(id) {
  let session = sessions.get(id);
  if (!session) {
    session = { turns: [], updatedAt: Date.now() };
    sessions.set(id, session);
  }
  session.updatedAt = Date.now();
  return session;
}

function clean(value) {
  return String(value || '')
    .replace(/```[\s\S]*?```/g, '')
    .replace(/^\s{0,3}#{1,6}\s+/gm, '')
    .replace(/\*\*(.*?)\*\*/g, '$1')
    .replace(/__(.*?)__/g, '$1')
    .replace(/`([^`]+)`/g, '$1')
    .replace(/^\s*[-*]\s+/gm, '• ')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
    .slice(0, 1800);
}

const SYSTEM_PROMPT = `You are FETAN (Field Emergency Triage & Assistance Network), the bilingual safety assistant built into AURASTAY, a civic reporting and emergency-response DEMO for Ethiopia.

Rules:
- Answer in the language requested by the user (English or Amharic). If the user writes Amharic, answer in Amharic.
- Be concise, practical and calm. Use short paragraphs and bullet lists where helpful.
- AURASTAY is a demonstration. Never claim that a report was dispatched, that responders are coming, that an SMS was delivered, or that you have live dispatch data.
- For immediate danger, always tell the user to call 611. FETAN is guidance only, not a dispatcher.
- Use only the provided context about the demo feed and site features. Do not invent incident details, phone numbers, agency names or statistics.
- Missing-person guidance: never invent cases. Advise contacting police and sharing only authorised contact details and photos.
- Privacy: never ask for sensitive personal data, exact home addresses, or identity documents.
- If the answer is not in the context, say what you do know and point to the Help page or 611.`;

router.post(
  '/chat',
  rateLimit({ scope: 'fetan', windowMs: 60_000, max: 20 }),
  async (req, res, next) => {
    try {
      const sessionId = String(req.body?.sessionId || '');
      if (!SESSION_PATTERN.test(sessionId)) throw badRequest('Invalid chat session.');
      const message = String(req.body?.message || '').trim();
      if (!message) throw badRequest('Message is required.');
      if (message.length > MAX_MESSAGE_CHARS) throw badRequest('Message is too long.');
      const lang = req.body?.lang === 'am' ? 'am' : 'en';
      const context = String(req.body?.context || '').slice(0, 2000);
      const history = Array.isArray(req.body?.history)
        ? req.body.history
            .filter(
              (turn) =>
                turn &&
                (turn.role === 'user' || turn.role === 'assistant') &&
                typeof turn.text === 'string',
            )
            .slice(-6)
            .map((turn) => ({ role: turn.role, content: turn.text.slice(0, 1200) }))
        : [];

      const session = getSession(sessionId);
      session.turns.push({ role: 'user', text: message });
      session.turns = session.turns.slice(-MAX_STORED_TURNS);

      if (!config.fetan.apiKey) {
        res.json({
          configured: false,
          answer: null,
          sessionId,
          history: session.turns,
        });
        return;
      }

      const messages = [
        { role: 'system', content: SYSTEM_PROMPT },
        ...(context ? [{ role: 'system', content: `AURASTAY context:\n${context}` }] : []),
        ...history,
        { role: 'user', content: message },
      ];

      let answer = null;
      let model = config.fetan.model;
      try {
        const response = await fetch(`${config.fetan.baseUrl}/chat/completions`, {
          method: 'POST',
          headers: {
            'content-type': 'application/json',
            authorization: `Bearer ${config.fetan.apiKey}`,
          },
          body: JSON.stringify({
            model: config.fetan.model,
            messages,
            temperature: 0.3,
            max_tokens: 500,
          }),
          signal: AbortSignal.timeout(15_000),
        });
        if (response.ok) {
          const data = await response.json();
          answer = clean(data?.choices?.[0]?.message?.content || '');
          model = data?.model || model;
          if (!answer) answer = null;
        } else {
          console.warn('[fetan] Provider responded', response.status);
        }
      } catch (error) {
        console.warn('[fetan] Live model unavailable:', error.message);
      }

      if (answer) {
        session.turns.push({ role: 'assistant', text: answer });
        session.turns = session.turns.slice(-MAX_STORED_TURNS);
      }

      res.json({
        configured: true,
        answer,
        model,
        sessionId,
        history: session.turns,
      });
    } catch (error) {
      next(error);
    }
  },
);

router.delete('/chat', (req, res) => {
  const sessionId = String(req.query.sessionId || '');
  if (SESSION_PATTERN.test(sessionId)) sessions.delete(sessionId);
  res.json({ ok: true });
});

router.get('/status', (_req, res) => {
  res.json({ configured: Boolean(config.fetan.apiKey), model: config.fetan.model });
});

export default router;
