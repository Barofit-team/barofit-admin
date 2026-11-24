import React, { useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import { api } from "./api";
import {
  areas,
  categories,
  levels,
  type Area,
  type Exercise,
  type Template,
  type Member,
  type Summary,
  type History,
  type SetItem,
} from "./types";
import "./style.css";
const date = (value: string | null) =>
  value
    ? new Date(value).toLocaleString("ko-KR", { timeZone: "Asia/Seoul" })
    : "—";
const message = (e: unknown) =>
  e instanceof Error ? e.message : "요청을 처리하지 못했습니다.";
const nav = [
  ["overview", "운영 요약", "◫"],
  ["members", "회원 조회", "◎"],
  ["exercises", "운동 관리", "▤"],
  ["templates", "루틴 관리", "▦"],
  ["history", "변경 이력", "◷"],
] as const;
type Page = (typeof nav)[number][0];
function Badge({ visible }: { visible: boolean }) {
  return (
    <span className={`badge ${visible ? "green" : "gray"}`}>
      {visible ? "공개" : "비공개"}
    </span>
  );
}
function App() {
  const [passwordOpen, setPasswordOpen] = useState(false);
  const [me, setMe] = useState<Member | null>(null),
    [checking, setChecking] = useState(true),
    [page, setPage] = useState<Page>("overview");
  const [exercises, setExercises] = useState<Exercise[]>([]),
    [templates, setTemplates] = useState<Template[]>([]),
    [summary, setSummary] = useState<Summary | null>(null),
    [error, setError] = useState(""),
    [loading, setLoading] = useState(false),
    [updated, setUpdated] = useState(""),
    [dirty, setDirty] = useState(false),
    [refresh, setRefresh] = useState(0);
  useEffect(() => {
    let active = true;
    api<Member>("/auth/session")
      .then((user) => {
        if (active) setMe(user);
      })
      .catch(() => {})
      .finally(() => {
        if (active) setChecking(false);
      });
    const expire = () => {
      setMe(null);
      setDirty(false);
    };
    window.addEventListener("admin-session-expired", expire);
    return () => {
      active = false;
      window.removeEventListener("admin-session-expired", expire);
    };
  }, []);
  useEffect(() => {
    const handle = (e: BeforeUnloadEvent) => {
      if (dirty) {
        e.preventDefault();
        e.returnValue = "";
      }
    };
    window.addEventListener("beforeunload", handle);
    return () => window.removeEventListener("beforeunload", handle);
  }, [dirty]);
  async function load() {
    setLoading(true);
    setError("");
    const results = await Promise.allSettled([
      api<Exercise[]>("/admin-api/routine/exercises"),
      api<Template[]>("/admin-api/routine/templates"),
      api<Summary>("/admin-api/identity/summary"),
    ]);
    if (results[0].status === "fulfilled") setExercises(results[0].value);
    if (results[1].status === "fulfilled") setTemplates(results[1].value);
    if (results[2].status === "fulfilled") setSummary(results[2].value);
    const failed = results.find((r) => r.status === "rejected");
    if (failed?.status === "rejected") setError(message(failed.reason));
    else setUpdated(new Date().toISOString());
    setLoading(false);
  }
  useEffect(() => {
    if (me) void load();
  }, [me, refresh]);
  const confirmLeave = () =>
    !dirty || window.confirm("저장하지 않은 변경을 버릴까요?");
  if (checking)
    return (
      <main className="login">
        <div className="spinner" />
        <p>관리자 권한을 확인하고 있어요.</p>
      </main>
    );
  if (!me)
    return (
      <Login
        error={error}
        onLogin={(user) => {
          setError("");
          setMe(user);
        }}
      />
    );
  return (
    <div className="app">
      <aside className="sidebar">
        <div className="wordmark">
          Barofit<span>ADMIN</span>
        </div>
        <p className="nav-label">WORKSPACE</p>
        <nav>
          {nav.map(([id, label, icon]) => (
            <button
              key={id}
              className={page === id ? "active" : ""}
              onClick={() => {
                if (confirmLeave()) {
                  setDirty(false);
                  setPage(id);
                }
              }}
            >
              <span aria-hidden>{icon}</span>
              {label}
            </button>
          ))}
        </nav>
        <div className="sidebar-bottom">
          <div className="avatar">{me.nickname?.slice(0, 1) ?? "A"}</div>
          <div>
            <strong>{me.nickname ?? "관리자"}</strong>
            <small>관리자 · ADMIN</small>
            <button
              className="password-link"
              onClick={() => setPasswordOpen(true)}
            >
              비밀번호 변경
            </button>
          </div>
          <button
            aria-label="로그아웃"
            onClick={async () => {
              if (!confirmLeave()) return;
              try {
                const r = await fetch("/auth/logout", {
                  method: "POST",
                  credentials: "same-origin",
                });
                if (!r.ok) throw new Error("로그아웃에 실패했습니다.");
                setMe(null);
              } catch (e) {
                setError(message(e));
              }
            }}
          >
            ⏻
          </button>
        </div>
      </aside>
      <div className="workspace">
        <header className="topbar">
          <span>
            바로핏 운영 콘솔 <b>/ {nav.find((n) => n[0] === page)?.[1]}</b>
          </span>
          <span className="timezone">Asia/Seoul</span>
        </header>
        <main className="content">
          {passwordOpen && (
            <PasswordChange
              onClose={() => setPasswordOpen(false)}
              onDone={() => {
                setPasswordOpen(false);
                setMe(null);
              }}
            />
          )}
          <div className="page-heading">
            <div>
              <p className="eyebrow">BAROFIT OPERATIONS</p>
              <h1>{nav.find((n) => n[0] === page)?.[1]}</h1>
              <p>
                {page === "overview"
                  ? "회원부터 운동 콘텐츠까지, 운영 현황을 한눈에 확인하세요."
                  : page === "exercises"
                    ? "종목별 가이드, AI 공개 상태와 불편 부위를 관리하세요."
                    : page === "templates"
                      ? "루틴을 구성하고 사용자에게 보이는 상태를 확인하세요."
                      : page === "members"
                        ? "가입과 온보딩 현황을 확인하고 회원을 검색하세요."
                        : "누가 어떤 콘텐츠를 수정했는지 확인하세요."}
              </p>
            </div>
            <button
              className="button"
              disabled={loading}
              onClick={() => {
                if (confirmLeave()) {
                  setDirty(false);
                  setRefresh((v) => v + 1);
                }
              }}
            >
              {loading ? "불러오는 중…" : "새로고침"}
            </button>
          </div>
          {error && (
            <div role="alert" className="alert">
              {error}
            </div>
          )}
          {loading && (
            <div role="status" className="loading-line">
              데이터를 불러오고 있습니다.
            </div>
          )}
          {page === "overview" && (
            <>
              <div className="stats">
                <Stat
                  label="전체 회원"
                  value={summary?.total}
                  sub={`오늘 가입 ${summary?.joinedToday ?? "—"}명`}
                />
                <Stat
                  label="온보딩 완료율"
                  value={
                    summary
                      ? `${summary.active ? Math.round((summary.onboarded / summary.active) * 100) : 0}%`
                      : undefined
                  }
                  sub={`활성 회원 ${summary?.active ?? "—"}명 기준`}
                />
                <Stat
                  label="공개 운동"
                  value={
                    updated
                      ? `${exercises.filter((e) => e.visible).length} / ${exercises.length}`
                      : undefined
                  }
                  sub="활성 상태 + AI 검증 완료"
                />
                <Stat
                  label="공개 루틴"
                  value={
                    updated
                      ? `${templates.filter((t) => t.visible).length} / ${templates.length}`
                      : undefined
                  }
                  sub="모든 종목이 공개 대상인 루틴"
                />
              </div>
              <div className="overview-grid">
                <section className="panel">
                  <div className="panel-title">
                    <h2>콘텐츠 운영 현황</h2>
                    <span className="pill">실시간 조회</span>
                  </div>
                  <div className="status-row">
                    <span>AI 검증 대기 종목</span>
                    <strong>
                      {
                        exercises.filter((e) => e.assessmentStatus !== "READY")
                          .length
                      }
                      <small>개</small>
                    </strong>
                  </div>
                  <div className="status-row">
                    <span>불편 부위 매핑 필요</span>
                    <strong>
                      {
                        exercises.filter((e) => !e.discomfortAreas.length)
                          .length
                      }
                      <small>개</small>
                    </strong>
                  </div>
                  <div className="status-row">
                    <span>사용자 비공개 루틴</span>
                    <strong>
                      {templates.filter((t) => !t.visible).length}
                      <small>개</small>
                    </strong>
                  </div>
                  <button
                    className="button"
                    onClick={() => setPage("exercises")}
                  >
                    운동 콘텐츠 관리
                  </button>
                </section>
                <section className="panel blue-panel">
                  <div className="pill">추천 운영 정책</div>
                  <h2>
                    불편 부위는
                    <br />
                    추천에만 반영해요.
                  </h2>
                  <p>
                    선택한 불편 부위를 사용하는 종목이 전체의 <b>50% 이상</b>
                    이면 오늘의 추천에서 제외됩니다.
                  </p>
                  <p>
                    직접 선택 목록에는 계속 노출됩니다. 여러 부위에 겹치는
                    종목도 한 번만 계산합니다.
                  </p>
                  <button
                    className="button"
                    onClick={() => setPage("templates")}
                  >
                    루틴 구성 확인
                  </button>
                </section>
              </div>
              <section className="panel">
                <h2>확인이 필요한 루틴</h2>
                {templates
                  .filter((t) => !t.visible)
                  .slice(0, 5)
                  .map((t) => (
                    <div className="review-row" key={t.detail.id}>
                      <strong>{t.detail.name}</strong>
                      <span>{t.hiddenReasons.join(" · ")}</span>
                      <Badge visible={false} />
                    </div>
                  ))}
                {templates.length > 0 && templates.every((t) => t.visible) && (
                  <p className="empty">모든 루틴이 공개 조건을 충족합니다.</p>
                )}
              </section>
            </>
          )}
          {page === "members" && <Members refresh={refresh} />}
          {page === "exercises" && (
            <Exercises
              data={exercises}
              templates={templates}
              onDirty={setDirty}
              confirmLeave={confirmLeave}
              onSaved={() => {
                setDirty(false);
                void load();
              }}
            />
          )}
          {page === "templates" && (
            <Templates
              data={templates}
              exercises={exercises}
              onDirty={setDirty}
              confirmLeave={confirmLeave}
              onSaved={() => {
                setDirty(false);
                void load();
              }}
            />
          )}
          {page === "history" && <HistoryPage refresh={refresh} />}
          <footer>
            Barofit Admin{" "}
            <span>
              {updated
                ? `마지막 조회 ${date(updated)}`
                : "서버 데이터 조회 대기"}
            </span>
          </footer>
        </main>
      </div>
    </div>
  );
}
function Login({
  error: parentError,
  onLogin,
}: {
  error: string;
  onLogin: (user: Member) => void;
}) {
  const [username, setUsername] = useState(""),
    [password, setPassword] = useState(""),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  return (
    <main className="login">
      <div className="login-card">
        <div className="wordmark">
          Barofit<span>ADMIN</span>
        </div>
        <div className="login-icon">B</div>
        <h1>
          더 나은 운동 경험을
          <br />
          만드는 공간
        </h1>
        <p>관리자 계정으로 로그인하세요.</p>
        <form
          onSubmit={async (e) => {
            e.preventDefault();
            setBusy(true);
            setError("");
            try {
              const response = await fetch("/auth/login", {
                method: "POST",
                credentials: "same-origin",
                headers: { "content-type": "application/json" },
                body: JSON.stringify({ username, password }),
              });
              const result = await response.json();
              if (!response.ok)
                throw new Error(result.detail ?? "로그인에 실패했습니다.");
              setPassword("");
              onLogin(result);
            } catch (e) {
              setError(message(e));
            } finally {
              setBusy(false);
            }
          }}
        >
          <Field label="관리자 아이디">
            <input
              required
              autoComplete="username"
              minLength={3}
              maxLength={64}
              pattern="[a-zA-Z0-9][a-zA-Z0-9._-]{2,63}"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
            />
          </Field>
          <Field label="비밀번호">
            <input
              type="password"
              required
              autoComplete="current-password"
              maxLength={64}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </Field>
          {(error || parentError) && (
            <div role="alert" className="alert">
              {error || parentError}
            </div>
          )}
          <button className="button primary" disabled={busy}>
            {busy ? "로그인 중…" : "로그인"}
          </button>
        </form>
        <small>승인된 관리자만 접근할 수 있습니다.</small>
      </div>
      <p className="login-footer">Barofit Operations Console</p>
    </main>
  );
}
function PasswordChange({
  onClose,
  onDone,
}: {
  onClose: () => void;
  onDone: () => void;
}) {
  const [current, setCurrent] = useState(""),
    [next, setNext] = useState(""),
    [confirm, setConfirm] = useState(""),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  return (
    <div className="modal-backdrop">
      <section
        className="panel modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="password-title"
      >
        <div className="panel-title">
          <h2 id="password-title">관리자 비밀번호 변경</h2>
          <button className="button" onClick={onClose} disabled={busy}>
            닫기
          </button>
        </div>
        <p className="muted">
          변경하면 모든 로그인 세션이 종료됩니다. 새 비밀번호로 다시 로그인해
          주세요.
        </p>
        <form
          onSubmit={async (e) => {
            e.preventDefault();
            if (next !== confirm) {
              setError("새 비밀번호가 일치하지 않습니다.");
              return;
            }
            setBusy(true);
            setError("");
            try {
              await api("/admin-api/identity/password", {
                currentPassword: current,
                newPassword: next,
              });
              setCurrent("");
              setNext("");
              setConfirm("");
              onDone();
            } catch (e) {
              setError(message(e));
            } finally {
              setBusy(false);
            }
          }}
        >
          <Field label="현재 비밀번호">
            <input
              type="password"
              autoComplete="current-password"
              required
              maxLength={64}
              value={current}
              onChange={(e) => setCurrent(e.target.value)}
            />
          </Field>
          <Field label="새 비밀번호">
            <input
              type="password"
              autoComplete="new-password"
              required
              minLength={12}
              maxLength={64}
              value={next}
              onChange={(e) => setNext(e.target.value)}
            />
          </Field>
          <Field label="새 비밀번호 확인">
            <input
              type="password"
              autoComplete="new-password"
              required
              minLength={12}
              maxLength={64}
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
            />
          </Field>
          {error && (
            <div role="alert" className="alert">
              {error}
            </div>
          )}
          <button className="button primary save" disabled={busy}>
            {busy ? "변경 중…" : "비밀번호 변경 후 다시 로그인"}
          </button>
        </form>
      </section>
    </div>
  );
}
function Stat({
  label,
  value,
  sub,
}: {
  label: string;
  value?: number | string;
  sub: string;
}) {
  return (
    <section className="stat">
      <p>{label}</p>
      <strong>{value ?? "—"}</strong>
      <small>{sub}</small>
    </section>
  );
}
function Members({ refresh }: { refresh: number }) {
  const [query, setQuery] = useState(""),
    [search, setSearch] = useState(""),
    [page, setPage] = useState(0),
    [data, setData] = useState<{
      items: Member[];
      total: number;
      totalPages: number;
    } | null>(null),
    [error, setError] = useState(""),
    [loading, setLoading] = useState(false);
  useEffect(() => {
    let active = true;
    setLoading(true);
    setError("");
    api<typeof data>(
      `/admin-api/identity/members?query=${encodeURIComponent(search)}&page=${page}&size=20`,
    )
      .then((d) => {
        if (active) setData(d);
      })
      .catch((e) => {
        if (active) setError(message(e));
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [search, page, refresh]);
  return (
    <section className="panel">
      <form
        className="toolbar"
        onSubmit={(e) => {
          e.preventDefault();
          setPage(0);
          setSearch(query);
        }}
      >
        <input
          aria-label="회원 닉네임 검색"
          placeholder="닉네임으로 회원 검색"
          value={query}
          maxLength={100}
          onChange={(e) => setQuery(e.target.value)}
        />
        <button className="button primary">검색</button>
        <span>{data ? `전체 ${data.total}명` : ""}</span>
      </form>
      {error && (
        <div className="alert" role="alert">
          {error}
        </div>
      )}
      {loading ? (
        <p role="status">회원 조회 중…</p>
      ) : (
        <>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>회원</th>
                  <th>상태</th>
                  <th>온보딩</th>
                  <th>가입일</th>
                  <th>최근 로그인</th>
                </tr>
              </thead>
              <tbody>
                {data?.items.map((u) => (
                  <tr key={u.id}>
                    <td>
                      <strong>{u.nickname ?? "닉네임 없음"}</strong>
                      <small>{u.id}</small>
                    </td>
                    <td>
                      <span className="badge gray">
                        {u.status === "ACTIVE" ? "활성" : "탈퇴"}
                      </span>
                      {u.role === "ADMIN" && (
                        <span className="badge blue">관리자</span>
                      )}
                    </td>
                    <td>{u.onboarded ? "완료" : "진행 전"}</td>
                    <td>{date(u.createdAt)}</td>
                    <td>{date(u.lastLoginAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {data?.items.length === 0 && (
            <p className="empty">검색 결과가 없습니다.</p>
          )}
          <div className="pagination">
            <button
              className="button"
              disabled={page === 0}
              onClick={() => setPage((p) => p - 1)}
            >
              이전
            </button>
            <span>
              {page + 1} / {Math.max(1, data?.totalPages ?? 1)}
            </span>
            <button
              className="button"
              disabled={!data || page + 1 >= data.totalPages}
              onClick={() => setPage((p) => p + 1)}
            >
              다음
            </button>
          </div>
        </>
      )}
    </section>
  );
}
type EditorProps = {
  onDirty: (dirty: boolean) => void;
  confirmLeave: () => boolean;
  onSaved: () => void;
};
function Exercises({
  data,
  templates,
  onDirty,
  confirmLeave,
  onSaved,
}: EditorProps & { data: Exercise[]; templates: Template[] }) {
  const [query, setQuery] = useState(""),
    [filter, setFilter] = useState("all"),
    [selected, setSelected] = useState<string | null>(null);
  const current = data.find((e) => e.id === selected);
  const list = data.filter(
    (e) =>
      (e.name + e.id).toLowerCase().includes(query.toLowerCase()) &&
      (filter === "all" || (filter === "visible" ? e.visible : !e.visible)),
  );
  return (
    <div className="split">
      <section className="panel">
        <div className="toolbar">
          <input
            aria-label="운동 검색"
            placeholder="운동 이름 검색"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
          <select
            aria-label="공개 상태 필터"
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
          >
            <option value="all">전체 {data.length}개</option>
            <option value="visible">공개</option>
            <option value="hidden">비공개</option>
          </select>
        </div>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>운동 종목</th>
                <th>분류</th>
                <th>공개 상태</th>
              </tr>
            </thead>
            <tbody>
              {list.map((e) => (
                <tr key={e.id} className={selected === e.id ? "selected" : ""}>
                  <td>
                    <button
                      className="text-button"
                      onClick={() => {
                        if (confirmLeave()) {
                          onDirty(false);
                          setSelected(e.id);
                        }
                      }}
                    >
                      {e.name}
                    </button>
                    <small>{e.id}</small>
                  </td>
                  <td>{categories[e.category]}</td>
                  <td>
                    <Badge visible={e.visible} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {!list.length && <p className="empty">표시할 운동이 없습니다.</p>}
      </section>
      {current ? (
        <ExerciseEditor
          key={`${current.id}-${current.version}`}
          item={current}
          templates={templates}
          onDirty={onDirty}
          onSaved={onSaved}
        />
      ) : (
        <section className="panel placeholder">
          <div>▤</div>
          <h2>운동을 선택하세요</h2>
          <p>가이드와 공개 상태를 편집할 수 있어요.</p>
        </section>
      )}
    </div>
  );
}
function ExerciseEditor({
  item,
  templates,
  onDirty,
  onSaved,
}: {
  item: Exercise;
  templates: Template[];
  onDirty: (d: boolean) => void;
  onSaved: () => void;
}) {
  const [draft, setDraft] = useState(item),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [success, setSuccess] = useState("");
  const patch = (next: Partial<Exercise>) => {
    setDraft((d) => ({ ...d, ...next }));
    setSuccess("");
    onDirty(true);
  };
  const linked = templates.filter((t) =>
    t.detail.exercises.some((e) => e.exerciseId === item.id),
  );
  return (
    <section className="panel editor">
      <div className="panel-title">
        <h2>{item.name}</h2>
        <Badge visible={draft.active && draft.assessmentStatus === "READY"} />
      </div>
      <p className="muted">변경 내용은 저장 후 사용자 화면에 반영됩니다.</p>
      <form
        onSubmit={async (e) => {
          e.preventDefault();
          if (
            !window.confirm(
              `${draft.name}의 변경을 저장할까요? 이 종목을 사용하는 루틴 ${linked.length}개의 공개·추천 결과에 영향을 줄 수 있습니다.`,
            )
          )
            return;
          setBusy(true);
          setError("");
          try {
            await api(`/admin-api/routine/exercises/${item.id}`, {
              version: draft.version,
              name: draft.name,
              description: draft.description,
              preparation: draft.preparation,
              instructions: draft.instructions,
              precautions: draft.precautions,
              introTtsText: draft.introTtsText,
              assessmentStatus: draft.assessmentStatus,
              active: draft.active,
              discomfortAreas: draft.discomfortAreas,
            });
            setSuccess("변경 내용을 저장했습니다.");
            onSaved();
          } catch (e) {
            setError(message(e));
          } finally {
            setBusy(false);
          }
        }}
      >
        <Field label="종목 이름">
          <input
            required
            maxLength={100}
            value={draft.name}
            onChange={(e) => patch({ name: e.target.value })}
          />
        </Field>
        <div className="form-grid">
          <Field label="AI 검증 상태">
            <select
              value={draft.assessmentStatus}
              onChange={(e) => patch({ assessmentStatus: e.target.value })}
            >
              {["READY", "IN_PROGRESS", "PLANNED"].map((s) => (
                <option key={s} value={s}>
                  {s === "READY"
                    ? "검증 완료 · READY"
                    : s === "PLANNED"
                      ? "검증 대기 · PLANNED"
                      : s}
                </option>
              ))}
            </select>
          </Field>
          <Field label="운영 상태">
            <select
              value={String(draft.active)}
              onChange={(e) => patch({ active: e.target.value === "true" })}
            >
              <option value="true">활성</option>
              <option value="false">비활성</option>
            </select>
          </Field>
        </div>
        <fieldset>
          <legend>
            불편 부위 매핑 <span>복수 선택</span>
          </legend>
          <div className="checkbox-grid">
            {(Object.keys(areas) as Area[]).map((area) => (
              <label key={area}>
                <input
                  type="checkbox"
                  checked={draft.discomfortAreas.includes(area)}
                  onChange={(e) =>
                    patch({
                      discomfortAreas: e.target.checked
                        ? [...draft.discomfortAreas, area]
                        : draft.discomfortAreas.filter((v) => v !== area),
                    })
                  }
                />
                {areas[area]}
              </label>
            ))}
          </div>
          <small>
            주요 사용·지지 부위를 선택하세요. 최소 1개가 필요합니다.
          </small>
        </fieldset>
        {(
          [
            "description",
            "preparation",
            "instructions",
            "precautions",
            "introTtsText",
          ] as const
        ).map((key, i) => (
          <Field
            key={key}
            label={
              [
                "운동 설명",
                "준비 자세",
                "수행 방법",
                "주의사항",
                "시작 전 TTS 안내",
              ][i]
            }
          >
            <textarea
              required
              maxLength={10000}
              rows={3}
              value={draft[key]}
              onChange={(e) => patch({ [key]: e.target.value })}
            />
          </Field>
        ))}
        <div className="notice">
          연결된 루틴 {linked.length}개:{" "}
          {linked.map((t) => t.detail.name).join(", ") || "없음"}
        </div>
        {error && (
          <div role="alert" className="alert">
            {error}
          </div>
        )}
        {success && (
          <p role="status" className="success">
            {success}
          </p>
        )}
        <button
          className="button primary save"
          disabled={busy || !draft.discomfortAreas.length}
        >
          {busy ? "저장 중…" : "변경 저장"}
        </button>
      </form>
    </section>
  );
}
function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  const id = React.useId();
  return (
    <div className="field">
      <label htmlFor={id}>{label}</label>
      {React.cloneElement(children as React.ReactElement<{ id?: string }>, {
        id,
      })}
    </div>
  );
}
function Templates({
  data,
  exercises,
  onDirty,
  confirmLeave,
  onSaved,
}: EditorProps & { data: Template[]; exercises: Exercise[] }) {
  const [selected, setSelected] = useState<string | null>(null),
    [query, setQuery] = useState("");
  const current = data.find((t) => t.detail.id === selected);
  return (
    <div className="split">
      <section className="panel">
        <div className="toolbar">
          <input
            aria-label="루틴 검색"
            placeholder="루틴 이름 검색"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
          <span>{data.length}개</span>
        </div>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>루틴</th>
                <th>난이도</th>
                <th>상태</th>
              </tr>
            </thead>
            <tbody>
              {data
                .filter((t) => t.detail.name.includes(query))
                .map((t) => (
                  <tr
                    key={t.detail.id}
                    className={selected === t.detail.id ? "selected" : ""}
                  >
                    <td>
                      <button
                        className="text-button"
                        onClick={() => {
                          if (confirmLeave()) {
                            onDirty(false);
                            setSelected(t.detail.id);
                          }
                        }}
                      >
                        {t.detail.name}
                      </button>
                      <small>
                        {categories[t.detail.category]} ·{" "}
                        {t.detail.exercises.length}종목
                      </small>
                    </td>
                    <td>{levels[t.detail.difficulty]}</td>
                    <td>
                      <Badge visible={t.visible} />
                    </td>
                  </tr>
                ))}
            </tbody>
          </table>
        </div>
      </section>
      {current ? (
        <TemplateEditor
          key={`${current.detail.id}-${current.version}`}
          item={current}
          catalog={exercises}
          onDirty={onDirty}
          onSaved={onSaved}
        />
      ) : (
        <section className="panel placeholder">
          <div>▦</div>
          <h2>루틴을 선택하세요</h2>
          <p>종목 구성과 세트별 목표를 편집할 수 있어요.</p>
        </section>
      )}
    </div>
  );
}
function TemplateEditor({
  item,
  catalog,
  onDirty,
  onSaved,
}: {
  item: Template;
  catalog: Exercise[];
  onDirty: (d: boolean) => void;
  onSaved: () => void;
}) {
  const [draft, setDraft] = useState({ ...item.detail, version: item.version }),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [selectedAreas, setSelectedAreas] = useState<Area[]>([]);
  const change = (next: Partial<typeof draft>) => {
    setDraft((d) => ({ ...d, ...next }));
    onDirty(true);
  };
  const move = (i: number, delta: number) => {
    const list = [...draft.exercises];
    [list[i], list[i + delta]] = [list[i + delta], list[i]];
    change({ exercises: list });
  };
  const patchSet = (i: number, j: number, next: Partial<SetItem>) =>
    change({
      exercises: draft.exercises.map((e, index) =>
        index === i
          ? {
              ...e,
              sets: e.sets.map((s, n) => (n === j ? { ...s, ...next } : s)),
            }
          : e,
      ),
    });
  const visible =
    draft.exercises.length > 0 &&
    draft.exercises.every(
      (e) =>
        catalog.find((c) => c.id === e.exerciseId)?.visible &&
        e.sets.length > 0,
    );
  const unmapped = draft.exercises.some(
    (e) => !catalog.find((c) => c.id === e.exerciseId)?.discomfortAreas.length,
  );
  const affected = draft.exercises.filter((e) =>
    catalog
      .find((c) => c.id === e.exerciseId)
      ?.discomfortAreas.some((a) => selectedAreas.includes(a)),
  ).length;
  return (
    <section className="panel editor">
      <div className="panel-title">
        <h2>루틴 편집</h2>
        <Badge visible={visible} />
      </div>
      <form
        onSubmit={async (e) => {
          e.preventDefault();
          if (
            !window.confirm(
              "루틴 템플릿의 구성을 저장할까요? 이후 선택하는 사용자에게 적용됩니다.",
            )
          )
            return;
          setBusy(true);
          setError("");
          try {
            await api(`/admin-api/routine/templates/${item.detail.id}`, {
              version: draft.version,
              name: draft.name,
              description: draft.description,
              difficulty: draft.difficulty,
              category: draft.category,
              exercises: draft.exercises.map((e) => ({
                exerciseId: e.exerciseId,
                sets: e.sets.map((s) => ({
                  targetReps: s.targetReps,
                  targetDurationSeconds: s.targetDurationSeconds,
                  weightKg: s.weightKg,
                  restSeconds: s.restSeconds,
                })),
              })),
            });
            onSaved();
          } catch (e) {
            setError(message(e));
          } finally {
            setBusy(false);
          }
        }}
      >
        <Field label="루틴 이름">
          <input
            required
            maxLength={100}
            value={draft.name}
            onChange={(e) => change({ name: e.target.value })}
          />
        </Field>
        <Field label="루틴 설명">
          <textarea
            required
            maxLength={10000}
            value={draft.description}
            onChange={(e) => change({ description: e.target.value })}
          />
        </Field>
        <div className="form-grid">
          <Field label="분류">
            <select
              value={draft.category}
              onChange={(e) => change({ category: e.target.value })}
            >
              {Object.entries(categories).map(([v, n]) => (
                <option key={v} value={v}>
                  {n}
                </option>
              ))}
            </select>
          </Field>
          <Field label="난이도">
            <select
              value={draft.difficulty}
              onChange={(e) => change({ difficulty: e.target.value })}
            >
              {Object.entries(levels).map(([v, n]) => (
                <option key={v} value={v}>
                  {n}
                </option>
              ))}
            </select>
          </Field>
        </div>
        <h3>종목 구성 · {draft.exercises.length}개</h3>
        {draft.exercises.map((e, i) => {
          const exercise = catalog.find((c) => c.id === e.exerciseId);
          return (
            <div className="exercise-block" key={`${e.exerciseId}-${i}`}>
              <div className="panel-title">
                <strong>
                  {i + 1}. {e.name}
                </strong>
                <div className="row-actions">
                  <button
                    type="button"
                    disabled={i === 0}
                    onClick={() => move(i, -1)}
                    aria-label={`${e.name} 위로`}
                  >
                    위로
                  </button>
                  <button
                    type="button"
                    disabled={i === draft.exercises.length - 1}
                    onClick={() => move(i, 1)}
                    aria-label={`${e.name} 아래로`}
                  >
                    아래로
                  </button>
                  <button
                    type="button"
                    onClick={() =>
                      change({
                        exercises: draft.exercises.filter((_, n) => n !== i),
                      })
                    }
                  >
                    삭제
                  </button>
                </div>
              </div>
              {!exercise?.visible && (
                <small className="warning">
                  이 종목이 비공개여서 루틴도 사용자에게 노출되지 않습니다.
                </small>
              )}
              {e.sets.map((s, j) => (
                <div className="set-row" key={j}>
                  <span>{j + 1}세트</span>
                  <Field
                    label={
                      exercise?.measurementType === "DURATION"
                        ? "시간(초)"
                        : "횟수"
                    }
                  >
                    <input
                      aria-label={`${e.name} ${j + 1}세트 목표`}
                      type="number"
                      min={1}
                      max={
                        exercise?.measurementType === "DURATION" ? 3600 : 1000
                      }
                      required
                      value={s.targetReps ?? s.targetDurationSeconds ?? ""}
                      onChange={(event) =>
                        patchSet(
                          i,
                          j,
                          exercise?.measurementType === "DURATION"
                            ? {
                                targetDurationSeconds: Number(
                                  event.target.value,
                                ),
                                targetReps: null,
                              }
                            : {
                                targetReps: Number(event.target.value),
                                targetDurationSeconds: null,
                              },
                        )
                      }
                    />
                  </Field>
                  <Field label="중량(kg)">
                    <input
                      aria-label={`${e.name} ${j + 1}세트 중량`}
                      type="number"
                      min={0}
                      max={9999.99}
                      step="0.01"
                      required
                      value={s.weightKg}
                      onChange={(event) =>
                        patchSet(i, j, { weightKg: Number(event.target.value) })
                      }
                    />
                  </Field>
                  <Field label="휴식(초)">
                    <input
                      aria-label={`${e.name} ${j + 1}세트 휴식`}
                      type="number"
                      min={0}
                      max={600}
                      required
                      value={s.restSeconds}
                      onChange={(event) =>
                        patchSet(i, j, {
                          restSeconds: Number(event.target.value),
                        })
                      }
                    />
                  </Field>
                  <button
                    aria-label={`${e.name} ${j + 1}세트 삭제`}
                    type="button"
                    disabled={e.sets.length <= 1}
                    onClick={() =>
                      change({
                        exercises: draft.exercises.map((v, n) =>
                          n === i
                            ? { ...v, sets: v.sets.filter((_, k) => k !== j) }
                            : v,
                        ),
                      })
                    }
                  >
                    ×
                  </button>
                </div>
              ))}
              <button
                className="button small"
                type="button"
                disabled={e.sets.length >= 10}
                onClick={() =>
                  change({
                    exercises: draft.exercises.map((v, n) =>
                      n === i
                        ? {
                            ...v,
                            sets: [...v.sets, { ...v.sets[v.sets.length - 1] }],
                          }
                        : v,
                    ),
                  })
                }
              >
                세트 추가
              </button>
            </div>
          );
        })}
        <Field label="종목 추가">
          <select
            value=""
            disabled={draft.exercises.length >= 30}
            onChange={(e) => {
              const entry = catalog.find((c) => c.id === e.target.value);
              if (!entry) return;
              change({
                exercises: [
                  ...draft.exercises,
                  {
                    exerciseId: entry.id,
                    name: entry.name,
                    sets: [
                      {
                        targetReps:
                          entry.measurementType === "REPS" ? 10 : null,
                        targetDurationSeconds:
                          entry.measurementType === "DURATION" ? 30 : null,
                        weightKg: 0,
                        restSeconds: 60,
                      },
                    ],
                  },
                ],
              });
            }}
          >
            <option value="">추가할 운동을 선택하세요</option>
            {catalog
              .filter(
                (c) => !draft.exercises.some((e) => e.exerciseId === c.id),
              )
              .map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                  {c.visible ? "" : " · 비공개"}
                </option>
              ))}
          </select>
        </Field>
        <fieldset>
          <legend>추천 비율 미리보기</legend>
          <div className="checkbox-grid">
            {(Object.keys(areas) as Area[]).map((a) => (
              <label key={a}>
                <input
                  type="checkbox"
                  checked={selectedAreas.includes(a)}
                  onChange={(e) =>
                    setSelectedAreas(
                      e.target.checked
                        ? [...selectedAreas, a]
                        : selectedAreas.filter((v) => v !== a),
                    )
                  }
                />
                {areas[a]}
              </label>
            ))}
          </div>
          <div className="notice">
            {!visible
              ? "비공개 루틴은 오늘의 추천과 직접 선택 목록에 표시되지 않습니다."
              : selectedAreas.length === 0
                ? "불편 부위를 선택하면 추천 제외 비율을 확인할 수 있습니다."
                : unmapped
                  ? "부위 매핑이 없는 종목이 있어 불편 부위를 선택한 사용자의 추천에서 제외됩니다."
                  : `${affected} / ${draft.exercises.length}종목 (${Math.round((affected / Math.max(1, draft.exercises.length)) * 100)}%) · ${affected * 2 >= draft.exercises.length ? "오늘의 추천 제외 · 직접 선택 가능" : "불편 부위 비율 조건 통과"}`}
          </div>
          <small>
            이 화면은 비율만 확인합니다. 실제 추천은 목표·경력·빈도도
            반영합니다.
          </small>
        </fieldset>
        {!visible && (
          <div className="notice">
            비공개 종목 또는 빈 구성을 먼저 확인하세요.
          </div>
        )}
        {error && (
          <div role="alert" className="alert">
            {error}
          </div>
        )}
        <button
          className="button primary save"
          disabled={busy || !draft.exercises.length}
        >
          {busy ? "저장 중…" : "루틴 변경 저장"}
        </button>
      </form>
    </section>
  );
}
function HistoryPage({ refresh }: { refresh: number }) {
  const [data, setData] = useState<History[]>([]),
    [error, setError] = useState("");
  useEffect(() => {
    let active = true;
    api<History[]>("/admin-api/routine/history")
      .then((d) => {
        if (active) {
          setData(d);
          setError("");
        }
      })
      .catch((e) => {
        if (active) setError(message(e));
      });
    return () => {
      active = false;
    };
  }, [refresh]);
  return (
    <section className="panel">
      <h2>최근 콘텐츠 변경 50건</h2>
      {error && (
        <div className="alert" role="alert">
          {error}
        </div>
      )}
      {data.map((h) => (
        <details key={h.id} className="history-item">
          <summary>
            <span className="badge blue">
              {h.resourceType === "EXERCISE" ? "운동" : "루틴"}
            </span>
            <strong>{h.resourceId}</strong>
            <time>{date(h.createdAt)}</time>
          </summary>
          <p className="muted">수정자 {h.actorId}</p>
          <div className="form-grid">
            <div>
              <h3>변경 전</h3>
              <pre>{pretty(h.beforeState)}</pre>
            </div>
            <div>
              <h3>변경 후</h3>
              <pre>{pretty(h.afterState)}</pre>
            </div>
          </div>
        </details>
      ))}
      {!data.length && !error && (
        <p className="empty">아직 변경 이력이 없습니다.</p>
      )}
    </section>
  );
}
function pretty(value: string) {
  try {
    return JSON.stringify(JSON.parse(value), null, 2);
  } catch {
    return value;
  }
}
createRoot(document.getElementById("root")!).render(<App />);
