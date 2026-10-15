package com.gtnhplanner;

import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.TreeMap;
import java.util.UUID;

import org.junit.jupiter.api.Test;

import com.google.gson.GsonBuilder;
import com.google.gson.JsonArray;
import com.google.gson.JsonElement;
import com.google.gson.JsonObject;
import com.google.gson.JsonParser;
import com.gtnhplanner.data.flowchart.Drawer;
import com.gtnhplanner.data.flowchart.Edge;
import com.gtnhplanner.data.flowchart.Graph;
import com.gtnhplanner.data.flowchart.MachineGroup;
import com.gtnhplanner.data.flowchart.Node;
import com.gtnhplanner.data.flowchart.Port;
import com.gtnhplanner.data.flowchart.balancer.BalanceMode;
import com.gtnhplanner.data.flowchart.balancer.BalanceResult;
import com.gtnhplanner.data.flowchart.balancer.Balancer;
import com.gtnhplanner.data.flowchart.balancer.External;
import com.gtnhplanner.data.flowchart.balancer.Note;
import com.gtnhplanner.data.flowchart.balancer.SolutionView;
import com.gtnhplanner.data.flowchart.balancer.SolveInput;
import com.gtnhplanner.data.flowchart.balancer.SolverMessage;
import com.gtnhplanner.data.flowchart.balancer.Spares;
import com.gtnhplanner.data.flowchart.balancer.Unanchored;
import com.gtnhplanner.dev.SolveInputJson;
import com.gtnhplanner.harness.GtnhFlowLoader;
import com.gtnhplanner.harness.TestIngredients;
import com.gtnhplanner.power.CustomRate;
import com.gtnhplanner.power.FluidTank;

/**
 * Throwaway (S1 parity, never on main): builds the website's parity scenarios as mod graphs, and records what the mod
 * solves and what its board shows. S1_SPEC = scenarios.json, S1_OUT = the answers file.
 */
class S1ParityTest {

    private static UUID id(final long n) {
        return new UUID(0, n);
    }

    @Test
    void record() throws IOException {
        final String spec = System.getenv("S1_SPEC");
        final String outPath = System.getenv("S1_OUT");
        if (spec == null || outPath == null) return;
        GtnhFlowLoader.ensureDefaultMachineProfile();
        final JsonObject root = new JsonParser().parse(Files.readString(Path.of(spec)))
            .getAsJsonObject();
        final JsonObject out = new JsonObject();
        for (final JsonElement s : root.getAsJsonArray("scenarios")) {
            final JsonObject sc = s.getAsJsonObject();
            out.add(
                sc.get("name")
                    .getAsString(),
                run(sc));
        }
        Files.writeString(
            Path.of(outPath),
            new GsonBuilder().setPrettyPrinting()
                .serializeSpecialFloatingPointValues()
                .create()
                .toJson(out),
            StandardCharsets.UTF_8);
    }

