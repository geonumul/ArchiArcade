/**
 * data/schools.json 을 다시 만든다.
 *   node scripts/build-schools.mjs
 *
 * 항목 하나는 이렇게 생겼다.
 *   "catholic.ac.kr": { name: "The Catholic University of Korea", local: "가톨릭대학교", country: "KR" }
 *
 * 이름을 둘로 나눈 이유는 화면 때문이다. 영문 이름을 크게 두고 현지어를 작게 옆에
 * 붙이면, 어느 나라 학생이 보든 같은 규칙으로 읽힌다. 예전에는 한 칸뿐이라
 * "가톨릭대학교" 와 "Soongsil University" 가 나란히 떠서 규칙이 없어 보였다.
 *
 * 이름은 지어내지 않는다.
 *   name  - 공개 데이터셋(Hipo/university-domains-list, MIT). 전 나라가 영문이다.
 *   local - 예전 목록에 있던 현지어 이름과, 아래 표에 손으로 확인해 넣은 한글.
 *           일본·중국·대만은 현지어 이름 출처가 없어 비워 둔다. 비면 화면에는
 *           영문만 나오고, 틀린 이름이 뜨는 것보다 낫다.
 *
 * 나라를 고르지 않고 데이터셋 전부를 넣는다. 학교가 아닌 것이 몇 개 섞이는 쪽이,
 * 진짜 학교를 빠뜨려 그 사람이 아예 못 들어오는 쪽보다 낫다.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { argv } from "node:process";

const SOURCE =
  "https://raw.githubusercontent.com/Hipo/university-domains-list/master/world_universities_and_domains.json";

/**
 * 한국 대학 한글 이름. 건축·건축공학·실내건축 과정이 있는 곳을 우선으로 채웠다.
 * 여기 없는 학교는 영문 이름이 그대로 남으므로, 발견될 때마다 늘리면 된다.
 */
