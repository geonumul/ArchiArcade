/**
 * 9개 언어 문항 은행의 1:1 인덱스 정렬을 검증한다.
 * 이 정렬이 전역 투표 합산의 기반이므로, 문항을 건드린 커밋마다 반드시 돌릴 것.
 *   npm run verify:banks
 */
import { readFileSync, readdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const QDIR = join(ROOT, "data", "questions");
const IDIR = join(ROOT, "lib", "i18n");
const LANGS = ["ko", "en", "zh", "tw", "ja", "fr", "it", "de", "es"];

const read = (p) => JSON.parse(readFileSync(p, "utf8"));
const problems = [];

const files = readdirSync(QDIR).filter((f) => f.endsWith(".json"));
if (files.length !== LANGS.length) {
  problems.push(`문항 파일 ${files.length}개 (기대 ${LANGS.length}개)`);
}

const banks = {};
for (const lang of LANGS) {
  try {
    banks[lang] = read(join(QDIR, `${lang}.json`));
  } catch {
    problems.push(`${lang}: 문항 파일을 읽을 수 없음`);
  }
}

const size = banks.ko?.length ?? 0;
for (const lang of LANGS) {
  const b = banks[lang];
  if (!b) continue;
  if (b.length !== size) problems.push(`${lang}: ${b.length}개 (기준 ko ${size}개)`);
  b.forEach((row, i) => {
    if (row.idx !== i) problems.push(`${lang}[${i}]: idx=${row.idx}`);
    if (!row.q || !row.a || !row.b) problems.push(`${lang}[${i}]: 빈 필드`);
  });
}

// i18n 키 집합도 함께 본다 — 누락되면 화면에 키 이름이 그대로 노출된다.
const koKeys = Object.keys(read(join(IDIR, "ko.json")));
for (const lang of LANGS.filter((l) => l !== "ko")) {
  const keys = Object.keys(read(join(IDIR, `${lang}.json`)));
  const missing = koKeys.filter((k) => !keys.includes(k));
  if (missing.length) problems.push(`i18n ${lang}: 키 ${missing.length}개 누락 (${missing.slice(0, 5).join(", ")}…)`);
}

if (problems.length) {
  console.error(`✗ 검증 실패 ${problems.length}건`);
  for (const p of problems.slice(0, 40)) console.error("  - " + p);
  process.exit(1);
}

console.log(`✓ ${LANGS.length}개 언어 × ${size}문항 = ${LANGS.length * size}항목, 인덱스 정렬 및 i18n 키 일치`);
