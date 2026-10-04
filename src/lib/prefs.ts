import { type Dispatch, type SetStateAction, useEffect, useState } from "react";

export function loadPref<T>(key: string, fallback: T): T {
  try {
    const v = localStorage.getItem(key);
    return v == null ? fallback : (JSON.parse(v) as T);
  } catch {
    return fallback;
  }
}
export function savePref(key: string, v: unknown) {
  try {
    localStorage.setItem(key, JSON.stringify(v));
  } catch {
    /* 隐私模式等情况下忽略 */
  }
}

/** 存在 localStorage 里的状态：初值从中读取，变化后写回 */
export function usePref<T>(key: string, fallback: T): [T, Dispatch<SetStateAction<T>>] {
  const [value, setValue] = useState(() => loadPref(key, fallback));
  useEffect(() => savePref(key, value), [key, value]);
  return [value, setValue];
}
