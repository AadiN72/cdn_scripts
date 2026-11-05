#!/usr/bin/env node

import fs from "fs";
import path from "path";
import { execFileSync } from "child_process";
import { Octokit } from "octokit";
import sharp from "sharp";
import dotenv from "dotenv";
import readline from "readline/promises";

const repoRoot = process.cwd();
dotenv.config({ path: path.join(repoRoot, ".env") });

const args = process.argv.slice(2);
const draftsDir = path.join(repoRoot, "drafts");

async function promptForDraft() {
  const files = fs
    .readdirSync(draftsDir)
    .filter((file) => file.endsWith(".md"))
    .sort();

  if (files.length === 0) {
    throw new Error("No draft files found in drafts/");
  }

  console.log("Select a draft to publish:\n");
  files.forEach((file, index) => {
    console.log(`${index + 1}. ${file.replace(/\.md$/, "")}`);
  });

  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });
  const answer = await rl.question("\nChoose a draft number: ");
  rl.close();

  const selection = Number(answer.trim());
  const chosen = files[selection - 1];
  if (!chosen) {
    throw new Error("Invalid selection");
  }
  return chosen.replace(/\.md$/, "");
}

let draftSlug = args[0] || (await promptForDraft());
if (!/^[A-Za-z0-9._-]+$/.test(draftSlug)) {
  throw new Error("Draft name contains unsupported characters");
}

const githubConfig = {
  token: process.env.GITHUB_TOKEN,
  owner: process.env.GITHUB_OWNER,
  repo: process.env.GITHUB_REPO,
  branch: process.env.GITHUB_BRANCH || "main",
  mediaPath: process.env.GITHUB_MEDIA_PATH || "media",
};

if (!githubConfig.token) {
  throw new Error("GITHUB_TOKEN not found in .env");
}
if (!githubConfig.owner || !githubConfig.repo) {
  throw new Error("GITHUB_OWNER or GITHUB_REPO not found in .env");
}

const octokit = new Octokit({ auth: githubConfig.token });
const draftFile = path.join(draftsDir, `${draftSlug}.md`);
const publishedFile = path.join(repoRoot, "files", `${draftSlug}.md`);

function findImageLinks(content) {
  return [...content.matchAll(/!\[([^\]]*)\]\(([^)]+)\)/g)].map((match) => ({
    path: match[2],
  }));
}

