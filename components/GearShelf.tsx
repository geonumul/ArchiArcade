import Link from "next/link";
import { Cabinet } from "@/components/Cabinet";
import { GEAR } from "@/lib/affiliate/gear";
import { STORES, STORES_BY_LANG, mapSearch } from "@/lib/affiliate/stores";
import { COUPANG_DISCLOSURE } from "@/lib/affiliate/coupang";

/**
 * 밤샘 장비 선반.
 *
 * 상품을 추천하지 않고 물건과 구매처만 늘어놓는다 - 왜 그렇게 했는지는 gear.ts 참고.
 *
 * 대가성 문구를 목록 위에 둔다. 표시광고법이 요구하는 것은 "쉽게 인식할 수 있는
 * 위치" 이고, 링크를 다 지나온 다음 맨 아래에 흐리게 적는 것은 표시하지 않은 것으로
 * 본다. 어차피 밝힐 것이면 먼저 밝히는 편이 읽는 사람에게도 낫다.
 *
 * 지금은 관리자에게만 보인다. 누구에게 보일지는 서버(app/gear/page.tsx)가 정하고
 * 이 파일은 그 판단을 하지 않는다 - 화면에서 감추는 방식이었다면 목록과 링크가
 * 그대로 번들에 실려 나가므로, 안 여는 것이 아니라 안 보이게 두는 것에 그친다.
 */

type L = "ko" | "en";

const UI: Record<L, {
  title: string;
  intro: string;
  online: string;
  offline: string;
  legendPaid: string;
  legendFree: string;
  disclosure: string;
  back: string;
}> = {
  ko: {
    title: "밤샘 장비",
    intro:
      "설계실에서 반드시 떨어지는 것들. 어느 제품이 좋은지는 적지 않았습니다 — " +
      "써 보지 않은 물건에 등수를 매기지 않으려고요. 무엇이 필요한지까지만 적고, " +
      "고르는 건 남겨 뒀습니다.",
    online: "온라인",
    offline: "오프라인에서 찾기",
    legendPaid: "노란 링크는 제휴 링크입니다 — 여기서 사시면 오락실에 수수료가 조금 들어옵니다. 값은 같습니다.",
    legendFree: "회색 링크는 지도 검색입니다. 수수료가 없습니다.",
    disclosure: COUPANG_DISCLOSURE,
    back: "← 오락실로",
  },
  en: {
    title: "All-nighter gear",
    intro:
      "The things that always run out in studio. We do not say which product is best — " +
      "we have not used them, and ranking things we have not used would make the whole " +
      "list worth less. What you need is here; choosing is left to you.",
    online: "Online",
    offline: "Find it nearby",
    legendPaid: "Yellow links are affiliate links — buying through them sends a small commission here. The price is the same.",
    legendFree: "Grey links are map searches. No commission.",
    disclosure:
      "Some links on this page are affiliate links. We may earn a commission from purchases made through them, at no extra cost to you.",
    back: "← Back to the arcade",
  },
};

export function GearShelf({ lang }: { lang: L }) {
  const t = UI[lang];

  return (
    <Cabinet title={t.title} hudRight="GEAR">
      <div className="note">{t.intro}</div>

      <div className="disclose">{t.disclosure}</div>

      {GEAR.map((g) => (
        <div key={g.id} className="field">
          <label>{g[lang].title}</label>

          {g.items.map((item) => {
            const text = item[lang];
            return (
              <div key={item.id} style={{ marginBottom: 16 }}>
                <div className="note" style={{ color: "var(--ink)", fontSize: 14 }}>
                  <b>{text.name}</b>
                </div>
                <div className="note">{text.note}</div>
                <div className="chips">
                  {STORES_BY_LANG[lang].map((id) => {
                    const store = STORES[id];
                    /* 대시보드에서 뽑아 온 링크가 있으면 그것을 그대로 쓴다. 이미 태그가
                       박혀 있어 손대면 오히려 깨진다. 없을 때만 검색 주소를 만든다. */
                    const href =
                      id === "coupang" && item.coupangLink
                        ? item.coupangLink
                        : store.search(text.keyword, item.id);
                    return (
                      <a
                        key={id}
                        className={store.paid ? "chip paid" : "chip"}
                        href={href}
                        target="_blank"
                        /* 제휴 링크는 sponsored 로 밝힌다. 검색엔진에 대고 숨기지 않는 것이
                           표시광고 규정과 같은 방향이라 따로 고민할 것이 없다. */
                        rel={store.paid ? "nofollow sponsored noopener" : "noopener"}
                      >
                        {store.label}
                      </a>
                    );
                  })}
                </div>
              </div>
            );
          })}

          <div className="note" style={{ marginTop: 4 }}>
            {t.offline}
          </div>
          <div className="chips">
            {g[lang].offline.map((place) => (
              <a
                key={place}
                className="chip off"
                href={mapSearch(place, lang)}
                target="_blank"
                rel="noopener"
              >
                {place}
              </a>
            ))}
          </div>
        </div>
      ))}

      <div className="note">{t.legendPaid}</div>
      <div className="note">{t.legendFree}</div>

      <Link className="btn kr gray" href={`/?lang=${lang}`}>
        {t.back}
      </Link>
    </Cabinet>
  );
}
