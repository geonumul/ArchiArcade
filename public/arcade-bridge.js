/*
 * window.storage 어댑터.
 *
 * 원본 index.html 은 화면부터 게임 로직까지 전부 자기가 들고 있고, 바깥에는
 * `window.storage` 네 개(get/set/list/delete)만 요구한다. 그래서 화면을 다시 그리는
 * 대신 이 파일 하나로 저장소만 우리 서버에 연결한다 — 원본은 손대지 않는다.
 *
 * 원본이 기대하는 모양:
 *   get(key)    → { value } · 없으면 null
 *   set(key,v)  → 성공하면 resolve, 실패하면 reject (원본이 실패를 화면에 띄운다)
 *   list(prefix)→ { keys: [...] }
 *   delete(key) → resolve
 * 두 번째 인자(true)는 원래 "공용 저장소" 플래그였고 지금은 항상 공용이라 무시한다.
 */
(function () {
  "use strict";

  var BASE = "/api/kv";

  function fail(res) {
    var e = new Error("storage " + res.status);
    e.status = res.status;
    return e;
  }

  async function get(key) {
    var res = await fetch(BASE + "?key=" + encodeURIComponent(key), { cache: "no-store" });
    if (res.status === 404) return null; // 없는 키는 오류가 아니다
    if (!res.ok) throw fail(res);
    return await res.json(); // { key, value }
  }

  async function set(key, value) {
    var res = await fetch(BASE, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ key: key, value: String(value) }),
    });
    if (!res.ok) throw fail(res);
    return await res.json();
  }

  async function list(prefix) {
    var res = await fetch(BASE + "?prefix=" + encodeURIComponent(prefix), { cache: "no-store" });
    if (!res.ok) throw fail(res);
    return await res.json(); // { keys }
  }

  async function del(key) {
    var res = await fetch(BASE + "?key=" + encodeURIComponent(key), { method: "DELETE" });
    if (!res.ok) throw fail(res);
    return await res.json();
  }

  window.storage = { get: get, set: set, list: list, delete: del };
})();
