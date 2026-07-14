type VerificationRequest = {
  requestId?: unknown;
};

export async function persistVerificationRequest(
  request: Request,
  database: D1Database,
  verificationToken: string,
) {
  if (request.method !== 'POST') {
    return Response.json({ error: 'Method not allowed' }, { status: 405 });
  }

  if (request.headers.get('authorization') !== `Bearer ${verificationToken}`) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const body = (await request
    .json()
    .catch(() => null)) as VerificationRequest | null;
  if (typeof body?.requestId !== 'string' || body.requestId.length === 0) {
    return Response.json({ error: 'requestId is required' }, { status: 400 });
  }

  const result = await database
    .prepare(
      'INSERT OR IGNORE INTO verification_requests (request_id, verified_at) VALUES (?, ?)',
    )
    .bind(body.requestId, new Date().toISOString())
    .run();

  if (result.meta.changes === 0) {
    return Response.json(
      { error: 'Request already verified' },
      { status: 409 },
    );
  }

  console.log(JSON.stringify({ event: 'verification_request_persisted' }));
  return Response.json({ verified: true }, { status: 201 });
}
