export default function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: { code: 'METHOD_NOT_ALLOWED', message: 'Метод не поддерживается' } });
  }
  res.setHeader('cache-control', 'no-store');
  return res.status(200).json({ ok: true, service: 'specly-parser', version: '0.1.0' });
}
