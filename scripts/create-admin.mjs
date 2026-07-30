/**
 * 관리자 계정을 만들거나 비밀번호를 바꾼다.
 *   node scripts/create-admin.mjs                  → 강한 비밀번호를 만들어 한 번만 보여 준다
 *   ADMIN_PW=... node scripts/create-admin.mjs      → 그 비밀번호로 설정한다
 *
 * 관리자 이름은 .env 의 ADMIN_NAME 이고, 일반 가입으로는 만들 수 없다(누가 먼저
 * 선점하면 안 되므로 가입 화면에서 막는다). 그래서 계정은 여기서 만든다.
 *
 * 비밀번호를 인자로 받지 않는 이유: 명령 인자는 셸 기록과 프로세스 목록에 남는다.
 * 환경변수도 셸 기록에 남으므로, 아무것도 주지 않고 여기서 만들어 쓰는 편이 낫다.
 */
import { PrismaClient } from "@prisma/client";
import { hash as argonHash } from "@node-rs/argon2";
import crypto from "node:crypto";
import { env, exit } from "node:process";

const prisma = new PrismaClient();

function strongPassword() {
  // 헷갈리는 글자(0/O, 1/l/I)를 뺀 뒤 24자. 규칙(8자+·영문+숫자)을 넉넉히 넘긴다.
  const abc = "abcdefghijkmnopqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const bytes = crypto.randomBytes(24);
  return [...bytes].map((b) => abc[b % abc.length]).join("");
}

try {
  const name = env.ADMIN_NAME?.trim();
  if (!name) {
    console.error("ADMIN_NAME 이 .env 에 없습니다. 관리자 이름을 먼저 정하세요.");
    exit(1);
  }

  const given = env.ADMIN_PW;
  if (given && !(given.length >= 8 && /[A-Za-z]/.test(given) && /[0-9]/.test(given))) {
    console.error("비밀번호 규칙: 8자 이상, 영문과 숫자 포함");
    exit(1);
  }
  const pw = given || strongPassword();
  const pwHash = await argonHash(pw, { algorithm: 2 /* Argon2id */ });

  const existing = await prisma.user.findUnique({ where: { name } });
  if (existing) {
    await prisma.user.update({ where: { id: existing.id }, data: { pwHash } });
    console.log(`관리자 계정 비밀번호를 바꿨습니다: ${name}`);
  } else {
    await prisma.user.create({ data: { name, pwHash, locale: "ko", profile: { create: {} } } });
    console.log(`관리자 계정을 만들었습니다: ${name}`);
  }

  if (given) {
    console.log("설정한 비밀번호로 로그인하세요. 셸 기록에 남았으면 지우는 것이 좋습니다.");
  } else {
    console.log("");
    console.log("  비밀번호: " + pw);
    console.log("");
    console.log("이 값은 다시 보여주지 않습니다. 지금 옮겨 적어 두세요.");
  }
  console.log("이 계정으로 로그인하면 공작소에서 모든 제보를 볼 수 있습니다.");
} finally {
  await prisma.$disconnect();
}
