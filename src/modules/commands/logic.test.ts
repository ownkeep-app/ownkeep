import { describe, expect, it } from "vitest";

import {
  argumentsToText,
  buildCommandIndex,
  commandEntries,
  createCommandEntry,
  fillTemplate,
  formFromCommand,
  groupByTag,
  parseArguments,
  parsePlaceholders,
  updateCommandEntry,
  validateCommandInput,
} from "./logic";
import { emptyCommandForm } from "./logic";
import type { CommandEntry, CommandFormInput } from "./types";

const NOW = "2026-07-07T00:00:00.000Z";

function entry(overrides: Partial<CommandEntry> = {}): CommandEntry {
  return {
    id: "c1",
    category: "git",
    title: "Delete a remote branch",
    description: "Delete a branch on origin",
    snippets: [
      { language: "bash", code: "git push origin --delete {{branch}}" },
    ],
    primaryCopyTemplate: "git push origin --delete {{branch}}",
    arguments: [],
    tags: ["git"],
    updatedAt: NOW,
    ...overrides,
  };
}

describe("parsePlaceholders", () => {
  it("extracts unique names in order, reusing repeats", () => {
    expect(
      parsePlaceholders("docker run -p {{port}}:{{port}} {{img}}"),
    ).toEqual(["port", "img"]);
  });

  it("ignores invalid placeholder shapes", () => {
    expect(parsePlaceholders("{{1bad}} {{ }} {{a b}} {{ok_1}}")).toEqual([
      "ok_1",
    ]);
  });

  it("returns nothing when there are no placeholders", () => {
    expect(parsePlaceholders("git status")).toEqual([]);
  });
});

describe("fillTemplate", () => {
  it("fills a mid-string, repeated placeholder correctly", () => {
    expect(
      fillTemplate("docker run -p {{port}}:{{port}} {{img}}", {
        port: "8080",
        img: "nginx",
      }),
    ).toBe("docker run -p 8080:8080 nginx");
  });

  it("leaves placeholders without a value intact (raw stays raw)", () => {
    const template = "git push origin --delete {{branch}}";
    expect(fillTemplate(template, {})).toBe(template);
  });

  it("differs from the raw template once filled", () => {
    const template = "git push origin --delete {{branch}}";
    const filled = fillTemplate(template, { branch: "feature" });
    expect(filled).toBe("git push origin --delete feature");
    expect(filled).not.toContain("{{");
    expect(template).toContain("{{branch}}"); // raw copy preserves the placeholder
  });
});

describe("parseArguments / argumentsToText", () => {
  it("parses text and enum arguments, deduping and validating names", () => {
    const args = parseArguments(
      "branch\nenv = dev, staging, prod\n1bad\nbranch\n",
    );
    expect(args).toEqual([
      { name: "branch", type: "text" },
      { name: "env", type: "enum", values: ["dev", "staging", "prod"] },
    ]);
  });

  it("round-trips through argumentsToText", () => {
    const text = "branch\nenv = dev, prod";
    expect(argumentsToText(parseArguments(text))).toBe(text);
  });

  it("treats an enum with no values as a text argument", () => {
    expect(parseArguments("x =")).toEqual([{ name: "x", type: "text" }]);
  });
});

describe("buildCommandIndex", () => {
  it("builds the one-line searchable form without exposing secrets", () => {
    const [indexed] = buildCommandIndex([entry()]);
    expect(indexed.displayLine).toBe(
      "Git command to Delete a remote branch: git push origin --delete {{branch}}",
    );
    expect(indexed.type).toBe("command");
    expect(indexed.searchString).toContain("git");
  });
});

describe("groupByTag", () => {
  it("groups by tag and sorts tags + titles", () => {
    const groups = groupByTag([
      entry({ id: "b", tags: ["git"], title: "Zeta" }),
      entry({ id: "a", tags: ["git"], title: "Alpha" }),
      entry({ id: "d", tags: ["docker"], title: "Compose" }),
    ]);
    expect(groups.map((g) => g.tag)).toEqual(["docker", "git"]);
    expect(groups[1].commands.map((c) => c.title)).toEqual(["Alpha", "Zeta"]);
  });

  it("lists a multi-tag command under each tag and falls back to Untagged", () => {
    const shared = entry({
      id: "shared",
      title: "Shared",
      tags: ["git", "docker"],
    });
    const groups = groupByTag([shared, entry({ id: "plain", tags: [] })]);
    expect(groups.map((g) => g.tag)).toEqual(["docker", "git", "Untagged"]);
    expect(groups.find((g) => g.tag === "git")?.commands).toHaveLength(1);
    expect(groups.find((g) => g.tag === "docker")?.commands).toHaveLength(1);
    expect(groups.find((g) => g.tag === "Untagged")?.commands[0].id).toBe(
      "plain",
    );
  });
});

describe("command CRUD", () => {
  const form: CommandFormInput = {
    category: " git ",
    title: " Delete branch ",
    description: "",
    language: "bash",
    code: "git push origin --delete {{branch}}",
    argumentsText: "branch",
    tags: ["git", "vcs", "git"],
  };

  it("creates a normalized entry with a single snippet + template", () => {
    const created = createCommandEntry(form, NOW, "fixed");
    expect(created.id).toBe("fixed");
    expect(created.category).toBe("git");
    expect(created.title).toBe("Delete branch");
    expect(created.snippets).toEqual([
      { language: "bash", code: "git push origin --delete {{branch}}" },
    ]);
    expect(created.primaryCopyTemplate).toBe(created.snippets[0].code);
    expect(created.arguments).toEqual([{ name: "branch", type: "text" }]);
    expect(created.tags).toEqual(["git", "vcs"]);
  });

  it("keeps the id on update and round-trips through the form", () => {
    const original = createCommandEntry(form, NOW, "keep");
    const updated = updateCommandEntry(
      original,
      formFromCommand(original),
      "2026-07-08T00:00:00.000Z",
    );
    expect(updated.id).toBe("keep");
    expect(updated.primaryCopyTemplate).toBe(original.primaryCopyTemplate);
    expect(updated.updatedAt).toBe("2026-07-08T00:00:00.000Z");
  });

  it("drops the snippet when the code is empty", () => {
    const created = createCommandEntry({ ...form, code: "  " }, NOW, "empty");
    expect(created.snippets).toEqual([]);
  });

  it("validates required fields", () => {
    expect(validateCommandInput(emptyCommandForm())).toMatch(/title/i);
    expect(validateCommandInput({ ...emptyCommandForm(), title: "x" })).toMatch(
      /command/i,
    );
    expect(
      validateCommandInput({
        ...emptyCommandForm(),
        title: "x",
        category: "",
      }),
    ).toMatch(/category/i);
    expect(validateCommandInput(form)).toBeNull();
  });
});

describe("commandEntries", () => {
  it("filters out non-command items", () => {
    expect(
      commandEntries([entry(), { nope: true }, "x"]).map((c) => c.id),
    ).toEqual(["c1"]);
  });

  it("formFromCommand falls back to the template when there is no snippet", () => {
    const form = formFromCommand(entry({ snippets: [] }));
    expect(form.code).toBe("git push origin --delete {{branch}}");
  });
});
