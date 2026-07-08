import { beforeEach, describe, expect, it, vi } from "vitest";

import { toast } from "sonner";
import {
  toastClipboard,
  toastCopied,
  toastError,
  toastSecretCopied,
} from "./toast";

vi.mock("sonner", () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));

const success = vi.mocked(toast.success);
const error = vi.mocked(toast.error);

describe("toast helpers", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("uses a default label for a generic copy", () => {
    toastCopied();
    expect(success).toHaveBeenCalledWith("Copied to the clipboard");
  });

  it("accepts a custom copy label", () => {
    toastCopied("URL copied");
    expect(success).toHaveBeenCalledWith("URL copied");
  });

  it("notes the auto-clear window when copying a secret", () => {
    toastSecretCopied(30);
    expect(success).toHaveBeenCalledWith("Password copied", {
      description: "The clipboard clears in 30s.",
    });
  });

  it("warns to clear manually when auto-clear is disabled", () => {
    toastSecretCopied(0);
    expect(success).toHaveBeenCalledWith("Password copied", {
      description: "Remember to clear your clipboard when you are done.",
    });
  });

  it("surfaces errors", () => {
    toastError("Boom");
    expect(error).toHaveBeenCalledWith("Boom");
  });

  it("toasts success or a generic failure for a clipboard write", () => {
    toastClipboard(true, "Command copied");
    expect(success).toHaveBeenCalledWith("Command copied");

    toastClipboard(false, "Command copied");
    expect(error).toHaveBeenCalledWith("Couldn't copy to the clipboard.");
  });
});
