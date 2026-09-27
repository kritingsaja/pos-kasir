// This is the adapter to install in the current pos-kasir Next.js App Router project.
import { checkMutasiBca, errorResponse, noCacheHeaders } from '../../../lib/bca-check.js';
import { BcaError } from '../../../lib/bca-matching.js';
import { randomUUID } from 'node:crypto';

export const runtime = 'nodejs';
export const maxDuration = 120;
export const dynamic = 'force-dynamic';

export async function GET() {
  // Protected by the application's POS middleware. Never expose credentials or BCA cookies.
  const missing = ['BCA_USER', 'BCA_PASS', 'JWT_SECRET'].filter(name => !process.env[name]);
  const configured = missing.length === 0;
  const message = !configured ? (missing.includes('JWT_SECRET')
    ? 'Pengecekan BCA belum aktif karena konfigurasi keamanan kasir belum lengkap. Hubungi admin.'
    : 'BCA belum dihubungkan pada versi aplikasi ini. Hubungi admin.') : '';
  console.info(JSON.stringify({ event: 'bca.configuration', configured, missing }));
  return Response.json({ success: true, configured, message, missing,
  }, { headers: noCacheHeaders });
}

export async function POST(request) {
  const requestId = randomUUID();
  const start = Date.now();
  let stage = 'validating_request';
  try {
    if (!request.headers.get('content-type')?.startsWith('application/json')) {
      throw new BcaError('INVALID_BODY', 'Gunakan Content-Type application/json.', 415);
    }
    const text = await request.text();
    if (Buffer.byteLength(text) > 4096) throw new BcaError('INVALID_BODY', 'Permintaan terlalu besar.', 413);
    let input;
    try { input = JSON.parse(text); } catch { throw new BcaError('INVALID_BODY', 'JSON tidak valid.', 400); }
    console.info(JSON.stringify({ event: 'bca.check.start', requestId, mode: input?.mode === 'list' ? 'list' : 'match' }));
    const body = await checkMutasiBca({ input, cookie: request.headers.get('cookie'), fetchSite: request.headers.get('sec-fetch-site'),
      onProgress: next => {
        stage = next;
        console.info(JSON.stringify({ event: 'bca.check.progress', requestId, stage, durationMs: Date.now() - start }));
      },
    });
    console.info(JSON.stringify({ event: 'bca.check.finish', requestId, matched: body.matched ?? null, durationMs: Date.now() - start }));
    return Response.json(body, { headers: noCacheHeaders });
  } catch (error) {
    const result = errorResponse(error);
    console.error(JSON.stringify({ event: 'bca.check.error', requestId, stage, code: result.body.code, status: result.status, durationMs: Date.now() - start }));
    return Response.json({ ...result.body, stage, requestId }, {
      status: result.status,
      headers: { ...noCacheHeaders, ...(result.status === 429 ? { 'Retry-After': '5' } : {}) },
    });
  }
}
