import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { FillInForm } from "./FillInForm";
import type { CommandArgument } from "./types";

const ARGS: CommandArgument[] = [
  { name: "img", type: "enum", values: ["nginx", "redis"] },
];

describe("FillInForm", () => {
  it("renders one field per unique placeholder (enum → dropdown) and previews the fill", async () => {
    const user = userEvent.setup();
    render(
      <FillInForm
        arguments={ARGS}
        onCancel={() => {}}
        onComplete={() => {}}
        onRaw={() => {}}
        template="docker run -p {{port}}:{{port}} {{img}}"
        title="Run a container"
      />,
    );

    const img = screen.getByLabelText("img");
    expect(img.tagName).toBe("SELECT"); // enum argument → dropdown
    await user.type(screen.getByLabelText("port"), "8080");
    await user.selectOptions(img, "nginx");

    expect(
      screen.getByText("docker run -p 8080:8080 nginx"),
    ).toBeInTheDocument();
  });

  it("copies the completed command on submit", async () => {
    const user = userEvent.setup();
    const onComplete = vi.fn();
    render(
      <FillInForm
        arguments={ARGS}
        onCancel={() => {}}
        onComplete={onComplete}
        onRaw={() => {}}
        template="docker run -p {{port}}:{{port}} {{img}}"
        title="Run a container"
      />,
    );

    await user.type(screen.getByLabelText("port"), "80");
    await user.selectOptions(screen.getByLabelText("img"), "redis");
    await user.click(screen.getByRole("button", { name: /^copy$/i }));

    expect(onComplete).toHaveBeenCalledWith("docker run -p 80:80 redis");
  });

  it("copies raw via the button and via Opt/Alt+Enter", async () => {
    const user = userEvent.setup();
    const onRaw = vi.fn();
    const { container } = render(
      <FillInForm
        arguments={ARGS}
        onCancel={() => {}}
        onComplete={() => {}}
        onRaw={onRaw}
        template="docker run -p {{port}}:{{port}} {{img}}"
        title="Run a container"
      />,
    );

    await user.click(screen.getByRole("button", { name: /copy raw/i }));
    expect(onRaw).toHaveBeenCalledTimes(1);

    const form = container.querySelector("form");
    fireEvent.keyDown(form as HTMLElement, { key: "Enter", altKey: true });
    expect(onRaw).toHaveBeenCalledTimes(2);
  });

  it("ignores a plain Enter keydown for the raw shortcut", () => {
    const onRaw = vi.fn();
    const { container } = render(
      <FillInForm
        arguments={ARGS}
        onCancel={() => {}}
        onComplete={() => {}}
        onRaw={onRaw}
        template="docker run -p {{port}}:{{port}} {{img}}"
        title="Run a container"
      />,
    );
    fireEvent.keyDown(container.querySelector("form") as HTMLElement, {
      key: "Enter",
    });
    expect(onRaw).not.toHaveBeenCalled();
  });

  it("cancels", async () => {
    const user = userEvent.setup();
    const onCancel = vi.fn();
    render(
      <FillInForm
        arguments={ARGS}
        onCancel={onCancel}
        onComplete={() => {}}
        onRaw={() => {}}
        template="docker run -p {{port}}:{{port}} {{img}}"
        title="Run a container"
      />,
    );
    await user.click(screen.getByRole("button", { name: /cancel/i }));
    expect(onCancel).toHaveBeenCalled();
  });
});
