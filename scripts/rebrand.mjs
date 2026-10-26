/**
 * Rebrand the worker's identity from "edgetunnel" to "Nova Worker Beta".
 *
 * Only the three user-agent identity strings are touched. Everything else —
 * proxy endpoints, KV keys, routes, the panel host — stays byte-identical.
 *
 * The script refuses to run if the input file is not the expected upstream
 * revision, or if any replacement does not match the expected number of times.
 * That makes a silent partial rebrand impossible.
 */

import { readFileSync, writeFileSync } from "node:fs";
import { createHash } from "node:crypto";

const NEW_NAME = "Nova Worker Beta";
const EXPECTED_SHA256 =
  "1e84d11af0544654bf56a06fa833e77184a57193288a9ffccf62c031a9fb7d65";

const file = process.argv[2] || "_worker.js";

/** @type {Array<{ label: string, from: string, to: string, count: number }>} */
const REPLACEMENTS = [
  {
    label: "subscription fetch user-agent",
    from: "const 汇聚订阅_UA = 'v2rayN/edge' + 'tunnel (https://github.com/' + 特征码字典[1] + '/edge' + 'tunnel)';",
    to: "const 汇聚订阅_UA = 'v2rayN/" + NEW_NAME + "';",
    count: 1,
  },
  {
    label: "BEST_SUB client detection",
    from: "UA.toLowerCase().includes('tunnel (https://github.com/' + 特征码字典[1] + '/edge')",
    to: "UA.toLowerCase().includes('" + NEW_NAME.toLowerCase() + "')",
    count: 1,
  },
  {
    label: "subconverter user-agent",
    from: "'Subconverter for ' + 订阅类型 + ' edge' + 'tunnel (https://github.com/' + 特征码字典[1] + '/edge' + 'tunnel) Uid/0x'",
    to: "'Subconverter for ' + 订阅类型 + ' " + NEW_NAME + " Uid/0x'",
    count: 1,
  },
];

const raw = readFileSync(file);
const sha = createHash("sha256").update(raw).digest("hex");
if (sha !== EXPECTED_SHA256) {
  console.error(`Refusing to edit: ${file} sha256 is ${sha}`);
  console.error(`Expected the upstream revision ${EXPECTED_SHA256}.`);
  process.exit(1);
}

let source = raw.toString("utf8");
const before = source.length;

for (const rule of REPLACEMENTS) {
  const found = source.split(rule.from).length - 1;
  if (found !== rule.count) {
    console.error(`Refusing to edit: "${rule.label}" matched ${found} time(s), expected ${rule.count}.`);
    process.exit(1);
  }
  source = source.split(rule.from).join(rule.to);
  console.log(`ok  ${rule.label}`);
}

const leftovers = [
  "/edge' + 'tunnel",
  "github.com/' + 特征码字典[1] + '/edge",
  "v2rayN/edge",
];
for (const needle of leftovers) {
  if (source.includes(needle)) {
    console.error(`Refusing to write: leftover branding fragment ${JSON.stringify(needle)}`);
    process.exit(1);
  }
}

writeFileSync(file, source);
console.log(`\n${file}: rebranded to "${NEW_NAME}"`);
console.log(`chars: ${before} -> ${source.length}`);
