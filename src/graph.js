// The graph of a flow: which step leads to which, what can be reached from the start, and what can reach a set of steps. Every
// walk uses a list of steps still to visit and a set of steps seen, so a flow of any shape (a loop, a step that leads to itself,
// twenty thousand steps in a line) ends, and nothing here calls itself.

// The ids of the steps an edge leads to, for the edges whose target is a step of the flow.
export function buildGraph(flow) {
  const out = new Map();
  const into = new Map();
  for (const id of flow.steps.keys()) {
    out.set(id, []);
    into.set(id, []);
  }
  for (const step of flow.steps.values()) {
    for (const edge of step.edges) {
      if (!flow.steps.has(edge.to)) continue;
      out.get(step.id).push(edge.to);
      into.get(edge.to).push({ from: step.id, kind: edge.kind });
    }
  }
  return { out, into };
}

// The ids that can be reached from the start ids by following the edges forward (the start ids included).
export function reachableFrom(starts, out) {
  const seen = new Set();
  const todo = [];
  for (const s of starts) {
    if (out.has(s) && !seen.has(s)) {
      seen.add(s);
      todo.push(s);
    }
  }
  while (todo.length > 0) {
    const id = todo.pop();
    for (const next of out.get(id)) {
      if (!seen.has(next)) {
        seen.add(next);
        todo.push(next);
      }
    }
  }
  return seen;
}

// The ids from which at least one of the target ids can be reached (the targets included): the walk goes backward.
export function canReach(targets, into) {
  const seen = new Set();
  const todo = [];
  for (const t of targets) {
    if (into.has(t) && !seen.has(t)) {
      seen.add(t);
      todo.push(t);
    }
  }
  while (todo.length > 0) {
    const id = todo.pop();
    for (const { from } of into.get(id)) {
      if (!seen.has(from)) {
        seen.add(from);
        todo.push(from);
      }
    }
  }
  return seen;
}
