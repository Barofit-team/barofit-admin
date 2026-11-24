import { createServer } from "node:http";
import { randomBytes } from "node:crypto";
import { readFile } from "node:fs/promises";
import { resolve, extname, sep } from "node:path";

const random = () => randomBytes(32).toString("base64url");
const cookie = (req, key) =>
  (req.headers.cookie ?? "")
    .split(";")
    .map((x) => x.trim())
    .find((x) => x.startsWith(`${key}=`))
    ?.slice(key.length + 1);
class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}
export function createAdminServer({
  origin,
  identityUrl,
  routineUrl,
  production = false,
  fetcher = fetch,
  dist = resolve("dist"),
}) {
  if (
    !origin ||
    new URL(origin).origin !== origin ||
    (production && !origin.startsWith("https://"))
  )
    throw new Error(
      "ADMIN_ORIGIN must be an origin; production requires HTTPS",
    );
  const sessions = new Map();
  const sessionName = production ? "__Host-barofit-admin" : "barofit-admin";
  const cookieValue = (name, value, maxAge) =>
    `${name}=${value}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAge}${production ? "; Secure" : ""}`;
  const timer = setInterval(() => {
    for (const map of [sessions])
      for (const [key, v] of map) if (v.expires < Date.now()) map.delete(key);
  }, 60000);
  timer.unref();
  async function upstream(base, path, options = {}) {
    return fetcher(new URL(path, base), {
      ...options,
      redirect: "error",
      signal: AbortSignal.timeout(10000),
    });
  }
  async function body(req) {
    if (!req.headers["content-type"]?.startsWith("application/json"))
      throw new HttpError(415, "JSON 요청이 필요합니다.");
    let bytes = 0,
      parts = [];
    for await (const part of req) {
      bytes += part.length;
      if (bytes > 262144) throw new HttpError(413, "요청이 너무 큽니다.");
      parts.push(part);
    }
    try {
      return JSON.parse(Buffer.concat(parts).toString());
    } catch {
      throw new HttpError(400, "JSON 형식이 올바르지 않습니다.");
    }
  }
  async function revoke(tokens) {
    try {
      await upstream(identityUrl, "/api/v1/auth/logout", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ refreshToken: tokens.refreshToken }),
      });
    } catch {}
  }
  async function token(session) {
    if (Date.parse(session.accessTokenExpiresAt) > Date.now() + 30000)
      return session.accessToken;
    if (!session.refreshing)
      session.refreshing = (async () => {
        const response = await upstream(identityUrl, "/api/v1/auth/refresh", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ refreshToken: session.refreshToken }),
        });
        if (!response.ok) throw new HttpError(401, "다시 로그인해 주세요.");
        Object.assign(session, await response.json());
      })().finally(() => {
        delete session.refreshing;
      });
    await session.refreshing;
    return session.accessToken;
  }
  const server = createServer(async (req, res) => {
    res.setHeader("Cache-Control", "no-store");
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("Referrer-Policy", "no-referrer");
    res.setHeader("X-Frame-Options", "DENY");
    if (production)
      res.setHeader(
        "Content-Security-Policy",
        "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'",
      );
    const send = (status, data) => {
      res.writeHead(status, {
        "content-type": "application/json; charset=utf-8",
      });
      res.end(JSON.stringify(data));
    };
    try {
      const url = new URL(req.url, origin);
      if (
        !["GET", "HEAD"].includes(req.method) &&
        req.headers.origin !== origin
      )
        throw new HttpError(403, "같은 관리자 사이트에서 요청해 주세요.");
      if (req.method === "GET" && url.pathname === "/healthz")
        return send(200, { status: "ok" });
      if (req.method === "POST" && url.pathname === "/auth/login") {
        const input = await body(req);
        if (
          !input ||
          typeof input.username !== "string" ||
          !/^[a-zA-Z0-9][a-zA-Z0-9._-]{2,63}$/.test(input.username) ||
          typeof input.password !== "string" ||
          !input.password ||
          input.password.length > 64
        )
          throw new HttpError(
            400,
            "아이디 또는 비밀번호 형식을 확인해 주세요.",
          );
        const response = await upstream(
          identityUrl,
          "/api/v1/auth/admin-login",
          {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({
              username: input.username,
              password: input.password,
            }),
          },
        );
        if (!response.ok) {
          const error = await response.json().catch(() => ({}));
          throw new HttpError(
            response.status,
            error.detail ?? "아이디 또는 비밀번호를 확인해 주세요.",
          );
        }
        const tokens = await response.json();
        const admin = await upstream(
          identityUrl,
          "/api/v1/admin/identity/session",
          { headers: { authorization: `Bearer ${tokens.accessToken}` } },
        );
        if (!admin.ok) {
          await revoke(tokens);
          throw new HttpError(403, "승인된 관리자 계정으로 로그인해 주세요.");
        }
        if (sessions.size >= 1000) {
          await revoke(tokens);
          throw new HttpError(503, "로그인 세션 수를 초과했습니다.");
        }
        const previous = cookie(req, sessionName);
        if (sessions.has(previous)) {
          await revoke(sessions.get(previous));
          sessions.delete(previous);
        }
        const member = await admin.json();
        const id = random();
        sessions.set(id, {
          ...tokens,
          adminId: member.id,
          expires: Date.now() + 8 * 3600000,
        });
        res.setHeader("Set-Cookie", cookieValue(sessionName, id, 8 * 3600));
        return send(200, member);
      }
      if (
        url.pathname === "/auth/session" ||
        url.pathname === "/auth/logout" ||
        url.pathname.startsWith("/admin-api/")
      ) {
        const id = cookie(req, sessionName),
          session = sessions.get(id);
        if (!session || session.expires < Date.now()) {
          sessions.delete(id);
          throw new HttpError(401, "관리자 로그인이 필요합니다.");
        }
        if (url.pathname === "/auth/logout" && req.method === "POST") {
          sessions.delete(id);
          await revoke(session);
          res.setHeader("Set-Cookie", cookieValue(sessionName, "", 0));
          return send(200, { ok: true });
        }
        const accessToken = await token(session),
          headers = { authorization: `Bearer ${accessToken}` };
        const admin = await upstream(
          identityUrl,
          "/api/v1/admin/identity/session",
          { headers },
        );
        if (!admin.ok) {
          if ([401, 403].includes(admin.status)) {
            sessions.delete(id);
            await revoke(session);
          }
          throw new HttpError(
            admin.status === 403 ? 403 : admin.status === 401 ? 401 : 502,
            "관리자 권한을 확인하지 못했습니다.",
          );
        }
        if (url.pathname === "/auth/session" && req.method === "GET")
          return send(200, await admin.json());
        const route = url.pathname.slice("/admin-api".length);
        const validGet =
          req.method === "GET" &&
          /^\/(identity\/(summary|members)|routine\/(exercises|templates|history))$/.test(
            route,
          );
        const validPut =
          req.method === "PUT" &&
          (/^\/routine\/(exercises|templates)\/[a-zA-Z0-9-]+$/.test(route) ||
            route === "/identity/password");
        if (!validGet && !validPut)
          throw new HttpError(404, "지원하지 않는 관리 요청입니다.");
        const input = validPut ? await body(req) : undefined;
        const result = await upstream(
          route.startsWith("/identity/") ? identityUrl : routineUrl,
          `/api/v1/admin${route}${url.search}`,
          {
            method: req.method,
            headers: { ...headers, "content-type": "application/json" },
            body: input === undefined ? undefined : JSON.stringify(input),
          },
        );
        if (route === "/identity/password" && result.ok) {
          for (const [sessionId, value] of sessions)
            if (value.adminId === session.adminId) sessions.delete(sessionId);
          await revoke(session);
          res.setHeader("Set-Cookie", cookieValue(sessionName, "", 0));
        }
        res.writeHead(result.status, {
          "content-type": "application/json; charset=utf-8",
        });
        return res.end(await result.text());
      }
      if (req.method !== "GET" && req.method !== "HEAD")
        throw new HttpError(404, "페이지를 찾을 수 없습니다.");
      let file = resolve(dist, `.${decodeURIComponent(url.pathname)}`);
      if (file !== dist && !file.startsWith(dist + sep))
        throw new HttpError(404, "페이지를 찾을 수 없습니다.");
      if (!extname(file)) file = resolve(dist, "index.html");
      const types = {
        ".html": "text/html; charset=utf-8",
        ".js": "application/javascript",
        ".css": "text/css",
        ".svg": "image/svg+xml",
        ".png": "image/png",
      };
      const data = await readFile(file).catch(() => {
        throw new HttpError(404, "페이지를 찾을 수 없습니다.");
      });
      res.writeHead(200, {
        "content-type": types[extname(file)] ?? "application/octet-stream",
      });
      res.end(req.method === "HEAD" ? undefined : data);
    } catch (error) {
      if (res.headersSent) return res.end();
      send(error.status ?? 502, {
        detail: error.status
          ? error.message
          : "서버 연결에 실패했습니다. 잠시 후 다시 시도해 주세요.",
      });
    }
  });
  server.on("close", () => clearInterval(timer));
  server.requestTimeout = 15000;
  server.headersTimeout = 10000;
  return server;
}
