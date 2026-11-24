export async function api<T>(path: string, body?: unknown): Promise<T> {
  const response = await fetch(path, {
    credentials: "same-origin",
    method: body === undefined ? "GET" : "PUT",
    headers:
      body === undefined ? undefined : { "content-type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    if (response.status === 401)
      window.dispatchEvent(new Event("admin-session-expired"));
    throw new Error(
      data.detail ??
        (response.status === 403
          ? "관리자 권한이 필요합니다."
          : `요청 실패 (${response.status})`),
    );
  }
  return data;
}
