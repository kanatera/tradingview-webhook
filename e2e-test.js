const BASE_URL = process.env.BASE_URL || 'http://localhost:12345';
const AUTH_USER = process.env.AUTH_USER || 'admin';
const AUTH_PASS = process.env.AUTH_PASS || 'admin';

// /api routes require a session (see src/middleware.ts): log in once, then send
// the session cookie on every request.
async function login() {
  const res = await fetch(`${BASE_URL}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: AUTH_USER, password: AUTH_PASS }),
  });
  if (!res.ok) throw new Error(`Login failed: ${res.status}`);
  const cookie = (res.headers.get('set-cookie') || '').split(';')[0];
  const rawFetch = globalThis.fetch;
  globalThis.fetch = (url, opts = {}) =>
    rawFetch(url, { ...opts, headers: { ...(opts.headers || {}), Cookie: cookie } });
}

async function runTests() {
  console.log('--- Starting End-to-End Tests ---');

  try {
    await login();

    // 1. Settings
    console.log('\n1. Testing Settings API...');
    const settingsRes = await fetch(`${BASE_URL}/api/settings/webook`);
    if (!settingsRes.ok) throw new Error(`Settings failed: ${settingsRes.status}`);
    const { secret, publicUrl } = await settingsRes.json();
    console.log('Secret:', secret);
    console.log('Public URL:', publicUrl);
    if (!secret) throw new Error('Secret is missing');

    // 2. Webhook Authentication
    console.log('\n2. Testing Webhook Authentication...');
    const invalidAuthRes = await fetch(`${BASE_URL}/api/webhook/invalid-secret`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text: 'test' })
    });
    if (invalidAuthRes.status === 401) {
      console.log('Correctly received 401 for invalid secret');
    } else {
      throw new Error(`POST to /api/webhook/invalid-secret should have failed with 401, got ${invalidAuthRes.status}`);
    }

    const webhookRes = await fetch(`${BASE_URL}/api/webhook/${secret}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text: 'Test message for E2E' })
    });
    console.log('Webhook POST response status:', webhookRes.status);
    if (!webhookRes.ok) throw new Error(`Webhook failed: ${webhookRes.status}`);
    const webhookData = await webhookRes.json();
    const messageId = webhookData.id;
    console.log('Created Message ID:', messageId);

    // 3. Scheduling & Overlaps
    console.log('\n3. Testing Scheduling & Overlaps...');
    const schedulesRes = await fetch(`${BASE_URL}/api/schedules`);
    const schedulesData = await schedulesRes.json();
    console.log('Fetched current speakers count:', schedulesData.speakers.length);

    const testSpeaker = 'E2E-Tester';
    // Create first schedule
    const s1Res = await fetch(`${BASE_URL}/api/schedules`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        speakerName: testSpeaker,
        dayOfWeek: 1,
        startTime: '10:00',
        endTime: '11:00'
      })
    });
    if (!s1Res.ok) throw new Error(`S1 creation failed: ${s1Res.status}`);
    const s1 = await s1Res.json();
    console.log('Created first test schedule:', s1.id);

    // Attempt overlapping schedule
    const overlapRes = await fetch(`${BASE_URL}/api/schedules`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        speakerName: testSpeaker,
        dayOfWeek: 1,
        startTime: '10:30',
        endTime: '11:30'
      })
    });
    if (overlapRes.status === 400) {
      const overlapData = await overlapRes.json();
      console.log('Correctly received 400 for overlap:', overlapData.error);
    } else {
      throw new Error(`Overlapping schedule should have failed with 400, got ${overlapRes.status}`);
    }

    // Create non-overlapping
    const s2Res = await fetch(`${BASE_URL}/api/schedules`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        speakerName: testSpeaker,
        dayOfWeek: 1,
        startTime: '12:00',
        endTime: '13:00'
      })
    });
    if (!s2Res.ok) throw new Error(`S2 creation failed: ${s2Res.status}`);
    const s2 = await s2Res.json();
    console.log('Created non-overlapping schedule:', s2.id);

    // Delete them
    await fetch(`${BASE_URL}/api/schedules/${s1.id}`, { method: 'DELETE' });
    await fetch(`${BASE_URL}/api/schedules/${s2.id}`, { method: 'DELETE' });
    console.log('Deleted test schedules');

    // 4. Dashboard API
    console.log('\n4. Testing Dashboard API...');
    const messagesRes = await fetch(`${BASE_URL}/api/messages`);
    const messagesData = await messagesRes.json();
    const foundMessage = messagesData.messages.find(m => m.id === messageId);
    if (!foundMessage) throw new Error('Test message not found in /api/messages');
    console.log('Found test message in dashboard');
    if (!messagesData.pagination) throw new Error('Pagination fields missing');
    console.log('Pagination fields present:', Object.keys(messagesData.pagination));

    // 5. Purge & Maintenance
    console.log('\n5. Testing Purge...');
    const purgeRes = await fetch(`${BASE_URL}/api/messages/purge?olderThanDays=0`, { method: 'DELETE' });
    const purgeData = await purgeRes.json();
    console.log('Purge result:', purgeData);
    
    const messagesAfterPurgeRes = await fetch(`${BASE_URL}/api/messages`);
    const messagesAfterPurgeData = await messagesAfterPurgeRes.json();
    console.log('Message count after purge:', messagesAfterPurgeData.messages.length);
    if (messagesAfterPurgeData.messages.length !== 0) throw new Error('Messages not cleared after purge');

    // 6. Export
    console.log('\n6. Testing Export...');
    // Trigger one more webhook
    await fetch(`${BASE_URL}/api/webhook/${secret}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text: 'Message for Export Test' })
    });
    
    const exportRes = await fetch(`${BASE_URL}/api/messages/export`);
    console.log('Export Content-Type:', exportRes.headers.get('content-type'));
    const csvContent = await exportRes.text();
    if (!csvContent.includes('Message for Export Test')) {
       throw new Error('CSV Export does not contain the new message');
    }
    console.log('Export contains the new message');

    console.log('\n--- All Tests Passed Successfully ---');
  } catch (err) {
    console.error('\n--- Test Failed ---');
    console.error(err.message);
    process.exit(1);
  }
}

runTests();
