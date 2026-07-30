/*
 * 허브에 학교 섹션(인증 · 학교 순위 · 동문)을 붙인다.
 *
 * 원본 마크업을 고치는 대신 여기서 같은 클래스(.cart.wide)로 만들어 넣는다.
 * 그래야 원본 CSS 가 그대로 먹고, 원본 파일은 스크립트 한 줄만 늘어난다.
 * 문구는 원본 UI 사전과 같은 9개 언어를 직접 들고 있다 — 원본 사전을 건드리면
 * 154문항 정렬을 검사하는 스크립트와 얽히기 때문에 이쪽에 따로 둔다.
 */
(function () {
  "use strict";

  var T = {
    ko: {
      head: "▼ 학교 ▼",
      verify: ["학교 인증", "학교 메일로 뱃지를 받고, 우리 학교 순위에 내 표를 보탭니다", "인증하러 가기 ▶"],
      verified: ["인증됨", "뱃지 확인·해제, 동문 목록 공개 설정", "뱃지 관리 ▶"],
      rank: ["학교 순위", "인증된 학생들의 표로만 매기는 학교별 순위", "순위 보기 ▶"],
      alumni: ["동문 찾기", "같은 학교 사람들 — 공개에 동의한 사람만 보입니다", "동문 보기 ▶"],
    },
    en: {
      head: "▼ SCHOOL ▼",
      verify: ["SCHOOL BADGE", "Verify with your school email — get a badge and add your votes to your school", "VERIFY ▶"],
      verified: ["VERIFIED", "Check or remove your badge, manage alumni listing", "MANAGE ▶"],
      rank: ["SCHOOL RANKING", "Ranked from verified students' votes only", "VIEW ▶"],
      alumni: ["ALUMNI", "People from your school — only those who opted in", "BROWSE ▶"],
    },
    zh: {
      head: "▼ 学校 ▼",
      verify: ["学校认证", "用学校邮箱获得徽章，为本校排名投票", "去认证 ▶"],
      verified: ["已认证", "查看或解除徽章，设置校友名录公开", "管理徽章 ▶"],
      rank: ["学校排名", "仅由认证学生的投票排出的学校榜", "查看排名 ▶"],
      alumni: ["校友名录", "同校的人——仅显示同意公开的人", "查看校友 ▶"],
    },
    tw: {
      head: "▼ 學校 ▼",
      verify: ["學校認證", "用學校信箱取得徽章，為本校排名投票", "前往認證 ▶"],
      verified: ["已認證", "查看或解除徽章，設定校友名錄公開", "管理徽章 ▶"],
      rank: ["學校排名", "僅由認證學生的投票排出的學校榜", "查看排名 ▶"],
      alumni: ["校友名錄", "同校的人——僅顯示同意公開的人", "查看校友 ▶"],
    },
    ja: {
      head: "▼ 学校 ▼",
      verify: ["学校認証", "学校メールでバッジを取得し、自分の学校に票を足そう", "認証する ▶"],
      verified: ["認証済み", "バッジの確認・解除、同窓生名簿の公開設定", "バッジ管理 ▶"],
      rank: ["学校ランキング", "認証済み学生の票だけで決まる学校別ランキング", "ランキングを見る ▶"],
      alumni: ["同窓生を探す", "同じ学校の人 — 公開に同意した人のみ表示", "同窓生を見る ▶"],
    },
    fr: {
      head: "▼ ÉCOLE ▼",
      verify: ["VÉRIFICATION ÉCOLE", "Vérifiez avec votre e-mail universitaire : badge et votes pour votre école", "VÉRIFIER ▶"],
      verified: ["VÉRIFIÉ", "Voir ou retirer le badge, gérer l'annuaire des anciens", "GÉRER ▶"],
      rank: ["CLASSEMENT DES ÉCOLES", "Établi uniquement à partir des votes d'étudiants vérifiés", "VOIR ▶"],
      alumni: ["ANNUAIRE DES ANCIENS", "Les personnes de votre école qui ont accepté d'être listées", "PARCOURIR ▶"],
    },
    it: {
      head: "▼ SCUOLA ▼",
      verify: ["VERIFICA SCUOLA", "Verifica con l'e-mail universitaria: badge e voti per la tua scuola", "VERIFICA ▶"],
      verified: ["VERIFICATO", "Controlla o rimuovi il badge, gestisci l'elenco ex alunni", "GESTISCI ▶"],
      rank: ["CLASSIFICA SCUOLE", "Costruita solo sui voti di studenti verificati", "VEDI ▶"],
      alumni: ["ELENCO EX ALUNNI", "Le persone della tua scuola che hanno scelto di comparire", "SFOGLIA ▶"],
    },
    de: {
      head: "▼ HOCHSCHULE ▼",
      verify: ["HOCHSCHUL-BADGE", "Mit Hochschul-E-Mail verifizieren — Abzeichen und Stimmen für deine Hochschule", "VERIFIZIEREN ▶"],
      verified: ["VERIFIZIERT", "Abzeichen prüfen oder entfernen, Alumni-Eintrag verwalten", "VERWALTEN ▶"],
      rank: ["HOCHSCHUL-RANGLISTE", "Nur aus den Stimmen verifizierter Studierender", "ANSEHEN ▶"],
      alumni: ["ALUMNI-VERZEICHNIS", "Leute deiner Hochschule, die sich eintragen ließen", "DURCHSEHEN ▶"],
    },
    es: {
      head: "▼ ESCUELA ▼",
      verify: ["VERIFICACIÓN DE ESCUELA", "Verifica con tu correo universitario: insignia y votos para tu escuela", "VERIFICAR ▶"],
      verified: ["VERIFICADO", "Revisa o quita la insignia, gestiona el directorio de exalumnos", "GESTIONAR ▶"],
      rank: ["RANKING DE ESCUELAS", "Hecho solo con los votos de estudiantes verificados", "VER ▶"],
      alumni: ["DIRECTORIO DE EXALUMNOS", "Gente de tu escuela que eligió aparecer en la lista", "EXPLORAR ▶"],
    },
  };

  function lang() {
    return typeof LANG === "string" && T[LANG] ? LANG : "ko";
  }

  var SMALL = "color:var(--dim);font-size:12px;font-family:var(--kfont)";
  var badge = null; // /api/verify/me 결과 — 인증했으면 첫 칸 문구가 바뀐다

  function esc(s) {
    return String(s).replace(/[<>&]/g, function (c) {
      return { "<": "&lt;", ">": "&gt;", "&": "&amp;" }[c];
    });
  }

  function cart(id, icon, href) {
    var b = document.createElement("button");
    b.className = "cart wide";
    b.id = id;
    b.innerHTML =
      '<span class="cart-icon">' + icon + '</span>' +
      '<span class="cart-name"></span>' +
      '<span class="cart-tag"></span>';
    b.addEventListener("click", function () {
      if (typeof sfxNext === "function") sfxNext();
      // 오락실에서 고른 언어를 그대로 넘긴다 — 학교 페이지도 9개 언어를 따라간다.
      location.href = href + "?lang=" + encodeURIComponent(lang());
    });
    return b;
  }

  function mount() {
    var hub = document.getElementById("vArcade");
    if (!hub || document.getElementById("schHead")) return;

    var head = document.createElement("div");
    head.className = "comm-head";
    head.id = "schHead";

    var wrap = document.createDocumentFragment();
    wrap.appendChild(head);
    wrap.appendChild(cart("cartVerify", "🎓", "/verify"));
    wrap.appendChild(cart("cartRank", "🏫", "/schools"));
    wrap.appendChild(cart("cartAlumni", "👥", "/alumni"));

    // "▼ SELECT GAME ▼" 바로 위 — 커뮤니티 줄 다음에 놓아 게임 카트를 밀어내지 않는다.
    var press = hub.querySelector(".press");
    if (press) hub.insertBefore(wrap, press);
    else hub.appendChild(wrap);
  }

  function paint() {
    var t = T[lang()];
    var head = document.getElementById("schHead");
    if (!head) return;
    head.textContent = t.head;

    var rows = [
      ["cartVerify", badge ? t.verified : t.verify],
      ["cartRank", t.rank],
      ["cartAlumni", t.alumni],
    ];
    rows.forEach(function (r) {
      var el = document.getElementById(r[0]);
      if (!el) return;
      var name = r[1][0];
      // 인증한 사람에게는 학교 이름을 그대로 보여준다 — 뱃지가 붙었다는 사실이
      // 문구보다 학교 이름으로 확인될 때 더 분명하다.
      if (r[0] === "cartVerify" && badge) name = "✓ " + esc(badge.schoolName);
      el.querySelector(".cart-name").innerHTML =
        esc(name) + '<br><small style="' + SMALL + '">' + esc(r[1][1]) + "</small>";
      el.querySelector(".cart-tag").textContent = r[1][2];
    });
  }

  function start() {
    mount();
    paint();

    // 언어를 바꾸면 원본이 applyLang 을 부른다. 원본이 쓰는 확장 방식 그대로 감싼다.
    if (typeof applyLang === "function") {
      var prev = applyLang;
      applyLang = function () {
        prev();
        paint();
      };
    }

    fetch("/api/verify/me", { cache: "no-store" })
      .then(function (r) { return r.json(); })
      .then(function (d) { badge = d && d.badge ? d.badge : null; paint(); })
      .catch(function () { /* 뱃지 조회 실패는 게임 진행과 무관하므로 조용히 넘긴다 */ });
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", start);
  else start();
})();
