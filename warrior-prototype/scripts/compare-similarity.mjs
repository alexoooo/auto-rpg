import { createHash, randomInt } from "node:crypto";
import { createServer } from "node:http";
import { appendFileSync, existsSync, mkdirSync, readFileSync } from "node:fs";
import { basename, resolve } from "node:path";

const args = process.argv.slice(2);
if (args.length !== 2) {
  console.error("usage: npm run similarity:compare -- <candidate-a-directory> <candidate-b-directory>");
  process.exit(2);
}

const views = [
  "front", "front_left", "left", "back_left",
  "back", "back_right", "right", "front_right",
];
const candidates = args.map((value) => resolve(value));
for (const directory of candidates) {
  for (const view of views) {
    const file = resolve(directory, `${view}.png`);
    if (!existsSync(file)) throw new Error(`${directory} has no ${view}.png`);
  }
}
const displayed = randomInt(2) === 0 ? candidates : [candidates[1], candidates[0]];
const output = resolve(".review/similarity/comparisons.jsonl");
mkdirSync(resolve(".review/similarity"), { recursive: true });

function digest(directory) {
  const hash = createHash("sha256");
  for (const view of views) hash.update(readFileSync(resolve(directory, `${view}.png`)));
  return hash.digest("hex");
}

function metricSummary(directory) {
  const candidates = [resolve(directory, "similarity-v2/report.json"), resolve(directory, "similarity/report.json"), resolve(directory, "report.json")];
  const reportPath = candidates.find((value) => existsSync(value));
  if (!reportPath) return null;
  const report = JSON.parse(readFileSync(reportPath, "utf8"));
  return {
    formulaVersion: report.formulaVersion,
    distance: report.distance,
    componentWeights: report.componentWeights,
    aggregation: report.aggregation,
    views: report.views,
  };
}

function page() {
  const columns = displayed.map((directory, side) => `
    <section><h2>${side === 0 ? "Left" : "Right"} -- ${basename(directory)}</h2>
    <div class="views">${views.map((view) => `<figure><img src="/image/${side}/${view}"><figcaption>${view}</figcaption></figure>`).join("")}</div></section>
  `).join("");
  return `<!doctype html><html lang="en"><meta charset="utf-8"><title>Warrior A/B comparison</title>
  <style>body{margin:1.5rem;background:#15110f;color:#eee;font:16px system-ui}.pair{display:grid;grid-template-columns:1fr 1fr;gap:2rem}.views{display:grid;grid-template-columns:1fr 1fr;gap:.5rem}figure{margin:0}img{width:100%}button{font:inherit;padding:.8rem 1.4rem;margin:.6rem}</style>
  <body><h1>Which candidate is closer to the concept warrior?</h1><div class="pair">${columns}</div>
  <h3>Target similarity</h3><p><button data-kind="target" data-choice="left">Left</button><button data-kind="target" data-choice="tie">Tie</button><button data-kind="target" data-choice="right">Right</button></p>
  <h3>Production coherence</h3><p><button data-kind="production" data-choice="left">Left</button><button data-kind="production" data-choice="tie">Tie</button><button data-kind="production" data-choice="right">Right</button></p>
  <p><button id="submit" disabled>Record both judgments</button></p><output></output><script>const choices={};for(const button of document.querySelectorAll('[data-kind]'))button.onclick=()=>{choices[button.dataset.kind]=button.dataset.choice;button.parentElement.querySelectorAll('button').forEach(value=>value.disabled=false);button.disabled=true;document.querySelector('#submit').disabled=!choices.target||!choices.production};document.querySelector('#submit').onclick=async()=>{const response=await fetch('/choice',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(choices)});document.querySelector('output').textContent=await response.text()}</script></body></html>`;
}

const server = createServer((request, response) => {
  if (request.method === "GET" && request.url === "/") {
    response.writeHead(200, { "content-type": "text/html; charset=utf-8" });
    response.end(page());
    return;
  }
  const image = request.url?.match(/^\/image\/(0|1)\/(front|front_left|left|back_left|back|back_right|right|front_right)$/);
  if (request.method === "GET" && image) {
    response.writeHead(200, { "content-type": "image/png", "cache-control": "no-store" });
    response.end(readFileSync(resolve(displayed[Number(image[1])], `${image[2]}.png`)));
    return;
  }
  if (request.method === "POST" && request.url === "/choice") {
    let body = "";
    request.on("data", (chunk) => { body += chunk; });
    request.on("end", () => {
      const choices = JSON.parse(body);
      if (![choices.target, choices.production].every((choice) => ["left", "right", "tie"].includes(choice))) {
        response.writeHead(400).end("invalid target or production choice");
        return;
      }
      const record = {
        schemaVersion: 2,
        targetChoice: choices.target,
        productionChoice: choices.production,
        left: { path: displayed[0], sha256: digest(displayed[0]), metric: metricSummary(displayed[0]) },
        right: { path: displayed[1], sha256: digest(displayed[1]), metric: metricSummary(displayed[1]) },
      };
      appendFileSync(output, `${JSON.stringify(record)}\n`);
      response.writeHead(200, { "content-type": "text/plain; charset=utf-8" });
      response.end(`Recorded target=${choices.target}, production=${choices.production}. Stop this server with Ctrl+C.`);
    });
    return;
  }
  response.writeHead(404).end("not found");
});

server.listen(0, "127.0.0.1", () => {
  const address = server.address();
  console.log(`comparison server PID ${process.pid} at http://127.0.0.1:${address.port}`);
  console.log("Open the URL in a visible browser; stop the server with Ctrl+C when finished.");
});

process.on("SIGINT", () => server.close(() => process.exit(0)));
