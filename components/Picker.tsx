"use client";

/**
 * 게임 느낌의 선택창.
 *
 * 원본 페이지의 arcade-ui.js 가 <select> 를 바꿔 끼우는 것과 같은 모양·같은 클래스를
 * 쓴다(스타일은 public/arcade-ui.css 한 곳에만 있다). 드롭다운이 아니라 눌러서 고르는
 * 픽셀 버튼이라, 학과나 학교 필터도 오락실 안에 있는 것처럼 보인다.
 */
export function Picker<T extends string>({
  value,
  options,
  onChange,
  wide = false,
  label,
}: {
  value: T;
  options: { value: T; main: string; sub?: string }[];
  onChange: (v: T) => void;
  wide?: boolean;
  label?: string;
}) {
  return (
    <div
      className="aa-pick"
      role="radiogroup"
      aria-label={label}
      style={wide ? { gridTemplateColumns: "1fr" } : undefined}
    >
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          role="radio"
          aria-checked={o.value === value}
          className={"aa-pick-op" + (o.value === value ? " cur" : "")}
          onClick={() => onChange(o.value)}
        >
          <b>{o.main}</b>
          {o.sub ? <i>{o.sub}</i> : null}
        </button>
      ))}
    </div>
  );
}