const KO_NAMES = {
  "snu.ac.kr": "서울대학교",
  "yonsei.ac.kr": "연세대학교",
  "korea.ac.kr": "고려대학교",
  "hanyang.ac.kr": "한양대학교",
  "skku.edu": "성균관대학교",
  "cau.ac.kr": "중앙대학교",
  "khu.ac.kr": "경희대학교",
  "hongik.ac.kr": "홍익대학교",
  "kookmin.ac.kr": "국민대학교",
  "sejong.ac.kr": "세종대학교",
  "soongsil.ac.kr": "숭실대학교",
  "dankook.ac.kr": "단국대학교",
  "konkuk.ac.kr": "건국대학교",
  "inha.ac.kr": "인하대학교",
  "ajou.ac.kr": "아주대학교",
  "catholic.ac.kr": "가톨릭대학교",
  "ewha.ac.kr": "이화여자대학교",
  "sookmyung.ac.kr": "숙명여자대학교",
  "smu.ac.kr": "상명대학교",
  "swu.ac.kr": "서울여자대학교",
  "duksung.ac.kr": "덕성여자대학교",
  "sungshin.ac.kr": "성신여자대학교",
  "kaist.ac.kr": "한국과학기술원",
  "postech.ac.kr": "포항공과대학교",
  "unist.ac.kr": "울산과학기술원",
  "gist.ac.kr": "광주과학기술원",
  "seoultech.ac.kr": "서울과학기술대학교",
  "uos.ac.kr": "서울시립대학교",
  "kyonggi.ac.kr": "경기대학교",
  "gachon.ac.kr": "가천대학교",
  "myongji.ac.kr": "명지대학교",
  "kw.ac.kr": "광운대학교",
  "ssu.ac.kr": "숭실대학교",
  "hufs.ac.kr": "한국외국어대학교",
  "sogang.ac.kr": "서강대학교",
  "dgu.ac.kr": "동국대학교",
  "hoseo.ac.kr": "호서대학교",
  "hanbat.ac.kr": "한밭대학교",
  "cnu.ac.kr": "충남대학교",
  "cbnu.ac.kr": "충북대학교",
  "chungbuk.ac.kr": "충북대학교",
  "jbnu.ac.kr": "전북대학교",
  "jnu.ac.kr": "전남대학교",
  "knu.ac.kr": "경북대학교",
  "pusan.ac.kr": "부산대학교",
  "pknu.ac.kr": "부경대학교",
  "donga.ac.kr": "동아대학교",
  "dau.ac.kr": "동아대학교",
  "deu.ac.kr": "동의대학교",
  "kyungnam.ac.kr": "경남대학교",
  "gnu.ac.kr": "경상국립대학교",
  "ulsan.ac.kr": "울산대학교",
  "andong.ac.kr": "국립안동대학교",
  "kangwon.ac.kr": "강원대학교",
  "hallym.ac.kr": "한림대학교",
  "yonsei.ac.kr:wonju": "연세대학교",
  "jejunu.ac.kr": "제주대학교",
  "inu.ac.kr": "인천대학교",
  "hanseo.ac.kr": "한서대학교",
  "kongju.ac.kr": "공주대학교",
  "sunmoon.ac.kr": "선문대학교",
  "namseoul.ac.kr": "남서울대학교",
  "hannam.ac.kr": "한남대학교",
  "woosuk.ac.kr": "우석대학교",
  "wku.ac.kr": "원광대학교",
  "chosun.ac.kr": "조선대학교",
  "honam.ac.kr": "호남대학교",
  "mokpo.ac.kr": "국립목포대학교",
  "sunchon.ac.kr": "국립순천대학교",
  "kunsan.ac.kr": "국립군산대학교",
  "kmu.ac.kr": "계명대학교",
  "yu.ac.kr": "영남대학교",
  "daegu.ac.kr": "대구대학교",
  "kiu.ac.kr": "경일대학교",
  "cu.ac.kr": "대구가톨릭대학교",
  "silla.ac.kr": "신라대학교",
  "kyungsung.ac.kr": "경성대학교",
  "tu.ac.kr": "동명대학교",
  "khu.ac.kr:global": "경희대학교",
  "kpu.ac.kr": "한국공학대학교",
  "koreatech.ac.kr": "한국기술교육대학교",
  "kumoh.ac.kr": "국립금오공과대학교",
  "cheongju.ac.kr": "청주대학교",
  "semyung.ac.kr": "세명대학교",
  "kku.ac.kr": "건국대학교",
  "paichai.ac.kr": "배재대학교",
  "woosong.ac.kr": "우송대학교",
  "mokwon.ac.kr": "목원대학교",
  "joongbu.ac.kr": "중부대학교",
  "kangnam.ac.kr": "강남대학교",
  "suwon.ac.kr": "수원대학교",
  "hs.ac.kr": "한신대학교",
  "anyang.ac.kr": "안양대학교",
  "syu.ac.kr": "삼육대학교",
  "sangji.ac.kr": "상지대학교",
  "yonsei.ac.kr:mirae": "연세대학교",
  "gwnu.ac.kr": "강릉원주대학교",
  "changwon.ac.kr": "국립창원대학교",
  "inje.ac.kr": "인제대학교",
  "pcu.ac.kr": "부산가톨릭대학교",
  "kyungil.ac.kr": "경일대학교",
  "daejin.ac.kr": "대진대학교",
  "hyupsung.ac.kr": "협성대학교",
  "yiu.ac.kr": "영남이공대학교",
  "halla.ac.kr": "한라대학교",
  "songwon.ac.kr": "송원대학교",
  "nsu.ac.kr": "남서울대학교",
  "kbu.ac.kr": "경복대학교",
  "shinhan.ac.kr": "신한대학교",
  "eulji.ac.kr": "을지대학교",
  "cha.ac.kr": "차의과학대학교",
  "dongyang.ac.kr": "동양대학교",
  "kduniv.ac.kr": "경동대학교",
  "yc.ac.kr": "연성대학교",
};

