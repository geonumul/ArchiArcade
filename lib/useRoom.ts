"use client";

import { useCallback, useEffect, useRef, useState } from "react";

/// 방 상태. 호스트가 갱신하고 참가자는 폴링으로 따라간다.
/// v1 은 폴링 유지 — 실시간 승격(Pusher 등)은 STEP 5 에서 다룬다.
export interface RoomState {
  phase: "lobby" | "quiz" | "reveal" | "end";
  seed: number[];
  step: number;
  timeLimit: number;
  lang: string;
  players: string[];
  /// 현재 문항의 마감 시각(epoch ms). 호스트가 정하고 모두가 같은 값을 본다.
  deadline?: number;
  createdAt?: number;
}

/**
 * 폴링 주기.
 *
 * 남은 시간은 서버가 내려준 deadline 을 받아 브라우저가 스스로 세기 때문에,
 * 폴링은 "다음 문항으로 넘어갔는지"만 확인하면 된다. 그래서 1초 미만으로 조일 이유가
 * 없고, 주기를 늘린 만큼 요청량이 그대로 줄어든다 — 무료 티어에서 가장 먼저 닿는
 * 한계가 이 요청량이다.
 */
const POLL_QUIZ_MS = 3000;
const POLL_IDLE_MS = 6000;

export interface RoomSnapshot {
  state: RoomState | null;
  playerCount: number;
  maxPlayers: number;
}

export function useRoomPoll(code: string | null, active: boolean) {
  const [state, setState] = useState<RoomState | null>(null);
  const [playerCount, setPlayerCount] = useState(0);
  const [maxPlayers, setMaxPlayers] = useState(0);
  const [gone, setGone] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const phaseRef = useRef<RoomState["phase"] | null>(null);

  const fetchOnce = useCallback(async () => {
    if (!code) return;
    try {
      const res = await fetch(`/api/rooms/${code}`, { cache: "no-store" });
      if (res.status === 404) {
        setGone(true);
        return;
      }
      if (!res.ok) return;
      const data = (await res.json()) as {
        state: RoomState;
        playerCount?: number;
        maxPlayers?: number;
      };
      setState(data.state);
      phaseRef.current = data.state?.phase ?? null;
      if (typeof data.playerCount === "number") setPlayerCount(data.playerCount);
      if (typeof data.maxPlayers === "number") setMaxPlayers(data.maxPlayers);
    } catch {
      // 일시적 네트워크 오류는 다음 주기에 자연히 복구된다
    }
  }, [code]);

  useEffect(() => {
    if (!code || !active) return;
    let stopped = false;

    const loop = async () => {
      await fetchOnce();
      if (stopped) return;
      // 대기실처럼 변화가 드문 구간에서는 더 느리게 돈다.
      const wait = phaseRef.current === "quiz" ? POLL_QUIZ_MS : POLL_IDLE_MS;
      timer.current = setTimeout(loop, wait);
    };
    void loop();

    return () => {
      stopped = true;
      if (timer.current) clearTimeout(timer.current);
      timer.current = null;
    };
  }, [code, active, fetchOnce]);

  return { state, playerCount, maxPlayers, gone, refresh: fetchOnce, setState };
}

export async function patchRoom(code: string, state: RoomState): Promise<boolean> {
  try {
    const res = await fetch(`/api/rooms/${code}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ state }),
    });
    return res.ok;
  } catch {
    return false;
  }
}

export async function closeRoom(code: string): Promise<void> {
  try {
    await fetch(`/api/rooms/${code}`, { method: "DELETE" });
  } catch {
    /* 종료는 실패해도 24시간 뒤 만료로 정리된다 */
  }
}

/// 남은 시간(초). 마감이 없으면 null.
export function useCountdown(deadline: number | undefined): number | null {
  const [left, setLeft] = useState<number | null>(null);

  useEffect(() => {
    if (!deadline) {
      setLeft(null);
      return;
    }
    const tick = () => setLeft(Math.max(0, Math.ceil((deadline - Date.now()) / 1000)));
    tick();
    const id = setInterval(tick, 250);
    return () => clearInterval(id);
  }, [deadline]);

  return left;
}
