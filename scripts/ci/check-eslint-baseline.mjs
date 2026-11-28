import { spawnSync } from "node:child_process";
import { realpathSync } from "node:fs";
import { join, relative } from "node:path";

function lint(directory) {
  const result = spawnSync(process.execPath, [
    join(directory, "node_modules/eslint/bin/eslint.js"),
    ".",
    "--format",
    "json",
  ], { cwd: directory, encoding: "utf8", maxBuffer: 10 * 1024 * 1024 });

  if (result.error || ![0, 1].includes(result.status)) {
    throw new Error(`ESLint could not run in ${directory}: ${result.error ?? result.stderr}`);
  }

  return JSON.parse(result.stdout).flatMap(({ filePath, messages }) =>
    messages.map(({ severity, ruleId, message }) => ({
      file: relative(directory, filePath), severity, ruleId, message,
    })),
  );
}

const baseDirectory = process.argv[2];
if (!baseDirectory) throw new Error("Supply the base checkout for the ESLint comparison.");

const baseline = lint(realpathSync(baseDirectory));
const current = lint(realpathSync(process.cwd()));
const remaining = new Map();
for (const problem of baseline) {
  const signature = JSON.stringify(problem);
  remaining.set(signature, (remaining.get(signature) ?? 0) + 1);
}

let newCount = 0;
for (const problem of current) {
  const signature = JSON.stringify(problem);
  const previous = remaining.get(signature) ?? 0;
  if (previous) remaining.set(signature, previous - 1);
  else newCount++;

  const origin = previous ? "inherited" : "new";
  const severity = problem.severity === 2 ? "error" : "warning";
  console.log(`${origin} ${severity} ${problem.file} [${problem.ruleId ?? "ESLint"}] ${problem.message}`);
}

console.log(`${current.length} ESLint diagnostics compared with ${baseline.length} on the base (${newCount} new).`);
process.exitCode = newCount ? 1 : 0;