/**
 * 공개 데이터셋이 빠뜨린 건축 전문학교.
 *
 * 데이터셋은 종합대학 위주라, 건축만 가르치는 곳이 통째로 없다. 건축학도가 쓰는
 * 서비스에서 AA 나 SCI-Arc 가 도메인 그대로 찍히면 곤란해서 손으로 채웠다.
 *
 * 전부 DNS 와 사이트 제목으로 확인한 것만 넣었다. 확인 과정에서 bac.edu 가
 * Boston Architectural College 가 아니라 Belmont Abbey College 였고, SCI-Arc 는
 * sci-arc.edu 가 아니라 sciarc.edu 였다 - 기억에 기대 넣었으면 둘 다 틀렸다.
 *
 * gsd.harvard.edu 나 bartlett.ucl.ac.uk 같은 하위 도메인은 넣지 않았다.
 * lib/school.ts 가 상위 도메인으로 올라가며 찾으므로 이미 통과한다.
 */

/**
 * 공개 데이터셋에 없어 영문 이름이 비어 있던 한국 대학.
 *
 * 화면은 영문을 크게 쓰고 현지어를 작게 붙이므로, 영문이 없으면 규칙이 깨진다.
 * 각 학교가 공식적으로 쓰는 영문 표기를 넣었다.
 */
const EN_NAMES = {
  "anu.ac.kr": "Andong National University",
  "anyang.ac.kr": "Anyang University",
  "catholic.ac.kr": "The Catholic University of Korea",
  "cheongju.ac.kr": "Cheongju University",
  "cu.ac.kr": "Daegu Catholic University",
  "dau.ac.kr": "Dong-A University",
  "dgu.ac.kr": "Dongguk University",
  "dongyang.ac.kr": "Dongyang University",
  "hnu.kr": "Hannam University",
  "hoseo.edu": "Hoseo University",
  "jbnu.ac.kr": "Jeonbuk National University",
  "kbu.ac.kr": "Kyungbok University",
  "kku.ac.kr": "Konkuk University",
  "knu.ac.kr": "Kyungpook National University",
  "namseoul.ac.kr": "Namseoul University",
  "tu.ac.kr": "Tongmyong University",
  "woosong.ac.kr": "Woosong University",
  "yc.ac.kr": "Yeonsung University",
  "yiu.ac.kr": "Yeungnam University College",
  "yu.ac.kr": "Yeungnam University",
};

const ARCH_SCHOOLS = {
  "aaschool.ac.uk": { name: "Architectural Association School of Architecture", country: "GB" },
  "sciarc.edu": { name: "Southern California Institute of Architecture", country: "US" },
  "risd.edu": { name: "Rhode Island School of Design", country: "US" },
  "newschool.edu": { name: "The New School (Parsons)", country: "US" },
  "the-bac.edu": { name: "Boston Architectural College", country: "US" },
  "waseda.jp": { name: "早稲田大学", country: "JP" },
  "waseda.ac.jp": { name: "早稲田大学", country: "JP" },
};

/**
 * 학교 이름에 이것들이 들어 있으면 대학이 아니라고 보고 뺀다.
 * 인증 대상은 대학이라, 어학원이나 병원 부설 기관까지 들어오면 목록만 흐려진다.
 */
const DROP = /\b(hospital|clinic|academy of language|language (school|institute)|high school)\b/i;

/**
 * 나라를 고르지 않는다.
 *
 * 처음에는 한국·미국·영국·중국·일본만 넣었는데, 그러면 목록에 없는 나라의 학생은
 * 접미사 규칙에 걸리지 않는 한 인증 자체가 막힌다. 네덜란드·북유럽·동유럽처럼
 * 대학이 일반 국가 도메인을 쓰는 곳이 통째로 빠졌다.
 *
 * 학교가 아닌 것이 몇 개 섞이는 쪽이, 진짜 학교를 빠뜨리는 쪽보다 낫다.
 * 섞여도 그 학교 순위 한 줄이 늘 뿐이지만, 빠지면 그 사람은 아예 못 들어온다.
 */

