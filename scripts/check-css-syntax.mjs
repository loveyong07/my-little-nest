import { globSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { parse, walk } from "css-tree";

const legacyPseudoElements = new Set(["before", "after", "first-line", "first-letter"]);
const mathFunctions = new Set([
  "abs",
  "acos",
  "asin",
  "atan",
  "atan2",
  "calc",
  "calc-size",
  "clamp",
  "cos",
  "exp",
  "hypot",
  "log",
  "max",
  "min",
  "mod",
  "pow",
  "rem",
  "round",
  "sign",
  "sin",
  "sqrt",
  "tan",
]);

// Biome handles structural rules and parse errors. Keep the two previous CSS
// conventions it does not check, using an AST so strings and comments are ignored.
export function checkCssSyntax(source) {
  const issues = [];
  const report = (node, message) => issues.push({ ...node.loc.start, message });
  const ast = parse(source, { positions: true, parseCustomProperty: true });

  function checkMath(container) {
    let previous;
    for (const node of container.children) {
      if (node.type === "Operator" && /^[+-]$/.test(node.value.trim())) {
        const { start, end } = node.loc;
        if (!/\s/.test(source[start.offset - 1] ?? "") || !/\s/.test(source[end.offset] ?? "")) {
          report(node, "CSS math + and - operators require whitespace on both sides.");
        }
      } else if (
        (previous && previous.type !== "Operator" && /^[+-]/.test(node.value ?? "")) ||
        (node.type === "Dimension" && /[+-]/.test(node.unit)) ||
        (node.type === "Identifier" && /[+-]$/.test(node.name))
      ) {
        // Missing spaces can make the operator part of a signed number or unit.
        report(node, "CSS math + and - operators require whitespace on both sides.");
      }
      if (node.type === "Parentheses") checkMath(node);
      previous = node;
    }
  }

  walk(ast, (node) => {
    if (node.type === "PseudoClassSelector" && legacyPseudoElements.has(node.name.toLowerCase())) {
      report(node, `Use ::${node.name} for pseudo-elements.`);
    }
    if (node.type === "Function" && mathFunctions.has(node.name.toLowerCase())) checkMath(node);
  });
  return issues;
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const files = globSync("src/**/*.css");
  if (files.length === 0) throw new Error("No source CSS files found.");
  let errors = 0;
  for (const file of files) {
    for (const issue of checkCssSyntax(readFileSync(file, "utf8"))) {
      console.error(`${file}:${issue.line}:${issue.column} ${issue.message}`);
      errors += 1;
    }
  }
  if (errors) process.exitCode = 1;
  else console.log(`CSS syntax conventions passed (${files.length} files).`);
}
