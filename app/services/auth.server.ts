const signInLinkLifetimeMs = 15 * 60 * 1000;
const sessionLifetimeMs = 30 * 24 * 60 * 60 * 1000;

type AuthEnvironment = {
  DB: D1Database;
  RESEND_API_KEY?: string;
  EMAIL_FROM?: string;
  AUTH_EMAIL_DELIVERY?: string;
};

type AuthenticatedUser = {
  id: string;
  email: string;
  displayName: string;
};

async function hash(value: string) {
  const bytes = new TextEncoder().encode(value);
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(digest), (byte) =>
    byte.toString(16).padStart(2, '0'),
  ).join('');
}

function newToken() {
  return `${crypto.randomUUID()}${crypto.randomUUID()}`;
}

function normalizeEmail(value: unknown) {
  if (typeof value !== 'string') return null;
  const email = value.trim().toLowerCase();
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ? email : null;
}

function expiry(milliseconds: number) {
  return new Date(Date.now() + milliseconds).toISOString();
}

export async function requestSignInLink(
  request: Request,
  env: AuthEnvironment,
) {
  const body = request.headers.get('content-type')?.includes('application/json')
    ? ((await request.json().catch(() => null)) as { email?: unknown } | null)
    : Object.fromEntries(await request.formData().catch(() => new FormData()));
  const email = normalizeEmail(body?.email);
  if (!email)
    return Response.json(
      { error: 'Enter a valid email address.' },
      { status: 400 },
    );

  const token = newToken();
  if (env.RESEND_API_KEY && env.EMAIL_FROM) {
    const link = new URL('/verify', request.url);
    link.searchParams.set('token', token);
    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        authorization: `Bearer ${env.RESEND_API_KEY}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        from: env.EMAIL_FROM,
        to: [email],
        subject: 'Sign in to Golf Tiers',
        html: `<p><a href="${link.href}">Sign in to Golf Tiers</a></p>`,
      }),
    });
    if (!response.ok) {
      console.log(JSON.stringify({ event: 'sign_in_email_failed' }));
      if (request.headers.get('accept')?.includes('text/html')) {
        return Response.redirect(
          new URL('/sign-in?error=email-failed', request.url),
          303,
        );
      }
      return Response.json(
        { error: 'Unable to send a sign-in link. Try again.' },
        { status: 502 },
      );
    }
  } else if (env.AUTH_EMAIL_DELIVERY !== 'local') {
    console.log(JSON.stringify({ event: 'sign_in_email_unavailable' }));
    if (request.headers.get('accept')?.includes('text/html')) {
      return Response.redirect(
        new URL('/sign-in?error=email-unavailable', request.url),
        303,
      );
    }
    return Response.json(
      { error: 'Sign-in email is temporarily unavailable. Try again later.' },
      { status: 503 },
    );
  }

  await env.DB.prepare(
    'INSERT INTO sign_in_links (token_hash, email, expires_at) VALUES (?, ?, ?)',
  )
    .bind(await hash(token), email, expiry(signInLinkLifetimeMs))
    .run();

  console.log(JSON.stringify({ event: 'sign_in_link_requested' }));
  if (request.headers.get('accept')?.includes('text/html')) {
    return Response.redirect(new URL('/sign-in?sent=1', request.url), 303);
  }
  return Response.json(
    { message: 'If that address can sign in, a link is on its way.' },
    { status: 202 },
  );
}

export async function verifySignInLink(
  token: string | null,
  env: AuthEnvironment,
) {
  if (!token) return null;
  const tokenHash = await hash(token);
  const now = new Date().toISOString();
  const link = await env.DB.prepare(
    'UPDATE sign_in_links SET used_at = ? WHERE token_hash = ? AND used_at IS NULL AND expires_at > ? RETURNING email',
  )
    .bind(now, tokenHash, now)
    .first<{ email: string }>();
  if (!link) return null;

  const user = await env.DB.prepare(
    'INSERT INTO users (id, email, created_at) VALUES (?, ?, ?) ON CONFLICT(email) DO UPDATE SET email = excluded.email RETURNING id',
  )
    .bind(crypto.randomUUID(), link.email, now)
    .first<{ id: string }>();
  const sessionToken = newToken();
  await env.DB.prepare(
    'INSERT INTO sessions (token_hash, user_id, expires_at, created_at) VALUES (?, ?, ?, ?)',
  )
    .bind(await hash(sessionToken), user!.id, expiry(sessionLifetimeMs), now)
    .run();
  console.log(JSON.stringify({ event: 'sign_in_verified' }));
  return sessionToken;
}

export async function authenticatedUser(
  request: Request,
  env: AuthEnvironment,
) {
  const token = request.headers
    .get('cookie')
    ?.match(/(?:^|;\s*)golf_tiers_session=([^;]+)/)?.[1];
  if (!token) return null;
  return env.DB.prepare(
    'SELECT users.id, users.email, users.display_name AS displayName FROM sessions JOIN users ON users.id = sessions.user_id WHERE sessions.token_hash = ? AND sessions.expires_at > ?',
  )
    .bind(await hash(token), new Date().toISOString())
    .first<AuthenticatedUser>();
}

export function sessionCookie(token: string) {
  return `golf_tiers_session=${token}; HttpOnly; Path=/; SameSite=Lax; Max-Age=${sessionLifetimeMs / 1000}; Secure`;
}

export async function updateDisplayName(
  request: Request,
  env: AuthEnvironment,
) {
  const user = await authenticatedUser(request, env);
  if (!user)
    return Response.json(
      { error: 'Authentication required.' },
      { status: 401 },
    );
  const body = request.headers.get('content-type')?.includes('application/json')
    ? ((await request.json().catch(() => null)) as {
        displayName?: unknown;
      } | null)
    : Object.fromEntries(await request.formData().catch(() => new FormData()));
  const displayName =
    typeof body?.displayName === 'string' ? body.displayName.trim() : '';
  if (!displayName || displayName.length > 80) {
    return Response.json(
      { error: 'Display name must be between 1 and 80 characters.' },
      { status: 400 },
    );
  }
  await env.DB.prepare('UPDATE users SET display_name = ? WHERE id = ?')
    .bind(displayName, user.id)
    .run();
  if (request.headers.get('accept')?.includes('text/html')) {
    return Response.redirect(new URL('/profile?saved=1', request.url), 303);
  }
  return Response.json({ displayName });
}