/**
 * 학술 전용 접미사. 목록에 없는 학교도 이걸로 통과한다.
 *
 * 데이터셋은 완전하지 않고 새 학교도 계속 생기므로, 접미사가 마지막 그물이다.
 * 유럽 대부분은 대학이 일반 국가 도메인(.de, .nl)을 써서 이 방법이 통하지 않고,
 * 그래서 도메인 목록이 그만큼 더 중요하다.
 */
const BASE_SUFFIXES = [
  { suffix: ".ac.kr", country: "KR" },
  { suffix: ".ac.jp", country: "JP" },
  { suffix: ".edu.cn", country: "CN" },
  { suffix: ".edu.tw", country: "TW" },
  { suffix: ".edu.hk", country: "HK" },
  { suffix: ".ac.uk", country: "GB" },
  { suffix: ".edu.au", country: "AU" },
  { suffix: ".edu", country: "US" },
];

const EXTRA_SUFFIXES = [
  { suffix: ".ac.nz", country: "NZ" },
  { suffix: ".edu.sg", country: "SG" },
  { suffix: ".edu.my", country: "MY" },
  { suffix: ".ac.in", country: "IN" },
  { suffix: ".edu.in", country: "IN" },
  { suffix: ".ac.th", country: "TH" },
  { suffix: ".edu.ph", country: "PH" },
  { suffix: ".ac.id", country: "ID" },
  { suffix: ".edu.vn", country: "VN" },
  { suffix: ".ac.il", country: "IL" },
  { suffix: ".edu.tr", country: "TR" },
  { suffix: ".ac.za", country: "ZA" },
  { suffix: ".edu.pk", country: "PK" },
  { suffix: ".ac.ir", country: "IR" },
  { suffix: ".edu.br", country: "BR" },
  { suffix: ".edu.mx", country: "MX" },
  { suffix: ".edu.ar", country: "AR" },
  { suffix: ".edu.co", country: "CO" },
  { suffix: ".edu.pe", country: "PE" },
  { suffix: ".ac.at", country: "AT" },
  { suffix: ".ac.be", country: "BE" },
  { suffix: ".ac.rs", country: "RS" },
  { suffix: ".ac.cy", country: "CY" },
  { suffix: ".edu.eg", country: "EG" },
  { suffix: ".edu.sa", country: "SA" },
  { suffix: ".ac.ae", country: "AE" },
  { suffix: ".edu.kw", country: "KW" },
  { suffix: ".edu.lb", country: "LB" },
  { suffix: ".edu.jo", country: "JO" },
  { suffix: ".ac.ma", country: "MA" },
  { suffix: ".edu.ua", country: "UA" },
  { suffix: ".edu.ru", country: "RU" },
];

