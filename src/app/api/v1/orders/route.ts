import { apiFailure, json, readJson, requireApiKey } from '@/lib/api-access';
import { createExternalOrder } from '@/lib/external-orders';

export async function POST(request: Request) {
    try {
        const keyId = await requireApiKey(request, 'orders');
        const result = await createExternalOrder(keyId, request.headers.get('idempotency-key') || '', await readJson(request));
        return json({ success: true, data: { ...result, status: 'pending_payment' } }, result.duplicate ? 200 : 201);
    } catch (error) { return apiFailure(error); }
}

export async function PUT(request: Request) {
    try {
        const keyId = await requireApiKey(request, 'orders');
        const result = await createExternalOrder(keyId, request.headers.get('idempotency-key') || '', await readJson(request), true);
        return json({ success: true, data: { ...result, status: 'pending_payment' } }, result.duplicate || result.updated ? 200 : 201);
    } catch (error) { return apiFailure(error); }
}
