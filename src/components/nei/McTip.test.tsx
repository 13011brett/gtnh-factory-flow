// @vitest-environment jsdom
import { cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { itemTipLines, McFloatingTip, modDisplayName } from "./McTip";
import { TOOLTIP_PANEL_CLASS } from "./tooltip-style";

afterEach(cleanup);

describe("Minecraft's tooltip", () => {
  it("writes an item as the game does: name, grey lines, the mod last", () => {
    expect(
      itemTipLines({ name: "Sodium Dust", id: "gregtech:gt.metaitem.01:2017", tooltip: ["Na", "Sodium Dust"], extra: ["274 recipes"] }),
    ).toEqual([
      { text: "Sodium Dust", tone: "name" },
      { text: "Na" },
      { text: "274 recipes" },
      { text: "GregTech", tone: "mod" },
    ]);
  });

  it("names no mod for a bare fluid id", () => {
    expect(itemTipLines({ name: "Water", id: "water" })).toEqual([{ text: "Water", tone: "name" }]);
  });

  it("names mods as NEI does, and keeps an unknown prefix", () => {
    expect(modDisplayName("bartworks")).toBe("BartWorks");
    expect(modDisplayName("IC2")).toBe("IndustrialCraft 2");
    expect(modDisplayName("someMod")).toBe("SomeMod");
  });

  it("draws in Minecraft's box with the tones on the lines", () => {
    render(<McFloatingTip x={100} y={100} lines={itemTipLines({ name: "Salt", id: "gregtech:salt" })} />);
    const panel = document.querySelector("[data-minecraft-tooltip]")!;
    expect(panel.classList.contains("mc-tip")).toBe(true);
    const lines = [...panel.querySelectorAll(".mc-tip-line")];
    expect(lines.map((line) => line.getAttribute("data-tone"))).toEqual(["name", "mod"]);
    expect(lines.map((line) => line.textContent)).toEqual(["Salt", "GregTech"]);
  });

  it("every panel tooltip wears the same box", () => {
    expect(TOOLTIP_PANEL_CLASS.split(" ")).toContain("mc-tip");
  });
});