async function main() {
  const cached = argv.find((a) => a.startsWith("--from="))?.slice("--from=".length);
  const prevPath = argv.find((a) => a.startsWith("--prev="))?.slice("--prev=".length);

  const raw = cached
    ? JSON.parse(readFileSync(cached, "utf8"))
    : await (await fetch(SOURCE)).json();
  console.log(`데이터셋: 대학 ${raw.length}개`);

  // 예전 목록의 현지어 이름을 살려 쓴다. 프랑스·독일 표기와 한글 79개가 거기 있다.
  const prev = prevPath ? JSON.parse(readFileSync(prevPath, "utf8")).domains : {};
  const localFromPrev = {};
  for (const [d, v] of Object.entries(prev)) {
    // 라틴 알파벳만으로 된 이름은 영문이라 보고 현지어로 치지 않는다.
    if (/[^ -]/.test(v.name)) localFromPrev[d] = v.name;
  }
  console.log(`예전 목록에서 가져온 현지어 이름: ${Object.keys(localFromPrev).length}개`);

  const domains = {};
  const suffixRules = [];

  // ── 영문 이름: 데이터셋 ──────────────────────────────────
  for (const uni of raw) {
    const cc = uni.alpha_two_code;
    if (!cc || !uni.name || DROP.test(uni.name)) continue;
    for (const d of uni.domains ?? []) {
      const domain = String(d).toLowerCase().replace(/^www\./, "");
      if (!domain.includes(".")) continue;
      if (!domains[domain]) domains[domain] = { name: uni.name, country: cc };
    }
  }
  console.log(`데이터셋에서: ${Object.keys(domains).length}개`);

  // ── 데이터셋이 빠뜨린 건축 전문학교 ─────────────────────
  let arch = 0;
  for (const [domain, meta] of Object.entries(ARCH_SCHOOLS)) {
    if (!domains[domain]) { domains[domain] = { ...meta }; arch++; }
  }
  console.log(`건축 전문학교 보충: ${arch}개`);

  // ── 예전 목록에만 있던 학교를 잃지 않는다 ───────────────
  let kept = 0;
  for (const [d, v] of Object.entries(prev)) {
    if (!domains[d]) { domains[d] = { name: v.name, country: v.country }; kept++; }
  }
  console.log(`예전 목록에만 있던 학교 유지: ${kept}개`);

  // ── 현지어 이름 붙이기 ──────────────────────────────────
  let localCount = 0;
  for (const [d, local] of Object.entries(localFromPrev)) {
    if (domains[d] && domains[d].name !== local) { domains[d].local = local; localCount++; }
  }
  for (const [key, ko] of Object.entries(KO_NAMES)) {
    const d = key.split(":")[0];
    if (!domains[d]) { domains[d] = { name: ko, country: "KR" }; continue; }
    if (domains[d].name !== ko) { domains[d].local = ko; localCount++; }
  }
  console.log(`현지어 이름이 붙은 학교: ${localCount}개`);


  // 영문 이름이 없던 한국 대학을 채운다. 지금 이름은 한글이므로 그것을 현지어로 옮긴다.
  let enFixed = 0;
  for (const [d, en] of Object.entries(EN_NAMES)) {
    const cur = domains[d];
    if (!cur) { domains[d] = { name: en, country: "KR" }; enFixed++; continue; }
    if (/[^\u0000-\u007f]/.test(cur.name)) {
      domains[d] = { name: en, local: cur.local ?? cur.name, country: cur.country };
      enFixed++;
    }
  }
  console.log(`영문 이름 채움: ${enFixed}개`);

  // ── 접미사 규칙 ─────────────────────────────────────────
  for (const r of [...BASE_SUFFIXES, ...EXTRA_SUFFIXES]) {
    if (!suffixRules.some((x) => x.suffix === r.suffix)) suffixRules.push(r);
  }
  // 긴 접미사를 먼저 본다 - .edu.cn 이 .cn 보다 앞서야 나라를 제대로 집는다.
  suffixRules.sort((a, b) => b.suffix.length - a.suffix.length);
  console.log(`접미사 규칙: ${suffixRules.length}개`);

  writeFileSync(
    "data/schools.json",
    JSON.stringify({ suffixRules, domains: sortKeys(domains) }, null, 2) + "\n",
    "utf8"
  );

  const byCountry = {};
  for (const v of Object.values(domains)) byCountry[v.country] = (byCountry[v.country] || 0) + 1;
  const withLocal = Object.values(domains).filter((v) => v.local).length;

  console.log(`\n총 ${Object.keys(domains).length}개 · 현지어 이름 있는 것 ${withLocal}개`);
  console.log(
    "상위 국가: " +
      Object.entries(byCountry)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 12)
        .map(([c, n]) => `${c} ${n}`)
        .join(" · ") + ` … 총 ${Object.keys(byCountry).length}개국`
  );
}

function sortKeys(obj) {
  return Object.fromEntries(Object.entries(obj).sort(([a], [b]) => a.localeCompare(b)));
}

await main();