    private static JsonObject run(final JsonObject sc) {
        final Graph graph = new Graph();
        final Map<Long, Node> nodes = new TreeMap<>();
        for (final JsonElement e : sc.getAsJsonArray("machines")) {
            final JsonObject m = e.getAsJsonObject();
            final Node n = new Node(
                id(
                    m.get("id")
                        .getAsLong()),
                0,
                0);
            final String kind = m.has("kind") ? m.get("kind")
                .getAsString() : "";
            n.machineName = m.get("name")
                .getAsString();
            n.properties.put(
                GtnhFlowLoader.DURATION_TICKS,
                m.get("dur")
                    .getAsInt());
            for (final JsonElement p : m.getAsJsonArray("in")) n.inputs.add(port(p, kind));
            for (final JsonElement p : m.getAsJsonArray("out")) n.outputs.add(port(p, kind));
            if (kind.startsWith("custom")) {
                final boolean supply = kind.equals("custom-supply");
                final JsonArray slot = (supply ? m.getAsJsonArray("out") : m.getAsJsonArray("in")).get(0)
                    .getAsJsonArray();
                n.powerSource = CustomRate.ID;
                CustomRate.hold(n, "item:test:" + slot.get(0)
                    .getAsString() + ":0", supply);
                n.powerSettings.put(
                    CustomRate.RATE,
                    slot.get(1)
                        .getAsString());
                n.machineConfig.setMachineCount(1);
                n.setMachineCountFixed(true);
            }
            if (kind.equals("tank")) n.powerSource = FluidTank.ID;
            if (m.has("pin")) {
                final double pin = m.get("pin")
                    .getAsDouble();
                n.machineConfig.setMachineCount((int) pin);
                n.setMachineCountFixed(true);
            }
            if (m.has("outRates")) for (final Map.Entry<String, JsonElement> r : m.getAsJsonObject("outRates")
                .entrySet())
                n.targetOutputRates.put(
                    Integer.parseInt(r.getKey()),
                    r.getValue()
                        .getAsDouble());
            if (m.has("inRates")) for (final Map.Entry<String, JsonElement> r : m.getAsJsonObject("inRates")
                .entrySet())
                n.targetInputRates.put(
                    Integer.parseInt(r.getKey()),
                    r.getValue()
                        .getAsDouble());
            nodes.put(
                m.get("id")
                    .getAsLong(),
                n);
            graph.addNode(n);
        }
        if (sc.has("wires")) for (final JsonElement e : sc.getAsJsonArray("wires")) {
            final JsonArray w = e.getAsJsonArray();
            graph.addEdge(
                new Edge(
                    id(
                        w.get(0)
                            .getAsLong()),
                    id(
                        w.get(1)
                            .getAsLong()),
                    id(
                        w.get(3)
                            .getAsLong()),
                    w.get(2)
                        .getAsInt(),
                    w.get(4)
                        .getAsInt()));
        }
        if (sc.has("drawers")) for (final JsonElement e : sc.getAsJsonArray("drawers")) {
            final JsonObject d = e.getAsJsonObject();
            final Drawer drawer = new Drawer(
                id(
                    d.get("id")
                        .getAsLong()),
                Drawer.Kind.valueOf(
                    d.get("kind")
                        .getAsString()),
                "test:" + d.get("res")
                    .getAsString());
            drawer.setTarget(
                Drawer.Rule.valueOf(
                    d.get("rule")
                        .getAsString()),
                d.get("rate")
                    .getAsDouble());
            graph.addDrawer(drawer);
            for (final JsonElement l : d.getAsJsonArray("links")) {
                final JsonArray link = l.getAsJsonArray();
                graph.linkDrawer(
                    drawer.getId(),
                    new Drawer.Link(
                        id(
                            link.get(0)
                                .getAsLong()),
                        link.get(1)
                            .getAsInt()));
            }
        }
        if (sc.has("shared")) for (final JsonElement e : sc.getAsJsonArray("shared")) {
            final JsonObject g = e.getAsJsonObject();
            final MachineGroup group = new MachineGroup();
            for (final JsonElement section : g.getAsJsonArray("sections")) group.addSection(
                id(section.getAsLong()));
            if (g.has("pin")) {
                group.setMachineCapacity(
                    g.get("pin")
                        .getAsInt());
                group.setPinned(true);
            }
            graph.groups.put(group.getId(), group);
        }

        final SolveInput input = SolveInput.of(graph, BalanceMode.AUTO, null);
        final JsonObject o = new JsonObject();
        o.add("input", SolveInputJson.write(input));
        final BalanceResult result = Balancer.solve(input);
        final Balancer.Answer answer = Balancer.solveWithAlternatives(input);

        // ---- the answer ----
        final JsonObject a = new JsonObject();
        if (answer instanceof final Balancer.Answer.Failed f) {
            a.addProperty("kind", "failed");
            a.addProperty(
                "failure",
                f.failure() == null ? "" : f.failure()
                    .message()
                    .name());
            a.add("notes", notes(f.notes()));
        } else {
            final Balancer.Answer.Solved s = (Balancer.Answer.Solved) answer;
            final SolutionView v = s.solution();
            a.addProperty("kind", "solved");
            a.add("machineCounts", map(v.machineCounts));
            a.add("edgeFlows", map(v.edgeFlowsPerSecond));
            a.add("gatedSources", externals(v.gatedSources));
            a.add("gatedSinks", externals(v.gatedSinks));
            a.add("terminalInputs", externals(v.terminalInputs));
            a.add("terminalOutputs", externals(v.terminalOutputs));
            final JsonArray unneeded = new JsonArray();
            for (final UUID u : v.unneeded) unneeded.add(new com.google.gson.JsonPrimitive(u.toString()));
            a.add("unneeded", unneeded);
            a.add("notes", notes(v.notes));
            a.add("drawerRates", map(v.drawers.rates()));
            final JsonArray unmet = new JsonArray();
            for (final UUID u : v.drawers.unmet()) unmet.add(new com.google.gson.JsonPrimitive(u.toString()));
            a.add("unmet", unmet);
            final JsonArray spares = new JsonArray();
            for (final Spares.Leftover l : v.spares()) {
                final JsonObject lo = new JsonObject();
                lo.addProperty("key", l.key());
                lo.addProperty("importing", l.importing());
                final JsonArray bearers = new JsonArray();
                for (final Spares.Bearer b : l.bearers()) {
                    final JsonObject bo = new JsonObject();
                    bo.addProperty("anchor", Spares.keyOf(b.anchor()));
                    bo.addProperty("max", b.max());
                    bo.addProperty("share", b.share());
                    bo.addProperty("solverPick", b.solverPick());
                    bearers.add(bo);
                }
                lo.add("bearers", bearers);
                spares.add(lo);
            }
            a.add("spares", spares);
            a.addProperty(
                "options",
                s.alternatives()
                    .options()
                    .size());
        }
        o.add("answer", a);

        // ---- the board (BoardSession / CardModel / RecipeCard / DrawerCard / buildTotals) ----
        boolean nothingToSolveFor = false;
        for (final Note n : result.notes()) if (n.message() == SolverMessage.NO_PIN) nothingToSolveFor = true;
        final Set<UUID> unset = new HashSet<>(Unanchored.of(graph));
        if (result instanceof final BalanceResult.Solved solved) unset.addAll(solved.auto().unneeded);
        final Map<String, Double> extras = new TreeMap<>();
        if (result instanceof final BalanceResult.Solved solved && solved.auto() != null) {
            for (final List<External> side : List.of(solved.auto().gatedSinks, solved.auto().gatedSources))
                for (final External e : side) {
                    final boolean output = !e.port()
                        .input();
                    if (e.ratePerSecond() <= 0 || portHasDrawer(
                        graph,
                        e.port()
                            .nodeId(),
                        output,
                        e.port()
                            .portIndex()))
                        continue;
                    extras.merge(
                        key(
                            e.port()
                                .nodeId(),
                            output,
                            e.port()
                                .portIndex()),
                        e.ratePerSecond(),
                        Double::sum);
                }
        }
        final JsonObject board = new JsonObject();
        board.addProperty("nothingToSolveFor", nothingToSolveFor);
        final JsonObject cards = new JsonObject();
        for (final Node n : graph.getNodes()) {
            final Balancer.NodeBalance b = result.nodeBalances()
                .get(n.id);
            final JsonObject c = new JsonObject();
            c.addProperty("count", b == null ? 0 : b.operations());
            c.addProperty("pinned", n.isMachineCountFixed());
            c.addProperty("unset", nothingToSolveFor || unset.contains(n.id));
            c.addProperty("countless", FluidTank.is(n));
            final JsonArray ins = new JsonArray(), outs = new JsonArray();
            for (int i = 0; i < n.inputs.size(); i++) ins.add(portView(graph, n, b, false, i, extras));
            for (int i = 0; i < n.outputs.size(); i++) outs.add(portView(graph, n, b, true, i, extras));
            c.add("inputs", ins);
            c.add("outputs", outs);
            cards.add(n.id.toString(), c);
        }
        board.add("cards", cards);
        final JsonObject drawers = new JsonObject();
        for (final Drawer d : graph.getDrawers()) {
            final JsonObject dj = new JsonObject();
            dj.addProperty(
                "rate",
                result.drawerRates()
                    .getOrDefault(d.getId(), 0.0));
            dj.addProperty("unset", nothingToSolveFor || unset.contains(d.getId()));
            drawers.add(
                d.getId()
                    .toString(),
                dj);
        }
        board.add("drawers", drawers);
        // The overview's totals: made and used per resource from the cards' ports, custom rate cards left out.
        final Map<String, double[]> flow = new TreeMap<>();
        for (final Node n : graph.getNodes()) {
            if (CustomRate.is(n)) continue;
            final Balancer.NodeBalance b = result.nodeBalances()
                .get(n.id);
            for (int i = 0; i < n.outputs.size(); i++) flow.computeIfAbsent(
                TestIngredients.nameOf(n.outputs.get(i)),
                k -> new double[2])[0] += b == null ? 0 : b.outputPerSecond(i);
            for (int i = 0; i < n.inputs.size(); i++) flow.computeIfAbsent(
                TestIngredients.nameOf(n.inputs.get(i)),
                k -> new double[2])[1] += b == null ? 0 : b.inputPerSecond(i);
        }
        final Map<String, Double> trash = new TreeMap<>();
        for (final Drawer d : graph.getDrawers()) if (d.getKind() == Drawer.Kind.TRASH) trash.merge(
            d.getResourceKey().substring(5),
            Math.max(0, result.drawerRates().getOrDefault(d.getId(), 0.0)),
            Double::sum);
        final JsonObject totals = new JsonObject(), tin = new JsonObject(), tout = new JsonObject(),
            tint = new JsonObject();
        for (final Map.Entry<String, double[]> e : flow.entrySet()) {
            final double made = e.getValue()[0], used = e.getValue()[1];
            if (used - made > 1e-9) tin.addProperty(e.getKey(), used - made);
            final double trashed = trash.getOrDefault(e.getKey(), 0.0);
            if (made - used - trashed > 1e-9) tout.addProperty(e.getKey(), made - used - trashed);
            if (Math.min(made, used) > 1e-9) tint.addProperty(e.getKey(), Math.min(made, used));
        }
        totals.add("inputs", tin);
        totals.add("outputs", tout);
        totals.add("internal", tint);
        // The overview's machine lines (buildTotals): every card that runs or is pinned, custom rates and tanks left out.
        final JsonObject lines = new JsonObject();
        for (final Node n : graph.getNodes()) {
            if (CustomRate.is(n) || FluidTank.is(n)) continue;
            final Balancer.NodeBalance b = result.nodeBalances()
                .get(n.id);
            final double count = b == null ? 0 : b.operations();
            if (count > 0 || n.isMachineCountFixed()) lines.addProperty(n.id.toString(), count);
        }
        totals.add("machines", lines);
        board.add("totals", totals);
        // The notices bar (buildNotices), by kind.
        final JsonArray notices = new JsonArray();
        if (nothingToSolveFor) notices.add(new com.google.gson.JsonPrimitive("no-pin"));
        for (final com.gtnhplanner.data.flowchart.balancer.DrawerReadout.Shortfall sf : result.drawers()
            .shortfalls()) notices.add(new com.google.gson.JsonPrimitive("unmet:" + sf.drawer()));
        for (final Note note : result.notes()) {
            final SolverMessage msg = note.message();
            final String k = msg == SolverMessage.OVERSHOOTS_TARGET ? "overshoot"
                : msg == SolverMessage.DRAWER_NOT_CONNECTED ? "unwired"
                    : msg == SolverMessage.DRAWER_WIRED_IGNORED ? "ignored"
                        : msg == SolverMessage.CHOICE_NO_LONGER_FITS || msg == SolverMessage.CHOICE_NEEDS_MORE_GATES
                            ? "choice"
                            : note.severity() == com.gtnhplanner.data.flowchart.balancer.Severity.ERROR
                                && msg != SolverMessage.EMPTY_GRAPH ? "failed:" + msg.name() : null;
            if (k != null) notices.add(new com.google.gson.JsonPrimitive(k));
        }
        board.add("notices", notices);
        o.add("board", board);
        return o;
    }

