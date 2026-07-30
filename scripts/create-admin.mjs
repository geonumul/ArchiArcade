/**
 * 관리자 계정을 만들거나 비밀번호를 바꾼다.
 *
 *   node scripts/create-admin.mjs
 *       터미널에서 비밀번호를 물어본다(화면에 안 보인다). 그냥 엔터를 치면
 *       강한 비밀번호를 만들어 한 번만 보여 준다.
 *
 *   node scripts/create-admin.mjs --email=you@example.com
 *       계정에 메일 주소를 달아 둔다. 그래야 앱 안의 "비밀번호 바꾸기"(메일로 코드)
 *       를 관리자도 쓸 수 있다.
 *
 *   ADMIN_PW=... node scripts/create-admin.mjs
 *       자동화용. 환경변수는 셸 기록에 남으니 손으로 칠 때는 위쪽을 쓰는 게 낫다.
 *
 * 관리자 이름은 .env 의 ADMIN_NAME 이고 일반 가입으로는 만들 수 없다 — 이름만 알면
 * 누구나 선점할 수 있기 때문에 가입 화면에서 막아 두었다. 그래서 여기서만 만든다.
 */
import { PrismaClient } from "@prisma/client";
import { hash as argonHash } from "@node-rs/argon2";
import crypto from "node:crypto";
import readline from "node:readline";
import { env, exit, stdin, stdout, argv } from "node:process";

const prisma = new PrismaClient();

const arg = (name) => argv.find((a) => a.startsWith(`--${name}=`))?.slice(name.length + 3);

function strongPassword() {
  // 헷갈리는 글자(0/O, 1/l/I)를 뺀 24자.
  const abc = "abcdefghijkmnopqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  return [...crypto.randomBytes(24)].map((b) => abc[b % abc.length]).join("");
}

const validPw = (p) => p.length >= 8 && /[A-Za-z]/.test(p) && /[0-9]/.test(p);

/** 입력한 글자가 화면에 남지 않게 물어본다. 어깨너머로 보이지 않게 하기 위해서다. */
function askHidden(question) {
  return new Promise((resolve) => {
    const rl = readline.createInterface({ input: stdin, output: stdout, terminal: true });
    const onData = (char) => {
      // 엔터·Ctrl+C 외에는 화면을 지우고 프롬프트만 다시 그린다.
      if (["\n", "\r", ""].includes(String(char))) return;
      stdout.write("\x1b[2K\r" + question);
    };
    stdin.on("data", onData);
    rl.question(question, (answer) => {
      stdin.removeListener("data", onData);
      rl.close();
      stdout.write("\n");
      resolve(answer);
    });
  });
}

try {
  const name = env.ADMIN_NAME?.trim();
  if (!name) {
    console.error("ADMIN_NAME 이 .env 에 없습니다. 관리자 이름을 먼저 정하세요.");
    exit(1);
  }

  let pw = env.ADMIN_PW;
  let generated = false;

  if (!pw && stdin.isTTY) {
    const first = await askHidden("새 비밀번호 (그냥 엔터 = 자동 생성): ");
    if (first) {
      const again = await askHidden("한 번 더: ");
      if (first !== again) {
        console.error("두 번 입력한 값이 다릅니다.");
        exit(1);
      }
      pw = first;
    }
  }

  if (!pw) {
    pw = strongPassword();
    generated = true;
  } else if (!validPw(pw)) {
    console.error("비밀번호 규칙: 8자 이상, 영문과 숫자 포함");
    exit(1);
  }

  const email = arg("email")?.trim().toLowerCase() || null;
  if (email && !/^[^\s@]+@[^\s@.]+(\.[^\s@.]+)+$/.test(email)) {
    console.error("이메일 형식을 확인해주세요.");
    exit(1);
  }
  if (email) {
    const taken = await prisma.user.findFirst({ where: { email, NOT: { name } } });
    if (taken) {
      console.error("그 이메일은 다른 계정이 쓰고 있습니다.");
      exit(1);
    }
  }

  const pwHash = await argonHash(pw, { algorithm: 2 /* Argon2id */ });
  const existing = await prisma.user.findUnique({ where: { name } });

  if (existing) {
    await prisma.user.update({
      where: { id: existing.id },
      data: { pwHash, ...(email ? { email } : {}) },
    });
    console.log(`관리자 비밀번호를 바꿨습니다: ${name}`);
  } else {
    await prisma.user.create({
      data: { name, pwHash, email, locale: "ko", profile: { create: {} } },
    });
    console.log(`관리자 계정을 만들었습니다: ${name}`);
  }

  if (generated) {
    console.log("");
    console.log("  비밀번호: " + pw);
    console.log("");
    console.log("이 값은 다시 보여주지 않습니다. 지금 옮겨 적어 두세요.");
  } else {
    console.log("입력하신 비밀번호로 설정했습니다.");
  }

  const after = await prisma.user.findUnique({ where: { name }, select: { email: true } });
  if (after?.email) {
    console.log("메일 주소가 등록돼 있어, 앱 안의 '비밀번호 바꾸기'도 쓸 수 있습니다.");
  } else {
    console.log("메일 주소가 없어 앱 안의 '비밀번호 바꾸기'는 쓸 수 없습니다.");
    console.log("  달아 두려면: node scripts/create-admin.mjs --email=주소");
  }
} finally {
  await prisma.$disconnect();
}
