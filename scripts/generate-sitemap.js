#!/usr/bin/env node

/**
 * Build sitemap.xml from static pages + Contentful blog posts.
 * Run: node scripts/generate-sitemap.js
 */

const fs = require("node:fs/promises");
const path = require("node:path");

const ROOT_DIR = path.resolve(__dirname, "..");
const SITE_ORIGIN = "https://qartibe.space";
const CONFIG_PATH = path.join(ROOT_DIR, "content", "contentful-config.json");
const FALLBACK_PATH = path.join(ROOT_DIR, "content", "site-content.json");
const OUTPUT_PATH = path.join(ROOT_DIR, "sitemap.xml");

const STATIC_URLS = [
  { loc: `${SITE_ORIGIN}/`, changefreq: "weekly", priority: "1.0" },
  { loc: `${SITE_ORIGIN}/blog`, changefreq: "daily", priority: "0.9" },
  { loc: `${SITE_ORIGIN}/portfolio`, changefreq: "weekly", priority: "0.8" }
];

const toDateOnly = (value) => {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return date.toISOString().slice(0, 10);
};

const today = () => new Date().toISOString().slice(0, 10);

const pickField = (...values) => {
  for (const value of values) {
    if (Array.isArray(value) && value.length > 0) return value;
    if (typeof value === "string" && value.trim()) return value.trim();
    if (typeof value === "number" || typeof value === "boolean") return value;
  }
  return "";
};

const slugify = (value) => {
  if (typeof value !== "string" || !value.trim()) return "";
  return value
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 120);
};

const normalizeContentTypes = (value) => {
  if (Array.isArray(value)) {
    return value.map((item) => String(item || "").trim()).filter(Boolean);
  }
  if (typeof value === "string" && value.trim()) {
    return value
      .split(",")
      .map((item) => item.trim())
      .filter(Boolean);
  }
  return [];
};

const escapeXml = (value) =>
  String(value).replace(/[<>&'"]/g, (char) => {
    const map = {
      "<": "&lt;",
      ">": "&gt;",
      "&": "&amp;",
      "'": "&apos;",
      "\"": "&quot;"
    };
    return map[char] || char;
  });

const readJson = async (filePath, fallback = {}) => {
  try {
    const raw = await fs.readFile(filePath, "utf8");
    return JSON.parse(raw);
  } catch {
    return fallback;
  }
};

const fetchContentfulByType = async ({ spaceId, deliveryToken, environment, contentType }) => {
  const endpoint = `https://cdn.contentful.com/spaces/${encodeURIComponent(spaceId)}/environments/${encodeURIComponent(
    environment
  )}/entries`;

  const limit = 100;
  let skip = 0;
  let total = 0;
  const allItems = [];

  do {
    const url = new URL(endpoint);
    url.searchParams.set("access_token", deliveryToken);
    url.searchParams.set("content_type", contentType);
    url.searchParams.set("order", "-sys.createdAt");
    url.searchParams.set("limit", String(limit));
    url.searchParams.set("skip", String(skip));

    const response = await fetch(url.toString(), { cache: "no-store" });
    if (!response.ok) {
      throw new Error(`Contentful request failed (${contentType}): ${response.status}`);
    }

    const data = await response.json();
    const items = Array.isArray(data?.items) ? data.items : [];
    allItems.push(...items);
    total = Number(data?.total) || allItems.length;
    skip += Number(data?.limit) || limit;
  } while (skip < total);

  return allItems;
};

const mapPost = (item) => {
  const fields = item?.fields || {};
  const title = pickField(fields.title_en, fields.titleEn, fields.title, fields.Title, fields.name);
  const rawSlug = pickField(fields.slug, fields.Slug, fields.urlSlug, fields.url_slug, title, item?.sys?.id);
  const slug = slugify(String(rawSlug || "").replace(/\.html?$/i, ""));
  const lastmod =
    toDateOnly(pickField(fields.date, fields.publishDate, fields.publishedAt, item?.sys?.updatedAt, item?.sys?.createdAt)) ||
    today();

  if (!slug) return null;
  return { slug, lastmod };
};

const loadContentfulPosts = async () => {
  const config = await readJson(CONFIG_PATH, {});
  if (!config?.enabled) return [];

  const spaceId = String(config?.spaceId || "").trim();
  const deliveryToken = String(config?.deliveryToken || "").trim();
  const environment = String(config?.environment || "master").trim() || "master";
  const contentTypes = normalizeContentTypes(config?.contentTypes?.blogPosts);

  if (!spaceId || !deliveryToken || contentTypes.length === 0) return [];

  const lists = await Promise.all(
    contentTypes.map((contentType) => fetchContentfulByType({ spaceId, deliveryToken, environment, contentType }))
  );

  return lists.flat().map(mapPost).filter(Boolean);
};

const loadFallbackPosts = async () => {
  const content = await readJson(FALLBACK_PATH, {});
  const posts = Array.isArray(content?.blogPosts) ? content.blogPosts : [];
  return posts
    .map((item) => {
      const slug = slugify(String(pickField(item?.slug, item?.title_en, item?.title_bn) || "").replace(/\.html?$/i, ""));
      if (!slug) return null;
      return {
        slug,
        lastmod: toDateOnly(item?.date) || today()
      };
    })
    .filter(Boolean);
};

