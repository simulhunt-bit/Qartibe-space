(() => {
  const CACHE_PREFIX = "qs-json-cache:v1:";
  const DEFAULT_TTL_MS = 5 * 60 * 1000;
  const MAX_CACHE_SIZE = 300_000;

  const resolveUrl = (url) => {
    try {
      return new URL(String(url || ""), window.location.origin).toString();
    } catch (error) {
      return String(url || "");
    }
  };

  const getStorage = () => {
    try {
      const probeKey = `${CACHE_PREFIX}probe`;
      window.sessionStorage.setItem(probeKey, "1");
      window.sessionStorage.removeItem(probeKey);
      return window.sessionStorage;
    } catch (error) {
      return null;
    }
  };

  const storage = getStorage();

  const readFromCache = (cacheKey, ttlMs) => {
    if (!storage) return null;
    try {
      const raw = storage.getItem(cacheKey);
      if (!raw) return null;
      const parsed = JSON.parse(raw);
      if (!parsed || typeof parsed !== "object") return null;
      const savedAt = Number(parsed.savedAt || 0);
      if (!savedAt || Date.now() - savedAt > ttlMs) return null;
      return parsed.value;
    } catch (error) {
      return null;
    }
  };

  const writeToCache = (cacheKey, value) => {
    if (!storage) return;
    try {
      const payload = JSON.stringify({
        savedAt: Date.now(),
        value
      });
      if (payload.length <= MAX_CACHE_SIZE) {
        storage.setItem(cacheKey, payload);
      }
    } catch (error) {
      // Ignore storage quota and serialization errors.
    }
  };

  const fetchAndCache = async (absoluteUrl, cacheKey, cacheMode) => {
    const response = await fetch(absoluteUrl, { cache: cacheMode });
    if (!response.ok) {
      throw new Error(`Request failed: ${response.status}`);
    }
    const json = await response.json();
    writeToCache(cacheKey, json);
    return json;
  };

  const fetchJson = async (url, options = {}) => {
    const absoluteUrl = resolveUrl(url);
    const ttlMs = Number(options.ttlMs) > 0 ? Number(options.ttlMs) : DEFAULT_TTL_MS;
    const cacheMode = typeof options.cacheMode === "string" && options.cacheMode ? options.cacheMode : "default";
    const revalidate = options.revalidate !== false;
    const bypassCache = options.bypassCache === true;
    const cacheKey = `${CACHE_PREFIX}${absoluteUrl}`;

    if (!bypassCache) {
      const cached = readFromCache(cacheKey, ttlMs);
      if (cached !== null) {
        if (revalidate) {
          fetchAndCache(absoluteUrl, cacheKey, cacheMode).catch(() => {});
        }
        return cached;
      }
    }

    return fetchAndCache(absoluteUrl, cacheKey, cacheMode);
  };

  const warmJson = async (url, options = {}) =>
    fetchJson(url, {
      ...options,
      bypassCache: true
    }).catch(() => null);

  window.qsContentLoader = Object.freeze({
    fetchJson,
    warmJson,
    resolveUrl
  });
})();
