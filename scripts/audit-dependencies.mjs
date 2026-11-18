import { readFile } from "node:fs/promises";

const backportedAdvisory = "https://github.com/advisories/GHSA-fc5q-39xc-vjpf";

export function unresolvedPicomatchAdvisories(advisories) {
  return advisories.filter(({ url, severity }) => url !== backportedAdvisory && !["info", "low"].includes(severity));
}

if (import.meta.main) {
  // npm audit cannot map a locally named fork to the upstream package.
  const metadata = await readFile(new URL("../vendor/picomatch/package.json", import.meta.url), "utf8");
  const { version } = JSON.parse(metadata);
  const response = await fetch("https://registry.npmjs.org/-/npm/v1/security/advisories/bulk", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ picomatch: [version] }),
    signal: AbortSignal.timeout(15000),
  });
  if (!response.ok) throw new Error("Could not check upstream picomatch advisories (HTTP " + response.status + ")");
  const report = await response.json();
  if (
    !report ||
    typeof report !== "object" ||
    Array.isArray(report) ||
    Object.keys(report).some((key) => key !== "picomatch")
  ) {
    throw new Error("Unexpected upstream picomatch advisory report");
  }
  const advisories = report.picomatch ?? [];
  const unresolved = unresolvedPicomatchAdvisories(advisories);
  console.log("Upstream picomatch " + version + " advisories");
  for (const { url, severity } of advisories) {
    const status = url === backportedAdvisory ? "backported" : severity;
    console.log(JSON.stringify({ url, status }));
  }
  if (unresolved.length) {
    console.error("Unresolved advisory on the picomatch backport baseline.");
    process.exitCode = 1;
  } else {
    console.log("No unresolved moderate or higher advisories on the picomatch backport baseline.");
  }
}
