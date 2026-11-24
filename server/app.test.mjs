import { test } from "node:test";
import assert from "node:assert/strict";
import { createAdminServer } from "./app.mjs";
const origin = "http://admin.local";
const json = (value, status = 200) =>
  new Response(JSON.stringify(value), {
    status,
    headers: { "content-type": "application/json" },
  });
async function fixture(
  t,
  { admin = true, expired = false, badPassword = false } = {},
) {
  let revoked = false,
    refreshes = 0,
    puts = 0,
    active = admin;
  const server = createAdminServer({
    origin,
    identityUrl: "http://identity",
    routineUrl: "http://routine",
    fetcher: async (url, options) => {
      if (url.pathname === "/api/v1/auth/admin-login") {
        assert.deepEqual(JSON.parse(options.body), {
          username: "operator",
          password: "test-password-only",
        });
        return badPassword
          ? json({ detail: "아이디 또는 비밀번호를 확인해 주세요." }, 401)
          : json({
              accessToken: "secret-access",
              refreshToken: "secret-refresh",
              accessTokenExpiresAt: expired
                ? "2000-01-01"
                : new Date(Date.now() + 600000).toISOString(),
            });
      }
      if (url.pathname === "/api/v1/auth/refresh") {
        refreshes++;
        await new Promise((r) => setTimeout(r, 15));
        return json({
          accessToken: "new-secret",
          refreshToken: "new-refresh",
          accessTokenExpiresAt: new Date(Date.now() + 600000).toISOString(),
        });
      }
      if (url.pathname === "/api/v1/auth/logout") {
        revoked = true;
        return new Response(null, { status: 204 });
      }
      if (url.pathname === "/api/v1/admin/identity/session")
        return json(
          { id: "admin-id", role: active ? "ADMIN" : "USER" },
          active ? 200 : 403,
        );
      if (options.method === "PUT") puts++;
      return json({ ok: true });
    },
  });
  await new Promise((r) => server.listen(0, "127.0.0.1", r));
  t.after(async () => {
    server.closeAllConnections();
    await new Promise((r) => server.close(r));
  });
  const request = (path, options = {}) =>
    fetch(`http://127.0.0.1:${server.address().port}` + path, {
      redirect: "manual",
      ...options,
    });
  async function login() {
    const response = await request("/auth/login", {
      method: "POST",
      headers: { origin, "content-type": "application/json" },
      body: JSON.stringify({
        username: "operator",
        password: "test-password-only",
      }),
    });
    return {
      response,
      cookie: response.headers
        .getSetCookie()
        .find((c) => c.startsWith("barofit-admin="))
        ?.split(";")[0],
    };
  }
  return {
    request,
    login,
    counts: () => ({ revoked, refreshes, puts }),
    revoke: () => {
      active = false;
    },
  };
}
test("password login returns an opaque HttpOnly cookie and no browser tokens", async (t) => {
  const f = await fixture(t);
  assert.equal((await f.request("/admin-api/routine/exercises")).status, 401);
  const { response, cookie } = await f.login();
  assert.equal(response.status, 200);
  assert(cookie);
  const text = await response.text();
  assert(!text.includes("secret-access"));
  assert(!text.includes("secret-refresh"));
  assert(response.headers.get("set-cookie").includes("HttpOnly"));
  assert.equal(
    (await f.request("/auth/session", { headers: { cookie } })).status,
    200,
  );
});
test("rejects bad credentials without creating a session", async (t) => {
  const f = await fixture(t, { badPassword: true });
  const { response, cookie } = await f.login();
  assert.equal(response.status, 401);
  assert.equal(cookie, undefined);
});
test("blocks cross-origin login and writes and restricts proxy routes", async (t) => {
  const f = await fixture(t);
  assert.equal(
    (
      await f.request("/auth/login", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: "{}",
      })
    ).status,
    403,
  );
  const { cookie } = await f.login();
  assert.equal(
    (
      await f.request("/admin-api/routine/exercises/squat", {
        method: "PUT",
        headers: { cookie, "content-type": "application/json" },
        body: "{}",
      })
    ).status,
    403,
  );
  assert.equal(f.counts().puts, 0);
  assert.equal(
    (
      await f.request("/admin-api/routine/exercises/squat", {
        method: "PUT",
        headers: { cookie, origin, "content-type": "application/json" },
        body: "{}",
      })
    ).status,
    200,
  );
  assert.equal(
    (await f.request("/admin-api/auth/admin-login", { headers: { cookie } }))
      .status,
    404,
  );
  assert.equal(
    (
      await f.request("/admin-api/routine/exercises/squat", {
        method: "PUT",
        headers: { cookie, origin, "content-type": "text/plain" },
        body: "{}",
      })
    ).status,
    415,
  );
});
test("non-admin login revokes tokens and creates no session", async (t) => {
  const f = await fixture(t, { admin: false });
  const { response, cookie } = await f.login();
  assert.equal(response.status, 403);
  assert.equal(cookie, undefined);
  assert(f.counts().revoked);
});
test("rotating refresh is serialized and role revocation removes access", async (t) => {
  const f = await fixture(t, { expired: true });
  const { cookie } = await f.login();
  const results = await Promise.all([
    f.request("/auth/session", { headers: { cookie } }),
    f.request("/auth/session", { headers: { cookie } }),
  ]);
  assert(results.every((r) => r.status === 200));
  assert.equal(f.counts().refreshes, 1);
  f.revoke();
  assert.equal(
    (await f.request("/admin-api/routine/exercises", { headers: { cookie } }))
      .status,
    403,
  );
  assert.equal(
    (await f.request("/auth/session", { headers: { cookie } })).status,
    401,
  );
});
test("logout and password change invalidate local sessions", async (t) => {
  const f = await fixture(t);
  let { cookie } = await f.login();
  const out = await f.request("/auth/logout", {
    method: "POST",
    headers: { cookie, origin },
  });
  assert.equal(out.status, 200);
  assert(f.counts().revoked);
  assert(out.headers.get("set-cookie").includes("Max-Age=0"));
  assert.equal(
    (await f.request("/auth/session", { headers: { cookie } })).status,
    401,
  );
  ({ cookie } = await f.login());
  const otherCookie = (await f.login()).cookie;
  const changed = await f.request("/admin-api/identity/password", {
    method: "PUT",
    headers: { cookie, origin, "content-type": "application/json" },
    body: JSON.stringify({
      currentPassword: "old",
      newPassword: "new-password-test",
    }),
  });
  assert.equal(changed.status, 200);
  assert.equal(
    (await f.request("/auth/session", { headers: { cookie: otherCookie } }))
      .status,
    401,
  );
  assert.equal(
    (await f.request("/auth/session", { headers: { cookie } })).status,
    401,
  );
});
test("production requires HTTPS", () =>
  assert.throws(
    () => createAdminServer({ origin, production: true }),
    /HTTPS/,
  ));
