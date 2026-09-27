// This is the adapter to install in the current pos-kasir Next.js App Router project.
import { checkMutasiBca, errorResponse, noCacheHeaders } from '../../../lib/bca-check.js';
import { BcaError } from '../../../lib/bca-matching.js';

export const runtime = 'nodejs';
export const maxDuration = 120;
export const dynamic = 'force-dynamic';

export async function GET() {
  // Protected by the application's POS middleware. Never expose credentials or BCA cookies.
  return Response.json({ success: true,
    configured: Boolean(process.env.BCA_USER && process.env.BCA_PASS && process.env.JWT_SECRET),
  }, { headers: noCacheHeaders });
}

export async function POST(request) {
  try {
    if (!request.headers.get('content-type')?.startsWith('application/json')) {
      throw new BcaError('INVALID_BODY', 'Gunakan Content-Type application/json.', 415);
    }
    const text = await request.text();
    if (Buffer.byteLength(text) > 4096) throw new BcaError('INVALID_BODY', 'Permintaan terlalu besar.', 413);
    let input;
    try { input = JSON.parse(text); } catch { throw new BcaError('INVALID_BODY', 'JSON tidak valid.', 400); }
    const body = await checkMutasiBca({ input, cookie: request.headers.get('cookie'), fetchSite: request.headers.get('sec-fetch-site') });
    return Response.json(body, { headers: noCacheHeaders });
  } catch (error) {
    const result = errorResponse(error);
    return Response.json(result.body, {
      status: result.status,
      headers: { ...noCacheHeaders, ...(result.status === 429 ? { 'Retry-After': '5' } : {}) },
    });
  }
}
