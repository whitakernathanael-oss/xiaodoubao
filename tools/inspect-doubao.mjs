#!/usr/bin/env node

const portArgument = process.argv.indexOf("--port");
const port = portArgument >= 0 ? Number(process.argv[portArgument + 1]) : 9225;
if (!Number.isInteger(port) || port < 1 || port > 65535) {
  throw new Error("--port must be between 1 and 65535");
}

async function targetsFor(host) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 2000);
  try {
    const response = await fetch(`http://${host}:${port}/json/list`, { signal: controller.signal });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    return await response.json();
  } finally {
    clearTimeout(timer);
  }
}

const attempts = await Promise.allSettled([targetsFor("127.0.0.1"), targetsFor("[::1]")]);
const targets = [...new Map(attempts
  .flatMap((attempt) => attempt.status === "fulfilled" ? attempt.value : [])
  .map((target) => [target.id, target])).values()];

if (targets.length === 0) {
  console.error(`No CDP targets found on loopback port ${port}.`);
  process.exitCode = 2;
} else {
  for (const target of targets) {
    const allowed = target.url.startsWith("doubao://doubao-chat/chat")
      && !target.url.includes("cross-site-support")
      && !target.url.includes("login");
    console.log(JSON.stringify({
      id: target.id,
      type: target.type,
      title: target.title,
      url: target.url,
      disposition: allowed ? "allowed" : "excluded"
    }));
    if (!allowed || !target.webSocketDebuggerUrl) continue;

    const socket = new WebSocket(target.webSocketDebuggerUrl);
    await new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error("WebSocket timeout")), 3000);
      socket.addEventListener("open", () => { clearTimeout(timer); resolve(); }, { once: true });
      socket.addEventListener("error", () => { clearTimeout(timer); reject(new Error("WebSocket failed")); }, { once: true });
    });
    const expression = `(() => {
      const safeValue = value => /^[a-zA-Z0-9_.:-]{1,80}$/.test(value) ? value : undefined;
      const inventory = [];
      for (const element of document.querySelectorAll('*')) {
        const tag = element.tagName.toLowerCase();
        const role = element.getAttribute('role') || undefined;
        const id = safeValue(element.id) || undefined;
        const attributes = {};
        for (const attribute of element.attributes) {
          const name = attribute.name.toLowerCase();
          if ((name.startsWith('data-') || ['aria-expanded','aria-selected','aria-controls','aria-modal','type'].includes(name)) && safeValue(attribute.value)) {
            attributes[name] = attribute.value;
          }
        }
        if (!id && !role && Object.keys(attributes).length === 0 && !['main','aside','nav','header','button','input','textarea','dialog'].includes(tag)) continue;
        const rectangle = element.getBoundingClientRect();
        if (rectangle.width < 1 || rectangle.height < 1) continue;
        inventory.push({
          tag, id, role, attributes,
          rect: [Math.round(rectangle.x), Math.round(rectangle.y), Math.round(rectangle.width), Math.round(rectangle.height)]
        });
        if (inventory.length >= 500) break;
      }
      return { title: document.title, viewport: [innerWidth, innerHeight], inventory };
    })()`;
    const result = await new Promise((resolve, reject) => {
      const id = 1;
      const timer = setTimeout(() => reject(new Error("CDP evaluation timeout")), 5000);
      socket.addEventListener("message", (event) => {
        const message = JSON.parse(String(event.data));
        if (message.id !== id) return;
        clearTimeout(timer);
        if (message.error || message.result?.exceptionDetails) reject(new Error("CDP evaluation failed"));
        else resolve(message.result?.result?.value);
      });
      socket.send(JSON.stringify({
        id,
        method: "Runtime.evaluate",
        params: { expression, returnByValue: true }
      }));
    });
    console.log(JSON.stringify({ targetId: target.id, structuralInventory: result }, null, 2));
    socket.close();
  }
}
