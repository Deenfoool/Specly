import http from 'node:http';
import { compareUrls } from './compare.js';
import { getDiagnostics } from './diagnostics.js';
import { errorPayload } from './http.js';

const PORT = Number(process.env.PORT || 8787);
const ALLOWED_ORIGINS = String(process.env.ALLOWED_ORIGINS || '*')
  .split(',')
  .map((value) => value.trim())
  .filter(Boolean);

const server = http.createServer(async (req, res) => {
  try {
    applyCors(req, res);

    if (req.method === 'OPTIONS') {
      res.writeHead(204).end();
      return;
    }

    if (req.method === 'GET' && req.url === '/api/health') {
      json(res, 200, getDiagnostics());
      return;
    }

    if (req.method === 'POST' && req.url === '/api/compare') {
      const body = await readJson(req);
      const result = await compareUrls(body.urls);
      json(res, 200, result);
      return;
    }

    json(res, 404, { error: { code: 'NOT_FOUND', message: 'Маршрут не найден' } });
  } catch (error) {
    const payload = errorPayload(error);
    json(res, payload.status, payload.body);
  }
});

server.listen(PORT, () => {
  console.log(`Specly Parser API listening on http://localhost:${PORT}`);
});

function applyCors(req, res) {
  const origin = req.headers.origin;
  const allowAny = ALLOWED_ORIGINS.includes('*');
  if (allowAny) res.setHeader('access-control-allow-origin', '*');
  else if (origin && ALLOWED_ORIGINS.includes(origin)) {
    res.setHeader('access-control-allow-origin', origin);
    res.setHeader('vary', 'Origin');
  }
  res.setHeader('access-control-allow-methods', 'GET,POST,OPTIONS');
  res.setHeader('access-control-allow-headers', 'content-type');
  res.setHeader('access-control-max-age', '86400');
}

async function readJson(req) {
  const chunks = [];
  let bytes = 0;
  for await (const chunk of req) {
    bytes += chunk.length;
    if (bytes > 32_768) {
      const error = new Error('Тело запроса слишком большое');
      error.code = 'PAYLOAD_TOO_LARGE';
      throw error;
    }
    chunks.push(chunk);
  }
  try {
    return JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}');
  } catch {
    const error = new Error('Некорректный JSON');
    error.code = 'INVALID_JSON';
    throw error;
  }
}

function json(res, status, payload) {
  res.statusCode = status;
  res.setHeader('content-type', 'application/json; charset=utf-8');
  res.setHeader('cache-control', 'no-store');
  res.end(JSON.stringify(payload));
}
