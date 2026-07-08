import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { useVaultStore } from "@/stores/vault-store";
import { createDefaultModel } from "@/vault/model";
import { financeModule } from "./module";
import type { Snapshot } from "./types";

vi.mock("uplot", () => ({
  default: vi.fn(() => ({ destroy: vi.fn() })),
}));

const snapshot: Snapshot = {
  id: "s1",
  date: "2026-07-01T00:00:00.000Z",
  note: "",
  entries: [{ place: "DBS", category: "bank", amount: 100, currency: "USD" }],
  updatedAt: "2026-07-01T00:00:00.000Z",
};

beforeEach(() => {
  useVaultStore.setState({
    model: createDefaultModel("2026-07-07T00:00:00.000Z"),
  });
});

describe("financeModule", () => {
  it("declares finance metadata and builds an index", () => {
    expect(financeModule.id).toBe("finance");
    expect(financeModule.scopePrefix).toBe("f");
    expect(financeModule.createEmpty()).toEqual([]);
    const index = financeModule.buildIndex([snapshot]);
    expect(index[0]).toMatchObject({
      id: "s1",
      moduleId: "finance",
      type: "finance",
    });
  });

  it("renders the ListView and EditView", () => {
    const ListView = financeModule.ListView;
    const EditView = financeModule.EditView;
    if (!EditView) throw new Error("finance EditView should be defined");

    const { unmount } = render(<ListView items={[snapshot]} />);
    expect(
      screen.getByRole("heading", { name: "Finance" }),
    ).toBeInTheDocument();
    unmount();

    render(<EditView item={snapshot} onCancel={() => {}} onSave={() => {}} />);
    expect(
      screen.getByRole("heading", { name: /edit snapshot/i }),
    ).toBeInTheDocument();
  });
});
