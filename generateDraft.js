#!/usr/bin/env node

import fs from "fs";
import path from "path";

const args = process.argv.slice(2);
const timestamp = args[0] || Date.now().toString();
const title = args[1] || "Untitled Draft";

if (!/^\d{13}$/.test(timestamp)) {
  console.error("Error: Timestamp must be a 13-digit millisecond timestamp");
  process.exit(1);
}

const date = new Date(Number(timestamp));
const dateString = date.toISOString().split("T")[0];
const slug = `draft-${timestamp}`;
const filePath = path.join(process.cwd(), "drafts", `${slug}.md`);
const imagesDir = path.join(process.cwd(), "drafts", `images-${slug}`);
const frontmatter = `---
title: ${title}
slug: ${slug}
date: ${dateString}
---

`;

try {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.mkdirSync(imagesDir, { recursive: true });
  fs.writeFileSync(filePath, frontmatter);
  console.log(`Created: ${filePath}`);
  console.log(`Created: ${imagesDir}`);
  console.log(`Timestamp: ${timestamp}`);
  console.log(`Date: ${dateString}`);
  console.log(`Title: ${title}`);
} catch (error) {
  console.error(`Error: ${error.message}`);
  process.exit(1);
}