    private static JsonObject portView(final Graph graph, final Node n, final Balancer.NodeBalance b,
        final boolean output, final int i, final Map<String, Double> extras) {
        final JsonObject p = new JsonObject();
        final double perSecond = b == null ? 0 : output ? b.outputPerSecond(i) : b.inputPerSecond(i);
        final double extra = Math.min(perSecond, Math.max(0, extras.getOrDefault(key(n.id, output, i), 0.0)));
        p.addProperty("name", TestIngredients.nameOf((output ? n.outputs : n.inputs).get(i)));
        p.addProperty("perSecond", perSecond);
        p.addProperty("extra", extra);
        // RecipeCard: the row reads what the wires carry when part of it is forced.
        p.addProperty("shown", extra > 1e-9 ? Math.max(0, perSecond - extra) : perSecond);
        p.addProperty("wired", wired(graph, n.id, output, i));
        return p;
    }

    private static boolean wired(final Graph graph, final UUID node, final boolean output, final int index) {
        for (final Edge e : graph.getEdges()) {
            if (output && e.sourceNodeId.equals(node) && e.sourceOutputIndex == index) return true;
            if (!output && e.targetNodeId.equals(node) && e.targetInputIndex == index) return true;
        }
        return portHasDrawer(graph, node, output, index);
    }

