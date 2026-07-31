/**
 * 학교 이름 한 줄.
 *
 * 영문을 크게 쓰고 현지어를 작게 옆에 붙인다.
 *   The Catholic University of Korea  가톨릭대학교
 *
 * 영문만 쓰면 한국 학생이 자기 학교를 한눈에 못 찾고, 현지어만 쓰면 나라마다 다른
 * 글자가 섞여 목록이 흐트러진다. 어느 쪽도 버리지 않으려고 크기로 나눴다.
 *
 * 현지어 이름은 출처가 있는 학교에만 있다. 없으면 영문만 나온다 - 없는 이름을
 * 지어내는 것보다 한 줄이 짧은 편이 낫다.
 */
export function SchoolName({
  name,
  local,
  size,
}: {
  name: string;
  local?: string | null;
  /// 목록 한 줄처럼 좁은 자리에서는 "small" 로 줄여 쓴다.
  size?: "normal" | "small";
}) {
  const localSize = size === "small" ? 10 : 12;

  return (
    <>
      {name}
      {/* 같은 이름이 두 번 나오지 않게 한다 - 영문과 현지어가 같은 학교가 있다. */}
      {local && local !== name && (
        <span
          style={{
            fontSize: localSize,
            color: "var(--dim)",
            marginLeft: 6,
            // 줄이 좁을 때 이름 중간이 아니라 현지어 앞에서 줄바꿈되게 한다.
            whiteSpace: "nowrap",
          }}
        >
          {local}
        </span>
      )}
    </>
  );
}
