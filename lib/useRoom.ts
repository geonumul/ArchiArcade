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

const POLL_MS = 1500;

export function useRoomPoll(code: string | null, active: boolean) {
  const [state, setState] = useState<RoomState | null>(null);
  const [gone, setGone] = useState(false);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);

  const fetchOnce = useCallback(async () => {
    if (!code) return;
    try {
      const res = await fetch(`/api/rooms/${code}`, { cache: "no-store" });
      if (res.status === 404) {
        setGone(true);
        return;
      }
      if (!res.ok) return;
      const data = (await res.json()) as { state: RoomState };
      setState(data.state);
    } catch {
      // 일시적 네트워크 오류는 다음 주기에 자연히 복구된다
    }
  }, [code]);

  useEffect(() => {
    if (!code || !active) return;
    void fetchOnce();
    timer.current = setInterval(fetchOnce, POLL_MS);
    return () => {
      if (timer.current) clearInterval(timer.current);
      timer.current = null;
    };
  }, [code, active, fetchOnce]);

  return { state, gone, refresh: fetchOnce, setState };
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
