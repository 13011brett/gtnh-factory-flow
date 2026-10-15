# S1: the board's answers against the mod's

`src/lib/solver/plan/parity/scenarios.json` lists board states (single card set or unset, chains, drawers and their rules,
port rates, forced flows, loops, leftovers, shared machines, custom rate cards, the fluid tank, ...). Both sides build
each one: `scenario-kit.ts` as a website plan, `S1ParityTest.java` (here; copy it into a mod checkout's
`src/test/java/com/gtnhplanner/`) as a mod graph. The mod's SolveInput, answer and board readouts (card counts,
"(set count)", port rows and forced rows, drawers, the overview's lines and machine lines, notices) are its own code's,
written to `fixtures/mod-answers.json`; `scenarios.test.ts` compares the website's adapter input, its solver's answer and
what its board shows with them.

Regenerate after adding a scenario (in the mod checkout):

    S1_SPEC=<website>/src/lib/solver/plan/parity/scenarios.json \
    S1_OUT=<website>/src/lib/solver/plan/parity/fixtures/mod-answers.json \
    ./gradlew test --tests 'com.gtnhplanner.S1ParityTest'

`board.mjs` loads the plans onto the dev board and prints what each card and the rail say, to check by eye that the
readings the test uses are what the page draws (dump the plans with `buildScenario` first).