const mapProject = (item) => {
  const fields = item?.fields || {};
  const title = pickField(fields.title_en, fields.titleEn, fields.title, fields.Title, fields.name);
  const rawSlug = pickField(fields.slug, fields.Slug, fields.url, fields.Url, title, item?.sys?.id);
  const slug = slugify(String(rawSlug || "").replace(/\.html?$/i, ""));
  const lastmod =
    toDateOnly(
      pickField(fields.date, fields.updatedAt, fields.updated_at, item?.sys?.updatedAt, item?.sys?.createdAt)
    ) || today();
  if (!slug) return null;
  return { slug, lastmod };
};

const loadContentfulProjects = async () => {
  const config = await readJson(CONFIG_PATH, {});
  if (!config?.enabled) return [];

  const spaceId = String(config?.spaceId || "").trim();
  const deliveryToken = String(config?.deliveryToken || "").trim();
  const environment = String(config?.environment || "master").trim() || "master";
  const contentTypes = normalizeContentTypes(config?.contentTypes?.portfolioProjects);

  if (!spaceId || !deliveryToken || contentTypes.length === 0) return [];

  const lists = await Promise.all(
    contentTypes.map((contentType) => fetchContentfulByType({ spaceId, deliveryToken, environment, contentType }))
  );

  return lists.flat().map(mapProject).filter(Boolean);
};

const loadFallbackProjects = async () => {
  const content = await readJson(FALLBACK_PATH, {});
  const projects = Array.isArray(content?.portfolioProjects) ? content.portfolioProjects : [];
  return projects
    .map((item) => {
      const slug = slugify(String(pickField(item?.slug, item?.title_en, item?.title_bn, item?.url) || "").replace(/\.html?$/i, ""));
      if (!slug) return null;
      return {
        slug,
        lastmod: toDateOnly(item?.date) || today()
      };
    })
    .filter(Boolean);
};

const buildSitemapXml = (entries) => {
  const urls = entries
    .map(
      (entry) => [
        "  <url>",
        `    <loc>${escapeXml(entry.loc)}</loc>`,
        `    <lastmod>${escapeXml(entry.lastmod)}</lastmod>`,
        `    <changefreq>${escapeXml(entry.changefreq)}</changefreq>`,
        `    <priority>${escapeXml(entry.priority)}</priority>`,
        "  </url>"
      ].join("\n")
    )
    .join("\n");

  return ['<?xml version="1.0" encoding="UTF-8"?>', '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">', urls, "</urlset>", ""].join(
    "\n"
  );
};

const main = async () => {
  const defaultDate = today();
  const staticEntries = STATIC_URLS.map((item) => ({ ...item, lastmod: defaultDate }));

  const [contentfulPosts, fallbackPosts, contentfulProjects, fallbackProjects] = await Promise.all([
    loadContentfulPosts(),
    loadFallbackPosts(),
    loadContentfulProjects(),
    loadFallbackProjects()
  ]);
  const postMap = new Map();

  [...contentfulPosts, ...fallbackPosts].forEach((post) => {
    const loc = `${SITE_ORIGIN}/blog?post=${encodeURIComponent(post.slug)}`;
    const existing = postMap.get(loc);
    if (!existing || post.lastmod > existing.lastmod) {
      postMap.set(loc, {
        loc,
        lastmod: post.lastmod || defaultDate,
        changefreq: "monthly",
        priority: "0.8"
      });
    }
  });

  const postEntries = Array.from(postMap.values()).sort((a, b) => b.lastmod.localeCompare(a.lastmod) || a.loc.localeCompare(b.loc));
  const projectMap = new Map();

  [...contentfulProjects, ...fallbackProjects].forEach((project) => {
    const loc = `${SITE_ORIGIN}/portfolio?project=${encodeURIComponent(project.slug)}`;
    const existing = projectMap.get(loc);
    if (!existing || project.lastmod > existing.lastmod) {
      projectMap.set(loc, {
        loc,
        lastmod: project.lastmod || defaultDate,
        changefreq: "weekly",
        priority: "0.7"
      });
    }
  });

  const projectEntries = Array.from(projectMap.values()).sort(
    (a, b) => b.lastmod.localeCompare(a.lastmod) || a.loc.localeCompare(b.loc)
  );

  const allEntries = [...staticEntries, ...postEntries, ...projectEntries];

  const xml = buildSitemapXml(allEntries);
  await fs.writeFile(OUTPUT_PATH, xml, "utf8");

  console.log(`Sitemap generated: ${OUTPUT_PATH}`);
  console.log(`- static pages: ${staticEntries.length}`);
  console.log(`- blog posts: ${postEntries.length}`);
  console.log(`- portfolio projects: ${projectEntries.length}`);
};

main().catch((error) => {
  console.error(`Failed to generate sitemap: ${error.message}`);
  process.exitCode = 1;
});
