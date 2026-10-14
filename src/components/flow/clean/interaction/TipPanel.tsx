"use client";

import { forwardRef, type CSSProperties } from "react";
import { PowerControlsGuide, PowerReadout } from "../../HatchPowerControls";
import { tooltipMode } from "../../recipe-tooltip-data";
import { applyRecipeInputOverrides } from "@/lib/model";
import { useFactoryStore } from "@/store/factory-store";
import { splitGold, type TipInput, type TipSpec } from "./tip-spec";
import "./interaction.css";

/** The mod's 7 x 10 mouse icon: outline with clipped corners, the pressed part filled. */
export function MouseIcon({ input }: { input: TipInput }) {
  if (input === "key") {
    return (
      <svg className="tp-icon" width="7" height="10" viewBox="0 0 7 10" aria-hidden>
        <rect x="0.5" y="1.5" width="6" height="6" fill="none" stroke="#a3a3a3" />
        <rect x="2" y="3" width="3" height="3" fill="#f5f5f5" />
      </svg>
    );
  }
  return (
    <svg className="tp-icon" width="7" height="10" viewBox="0 0 7 10" aria-hidden shapeRendering="crispEdges">
      <path d="M1.5 .5H5.5L6.5 1.5V8.5L5.5 9.5H1.5L.5 8.5V1.5Z" fill="none" stroke="#a3a3a3" />
      {input === "left" || input === "drag" ? <rect x="1" y="1" width="2.5" height="3" fill="#f5f5f5" /> : null}
      {input === "right" ? <rect x="3.5" y="1" width="2.5" height="3" fill="#f5f5f5" /> : null}
      {input === "wheel" || input === "middle" ? <rect x="3" y="1" width="1" height="4" fill="#f5f5f5" /> : null}
      {input === "drag" ? <path d="M3.5 5.5v3M2.5 7.5l1 1 1-1" fill="none" stroke="#f5f5f5" /> : null}
    </svg>
  );
}

function Gold({ text }: { text: string }) {
  return (
    <>
      {splitGold(text).map((run, index) =>
        run.gold ? (
          <span key={index} className="tp-gold">
            {run.text}
          </span>
        ) : (
          run.text
        ),
      )}
    </>
  );
}

/** The power input panel of the classic card (overclocks, next improvement, demand), for a card's chips and power row. */
function PowerPanel({ nodeId }: { nodeId: string }) {
  const project = useFactoryStore((state) => state.project);
  const lastResult = useFactoryStore((state) => state.lastResult);
  const node = project.nodes.find((entry) => entry.id === nodeId);
  const recipe = project.recipes.find((entry) => entry.id === node?.recipeId);
  if (!node || !recipe) return null;
  const nodeRecipe = applyRecipeInputOverrides(recipe, node);
  const result = lastResult?.nodes[nodeId];
  return (
    <div className="tp-power">
      <div className="tp-power-body">
        <PowerReadout
          recipe={nodeRecipe}
          node={node}
          mode={tooltipMode(project)}
          plannedEuT={result?.enabled && result.theoreticalMachinesRequired > 0 ? result.euT : undefined}
          utilization={result?.utilization}
        />
      </div>
      <div className="tp-power-guide">
        <PowerControlsGuide raw={node.powerInputMode === "eut"} />
      </div>
    </div>
  );
}

export interface TipPanelProps {
  spec: TipSpec;
  style?: CSSProperties;
}

/** The clean tooltip skin (spec 10.2) around title, rows, notes, rule and actions. */
export const TipPanel = forwardRef<HTMLDivElement, TipPanelProps>(function TipPanel({ spec, style }, ref) {
  return (
    <div ref={ref} className="tp ui-zoom" data-clean-tip="" data-tip-panel={spec.panel ? spec.panel.kind : undefined} style={style}>
      <div className="tp-title">{spec.title}</div>
      {spec.sub ? <div className="tp-sub">{spec.sub}</div> : null}
      {spec.panel?.kind === "power" ? <PowerPanel nodeId={spec.panel.nodeId} /> : null}
      {spec.rows?.map((row, index) => (
        <div key={index} className="tp-row">
          <span className="tp-label">{row.label}</span>
          <span className="tp-value" data-tone={row.tone && row.tone !== "plain" ? row.tone : undefined}>
            {row.value}
          </span>
        </div>
      ))}
      {spec.notes?.map((note, index) => (
        <div key={index} className="tp-note" data-tone={note.tone && note.tone !== "plain" ? note.tone : undefined}>
          <Gold text={note.text} />
        </div>
      ))}
      {spec.actions && spec.actions.length > 0 ? (
        <>
          <div className="tp-rule" />
          <div className="tp-actions">
            {spec.actions.map((action, index) => (
              <span key={index} className="tp-action">
                <MouseIcon input={action.input} />
                {action.label}
              </span>
            ))}
          </div>
        </>
      ) : null}
    </div>
  );
});
