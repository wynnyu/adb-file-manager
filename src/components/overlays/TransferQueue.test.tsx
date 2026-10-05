import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { providers, tz } from "../../test/utils.tsx";
import type { Transfer } from "../../types.ts";
import { TransferQueue } from "./TransferQueue.tsx";

function show(items: Transfer[]) {
  const onDismiss = vi.fn();
  render(
    <TransferQueue items={items} onDismiss={onDismiss}>
      <p>提示</p>
    </TransferQueue>,
    { wrapper: providers() },
  );
  return { onDismiss };
}

const close = () => screen.queryAllByRole("button", { name: tz("common.close") });

describe("TransferQueue", () => {
  it("上传到电脑阶段显示百分比", () => {
    show([{ id: "1", kind: "upload", label: "photos", status: "uploading", progress: 0.426 }]);
    expect(screen.getByText("photos")).toBeTruthy();
    expect(screen.getByText("43%")).toBeTruthy();
    expect(screen.getByText(tz("transfer.uploading"))).toBeTruthy();
  });

  it("进行中的任务不能关闭", () => {
    show([
      { id: "1", kind: "upload", label: "a", status: "pushing" },
      { id: "2", kind: "move", label: "b", status: "moving" },
    ]);
    expect(screen.getByText(tz("transfer.pushing"))).toBeTruthy();
    expect(screen.getByText(tz("transfer.moving"))).toBeTruthy();
    expect(close()).toHaveLength(0);
  });

  it("失败的任务显示错误原因，可以关闭", () => {
    const { onDismiss } = show([{ id: "9", kind: "download", label: "a.txt", status: "error", error: "下载已过期" }]);
    expect(screen.getByText("下载已过期")).toBeTruthy();
    fireEvent.click(close()[0]);
    expect(onDismiss).toHaveBeenCalledWith("9");
  });

  it("完成的任务显示完成", () => {
    show([{ id: "1", kind: "copy", label: "a", status: "done" }]);
    expect(screen.getByText(tz("transfer.done"))).toBeTruthy();
    expect(close()).toHaveLength(1);
  });

  it("children 排在传输卡片下面", () => {
    show([{ id: "1", kind: "copy", label: "a", status: "copying" }]);
    const tip = screen.getByText("提示");
    expect(screen.getByText("a").compareDocumentPosition(tip) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });
});
