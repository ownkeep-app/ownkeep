import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { describe, expect, it, vi } from "vitest";

import {
  APP_DEVELOPER_EMAIL,
  APP_FEATURES,
  APP_RELEASE_DATE,
  APP_WEBSITE,
  aboutVersionLabel,
} from "./about";
import { AboutDialog } from "./AboutDialog";
import { openExternalUrl } from "@/lib/url";

vi.mock("@/lib/url", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/url")>();
  return {
    ...actual,
    openExternalUrl: vi.fn(async () => true),
  };
});

const openExternal = vi.mocked(openExternalUrl);

describe("about metadata", () => {
  it("formats the version label", () => {
    expect(aboutVersionLabel("1.0")).toBe("keystash v1.0");
  });
});

describe("AboutDialog", () => {
  it("opens from the trigger and shows product details", async () => {
    const user = userEvent.setup();
    render(<AboutDialog />);

    await user.click(screen.getByRole("button", { name: "About keystash" }));

    expect(
      screen.getByRole("dialog", { name: "About keystash" }),
    ).toBeInTheDocument();
    expect(screen.getByText(aboutVersionLabel())).toBeInTheDocument();
    expect(screen.getByText(APP_RELEASE_DATE)).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: APP_DEVELOPER_EMAIL }),
    ).toHaveAttribute("href", `mailto:${APP_DEVELOPER_EMAIL}`);
    expect(screen.getByRole("link", { name: APP_WEBSITE })).toHaveAttribute(
      "href",
      APP_WEBSITE,
    );
    expect(screen.getByText(APP_FEATURES[0])).toBeInTheDocument();

    await user.click(screen.getByRole("link", { name: APP_WEBSITE }));
    expect(openExternal).toHaveBeenCalledWith(APP_WEBSITE);
    await user.click(screen.getByRole("link", { name: APP_DEVELOPER_EMAIL }));
    expect(openExternal).toHaveBeenCalledWith(`mailto:${APP_DEVELOPER_EMAIL}`);
  });

  it("toggles with Cmd+/", async () => {
    render(<AboutDialog showTrigger={false} />);

    fireEvent.keyDown(window, { key: "/", metaKey: true });
    expect(
      screen.getByRole("dialog", { name: "About keystash" }),
    ).toBeInTheDocument();

    fireEvent.keyDown(window, { key: "/", metaKey: true });
    await waitFor(() =>
      expect(
        screen.queryByRole("dialog", { name: "About keystash" }),
      ).not.toBeInTheDocument(),
    );
  });

  it("closes on Escape without leaking the key", async () => {
    const user = userEvent.setup();
    const onWindowKey = vi.fn();
    window.addEventListener("keydown", onWindowKey);
    render(<AboutDialog />);

    await user.click(screen.getByRole("button", { name: "About keystash" }));
    fireEvent.keyDown(screen.getByRole("dialog"), { key: "Escape" });

    await waitFor(() =>
      expect(
        screen.queryByRole("dialog", { name: "About keystash" }),
      ).not.toBeInTheDocument(),
    );
    expect(onWindowKey).not.toHaveBeenCalled();
    window.removeEventListener("keydown", onWindowKey);
  });

  it("closes via backdrop and the header close button", async () => {
    const user = userEvent.setup();
    render(<AboutDialog />);

    await user.click(screen.getByRole("button", { name: "About keystash" }));
    await user.click(
      screen.getByRole("button", { name: "Dismiss about keystash" }),
    );
    await waitFor(() =>
      expect(
        screen.queryByRole("dialog", { name: "About keystash" }),
      ).not.toBeInTheDocument(),
    );

    await user.click(screen.getByRole("button", { name: "About keystash" }));
    await user.click(
      screen.getByRole("button", { name: "Close about keystash" }),
    );
    await waitFor(() =>
      expect(
        screen.queryByRole("dialog", { name: "About keystash" }),
      ).not.toBeInTheDocument(),
    );
  });

  it("supports controlled open state", async () => {
    const onOpenChange = vi.fn();

    function Controlled() {
      const [open, setOpen] = useState(true);
      return (
        <AboutDialog
          onOpenChange={(next) => {
            onOpenChange(next);
            setOpen(next);
          }}
          open={open}
          showTrigger={false}
        />
      );
    }

    render(<Controlled />);
    expect(
      screen.getByRole("dialog", { name: "About keystash" }),
    ).toBeInTheDocument();

    fireEvent.keyDown(window, { key: "/", metaKey: true });
    await waitFor(() =>
      expect(
        screen.queryByRole("dialog", { name: "About keystash" }),
      ).not.toBeInTheDocument(),
    );
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });
});
