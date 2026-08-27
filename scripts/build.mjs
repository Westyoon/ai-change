import { copyFile, mkdir, readdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(scriptDirectory, "..");
const outputRoot = path.resolve(projectRoot, "dist");

const PUBLIC_ENTRIES = Object.freeze(["index.html", "assets", "css", "data", "js"]);
const EXCLUDED_DIRECTORIES = new Set([
  "data/drafts",
  "js/minigames/AIDS/dev",
]);
const PUBLIC_FILE_EXTENSIONS = new Set([
  ".avif",
  ".css",
  ".gif",
  ".html",
  ".ico",
  ".jpeg",
  ".jpg",
  ".js",
  ".json",
  ".m4a",
  ".mp3",
  ".mp4",
  ".ogg",
  ".otf",
  ".png",
  ".svg",
  ".ttf",
  ".wav",
  ".webm",
  ".webp",
  ".woff",
  ".woff2",
]);

const SECURITY_HEADERS = `/*
  Content-Security-Policy: default-src 'self'; base-uri 'self'; connect-src 'self'; font-src 'self'; form-action 'self'; frame-ancestors 'none'; img-src 'self' blob: data:; media-src 'self' blob:; object-src 'none'; script-src 'self'; style-src 'self' 'unsafe-inline'
  Permissions-Policy: accelerometer=(), camera=(), geolocation=(), gyroscope=(), microphone=(), payment=(), usb=()
  Referrer-Policy: strict-origin-when-cross-origin
  X-Content-Type-Options: nosniff
  X-Frame-Options: DENY
`;

function toPosix(relativePath) {
  return relativePath.split(path.sep).join("/");
}

function assertSafeOutputDirectory() {
  const relative = path.relative(projectRoot, outputRoot);
  if (relative !== "dist" || path.isAbsolute(relative)) {
    throw new Error(`Unsafe build output path: ${outputRoot}`);
  }
}

function shouldExclude(relativePath) {
  const normalized = toPosix(relativePath);
  return (
    EXCLUDED_DIRECTORIES.has(normalized) ||
    (normalized.startsWith("js/") && normalized.split("/").includes("dev")) ||
    normalized.endsWith(".draft.json") ||
    normalized.endsWith(".md")
  );
}

async function copyPublicEntry(relativePath, copiedFiles) {
  if (shouldExclude(relativePath)) return;

  const sourcePath = path.join(projectRoot, relativePath);
  const destinationPath = path.join(outputRoot, relativePath);
  const entries = await readdir(sourcePath, { withFileTypes: true }).catch((error) => {
    if (error?.code === "ENOTDIR") return null;
    throw error;
  });

  if (entries === null) {
    const extension = path.extname(relativePath).toLowerCase();
    if (!PUBLIC_FILE_EXTENSIONS.has(extension)) {
      throw new Error(`Unexpected file type in the public runtime graph: ${toPosix(relativePath)}`);
    }
    await mkdir(path.dirname(destinationPath), { recursive: true });
    await copyFile(sourcePath, destinationPath);
    copiedFiles.push(toPosix(relativePath));
    return;
  }

  await mkdir(destinationPath, { recursive: true });
  for (const entry of entries.sort((left, right) => left.name.localeCompare(right.name))) {
    await copyPublicEntry(path.join(relativePath, entry.name), copiedFiles);
  }
}

async function verifyBuild(copiedFiles) {
  const requiredFiles = [
    "index.html",
    "css/common.css",
    "data/app-config.json",
    "data/minigames.json",
    "js/app.js",
  ];

  for (const relativePath of requiredFiles) {
    if (!copiedFiles.includes(relativePath)) {
      throw new Error(`Required runtime file was not copied: ${relativePath}`);
    }
  }

  for (const relativePath of copiedFiles) {
    if (shouldExclude(relativePath)) {
      throw new Error(`Development-only file leaked into the build: ${relativePath}`);
    }
  }

  const appConfig = JSON.parse(await readFile(path.join(outputRoot, "data/app-config.json"), "utf8"));
  if (appConfig.publicBasePath !== "./") {
    throw new Error("The current static deployment requires app-config.publicBasePath to be './'.");
  }
}

async function main() {
  assertSafeOutputDirectory();
  await rm(outputRoot, { recursive: true, force: true });
  await mkdir(outputRoot, { recursive: true });

  const copiedFiles = [];
  for (const entry of PUBLIC_ENTRIES) {
    await copyPublicEntry(entry, copiedFiles);
  }

  copiedFiles.sort();
  await verifyBuild(copiedFiles);
  await writeFile(path.join(outputRoot, "_headers"), SECURITY_HEADERS, "utf8");

  console.log(`Production build created: ${copiedFiles.length} runtime files in dist/.`);
}

await main();