    private static boolean portHasDrawer(final Graph graph, final UUID node, final boolean output, final int index) {
        for (final Drawer d : graph.getDrawers()) {
            if ((d.getKind() == Drawer.Kind.SOURCE) == output) continue;
            for (final Drawer.Link l : d.getLinks()) if (l.nodeId()
                .equals(node) && l.portIndex() == index) return true;
        }
        return false;
    }

    private static String key(final UUID node, final boolean output, final int index) {
        return node + (output ? ":o:" : ":i:") + index;
    }

    private static Port<?> port(final JsonElement e, final String kind) {
        final JsonArray p = e.getAsJsonArray();
        final double qty = p.get(1)
            .getAsDouble();
        final Port<?> port = TestIngredients.port(
            p.get(0)
                .getAsString(),
            qty);
        if (kind.startsWith("custom") || kind.equals("tank")) port.setExactAmount(qty);
        return port;
    }

    private static JsonObject map(final Map<UUID, Double> m) {
        final JsonObject o = new JsonObject();
        for (final Map.Entry<UUID, Double> e : new TreeMap<>(m).entrySet()) o.addProperty(
            e.getKey()
                .toString(),
            e.getValue());
        return o;
    }

    private static JsonArray externals(final List<External> list) {
        final JsonArray a = new JsonArray();
        for (final External e : list) {
            final JsonObject o = new JsonObject();
            o.addProperty(
                "node",
                e.port()
                    .nodeId()
                    .toString());
            o.addProperty(
                "port",
                e.port()
                    .portIndex());
            o.addProperty(
                "input",
                e.port()
                    .input());
            o.addProperty("rate", e.ratePerSecond());
            a.add(o);
        }
        return a;
    }

    private static JsonArray notes(final List<Note> notes) {
        final JsonArray a = new JsonArray();
        for (final Note n : notes) a.add(new com.google.gson.JsonPrimitive(n.message().name()));
        return a;
    }
}
