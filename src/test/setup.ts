import { cleanup } from "@testing-library/react";
import { MotionGlobalConfig } from "motion/react";
import { afterEach, beforeEach, vi } from "vitest";

// 动画直接跳到终态，退场的元素立即移除
MotionGlobalConfig.skipAnimations = true;

// jsdom 没有实现滚动
Element.prototype.scrollIntoView = () => {};
Element.prototype.scrollTo = () => {};

beforeEach(() => {
  localStorage.clear();
  // 界面语言固定为中文，期望的文案用 tz 从中文词典里取
  localStorage.setItem("afm.lang", JSON.stringify("zh"));
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.restoreAllMocks();
});
