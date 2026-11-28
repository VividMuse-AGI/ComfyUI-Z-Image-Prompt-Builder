import { app } from "../../../scripts/app.js";
import { api } from "../../../scripts/api.js";

const ORDERS_LIMIT = 128;
const consumers = new Set();
export const submissions = new Map();
export const earlyResults = new Map();
export const terminalIds = new Set();
const promptOwners = new WeakMap();
let pendingRequests = 0;
let nextOrder = 0;
let installed = false;

export const rootGraph = () => app.rootGraph || app.graph;

export function nodeAtPath(graph, path) {
  const parts = String(path).split(":");
  for (let i = 0; graph && i < parts.length; i++) {
    const node = graph.getNodeById?.(parts[i]);
    if (i === parts.length - 1) return node;
    graph = node?.subgraph;
  }
  return null;
}

function bounded(map, key, value) {
  map.set(key, value);
  if (map.size > ORDERS_LIMIT) map.delete(map.keys().next().value);
}

function captureOwners(graph) {
  const owners = new Map();
  const counts = new Map();
  function visit(current, prefix = "", ancestors = new Set()) {
    if (!current || ancestors.has(current)) return;
    const next = new Set(ancestors).add(current);
    for (const node of current.nodes || current._nodes || []) {
      const path = prefix ? `${prefix}:${node.id}` : String(node.id);
      if ([...consumers].some((c) => c.matchNode(node))) {
        owners.set(path, {
          node,
          graph,
          path,
          generations: new Map(
            [...consumers].map((c) => [c, c.generation?.(node) ?? 0]),
          ),
        });
        counts.set(node, (counts.get(node) || 0) + 1);
      }
      if (node.subgraph) visit(node.subgraph, path, next);
    }
  }
  visit(graph);
  for (const [path, owner] of owners) {
    if (counts.get(owner.node) > 1) owners.delete(path);
  }
  return owners;
}

function dispatchExecuted(detail) {
  if (!detail || detail.prompt_id == null) return;
  const id = String(detail.prompt_id);
  if (terminalIds.has(id)) return;
  const path = String(detail.display_node ?? detail.node);
  const submission = submissions.get(id);
  if (!submission) {
    if (pendingRequests) {
      let messages = earlyResults.get(id);
      if (!messages) {
        messages = new Map();
        bounded(earlyResults, id, messages);
      }
      bounded(messages, path, detail);
    }
    return;
  }
  const owner = submission.owners.get(path);
  if (!owner || owner.graph !== rootGraph() || nodeAtPath(owner.graph, path) !== owner.node) return;
  for (const consumer of consumers) {
    if (!consumer.matchNode(owner.node)) continue;
    const expectedGen = owner.generations.get(consumer) ?? 0;
    const currentGen = consumer.generation?.(owner.node) ?? 0;
    if (expectedGen !== currentGen) continue;
    consumer.onExecuted?.(detail, {
      promptId: id,
      path,
      order: submission.order,
      owner: { node: owner.node, graph: owner.graph, path, generation: expectedGen },
    });
  }
}

export function ensureSubmissionObserver() {
  if (typeof app.graphToPrompt === "function" && !app.graphToPrompt.__vividMuseSharedObserver) {
    const original = app.graphToPrompt;
    const observed = async function () {
      const owners = captureOwners(arguments[0] || rootGraph());
      const prompt = await original.apply(this, arguments);
      if (prompt && typeof prompt === "object") promptOwners.set(prompt, owners);
      return prompt;
    };
    observed.__vividMuseSharedObserver = true;
    app.graphToPrompt = observed;
  }
  if (typeof api?.queuePrompt === "function" && !api.queuePrompt.__vividMuseSharedObserver) {
    const original = api.queuePrompt;
    const observed = async function (_number, prompt) {
      const owners = promptOwners.get(prompt);
      if (!owners?.size) return original.apply(this, arguments);
      const filtered = new Map([...owners].filter(([path]) => prompt.output?.[path]));
      const submission = { owners: filtered, order: ++nextOrder };
      pendingRequests++;
      try {
        const response = await original.apply(this, arguments);
        if (response?.prompt_id != null) {
          const id = String(response.prompt_id);
          if (!terminalIds.has(id)) {
            bounded(submissions, id, submission);
            for (const consumer of consumers) {
              consumer.onSubmitted?.(id, submission);
            }
            const messages = earlyResults.get(id);
            earlyResults.delete(id);
            for (const detail of messages?.values() || []) dispatchExecuted(detail);
          }
        }
        return response;
      } finally {
        if (--pendingRequests === 0) earlyResults.clear();
      }
    };
    observed.__vividMuseSharedObserver = true;
    api.queuePrompt = observed;
  }
  if (!installed && api?.addEventListener) {
    installed = true;
    api.addEventListener("executed", (event) => dispatchExecuted(event.detail));
    api.addEventListener("execution_success", (event) => {
      const id = event.detail?.prompt_id;
      if (id == null) return;
      const key = String(id);
      const inFlight = pendingRequests > 0 || submissions.has(key);
      for (const consumer of consumers) consumer.onSuccess?.(key, { inFlight });
    });
    for (const name of ["execution_error", "execution_interrupted"]) {
      api.addEventListener(name, (event) => {
        const id = event.detail?.prompt_id;
        if (id == null) return;
        const key = String(id);
        terminalIds.add(key);
        if (terminalIds.size > ORDERS_LIMIT) terminalIds.delete(terminalIds.values().next().value);
        earlyResults.delete(key);
        for (const consumer of consumers) consumer.onTerminal?.(key);
      });
    }
  }
}

export function registerSubmissionConsumer(consumer) {
  consumers.add(consumer);
  ensureSubmissionObserver();
  return () => consumers.delete(consumer);
}
