"use strict";

window.QartibeContentLoader = (() => {
  const DATA_URL = "content/site-content.json";
  let cachePromise = null;

  const slugify = (value) =>
    String(value || "")
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 120);

  const normalizeItems = (items, type) => {
    if (!Array.isArray(items)) return [];
    return items.map((item, index) => {
      const title = String(item?.title_en || item?.title || `${type}-${index + 1}`);
      const slug = slugify(item?.slug || title || `${type}-${index + 1}`);
      return {
        ...item,
        title_en: item?.title_en || title,
        summary_en: item?.summary_en || "",
        body_en: item?.body_en || item?.summary_en || "",
        slug,
        id: item?.id || slug || `${type}-${index + 1}`
      };
    });
  };

  const load = async () => {
    if (!cachePromise) {
      cachePromise = fetch(DATA_URL, { cache: "no-store" })
        .then((res) => {
          if (!res.ok) throw new Error(`Failed to load content: ${res.status}`);
          return res.json();
        })
        .then((data) => ({
          blogPosts: normalizeItems(data?.blogPosts, "blog"),
          portfolioProjects: normalizeItems(data?.portfolioProjects, "project")
        }))
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
    }
  };
})();
