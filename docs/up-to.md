# Up to: a machine count that is what you have

Written 2026-10-18. The website first, the mod (`gtnh-planner-mod`, `data/flowchart/balancer/`) right after, in
lockstep: every rule here has a Java twin and the two must give the same answer. The card's look is
`mockups/up-to-card/` (pass 3, `index.html`; its README has the owner's decisions).

## The rule

A card's machine count has one of three rules:

- **Any**: the plan picks how many (no `solvePin`).
- **Up to N** (the default for a set count): `solvePin = N`. The machines run as hard as the rest of the plan lets
  them, never above N. No forced flow (a gate: material brought in or sent out at a wired port with no drawer) makes
  up what they cannot do; they slow down instead, as in the game. It is old Build mode inside the one solver.
- **Exactly N**: `solvePin = N`, `solvePinExact: true`. Today's pin: N machines flat out, the rest solved around them,
  any gap shown as a forced flow.

A custom rate card's pin is always exact (its dial). A fluid tank has no pin. Every saved pin without the flag reads as
Up to, so every plan, old Build plans included (`plan/convert.ts` pins each card at its built count), becomes Up to with
no rewrite. There is no notice about it (the owner, 2026-10-17).

## How it reaches the engine

`adapter/model.ts`:

- A single card with an Up to pin is a one-machine pool: `{ machines: [card], capacity: N, exact: false, upTo: true }`,
  `countFixed: false`. An Exactly pin stays `countFixed` + `machineCount` as today.
- A shared card's pin is its group's pool: `exact: solvePinExact === true`, `upTo: !exact`.
- `PoolIn.upTo` is new and optional; a non-exact pool without it is a plain cap (the mod's older uncapped groups),
  unchanged.

## The engine (`src/lib/solver/plan/`)

### Anchoring

An Up to pool with `capacity > 0` anchors its part of the plan, as an exact pool does (`context.ts` `anchored`,
`unanchored.ts`, `adapter/unanchored.ts`). Its machines are never `unneeded` (an idle Up to card says UNUSED, not
"(set count)").

### The guard: no forced flow makes up an Up to card's gap

The guarded ports: every connected port whose wire network (`portComponent`) holds a port of an Up to pool's machine,
except ports a drawer is linked to (a drawer on a wired port is the player's own end: a byproduct drawer is permission
to run, a source drawer is supply).

Once per context, before the first pass, one LP (level -1): the base model with pins and pools but **without drawer
rows** and without the guard, minimising the guarded externals (each weighted by `externalWeight`). Then:

- infeasible: no guard (the pins conflict whatever happens; the chain fails and diagnoses as today);
- minimum at rounding (`heldAt`): every guarded external is closed in every model this context builds;
- otherwise (an Exactly pin needs some): the guarded externals together are held to that minimum (one row).

Leaving drawers out is the point: a drawer's rate never opens a forced flow on a guarded network. A rate the Up to
machines cannot reach stalls the chain, and the drawer relaxation (which builds its models with the guard) reports
the shortfall and names the Up to card that holds it back (`limitingNodes`, note `LIMIT_PIN` with `PIN_UP_TO`).
`diagnosePins` runs with the guard off, so a drawer shortfall is never mistaken for a pin conflict.

### The push: every Up to card as high as it goes, fairly

After the trades are settled and held (or, on the fast path, with every gate closed), before least flow:

- Let `u_i` = pool i's machine time over its capacity, in [0, 1].
- **Stage A, everything runs**: maximise the sum of `u_i`; call it S. (Old Build's first stage: a fed machine with
  somewhere to put its output never idles.)
- **Stage B, fairness**: progressive max-min over the `u_i` with the sum held at S (old Build's round-robin split).
  Each round maximises the least level z of the pools not yet frozen. A pool is frozen at z only when a probe proves it
  cannot go higher (maximise its own `u` with every unfrozen pool at least z); a pool the round's own point already
  shows above z is a certificate that it can, and is not probed. Repeat until every pool is frozen.
- **Hold**: each pool's machine time is held in a narrow band around its level through least flow, the canonical
  tie-break and every later model of that support (rows, not column bounds: TS columns start at 0).

The levels are a property of the plan, not of the solve path: the stage A optimum is unique, the max-min vector over a
convex set is unique, and every freeze is decided by a value (a probe's optimum), never by which vertex an engine
returns. So HiGHS and ojAlgo, and the reversed column order of the path test, give the same answer.

The push runs wherever a support is settled: the fast path, the chain's pass, and `evaluateSupport` (alternatives and
the stored choice). The levels ride on `Trades` (`floors`), so `tradeModel` applies them everywhere it is used.

### The read-out (`SolutionView.upTo`)

At the committed point, per Up to pool in pool order, under one counted budget (`MAX_READOUT_LPS`, work never time):

- `reached` = machine time; at its capacity (within 1e-6 of the level):
  - **wants**: drop the pool's cap and every push band, keep the trades; maximise the other Up to pools' levels plus
    each unmet drawer's met fraction (total over its target, at most 1). If that cannot beat what they have now, it is
    **FULL**. Otherwise minimise this pool's machine time at that optimum: more than its capacity is **BOTTLENECK**
    with `wants`. An Exactly card fed by a forced input on a network this pool makes also wants more: that input over
    this pool's per-machine rate is added to `wants`.
  - below its capacity, the reason probes, every other pool held in its band, this one free under its cap,
    maximising its own level:
    - **STARVED** when giving one input port a free supply raises it (a wired port: a free column into its
      conservation row; an unwired port with a capped source drawer: that drawer's cap lifted). All inputs are tried
      together first; only if that raises it is each tried alone. The first that does is `port`, the others `tied`.
      `upstream`: the Up to pools making that input that are FULL or BOTTLENECK.
    - else **CLOGGED** (at zero: **UNUSED**) when giving one output port a free sink raises it.
    - else **LIMITED**.
  - budget out: `reason: null`.

Islands: each island's read-out is its own; `solvePlan` concatenates them, sorted by `node`.

## What the board shows (`PlanSolveExtras.upTo`, `shortfalls`)

The adapter maps each read-out to the card's id (`PlanUpTo`: rows as `PortKey`, the resource as `kind:id`, upstream as
card ids), and every shortfall to `PlanShortfall` with the limiting cards. `NodeThroughputResult.utilization` is
reached / capacity for an Up to card; `status` is `bottleneck` for BOTTLENECK, `underutilized` below the count.

The card (pass 3): under the machine what runs, big and white ("×18.2"), and what you set, small, the number gold ("up
to 24"; click the number to type, the wheel steps it, click the rule word for Any, Up to, Exactly). Along the foot one
bar for an Up to card: its fill is reached / capacity, then one word in the reason's colour, one plain line, and a
fraction on the right ("18.2 / 24"); a bottleneck's bar runs on, striped, to what the line wants ("24 / 31"). An
Exactly card with a forced input says FORCED IN with the resource and rate. No bar for Any, or Exactly with nothing
forced. Every port tile is one shape; free ends only change colour; power is a tile; the short port is not lit.

## The mod

The same rules in `data/flowchart/balancer/` (Java): `PoolIn` gains `upTo`, `ModelBuilder` pools, `SolveContext`
anchoring and the guard, the push as a stage between `TradeStage` and `FlowMinStage` and inside `FastPathStage`, the
floors on `Trades`, `Enumerator.evaluateSupport`, `DrawerRelaxation` naming the card, `SolutionView.upTo`. The pin:
`Node.machineCountFixed` stays "a count is set", a new `machineCountExact` says Exactly; `MachineGroup.pinned` likewise.
Plans carry `solvePinExact` both ways (`FfPlanParser`, `FfCards`, `PlanExport`, `cloud/map`). The parity scenarios and
the corpus are re-dumped once both sides agree; until then the website's parity scenarios pin Exactly.

## Checking it against old Build

Old Build plans (the v3 fixtures) are solved twice: by the old Build engine still in the tree (`equations-core.ts`,
`node-verdict.ts`) and by the plan solver after `openAsPlan`. Every card's utilisation and its reason should agree
(BOTTLENECK = bottleneck, STARVED = starved or blocked, CLOGGED = clogged or clog lock, UNUSED = unused, FULL =
full). Known differences come from what the two treat differently: an unwired port stops a machine in old Build and
is a free end here.
