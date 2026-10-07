import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { providers, tz } from "../../test/utils.tsx";
import type { Task } from "../../types.ts";
import { TaskQueue } from "./TaskQueue.tsx";

function show(items: Task[]) {
  const onDismiss = vi.fn();
  render(
    <TaskQueue items={items} onDismiss={onDismiss}>
      <p>提示</p>
    </TaskQueue>,
    { wrapper: providers() },
  );
  return { onDismiss };
}

const close = () => screen.queryAllByRole("button", { name: tz("common.close") });

describe("TaskQueue", () => {
  it("上传到电脑阶段显示百分比", () => {
    show([{ id: "1", kind: "upload", label: "photos", status: "uploading", progress: 0.426 }]);
    expect(screen.getByText("photos")).toBeTruthy();
    expect(screen.getByText("43%")).toBeTruthy();
    expect(screen.getByText(tz("task.uploading"))).toBeTruthy();
  });

  it("进行中的任务不能关闭", () => {
    show([
      { id: "1", kind: "upload", label: "a", status: "pushing" },
      { id: "2", kind: "move", label: "b", status: "moving" },
    ]);
    expect(screen.getByText(tz("task.pushing"))).toBeTruthy();
    expect(screen.getByText(tz("task.moving"))).toBeTruthy();
    expect(close()).toHaveLength(0);
  });

  it("失败的任务显示错误原因，可以关闭", () => {
    const { onDismiss } = show([{ id: "9", kind: "download", label: "a.txt", status: "error", error: "下载已过期" }]);
    expect(screen.getByText("下载已过期")).toBeTruthy();
    fireEvent.click(close()[0]);
    expect(onDismiss).toHaveBeenCalledWith("9");
  });

  it("压缩中显示正在压缩，不能关闭", () => {
    show([{ id: "1", kind: "compress", label: "photos", status: "compressing" }]);
    expect(screen.getByText(tz("task.compressing"))).toBeTruthy();
    expect(close()).toHaveLength(0);
  });

  it("完成的任务带说明时显示说明而不是完成", () => {
    show([{ id: "1", kind: "compress", label: "d", status: "done", note: tz("task.skipped", { n: 3 }) }]);
    expect(screen.getByText(tz("task.skipped", { n: 3 }))).toBeTruthy();
    expect(screen.queryByText(tz("task.done"))).toBeNull();
  });

  it("完成的任务显示完成", () => {
    show([{ id: "1", kind: "copy", label: "a", status: "done" }]);
    expect(screen.getByText(tz("task.done"))).toBeTruthy();
    expect(close()).toHaveLength(1);
  });

  it("任何进行中的状态只要有进度就显示百分比", () => {
    show([{ id: "1", kind: "compress", label: "d", status: "compressing", progress: 0.5 }]);
    expect(screen.getByText("50%")).toBeTruthy();
  });

  it("统计大小时显示对应文案，没有进度时不显示百分比", () => {
    show([{ id: "1", kind: "download", label: "d", status: "preparing" }]);
    expect(screen.getByText(tz("task.preparing"))).toBeTruthy();
    expect(screen.queryByText(/%$/)).toBeNull();
  });

  it("进行中且可取消的任务显示取消按钮，点击后调用 cancel", () => {
    const cancel = vi.fn();
    show([{ id: "1", kind: "download", label: "d", status: "pulling", cancel }]);
    fireEvent.click(screen.getByRole("button", { name: tz("task.cancel") }));
    expect(cancel).toHaveBeenCalledOnce();
  });

  it("没有 cancel 的任务和已结束的任务不显示取消按钮", () => {
    show([
      { id: "1", kind: "download", label: "a", status: "pulling" },
      { id: "2", kind: "download", label: "b", status: "done", cancel: vi.fn() },
    ]);
    expect(screen.queryByRole("button", { name: tz("task.cancel") })).toBeNull();
  });

  it("已取消的任务显示已取消，可以关闭", () => {
    show([{ id: "1", kind: "download", label: "a", status: "canceled" }]);
    expect(screen.getByText(tz("task.canceled"))).toBeTruthy();
    expect(close()).toHaveLength(1);
  });

  it("children 排在任务卡片下面", () => {
    show([{ id: "1", kind: "copy", label: "a", status: "copying" }]);
    const tip = screen.getByText("提示");
    expect(screen.getByText("a").compareDocumentPosition(tip) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });
});
