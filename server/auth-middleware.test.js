import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequireApiAuth } from './auth-middleware.js';

function mockResponse() {
  return {
    statusCode: 200,
    payload: null,
    status(code) { this.statusCode = code; return this; },
    json(body) { this.payload = body; return this; }
  };
}

function request(path, { authorization = '', query = {}, body = {} } = {}) {
  return {
    path,
    query,
    body,
    headers: { authorization },
    get(name) { return this.headers[name.toLowerCase()] || ''; }
  };
}

test('deja pasar las sondas públicas sin token', async () => {
  const middleware = createRequireApiAuth({ getUserByToken: async () => null });
  let called = false;
  await middleware(request('/test'), mockResponse(), () => { called = true; });
  assert.equal(called, true);
});

test('rechaza peticiones privadas sin Bearer token', async () => {
  const middleware = createRequireApiAuth({ getUserByToken: async () => null });
  const res = mockResponse();
  await middleware(request('/library'), res, () => assert.fail('no debe continuar'));
  assert.equal(res.statusCode, 401);
});

test('acepta un token válido y adjunta la identidad autenticada', async () => {
  const middleware = createRequireApiAuth({
    getUserByToken: async token => token === 'valid' ? { id: 7, username: 'test', role: 'USER' } : null
  });
  const req = request('/library', { authorization: 'Bearer valid' });
  let called = false;
  await middleware(req, mockResponse(), () => { called = true; });
  assert.equal(called, true);
  assert.equal(req.authUserId, '7');
  assert.equal(req.authUser.username, 'test');
});

test('rechaza userId que no coincide con el token', async () => {
  const middleware = createRequireApiAuth({
    getUserByToken: async () => ({ id: 7, username: 'test' })
  });
  const res = mockResponse();
  await middleware(request('/library', { authorization: 'Bearer valid', query: { userId: '8' } }), res, () => assert.fail('no debe continuar'));
  assert.equal(res.statusCode, 403);
});

test('permite EventSource con token en query y protege la cuenta de ajustes', async () => {
  const middleware = createRequireApiAuth({
    getUserByToken: async token => token === 'valid' ? { id: 7, username: 'test' } : null
  });
  let called = false;
  await middleware(request('/rescan-stream', { query: { token: 'valid' } }), mockResponse(), () => { called = true; });
  assert.equal(called, true);

  const res = mockResponse();
  await middleware(request('/users/8/settings', { authorization: 'Bearer valid' }), res, () => assert.fail('no debe continuar'));
  assert.equal(res.statusCode, 403);
});
