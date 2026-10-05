import { act, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useToast } from "./useToast.ts";

describe("useToast", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  it("默认是错误提示，4 秒后消失", () => {
    const { result } = renderHook(() => useToast());
    act(() => result.current.flash("出错了"));
    expect(result.current.toast).toEqual({ msg: "出错了", tone: "error" });
    act(() => vi.advanceTimersByTime(3999));
    expect(result.current.toast).not.toBeNull();
    act(() => vi.advanceTimersByTime(1));
    expect(result.current.toast).toBeNull();
  });

  it("普通信息 2.5 秒后消失", () => {
    const { result } = renderHook(() => useToast());
    act(() => result.current.flash("已拷贝", "info"));
    act(() => vi.advanceTimersByTime(2500));
    expect(result.current.toast).toBeNull();
  });

  it("前一条的计时器不会清掉后来的提示", () => {
    const { result } = renderHook(() => useToast());
    act(() => result.current.flash("第一条"));
    act(() => vi.advanceTimersByTime(3000));
    act(() => result.current.flash("第二条", "info"));
    // 第一条的 4 秒到期
    act(() => vi.advanceTimersByTime(1000));
    expect(result.current.toast?.msg).toBe("第二条");
    act(() => vi.advanceTimersByTime(1500));
    expect(result.current.toast).toBeNull();
  });
});
