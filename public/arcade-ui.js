/*
 * 원본에 없던 두 가지 UI 를 붙인다.
 *
 *  1. NOW LOADING — 서버 응답을 기다리는 동안 픽셀 로딩 표시를 띄운다.
 *     동시접속이 몰리면 원본은 아무 표시 없이 멈춰 있는 것처럼 보이는데,
 *     그때 "죽은 화면"이 아니라 "로딩 중"으로 읽히게 하는 것이 목적이다.
 *
 *  2. 선택창 — <select> 드롭다운을 눌러서 고르는 픽셀 버튼으로 바꾼다.
 *     원래 <select> 는 DOM 에 남겨 두고 화면에서만 감춘다. 기존 게임 코드가
 *     전부 select.value 를 읽기 때문에, 그래야 로직을 하나도 고치지 않아도 된다.
 *
 * 새로 생긴 문구(최대 인원 · 정원 초과 · 문항 수 선택지)의 9개 언어도 여기서 채운다.
 * 원본 사전 블록을 직접 건드리면 154문항 정렬 검사와 얽히므로 Object.assign 으로 덧붙인다.
 */
(function () {
  "use strict";

  /* ══ 새 문구 (9개 언어) ══════════════════════════════════════ */

  var STR = {
    ko: {
      loading: "서버와 연결 중...",
      roomFull: "방이 가득 찼어요 - 호스트에게 인원을 늘려달라고 해보세요",
      qnLabel: "문항 수",
      qnOpts: ["10문항 (짧고 굵게)", "20문항 (기본)", "30문항 (풀코스)"],
      capLabel: "최대 인원",
      capOpts: ["10명 (소모임)", "30명 (한 반)", "50명 (설계실 전체)", "100명 (학년 전체)"],
    },
    en: {
      loading: "Connecting to the server...",
      roomFull: "Room is full - ask the host to raise the limit",
      qnLabel: "NUMBER OF QUESTIONS",
      qnOpts: ["10 (short)", "20 (default)", "30 (full course)"],
      capLabel: "MAX PLAYERS",
      capOpts: ["10 (small)", "30 (one class)", "50 (whole studio)", "100 (whole year)"],
    },
    zh: {
      loading: "正在连接服务器...",
      roomFull: "房间已满 - 让房主调高人数上限吧",
      qnLabel: "题目数量",
      qnOpts: ["10题 (速战)", "20题 (默认)", "30题 (全程)"],
      capLabel: "人数上限",
      capOpts: ["10人 (小聚)", "30人 (一个班)", "50人 (整个画室)", "100人 (整个年级)"],
    },
    tw: {
      loading: "正在連線伺服器...",
      roomFull: "房間已滿 - 請房主調高人數上限",
      qnLabel: "題目數量",
      qnOpts: ["10題 (速戰)", "20題 (預設)", "30題 (全程)"],
      capLabel: "人數上限",
      capOpts: ["10人 (小聚)", "30人 (一個班)", "50人 (整個製圖室)", "100人 (整個年級)"],
    },
    ja: {
      loading: "サーバーに接続中...",
      roomFull: "ルームが満員です - ホストに上限を上げてもらいましょう",
      qnLabel: "問題数",
      qnOpts: ["10問 (短期決戦)", "20問 (標準)", "30問 (フルコース)"],
      capLabel: "最大人数",
      capOpts: ["10人 (少人数)", "30人 (1クラス)", "50人 (製図室全体)", "100人 (学年全体)"],
    },
    fr: {
      loading: "Connexion au serveur...",
      roomFull: "Salle pleine - demandez à l'hôte d'augmenter la limite",
      qnLabel: "NOMBRE DE QUESTIONS",
      qnOpts: ["10 (court)", "20 (par défaut)", "30 (complet)"],
      capLabel: "JOUEURS MAX",
      capOpts: ["10 (petit groupe)", "30 (une classe)", "50 (tout l'atelier)", "100 (toute l'année)"],
    },
    it: {
      loading: "Connessione al server...",
      roomFull: "Stanza piena - chiedi all'host di alzare il limite",
      qnLabel: "NUMERO DI DOMANDE",
      qnOpts: ["10 (breve)", "20 (predefinito)", "30 (completo)"],
      capLabel: "GIOCATORI MAX",
      capOpts: ["10 (piccolo gruppo)", "30 (una classe)", "50 (tutta l'aula)", "100 (tutto l'anno)"],
    },
    de: {
      loading: "Verbindung zum Server...",
      roomFull: "Raum ist voll - bitte die Host-Person, das Limit zu erhöhen",
      qnLabel: "ANZAHL DER FRAGEN",
      qnOpts: ["10 (kurz)", "20 (Standard)", "30 (komplett)"],
      capLabel: "MAX. SPIELENDE",
      capOpts: ["10 (kleine Runde)", "30 (ein Kurs)", "50 (ganzer Zeichensaal)", "100 (ganzer Jahrgang)"],
    },
    es: {
      loading: "Conectando con el servidor...",
      roomFull: "La sala está llena - pide al anfitrión que suba el límite",
      qnLabel: "NÚMERO DE PREGUNTAS",
      qnOpts: ["10 (corta)", "20 (por defecto)", "30 (completa)"],
      capLabel: "JUGADORES MÁX.",
      capOpts: ["10 (grupo pequeño)", "30 (una clase)", "50 (todo el taller)", "100 (todo el curso)"],
    },
  };

  function lang() {
    return typeof LANG === "string" && STR[LANG] ? LANG : "ko";
  }

  // 정원 초과 문구는 원본의 err 사전에서 읽히므로 거기에 심어 둔다.
  if (typeof UI === "object" && UI) {
    Object.keys(STR).forEach(function (c) {
      if (UI[c] && UI[c].err) UI[c].err.roomFull = STR[c].roomFull;
    });
  }

  /* ══ 1. NOW LOADING ═════════════════════════════════════════ */

  var box = null;
  var inflight = 0;
  var showTimer = null;
  var shownAt = 0;
  var hideTimer = null;

  // 300ms 안에 끝나는 요청에는 띄우지 않는다. 방은 2초마다 폴링하므로,
  // 빠른 응답까지 표시하면 화면이 계속 깜빡인다.
  var SHOW_AFTER_MS = 300;
  // 한 번 뜨면 최소 이만큼은 유지한다 — 떴다 사라지는 것이 더 거슬린다.
  var MIN_VISIBLE_MS = 500;

  function ensureBox() {
    if (box) return box;
    box = document.createElement("div");
    box.className = "aa-load";
    box.id = "aaLoad";
    box.setAttribute("role", "status");
    box.setAttribute("aria-live", "polite");
    box.innerHTML =
      '<span class="aa-load-txt">NOW LOADING</span>' +
      '<span class="aa-load-bar"><i></i><i></i><i></i><i></i><i></i><i></i></span>' +
      '<span class="aa-load-sub"></span>';
    document.body.appendChild(box);
    return box;
  }

  function paintLoading() {
    if (!box) return;
    box.querySelector(".aa-load-sub").textContent = STR[lang()].loading;
  }

  function showLoading() {
    ensureBox();
    paintLoading();
    if (hideTimer) { clearTimeout(hideTimer); hideTimer = null; }
    if (!box.classList.contains("on")) {
      box.classList.add("on");
      shownAt = Date.now();
    }
  }

  function hideLoading() {
    if (!box || !box.classList.contains("on")) return;
    var left = MIN_VISIBLE_MS - (Date.now() - shownAt);
    if (left > 0) {
      hideTimer = setTimeout(function () { hideTimer = null; hideLoading(); }, left);
      return;
    }
    box.classList.remove("on");
  }

  function begin() {
    inflight++;
    if (inflight === 1 && !showTimer) {
      showTimer = setTimeout(function () { showTimer = null; if (inflight > 0) showLoading(); }, SHOW_AFTER_MS);
    }
  }

  function end() {
    inflight = Math.max(0, inflight - 1);
    if (inflight === 0) {
      if (showTimer) { clearTimeout(showTimer); showTimer = null; }
      hideLoading();
    }
  }

  var rawFetch = window.fetch.bind(window);
  window.fetch = function (input, init) {
    var url = typeof input === "string" ? input : (input && input.url) || "";
    // 우리 서버로 나가는 요청만 센다. 폰트·외부 CDN 까지 세면 첫 화면이 로딩 투성이가 된다.
    if (url.indexOf("/api/") === -1) return rawFetch(input, init);
    begin();
    return rawFetch(input, init).then(
      function (r) { end(); return r; },
      function (e) { end(); throw e; }
    );
  };

  /* ══ 2. 선택창 ═══════════════════════════════════════════════ */

  // "30초 (여유롭게)" → 큰 글씨 "30초" + 작은 글씨 "여유롭게"
  function split(text) {
    var m = String(text).match(/^\s*(.*?)\s*[（(]\s*(.+?)\s*[)）]\s*$/);
    return m ? [m[1], m[2]] : [String(text).trim(), ""];
  }

  var pickers = [];

  function buildPicker(sel, opts) {
    var wrap = document.createElement("div");
    wrap.className = "aa-pick";
    wrap.setAttribute("role", "radiogroup");
    if (sel.id) wrap.setAttribute("aria-labelledby", sel.id + "-label");
    if (opts && opts.wide) wrap.style.gridTemplateColumns = "1fr";

    sel.classList.add("aa-pick-src");
    sel.setAttribute("tabindex", "-1");
    sel.setAttribute("aria-hidden", "true");
    sel.parentNode.insertBefore(wrap, sel.nextSibling);

    var entry = { sel: sel, wrap: wrap };
    pickers.push(entry);
    renderPicker(entry);
    return entry;
  }

  function renderPicker(entry) {
    var sel = entry.sel;
    var wrap = entry.wrap;
    wrap.textContent = "";
    Array.prototype.forEach.call(sel.options, function (op) {
      var parts = split(op.textContent);
      var b = document.createElement("button");
      b.type = "button";
      b.className = "aa-pick-op" + (op.value === sel.value ? " cur" : "");
      b.setAttribute("role", "radio");
      b.setAttribute("aria-checked", op.value === sel.value ? "true" : "false");
      b.innerHTML = "<b></b>" + (parts[1] ? "<i></i>" : "");
      b.querySelector("b").textContent = parts[0];
      if (parts[1]) b.querySelector("i").textContent = parts[1];
      b.addEventListener("click", function () {
        if (sel.value === op.value) return;
        sel.value = op.value;
        sel.dispatchEvent(new Event("change", { bubbles: true }));
        if (typeof sfxNext === "function") sfxNext();
        renderPicker(entry);
      });
      wrap.appendChild(b);
    });
  }

  function repaintPickers() {
    pickers.forEach(renderPicker);
  }

  /* ══ 붙이기 ═════════════════════════════════════════════════ */

  function paintNewLabels() {
    var s = STR[lang()];
    var qn = document.getElementById("hcLabel");
    if (qn) qn.textContent = s.qnLabel;
    var cap = document.getElementById("hcapLabel");
    if (cap) cap.textContent = s.capLabel;

    var qs = document.querySelectorAll("#hostCount option");
    s.qnOpts.forEach(function (t, i) { if (qs[i]) qs[i].textContent = t; });
    var cs = document.querySelectorAll("#hostCap option");
    s.capOpts.forEach(function (t, i) { if (cs[i]) cs[i].textContent = t; });
  }

  function start() {
    ensureBox();

    ["hostTimer", "hostCount", "hostCap"].forEach(function (id) {
      var el = document.getElementById(id);
      if (el) buildPicker(el);
    });
    // 신고 종류는 문장이라 한 줄에 하나씩 놓아야 읽힌다.
    var bg = document.getElementById("bgType");
    if (bg) buildPicker(bg, { wide: true });

    paintNewLabels();
    repaintPickers();

    // 언어를 바꾸면 원본이 <option> 의 글자를 갈아끼운다. 그 뒤에 다시 그려야
    // 선택창에도 반영된다. 원본이 쓰는 확장 방식(감싸기)을 그대로 따른다.
    if (typeof applyLang === "function") {
      var prev = applyLang;
      applyLang = function () {
        prev();
        paintNewLabels();
        repaintPickers();
        paintLoading();
      };
    }
  }

  window.AA = { repaintPickers: repaintPickers, buildPicker: buildPicker };

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", start);
  else start();
})();
