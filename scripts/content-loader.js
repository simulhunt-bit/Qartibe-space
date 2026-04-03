"use strict";

window.QartibeContentLoader = (() => {
  const DATA_PATH = "content/site-content.json";
  const CONFIG_PATH = "content/contentful-config.json";
  let cachePromise = null;

  const scriptSrc =
    typeof document !== "undefined" && document.currentScript && document.currentScript.src
      ? document.currentScript.src
      : "";
  const scriptBaseHref = (() => {
    if (!scriptSrc) return "";
    try {
      return new URL("../", scriptSrc).href;
    } catch {
      return "";
    }
  })();

  const buildUrlCandidates = (path) => {
    const cleanPath = String(path || "").replace(/^\/+/, "");
    if (!cleanPath) return [];

    const candidates = [];
    if (scriptBaseHref) {
      try {
        candidates.push(new URL(cleanPath, scriptBaseHref).toString());
      } catch {}
    }

    if (typeof window !== "undefined" && window.location) {
      try {
        candidates.push(new URL(`/${cleanPath}`, window.location.origin).toString());
      } catch {}
      candidates.push(`/${cleanPath}`);
      candidates.push(cleanPath);
    } else {
      candidates.push(`/${cleanPath}`);
      candidates.push(cleanPath);
    }

    return Array.from(new Set(candidates));
  };

  const fetchJsonWithFallback = async (path, { required = false } = {}) => {
    const candidates = buildUrlCandidates(path);
    let lastError = null;

    for (const candidate of candidates) {
      try {
        const response = await fetch(candidate, { cache: "no-store" });
        if (!response.ok) {
          lastError = new Error(`Failed to load ${candidate}: ${response.status}`);
          continue;
        }
        return await response.json();
      } catch (error) {
        lastError = error;
      }
    }

    if (required) throw lastError || new Error(`Failed to load required JSON: ${path}`);
    return null;
  };

  const pick = (...values) => {
    for (const value of values) {
      if (typeof value === "string" && value.trim()) return value.trim();
      if (typeof value === "number" || typeof value === "boolean") return value;
      if (Array.isArray(value) && value.length > 0) return value;
      if (value && typeof value === "object") return value;
    }
    return "";
  };

  const slugify = (value) =>
    String(value || "")
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 120);

  const toArray = (value) => {
    if (Array.isArray(value)) return value;
    if (typeof value === "string" && value.trim()) {
      return value
        .split(",")
        .map((part) => part.trim())
        .filter(Boolean);
    }
    return [];
  };

  const richTextToPlain = (node) => {
    if (!node) return "";
    if (Array.isArray(node)) return node.map(richTextToPlain).join(" ").trim();
    if (node.nodeType === "text") return String(node.value || "");
    if (Array.isArray(node.content)) return node.content.map(richTextToPlain).join(" ").trim();
    return "";
  };

  const trimSummary = (value, maxLen = 180) => {
    const text = String(value || "").replace(/\s+/g, " ").trim();
    if (text.length <= maxLen) return text;
    return `${text.slice(0, Math.max(0, maxLen - 3)).trim()}...`;
  };

  const normalizeLocalBlogPosts = (items) => {
    if (!Array.isArray(items)) return [];

    return items.map((item, index) => {
      const title = String(pick(item?.title_en, item?.title, `blog-${index + 1}`));
      const slug = slugify(pick(item?.slug, title, item?.id, `blog-${index + 1}`));
      const summary = String(pick(item?.summary_en, item?.summary, item?.body_en, ""));
      const relatedPostIds = toArray(pick(item?.relatedPostIds, item?.relatedPosts, []))
        .map((value) => String(value).trim())
        .filter(Boolean);
      const recommendedPostTitles = toArray(
        pick(item?.recommendedPostTitles, item?.recommendedPosts, item?.relatedTitles, [])
      )
        .map((value) => String(value).trim())
        .filter(Boolean);

      return {
        id: String(pick(item?.id, slug)),
        slug,
        title_en: title,
        summary_en: summary,
        body_en: String(pick(item?.body_en, summary)),
        date: String(pick(item?.publishedDate, item?.date, "")),
        publishedDate: String(pick(item?.publishedDate, item?.date, "")),
        author: String(pick(item?.author, "")),
        imagePrompt: String(pick(item?.imagePrompt, "")),
        richContent: null,
        relatedPostIds,
        relatedSlugs: [],
        recommendedPostTitles,
        recommendedSlugs: [],
        source: "local"
      };
    });
  };

  const normalizeLocalPortfolioProjects = (items) => {
    if (!Array.isArray(items)) return [];

    return items.map((item, index) => {
      const title = String(pick(item?.title_en, item?.title, `project-${index + 1}`));
      const slug = slugify(pick(item?.slug, title, item?.id, item?.url, `project-${index + 1}`));
      const summary = String(pick(item?.summary_en, item?.summary, item?.description_en, item?.description, ""));
      const duration = String(pick(item?.duration, ""));
      const actionsTaken = String(pick(item?.actionsTaken, item?.actions, ""));
      const results = String(pick(item?.results, item?.result_en, item?.result, ""));
      return {
        id: String(pick(item?.id, slug)),
        slug,
        title_en: title,
        summary_en: summary,
        duration,
        actionsTaken,
        results,
        result_en: String(pick(item?.result_en, item?.result, results)),
        tags_en: toArray(pick(item?.tags_en, item?.tags, [])),
        richDescription: null,
        source: "local"
      };
    });
  };

  const normalizeLocalServices = (items) => {
    if (!Array.isArray(items)) return [];

    return items.map((item, index) => {
      const title = String(pick(item?.title_en, item?.title, `service-${index + 1}`));
      const slug = slugify(pick(item?.slug, title, item?.id, item?.url, `service-${index + 1}`));
      const summary = String(pick(item?.summary_en, item?.summary, item?.description_en, item?.description, ""));
      const highlights = toArray(pick(item?.highlights, item?.deliverables, item?.points, item?.tags_en, item?.tags, []));
      const inquireLabel = String(pick(item?.inquireLabel, "Inquire"));

      return {
        id: String(pick(item?.id, slug)),
        slug,
        title_en: title,
        summary_en: summary,
        highlights,
        inquireLabel,
        source: "local"
      };
    });
  };

  const readLocalData = async () => {
    const data = await fetchJsonWithFallback(DATA_PATH, { required: true });
    return {
      blogPosts: normalizeLocalBlogPosts(data?.blogPosts),
      portfolioProjects: normalizeLocalPortfolioProjects(data?.portfolioProjects),
      services: normalizeLocalServices(data?.services)
    };
  };

  const readConfig = async () => {
    try {
      const config = await fetchJsonWithFallback(CONFIG_PATH);
      return config && typeof config === "object" ? config : null;
    } catch {
      return null;
    }
  };

  const fetchContentfulEntriesByType = async ({ spaceId, token, environment, contentType }) => {
    const endpoint = `https://cdn.contentful.com/spaces/${encodeURIComponent(spaceId)}/environments/${encodeURIComponent(
      environment
    )}/entries`;
    const limit = 100;
    let skip = 0;
    let total = 0;
    const items = [];
    const includesEntries = new Map();
    const includesAssets = new Map();

    do {
      const url = new URL(endpoint);
      url.searchParams.set("access_token", token);
      url.searchParams.set("content_type", contentType);
      url.searchParams.set("include", "2");
      url.searchParams.set("limit", String(limit));
      url.searchParams.set("skip", String(skip));
      url.searchParams.set("order", "-fields.publishedDate,-sys.createdAt");

      const response = await fetch(url.toString(), { cache: "no-store" });
      if (!response.ok) {
        throw new Error(`Contentful request failed (${contentType}): ${response.status}`);
      }

      const data = await response.json();
      const batch = Array.isArray(data?.items) ? data.items : [];
      items.push(...batch);
      total = Number(data?.total) || items.length;
      skip += Number(data?.limit) || limit;

      const linkedEntries = Array.isArray(data?.includes?.Entry) ? data.includes.Entry : [];
      const linkedAssets = Array.isArray(data?.includes?.Asset) ? data.includes.Asset : [];

      linkedEntries.forEach((entry) => {
        if (entry?.sys?.id) includesEntries.set(entry.sys.id, entry);
      });
      linkedAssets.forEach((asset) => {
        if (asset?.sys?.id) includesAssets.set(asset.sys.id, asset);
      });
    } while (skip < total);

    return { items, includesEntries, includesAssets };
  };

  const mapContentfulBlogEntry = (entry, includesEntries) => {
    const fields = entry?.fields || {};
    const title = String(pick(fields.title, fields.title_en, fields.titleEn, fields.name, "Untitled"));
    const slug = slugify(pick(fields.slug, fields.urlSlug, fields.url_slug, title, entry?.sys?.id));
    const contentDoc = fields.content || fields.body || null;
    const tipsDoc = fields.actionableTips || null;
    const examplesDoc = fields.examples || null;
    const summary = trimSummary(
      pick(fields.summary, fields.summary_en, richTextToPlain(contentDoc), richTextToPlain(tipsDoc), richTextToPlain(examplesDoc), "")
    );
    const publishedDate = String(pick(fields.publishedDate, fields.date, entry?.sys?.createdAt, ""));

    let author = "";
    const authorLinkId = fields?.author?.sys?.id;
    if (authorLinkId && includesEntries?.has(authorLinkId)) {
      const authorEntry = includesEntries.get(authorLinkId);
      author = String(pick(authorEntry?.fields?.name, authorEntry?.fields?.title, ""));
    } else {
      author = String(pick(fields.authorName, fields.author, ""));
    }

    const relatedPostIds = Array.isArray(fields.relatedPosts)
      ? fields.relatedPosts
          .map((item) => item?.sys?.id)
          .filter((id) => typeof id === "string" && id.trim())
      : [];
    const recommendedPostTitles = toArray(fields.recommendedPosts)
      .map((value) => String(value).trim())
      .filter(Boolean);

    return {
      id: String(pick(entry?.sys?.id, slug)),
      slug,
      title_en: title,
      summary_en: summary,
      body_en: trimSummary(richTextToPlain(contentDoc), 500),
      date: publishedDate,
      publishedDate,
      author,
      imagePrompt: String(pick(fields.imagePrompt, "")),
      richContent: {
        content: contentDoc,
        actionableTips: tipsDoc,
        examples: examplesDoc
      },
      relatedPostIds,
      relatedSlugs: [],
      recommendedPostTitles,
      recommendedSlugs: [],
      source: "contentful"
    };
  };

  const mapContentfulPortfolioEntry = (entry) => {
    const fields = entry?.fields || {};
    const title = String(pick(fields.title, fields.title_en, fields.titleEn, fields.name, "Untitled project"));
    const slug = slugify(pick(fields.slug, fields.urlSlug, fields.url_slug, title, fields.url, entry?.sys?.id));
    const descriptionDoc = fields.description || null;
    const summary = String(pick(fields.summary, fields.summary_en, richTextToPlain(descriptionDoc), ""));
    const duration = String(pick(fields.duration, ""));
    const actionsTaken = String(pick(fields.actionsTaken, fields.actions_taken, ""));
    const results = String(pick(fields.results, fields.result, fields.result_en, ""));

    return {
      id: String(pick(entry?.sys?.id, slug)),
      slug,
      title_en: title,
      summary_en: trimSummary(summary, 260),
      duration,
      actionsTaken,
      results,
      result_en: String(pick(fields.result, fields.result_en, results)),
      tags_en: toArray(pick(fields.tags, fields.tags_en, [])),
      richDescription: descriptionDoc,
      source: "contentful"
    };
  };

  const mapContentfulServiceEntry = (entry) => {
    const fields = entry?.fields || {};
    const title = String(pick(fields.title, fields.title_en, fields.titleEn, fields.name, "Untitled service"));
    const slug = slugify(pick(fields.slug, fields.urlSlug, fields.url_slug, title, fields.url, entry?.sys?.id));
    const summary = String(pick(fields.summary, fields.summary_en, fields.description, fields.description_en, ""));
    const highlights = toArray(pick(fields.highlights, fields.deliverables, fields.features, fields.points, fields.tags, []));
    const inquireLabel = String(pick(fields.inquireLabel, "Inquire"));

    return {
      id: String(pick(entry?.sys?.id, slug)),
      slug,
      title_en: title,
      summary_en: trimSummary(summary, 220),
      highlights,
      inquireLabel,
      source: "contentful"
    };
  };

  const mergeBySlug = (preferred, fallback) => {
    const map = new Map();
    [...preferred, ...fallback].forEach((item) => {
      const key = String(item?.slug || "").trim().toLowerCase();
      if (!key) return;
      if (!map.has(key)) map.set(key, item);
    });
    return Array.from(map.values());
  };

  const sortByDateDesc = (items) =>
    [...items].sort((a, b) => {
      const da = Date.parse(pick(a?.publishedDate, a?.date, ""));
      const db = Date.parse(pick(b?.publishedDate, b?.date, ""));
      return (Number.isFinite(db) ? db : 0) - (Number.isFinite(da) ? da : 0);
    });

  const resolveBlogRelations = (posts) => {
    const idToSlug = new Map();
    const titleToSlug = new Map();

    posts.forEach((post) => {
      const slug = String(post?.slug || "").trim();
      if (!slug) return;

      if (post?.id) idToSlug.set(String(post.id), slug);

      const titleKey = String(post?.title_en || "").trim().toLowerCase();
      if (titleKey && !titleToSlug.has(titleKey)) {
        titleToSlug.set(titleKey, slug);
      }
    });

    posts.forEach((post) => {
      const ownSlug = String(post?.slug || "").trim();
      const existingRelatedSlugs = Array.isArray(post?.relatedSlugs) ? post.relatedSlugs : [];
      const relatedFromIds = (Array.isArray(post?.relatedPostIds) ? post.relatedPostIds : [])
        .map((id) => idToSlug.get(String(id)))
        .filter(Boolean);

      post.relatedSlugs = Array.from(new Set([...existingRelatedSlugs, ...relatedFromIds])).filter(
        (slug) => slug && slug !== ownSlug
      );

      const recommendedTitles = Array.isArray(post?.recommendedPostTitles) ? post.recommendedPostTitles : [];
      post.recommendedSlugs = Array.from(
        new Set(
          recommendedTitles
            .map((title) => titleToSlug.get(String(title).trim().toLowerCase()))
            .filter(Boolean)
        )
      ).filter((slug) => slug && slug !== ownSlug);
    });

    return posts;
  };

  const loadContentfulData = async () => {
    const config = await readConfig();
    if (!config?.enabled) return { blogPosts: [], portfolioProjects: [], services: [] };

    const spaceId = String(config?.spaceId || "").trim();
    const token = String(config?.deliveryToken || "").trim();
    const environment = String(config?.environment || "master").trim() || "master";
    const blogTypes = toArray(config?.contentTypes?.blogPosts);
    const portfolioTypes = toArray(config?.contentTypes?.portfolioProjects);
    const serviceTypes = toArray(config?.contentTypes?.services);
    if (!spaceId || !token) return { blogPosts: [], portfolioProjects: [], services: [] };

    const blogResults = await Promise.all(
      blogTypes.map((contentType) =>
        fetchContentfulEntriesByType({ spaceId, token, environment, contentType }).catch(() => ({
          items: [],
          includesEntries: new Map(),
          includesAssets: new Map()
        }))
      )
    );
    const portfolioResults = await Promise.all(
      portfolioTypes.map((contentType) =>
        fetchContentfulEntriesByType({ spaceId, token, environment, contentType }).catch(() => ({
          items: [],
          includesEntries: new Map(),
          includesAssets: new Map()
        }))
      )
    );
    const serviceResults = await Promise.all(
      serviceTypes.map((contentType) =>
        fetchContentfulEntriesByType({ spaceId, token, environment, contentType }).catch(() => ({
          items: [],
          includesEntries: new Map(),
          includesAssets: new Map()
        }))
      )
    );

    const blogIncludesEntries = new Map();
    const contentfulBlogPosts = blogResults
      .flatMap((result) => {
        result.includesEntries.forEach((value, key) => blogIncludesEntries.set(key, value));
        return result.items;
      })
      .map((entry) => mapContentfulBlogEntry(entry, blogIncludesEntries));

    const contentfulPortfolioProjects = portfolioResults
      .flatMap((result) => result.items)
      .map((entry) => mapContentfulPortfolioEntry(entry));
    const contentfulServices = serviceResults.flatMap((result) => result.items).map((entry) => mapContentfulServiceEntry(entry));

    return {
      blogPosts: contentfulBlogPosts,
      portfolioProjects: contentfulPortfolioProjects,
      services: contentfulServices
    };
  };

  const load = async () => {
    if (!cachePromise) {
      cachePromise = Promise.allSettled([readLocalData(), loadContentfulData()])
        .then((results) => {
          const local =
            results[0].status === "fulfilled" ? results[0].value : { blogPosts: [], portfolioProjects: [], services: [] };
          const contentful =
            results[1].status === "fulfilled" ? results[1].value : { blogPosts: [], portfolioProjects: [], services: [] };
          const mergedBlogPosts = resolveBlogRelations(sortByDateDesc(mergeBySlug(contentful.blogPosts, local.blogPosts)));
          return {
            blogPosts: mergedBlogPosts,
            portfolioProjects: mergeBySlug(contentful.portfolioProjects, local.portfolioProjects),
            services: mergeBySlug(contentful.services, local.services)
          };
        })
        .catch((err) => {
          cachePromise = null;
          throw err;
        });
    }
    return cachePromise;
  };

  return {
    load,
    async getBlogPosts() {
      const data = await load();
      return data.blogPosts;
    },
    async getPortfolioProjects() {
      const data = await load();
      return data.portfolioProjects;
    },
    async getServices() {
      const data = await load();
      return data.services;
    }
  };
})();

