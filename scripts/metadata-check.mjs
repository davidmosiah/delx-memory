import { existsSync, readFileSync } from "node:fs";

const packageJson = JSON.parse(readFileSync("package.json", "utf8"));
const serverJson = JSON.parse(readFileSync("server.json", "utf8"));
const errors = [];

function requireFile(path) {
  if (!existsSync(path)) errors.push(`Missing required file: ${path}`);
}

requireFile("README.md");
requireFile("LICENSE");
requireFile("CHANGELOG.md");
requireFile("SECURITY.md");
requireFile("AGENTS.md");
requireFile("CONTRIBUTING.md");
requireFile("llms.txt");
requireFile("server.json");

if (serverJson.version !== packageJson.version) {
  errors.push(`server.json version ${serverJson.version} != package.json version ${packageJson.version}`);
}

const npmPkg = serverJson.packages?.find((p) => p.registryType === "npm");
if (!npmPkg) {
  errors.push("server.json must declare an npm package.");
} else {
  if (npmPkg.identifier !== packageJson.name) {
    errors.push(`server.json identifier ${npmPkg.identifier} != package name ${packageJson.name}`);
  }
  if (npmPkg.version !== packageJson.version) {
    errors.push(`server.json package version ${npmPkg.version} != package version ${packageJson.version}`);
  }
}

if (!Array.isArray(packageJson.files) || !packageJson.files.includes("llms.txt")) {
  errors.push("package.json files must include llms.txt.");
}
if (!packageJson.files.includes("README.md")) errors.push("package.json files must include README.md.");
if (!packageJson.files.includes("LICENSE")) errors.push("package.json files must include LICENSE.");
if (!packageJson.files.includes("examples")) errors.push("package.json files must include examples.");
if (packageJson.files.includes("src")) errors.push("package.json files must NOT include src.");
if (packageJson.files.includes("scripts")) errors.push("package.json files must NOT include scripts.");
if (packageJson.files.includes(".env")) errors.push("package.json files must NOT include .env.");

if (errors.length) {
  console.error(errors.map((e) => `- ${e}`).join("\n"));
  process.exit(1);
}

console.log(
  JSON.stringify(
    { ok: true, package: packageJson.name, version: packageJson.version },
    null,
    2,
  ),
);
