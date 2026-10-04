// auth-e2e-test.js — verifies API auth against a running server.
// Usage: BASE_URL=http://localhost:12345 AUTH_USER=admin AUTH_PASS=admin node auth-e2e-test.js
// Non-destructive: protected routes are only called without credentials (expect 401)
// or with read-only methods; mutating calls with a session are not made.
const BASE_URL = process.env.BASE_URL || 'http://localhost:12345';
const AUTH_USER = process.env.AUTH_USER || 'admin';
const AUTH_PASS = process.env.AUTH_PASS || 'admin';

let failures = 0;
function check(cond, msg) {
    if (cond) console.log('PASSED:', msg);
    else { console.error('FAILED:', msg); failures++; }
}

async function status(method, path, headers = {}) {
    const res = await fetch(`${BASE_URL}${path}`, {
        method,
        headers,
        redirect: 'manual',
        body: ['POST', 'PUT', 'DELETE'].includes(method) ? '{}' : undefined,
    });
    if (path.includes('/stream')) res.body?.cancel();
    return res.status;
}

// Every protected route + method. Called without credentials and with the read token.
const PROTECTED = [
    ['GET', '/api/messages?limit=1'],
    ['GET', '/api/messages/stream'],
    ['GET', '/api/messages/export'],
    ['GET', '/api/messages/purge'],
    ['DELETE', '/api/messages/purge?olderThanDays=0'],
    ['GET', '/api/settings/webook'],
    ['POST', '/api/settings/webook'],
    ['GET', '/api/settings/mute'],
    ['POST', '/api/settings/mute'],
    ['GET', '/api/settings/api-token'],
    ['POST', '/api/settings/api-token'],
    ['DELETE', '/api/settings/api-token'],
    ['GET', '/api/schedules'],
    ['POST', '/api/schedules'],
    ['PUT', '/api/schedules/1'],
    ['DELETE', '/api/schedules/1'],
    ['GET', '/api/speakers'],
    ['POST', '/api/test-speak'],
    ['GET', '/api/lgtv/pair'],
    ['POST', '/api/lgtv/pair'],
    ['POST', '/api/lgtv/test'],
    ['POST', '/api/auth/update'],
    ['GET', '/api/does-not-exist'],
    // path tricks must not slip past the allowlist
    ['GET', '/api/webhook/x/../../settings/webook'],
    ['GET', '/api/health/../settings/webook'],
];

async function main() {
    console.log(`--- Auth E2E against ${BASE_URL} ---`);

    console.log('\n1. Protected routes reject anonymous requests');
    for (const [m, p] of PROTECTED) check(await status(m, p) === 401, `${m} ${p} → 401 without session`);

    console.log('\n2. Public routes stay open');
    check(await status('GET', '/api/health') === 200, 'GET /api/health → 200');
    check(await status('POST', '/api/auth/logout') === 200, 'POST /api/auth/logout → 200');
    const badLogin = await fetch(`${BASE_URL}/api/auth/login`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: 'nope', password: 'nope' }),
    });
    check(badLogin.status === 401, 'POST /api/auth/login with bad creds → 401 (reachable, not blocked)');
    // The route only exports POST, so a GET that gets past the middleware is a 405.
    // (A POST isn't used: it would store and cast a message when no secret is set.)
    check(await status('GET', '/api/webhook/some-secret') === 405, 'GET /api/webhook/:secret passes middleware → 405');

    console.log('\n3. Session cookie grants access');
    const login = await fetch(`${BASE_URL}/api/auth/login`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: AUTH_USER, password: AUTH_PASS }),
    });
    check(login.ok, 'login with real credentials');
    const cookie = (login.headers.get('set-cookie') || '').split(';')[0];
    const auth = { Cookie: cookie };
    for (const p of ['/api/messages?limit=1', '/api/messages/export', '/api/messages/purge',
        '/api/settings/webook', '/api/settings/mute', '/api/settings/api-token', '/api/schedules', '/api/lgtv/pair?ip=192.0.2.1']) {
        check(await status('GET', p, auth) === 200, `GET ${p} → 200 with session`);
    }
    check(await status('GET', '/api/messages/stream', auth) === 200, 'GET /api/messages/stream → 200 with session');
    check(await status('GET', '/api/messages', { Cookie: 'trade_alert_session=forged' }) === 401, 'forged cookie → 401');

    console.log('\n4. Read-only token works only on GET /api/messages');
    const originalTokenRes = await fetch(`${BASE_URL}/api/settings/api-token`, { headers: auth });
    const originalToken = (await originalTokenRes.json()).token;
    let token = originalToken;
    if (!token) {
        token = (await (await fetch(`${BASE_URL}/api/settings/api-token`, { method: 'POST', headers: auth })).json()).token;
    }
    const tok = { 'X-API-Key': token };
    check(await status('GET', '/api/messages?limit=5', tok) === 200, 'GET /api/messages with token → 200');
    check(await status('GET', '/api/messages?limit=5', { 'X-API-Key': 'wrong' }) === 401, 'GET /api/messages with wrong token → 401');
    check(await status('GET', `/api/messages?limit=5&api_key=${token}`) === 401, 'token in query string is ignored → 401');
    for (const [m, p] of PROTECTED.filter(([m, p]) => !(m === 'GET' && p.startsWith('/api/messages?')))) {
        check(await status(m, p, tok) === 401, `${m} ${p} → 401 with read token`);
    }

    // Clean up: if we created a token for the test, revoke it so nothing is left behind.
    if (!originalToken) {
        await fetch(`${BASE_URL}/api/settings/api-token`, { method: 'DELETE', headers: auth });
        check(await status('GET', '/api/messages', tok) === 401, 'revoked token → 401');
    }

    console.log(failures ? `\n--- ${failures} FAILED ---` : '\n--- All Auth Tests Passed ---');
    process.exit(failures ? 1 : 0);
}

main().catch((e) => { console.error(e); process.exit(1); });
