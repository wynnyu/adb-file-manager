import { act, fireEvent, render, screen } from "@testing-library/react";
import { FolderPlus, Pencil, Skull } from "lucide-react";
import { describe, expect, it, vi } from "vitest";
import { deferred, providers, tz } from "../../test/utils.tsx";
import { Dialog, type DialogState } from "./Dialog.tsx";

function show(state: DialogState) {
  const onClose = vi.fn();
  render(<Dialog state={state} onClose={onClose} />, { wrapper: providers() });
  return { onClose };
}

const prompt = (patch: Partial<Extract<DialogState, { kind: "prompt" }>> = {}): DialogState => ({
  kind: "prompt",
  icon: Pencil,
  title: "重命名",
  initial: "photo.2024.jpg",
  confirm: "确定",
  onSubmit: vi.fn(async () => {}),
  ...patch,
});

const confirm = (patch: Partial<Extract<DialogState, { kind: "confirm" }>> = {}): DialogState => ({
  kind: "confirm",
  icon: Skull,
  title: "删除“a.txt”？",
  message: "将永久删除，无法恢复。",
  confirm: "删除",
  tone: "danger",
  onSubmit: vi.fn(async () => {}),
  ...patch,
});

const button = (name: string) => screen.getByRole("button", { name });

describe("Dialog", () => {
  describe("prompt", () => {
    it("聚焦输入框，只选中文件名主体，不选扩展名", () => {
      show(prompt());
      const input = screen.getByRole<HTMLInputElement>("textbox");
      expect(input).toBe(document.activeElement);
      expect(input.value).toBe("photo.2024.jpg");
      expect([input.selectionStart, input.selectionEnd]).toEqual([0, "photo.2024".length]);
    });

    it("没有扩展名时全部选中", () => {
      show(prompt({ icon: FolderPlus, initial: ".config" }));
      const input = screen.getByRole<HTMLInputElement>("textbox");
      expect([input.selectionStart, input.selectionEnd]).toEqual([0, ".config".length]);
    });

    it("提交去掉首尾空格的输入，成功后关闭", async () => {
      const state = prompt();
      const { onClose } = show(state);
      fireEvent.change(screen.getByRole("textbox"), { target: { value: "  新名字.jpg " } });
      await act(async () => fireEvent.click(button("确定")));
      expect(state.onSubmit).toHaveBeenCalledWith("新名字.jpg");
      expect(onClose).toHaveBeenCalled();
    });

    it("输入为空时不提交", () => {
      const state = prompt();
      show(state);
      fireEvent.change(screen.getByRole("textbox"), { target: { value: "   " } });
      fireEvent.click(button("确定"));
      expect(state.onSubmit).not.toHaveBeenCalled();
    });

    it("失败时显示错误，不关闭，可以再次提交", async () => {
      const onSubmit = vi.fn().mockRejectedValueOnce(new Error("目标已存在")).mockResolvedValueOnce(undefined);
      const { onClose } = show(prompt({ onSubmit }));
      await act(async () => fireEvent.click(button("确定")));
      expect(screen.getByText("目标已存在")).toBeTruthy();
      expect(onClose).not.toHaveBeenCalled();

      await act(async () => fireEvent.click(button("确定")));
      expect(onSubmit).toHaveBeenCalledTimes(2);
      expect(onClose).toHaveBeenCalled();
    });

    it("处理中按钮不可用，Esc 和点击背景都不关闭", async () => {
      const job = deferred<void>();
      const { onClose } = show(prompt({ onSubmit: () => job.promise }));
      await act(async () => fireEvent.click(button("确定")));
      const busy = button(tz("common.processing")) as HTMLButtonElement;
      expect(busy.disabled).toBe(true);
      expect((button(tz("common.cancel")) as HTMLButtonElement).disabled).toBe(true);

      fireEvent.keyDown(window, { key: "Escape" });
      fireEvent.mouseDown(document.querySelector("form")!.parentElement!);
      expect(onClose).not.toHaveBeenCalled();

      await act(async () => job.resolve());
      expect(onClose).toHaveBeenCalledTimes(1);
    });
  });

  describe("confirm", () => {
    it("显示标题和正文，确认时传入未勾选", async () => {
      const state = confirm();
      show(state);
      expect(screen.getByRole("heading").textContent).toBe("删除“a.txt”？");
      expect(screen.getByText("将永久删除，无法恢复。")).toBeTruthy();
      await act(async () => fireEvent.click(button("删除")));
      expect(state.onSubmit).toHaveBeenCalledWith(false);
    });

    it("可勾选项的结果传给 onSubmit", async () => {
      const state = confirm({ checkbox: "不再提示" });
      show(state);
      expect(button("不再提示").getAttribute("aria-pressed")).toBe("false");
      fireEvent.click(button("不再提示"));
      expect(button("不再提示").getAttribute("aria-pressed")).toBe("true");
      await act(async () => fireEvent.click(button("删除")));
      expect(state.onSubmit).toHaveBeenCalledWith(true);
    });

    it("倒计时结束前确认按钮不可用，默认聚焦“取消”", () => {
      vi.useFakeTimers();
      const state = confirm({ countdown: 3, confirm: "确认删除" });
      show(state);
      expect(document.activeElement).toBe(button(tz("common.cancel")));
      const ok = () => screen.getByRole<HTMLButtonElement>("button", { name: /^确认删除/ });
      expect(ok().textContent).toBe("确认删除（3）");
      expect(ok().disabled).toBe(true);

      // 回车提交表单也不生效
      fireEvent.submit(document.querySelector("form")!);
      expect(state.onSubmit).not.toHaveBeenCalled();

      for (let i = 0; i < 3; i++) act(() => vi.advanceTimersByTime(1000));
      expect(ok().textContent).toBe("确认删除");
      expect(ok().disabled).toBe(false);
    });
  });

  describe("form", () => {
    const form = (patch: Partial<Extract<DialogState, { kind: "form" }>> = {}): DialogState => ({
      kind: "form",
      icon: Pencil,
      title: "修改属性",
      fields: [
        { label: "属性名", initial: "persist.a", readOnly: true, mono: true },
        { label: "值", initial: "old", required: true, trim: true },
        { label: "备注", initial: " x " },
      ],
      confirm: "保存",
      onSubmit: vi.fn(async () => {}),
      ...patch,
    });
    const field = (name: string) => screen.getByRole<HTMLInputElement>("textbox", { name });

    it("聚焦第一个可编辑项并选中内容，只读项不可编辑", () => {
      show(form());
      expect(field("值")).toBe(document.activeElement);
      expect([field("值").selectionStart, field("值").selectionEnd]).toEqual([0, 3]);
      expect(field("属性名").readOnly).toBe(true);
      expect(field("属性名").value).toBe("persist.a");
    });

    it("显示说明，提交按项顺序传值，只对 trim 项去掉首尾空白", async () => {
      const state = form({ message: "说明文字" });
      const { onClose } = show(state);
      expect(screen.getByText("说明文字")).toBeTruthy();
      fireEvent.change(field("值"), { target: { value: "  new  " } });
      await act(async () => fireEvent.click(button("保存")));
      expect(state.onSubmit).toHaveBeenCalledWith(["persist.a", "new", " x "]);
      expect(onClose).toHaveBeenCalled();
    });

    it("必填项为空（含全空白）时禁用确认，回车也不提交", () => {
      const state = form();
      show(state);
      fireEvent.change(field("值"), { target: { value: "   " } });
      expect((button("保存") as HTMLButtonElement).disabled).toBe(true);
      fireEvent.submit(document.querySelector("form")!);
      expect(state.onSubmit).not.toHaveBeenCalled();
      fireEvent.change(field("值"), { target: { value: "1" } });
      expect((button("保存") as HTMLButtonElement).disabled).toBe(false);
    });

    it("非必填项可以为空", async () => {
      const state = form();
      show(state);
      fireEvent.change(field("备注"), { target: { value: "" } });
      await act(async () => fireEvent.click(button("保存")));
      expect(state.onSubmit).toHaveBeenCalledWith(["persist.a", "old", ""]);
    });

    it("失败时显示错误并保留输入，不关闭", async () => {
      const onSubmit = vi.fn().mockRejectedValueOnce(new Error("属性未生效"));
      const { onClose } = show(form({ onSubmit }));
      fireEvent.change(field("值"), { target: { value: "new" } });
      await act(async () => fireEvent.click(button("保存")));
      expect(screen.getByText("属性未生效")).toBeTruthy();
      expect(field("值").value).toBe("new");
      expect(onClose).not.toHaveBeenCalled();
    });
  });

  it("Esc、取消按钮和点击背景都会关闭，点在对话框里不会", () => {
    const { onClose } = show(confirm());
    fireEvent.mouseDown(document.querySelector("form")!);
    expect(onClose).not.toHaveBeenCalled();

    fireEvent.keyDown(window, { key: "Escape" });
    fireEvent.click(button(tz("common.cancel")));
    fireEvent.mouseDown(document.querySelector("form")!.parentElement!);
    expect(onClose).toHaveBeenCalledTimes(3);
  });
});