function escapeRegex(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function resolveImageSourceDir(content) {
  const candidates = findImageLinks(content)
    .map(({ path: imagePath }) => imagePath.trim())
    .filter((imagePath) => imagePath && !/^https?:\/\//i.test(imagePath))
    .map((imagePath) => path.join(draftsDir, path.dirname(imagePath)));

  for (const candidate of candidates) {
    if (fs.existsSync(candidate) && fs.statSync(candidate).isDirectory()) {
      return candidate;
    }
  }

  const fallback = path.join(draftsDir, `images-${draftSlug}`);
  if (fs.existsSync(fallback)) {
    return fallback;
  }

  const imageDirs = fs
    .readdirSync(draftsDir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && entry.name.startsWith("images-"));
  return imageDirs.length === 1
    ? path.join(draftsDir, imageDirs[0].name)
    : null;
}

async function moveImagesIntoMedia(content) {
  const sourceDir = resolveImageSourceDir(content);
  if (!sourceDir) {
    return { files: [], imageNameMap: new Map() };
  }

  const targetDir = path.join(repoRoot, "media", draftSlug);
  fs.rmSync(targetDir, { recursive: true, force: true });
  fs.mkdirSync(targetDir, { recursive: true });

  const imageNameMap = new Map();
  for (const entry of fs.readdirSync(sourceDir, { withFileTypes: true })) {
    if (!entry.isFile()) {
      continue;
    }

    const sourcePath = path.join(sourceDir, entry.name);
    const parsedName = path.parse(entry.name);
    let outputName = `${parsedName.name}.png`;
    let suffix = 1;
    while (fs.existsSync(path.join(targetDir, outputName))) {
      outputName = `${parsedName.name}-${suffix}.png`;
      suffix += 1;
    }

    await sharp(sourcePath).png().toFile(path.join(targetDir, outputName));
    imageNameMap.set(entry.name, outputName);
  }

  try {
    fs.rmSync(sourceDir, {
      recursive: true,
      force: true,
      maxRetries: 5,
      retryDelay: 200,
    });
  } catch (error) {
    if (error.code !== "EPERM") {
      throw error;
    }

    console.warn(
      `Warning: Converted images, but could not remove source directory: ${sourceDir}`,
    );
  }
  execFileSync("git", ["add", "--", `media/${draftSlug}`], {
    cwd: repoRoot,
    stdio: "inherit",
  });

  return {
    files: fs.readdirSync(targetDir),
    imageNameMap,
  };
}

async function getImageUrlsFromGitHub() {
  const mediaDir = path.join(repoRoot, "media", draftSlug);
  const imageUrls = new Map();
  for (const fileName of fs.readdirSync(mediaDir)) {
    const contentData = await octokit.rest.repos.getContent({
      owner: githubConfig.owner,
      repo: githubConfig.repo,
      path: `${githubConfig.mediaPath}/${draftSlug}/${fileName}`,
      ref: githubConfig.branch,
    });
    imageUrls.set(
      fileName,
      contentData.data.download_url ||
        `https://raw.githubusercontent.com/${githubConfig.owner}/${githubConfig.repo}/${githubConfig.branch}/${githubConfig.mediaPath}/${draftSlug}/${fileName}`,
    );
  }
  return imageUrls;
}

function commitMediaBundle() {
  const status = execFileSync("git", ["status", "--porcelain", "--", `media/${draftSlug}`], {
    cwd: repoRoot,
    encoding: "utf8",
  }).trim();
  if (!status) {
    return;
  }
  execFileSync("git", ["commit", "-m", `Add media for ${draftSlug}`], {
    cwd: repoRoot,
    stdio: "inherit",
  });
  execFileSync("git", ["push", "origin", githubConfig.branch], {
    cwd: repoRoot,
    stdio: "inherit",
  });
}

function hydrateMarkdown(content, imageUrls, imageNameMap) {
  for (const imageLink of findImageLinks(content)) {
    const sourceName = path.basename(imageLink.path);
    const mediaName = imageNameMap.get(sourceName) || sourceName;
    const cdnUrl = imageUrls.get(mediaName);
    if (!cdnUrl) {
      continue;
    }
    content = content.replace(
      new RegExp(`!\\[([^\\]]*)\\]\\(${escapeRegex(imageLink.path)}\\)`, "g"),
      `![$1](${cdnUrl})`,
    );
  }
  return content;
}

function finalizeGitPublish() {
  const candidatePaths = [`drafts/${draftSlug}.md`, `files/${draftSlug}.md`];
  if (fs.existsSync(path.join(repoRoot, "rss.xml"))) {
    candidatePaths.push("rss.xml");
  }
  const paths = candidatePaths.filter((relativePath) => {
    if (fs.existsSync(path.join(repoRoot, relativePath))) {
      return true;
    }

    try {
      execFileSync("git", ["ls-files", "--error-unmatch", "--", relativePath], {
        cwd: repoRoot,
        stdio: "ignore",
      });
      return true;
    } catch (error) {
      if (error.status !== 1) {
        throw error;
      }
      return false;
    }
  });
  if (paths.length === 0) {
    return;
  }
  execFileSync("git", ["add", "-A", "--", ...paths], {
    cwd: repoRoot,
    stdio: "inherit",
  });
  const status = execFileSync("git", ["status", "--porcelain"], {
    cwd: repoRoot,
    encoding: "utf8",
  }).trim();
  if (!status) {
    return;
  }
  execFileSync("git", ["commit", "-m", `Publish ${draftSlug}`], {
    cwd: repoRoot,
    stdio: "inherit",
  });
  execFileSync("git", ["push", "origin", githubConfig.branch], {
    cwd: repoRoot,
    stdio: "inherit",
  });
}

async function publishDraft() {
  if (!fs.existsSync(draftFile)) {
    throw new Error(`Draft file not found: ${draftFile}`);
  }

  console.log(`\nPublishing draft: ${draftSlug}\n`);
  const content = fs.readFileSync(draftFile, "utf8");
  const { files, imageNameMap } = await moveImagesIntoMedia(content);
  if (files.length > 0) {
    commitMediaBundle();
  }

  const imageUrls = files.length > 0 ? await getImageUrlsFromGitHub() : new Map();
  fs.mkdirSync(path.dirname(publishedFile), { recursive: true });
  fs.writeFileSync(
    publishedFile,
    hydrateMarkdown(content, imageUrls, imageNameMap),
  );

  const rssScript = path.join(repoRoot, "scripts", "generateRss.js");
  if (fs.existsSync(rssScript)) {
    execFileSync(process.execPath, [rssScript], {
      cwd: repoRoot,
      stdio: "inherit",
    });
  }

  fs.rmSync(draftFile);
  finalizeGitPublish();
  console.log(`\nSuccessfully published ${draftSlug}\n`);
}

publishDraft().catch((error) => {
  console.error(`\nPublish failed: ${error.message}\n`);
  process.exitCode = 1;
});
