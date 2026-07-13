import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { TagMultiSelect } from "./tag-multi-select";

describe("TagMultiSelect", () => {
  it("toggles tags on and off", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    const { rerender } = render(
      <TagMultiSelect
        aria-label="Tags"
        onChange={onChange}
        options={["Bash", "CSS"]}
        value={["Bash"]}
      />,
    );

    await user.click(screen.getByRole("checkbox", { name: "Bash" }));
    expect(onChange).toHaveBeenCalledWith([]);

    onChange.mockClear();
    rerender(
      <TagMultiSelect
        aria-label="Tags"
        onChange={onChange}
        options={["Bash", "CSS"]}
        value={[]}
      />,
    );
    await user.click(screen.getByRole("checkbox", { name: "CSS" }));
    expect(onChange).toHaveBeenCalledWith(["CSS"]);
  });
});
