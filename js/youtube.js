/*
  Sermones (100% estático para GitHub Pages)
  - NO usa YouTube Data API
  - NO usa API keys
  - NO usa backend

  Estrategia:
  1) Intentar resolver Channel ID (UC...) a partir del @handle usando el RSS legacy (?user=)
  2) Consumir el RSS oficial vía rss2json:
     https://api.rss2json.com/v1/api.json?rss_url=
  3) Renderizar 3 cards con thumbnail/título/fecha/botón
  4) Modal opcional embebido con iframe

  Nota:
  - Dependemos de un servicio tercero (rss2json). Puede tener límites o fallar.
*/

(() => {
  "use strict";

  const HANDLE = "iglesiacristianacongregaci5798"; // del URL: https://www.youtube.com/@...
  // Opcional: si conoces el Channel ID (UC...), pégalo aquí para máxima confiabilidad.
  // Si se deja vacío, el script intenta resolverlo automáticamente.
  const FALLBACK_CHANNEL_ID = "";
  const MAX_RESULTS = 4;
  const USE_MODAL = true;
  const CHANNEL_URL = `https://www.youtube.com/@${HANDLE}`;

  // Resiliencia: servicios terceros pueden fallar intermitente.
  const FETCH_TIMEOUT_MS = 8000;
  const RETRY_MAX = 3;
  const RETRY_BASE_MS = 900;

  const RSS2JSON_V1 = "https://api.rss2json.com/v1/api.json?rss_url=";
  const RSS2JSON_LEGACY = "https://rss2json.com/api.json?rss_url=";
  const ALLORIGINS_RAW = "https://api.allorigins.win/raw?url=";

  const grid = document.getElementById("sermonsGrid");
  const statusEl = document.getElementById("sermonsStatus");

  const featuredEl = document.getElementById("featuredSermon");
  const moreBtn = document.getElementById("sermonsMoreBtn");

  const modal = document.getElementById("videoModal");
  const modalFrame = document.getElementById("videoModalFrame");

  if (!grid || !statusEl) return;

  if (moreBtn) {
    moreBtn.setAttribute("href", CHANNEL_URL);
  }

  const setStatus = (msg) => {
    statusEl.textContent = msg;
  };

  const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

  const fetchWithTimeout = async (url, options = {}, timeoutMs = FETCH_TIMEOUT_MS) => {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);

    try {
      return await fetch(url, {
        cache: "no-store",
        ...options,
        signal: controller.signal
      });
    } finally {
      clearTimeout(timer);
    }
  };

  const escapeHtml = (str) =>
    String(str)
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");

  const capitalizeMonth = (formatted) => {
    // "15 de enero de 2026" -> "15 de Enero de 2026"
    // Mantiene el formato solicitado por el usuario.
    const parts = String(formatted).split(" de ");
    if (parts.length !== 3) return formatted;
    const [day, month, year] = parts;
    const monthCap = month ? month.charAt(0).toUpperCase() + month.slice(1) : month;
    return `${day} de ${monthCap} de ${year}`;
  };

  const formatDateEs = (iso) => {
    try {
      const date = new Date(iso);
      const formatted = date.toLocaleDateString("es-MX", {
        day: "2-digit",
        month: "long",
        year: "numeric"
      });
      return capitalizeMonth(formatted);
    } catch {
      return "";
    }
  };

  const renderFeaturedSkeleton = () => {
    if (!featuredEl) return;
    featuredEl.innerHTML = `
      <article class="featured-card featured-card--skeleton">
        <div class="featured-card__img skeleton" style="height: clamp(280px, 45vw, 460px);"></div>
      </article>
    `;
  };

  const renderSkeletons = (count) => {
    grid.innerHTML = "";

    for (let i = 0; i < count; i += 1) {
      const el = document.createElement("article");
      el.className = "sermon-card sermon-card--skeleton";
      el.innerHTML = `
        <div class="sermon-card__img skeleton"></div>
        <div class="sermon-card__body">
          <div class="skeleton skeleton--title"></div>
          <div class="skeleton skeleton--meta"></div>
          <div class="skeleton skeleton--btn"></div>
        </div>
      `;
      grid.appendChild(el);
    }
  };

  const renderFeatured = (it) => {
    if (!featuredEl) return;

    const videoId = extractVideoId(it);
    const title = String(it?.title || "Mensaje");
    const link = String(it?.link || "");
    const date = formatDateEs(it?.pubDate);
    const thumb = it?.thumbnail || getThumbnailFromVideoId(videoId);

    const safeTitle = escapeHtml(title);

    featuredEl.innerHTML = `
      <article class="featured-card animate animate--up">
        <button class="featured-card__media" type="button" aria-label="Ver último mensaje: ${safeTitle}">
          <img class="featured-card__img" src="${thumb}" alt="Miniatura del último mensaje: ${safeTitle}" loading="lazy" />
          <span class="featured-card__shade" aria-hidden="true"></span>
          <div class="featured-card__content">
            <span class="featured-card__badge" aria-hidden="true">Último mensaje</span>
            <h3 class="featured-card__title">${safeTitle}</h3>
            <p class="featured-card__meta">${escapeHtml(date)}</p>
            <div class="featured-card__actions">
              <a class="btn btn--primary btn--sm" href="${escapeHtml(link)}" target="_blank" rel="noreferrer">Ver ahora</a>
              <a class="btn btn--ghost btn--sm" href="${escapeHtml(CHANNEL_URL)}" target="_blank" rel="noreferrer">Ver más</a>
            </div>
          </div>
        </button>
      </article>
    `;

    const mediaBtn = featuredEl.querySelector(".featured-card__media");
    if (USE_MODAL && mediaBtn && videoId) {
      mediaBtn.addEventListener("click", () => openModal(videoId, title));
    } else if (mediaBtn && link) {
      mediaBtn.addEventListener("click", () => window.open(link, "_blank", "noopener,noreferrer"));
    }

    requestAnimationFrame(() => {
      featuredEl.querySelectorAll(".animate").forEach((el) => el.classList.add("is-visible"));
    });
  };

  const extractVideoId = (item) => {
    const link = String(item?.link || "");

    // Prefer link query param v=
    try {
      const url = new URL(link);
      const v = url.searchParams.get("v");
      if (v) return v;
    } catch {
      // ignore
    }

    // Fallback: guid suele ser "yt:video:VIDEO_ID"
    const guid = String(item?.guid || "");
    const m = guid.match(/yt:video:([a-zA-Z0-9_-]{6,})/);
    if (m?.[1]) return m[1];

    return "";
  };

  const getThumbnailFromVideoId = (videoId) => {
    // hqdefault es suficiente; YouTube entrega la mejor disponible.
    return videoId ? `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg` : "images/sermon-placeholder.svg";
  };

  const openModal = (videoId, title) => {
    if (!modal || !modalFrame) return;

    const safeTitle = escapeHtml(title || "Video");
    modalFrame.innerHTML = `
      <iframe
        title="${safeTitle}"
        width="100%"
        height="100%"
        src="https://www.youtube.com/embed/${encodeURIComponent(videoId)}?autoplay=1&rel=0"
        allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
        allowfullscreen
        style="border:0;"
      ></iframe>
    `;

    modal.setAttribute("aria-hidden", "false");
    modal.classList.add("is-open");
    document.documentElement.classList.add("is-modal-open");
  };

  const closeModal = () => {
    if (!modal || !modalFrame) return;
    modal.setAttribute("aria-hidden", "true");
    modal.classList.remove("is-open");
    modalFrame.innerHTML = "";
    document.documentElement.classList.remove("is-modal-open");
  };

  if (modal) {
    modal.addEventListener("click", (event) => {
      const shouldClose = event.target?.closest("[data-modal-close]");
      if (shouldClose) closeModal();
    });

    document.addEventListener("keydown", (event) => {
      if (event.key === "Escape") closeModal();
    });
  }

  const renderCards = (items) => {
    grid.innerHTML = "";

    items.forEach((it) => {
      const videoId = extractVideoId(it);
      const title = String(it?.title || "Mensaje");
      const link = String(it?.link || "");
      const date = formatDateEs(it?.pubDate);

      const thumb = it?.thumbnail || getThumbnailFromVideoId(videoId);
      const safeTitle = escapeHtml(title);

      const card = document.createElement("article");
      card.className = "sermon-card animate animate--up";
      card.innerHTML = `
        <button class="sermon-card__media" type="button" aria-label="Ver mensaje: ${safeTitle}">
          <img class="sermon-card__img" src="${thumb}" alt="Miniatura del mensaje: ${safeTitle}" loading="lazy" />
          <span class="sermon-card__overlay" aria-hidden="true"></span>
          <span class="sermon-card__play" aria-hidden="true">Ver</span>
        </button>
        <div class="sermon-card__body">
          <h3 class="sermon-card__title">${safeTitle}</h3>
          <p class="sermon-card__meta">${escapeHtml(date)}</p>
          <div class="sermon-card__actions">
            <a class="btn btn--primary btn--sm" href="${escapeHtml(link)}" target="_blank" rel="noreferrer">
              Ver mensaje
            </a>
          </div>
        </div>
      `;

      const mediaBtn = card.querySelector(".sermon-card__media");
      if (USE_MODAL && mediaBtn && videoId) {
        mediaBtn.addEventListener("click", () => openModal(videoId, title));
      } else if (mediaBtn && link) {
        mediaBtn.addEventListener("click", () => window.open(link, "_blank", "noopener,noreferrer"));
      }

      grid.appendChild(card);
    });

    // Fade-in simple para contenido dinámico (sin depender de IntersectionObserver)
    requestAnimationFrame(() => {
      grid.querySelectorAll(".animate").forEach((el) => el.classList.add("is-visible"));
    });
  };

  const fetchText = async (url) => {
    const res = await fetchWithTimeout(url, {
      headers: { Accept: "text/plain, application/xml, text/xml, */*" }
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.text();
  };

  const fetchJson = async (url) => {
    const res = await fetchWithTimeout(url, {
      headers: { Accept: "application/json" }
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.json();
  };

  const fetchViaAllOrigins = async (targetUrl) => {
    const url = `${ALLORIGINS_RAW}${encodeURIComponent(targetUrl)}`;
    return await fetchText(url);
  };

  const rss2json = async (rssUrl, baseUrl) => {
    const url = `${baseUrl}${encodeURIComponent(rssUrl)}`;
    const data = await fetchJson(url);
    if (data?.status !== "ok") throw new Error("RSS2JSON error");
    return data;
  };

  const parseYouTubeRssXmlToItems = (xmlText) => {
    const parser = new DOMParser();
    const doc = parser.parseFromString(xmlText, "application/xml");

    // Si hay error de parseo, DOMParser genera <parsererror>
    if (doc.getElementsByTagName("parsererror")?.length) {
      throw new Error("XML parse error");
    }

    const entries = Array.from(doc.getElementsByTagName("entry"));

    return entries.map((entry) => {
      const title = entry.getElementsByTagName("title")?.[0]?.textContent || "";
      const published = entry.getElementsByTagName("published")?.[0]?.textContent || "";

      // link alterno
      const links = Array.from(entry.getElementsByTagName("link"));
      const alt = links.find((l) => (l.getAttribute("rel") || "").toLowerCase() === "alternate") || links[0];
      const link = alt?.getAttribute("href") || "";

      // yt:videoId (namespaced) suele venir como <yt:videoId>
      const videoId =
        entry.getElementsByTagName("yt:videoId")?.[0]?.textContent ||
        entry.getElementsByTagName("videoId")?.[0]?.textContent ||
        "";

      const thumb =
        entry.getElementsByTagName("media:thumbnail")?.[0]?.getAttribute("url") ||
        getThumbnailFromVideoId(videoId);

      return {
        title,
        link,
        pubDate: published,
        guid: videoId ? `yt:video:${videoId}` : "",
        thumbnail: thumb
      };
    });
  };

  const getChannelIdFromHandle = async (handle) => {
    // YouTube no permite CORS directo; usamos AllOrigins para obtener el HTML.
    const html = await fetchViaAllOrigins(`https://www.youtube.com/@${encodeURIComponent(handle)}`);

    // Varias formas posibles según el HTML:
    const patterns = [
      /"channelId"\s*:\s*"(UC[\w-]+)"/,
      /"browseId"\s*:\s*"(UC[\w-]+)"/,
      /\/channel\/(UC[\w-]+)/
    ];

    for (const re of patterns) {
      const m = html.match(re);
      if (m?.[1]) return m[1];
    }

    return "";
  };

  const getFeedData = async (rssUrl) => {
    // 1) rss2json v1
    try {
      return await rss2json(rssUrl, RSS2JSON_V1);
    } catch {
      // ignore
    }

    // 2) rss2json legacy
    try {
      return await rss2json(rssUrl, RSS2JSON_LEGACY);
    } catch {
      // ignore
    }

    // 3) Fallback: XML directo vía AllOrigins
    const xml = await fetchViaAllOrigins(rssUrl);
    const items = parseYouTubeRssXmlToItems(xml);
    return { status: "ok", feed: { url: rssUrl }, items };
  };

  const extractChannelIdFromFeedUrl = (feedUrl) => {
    const m = String(feedUrl || "").match(/channel_id=(UC[a-zA-Z0-9_-]+)/);
    return m?.[1] || "";
  };

  const resolveChannelId = async () => {
    if (FALLBACK_CHANNEL_ID) return { channelId: FALLBACK_CHANNEL_ID, data: null };

    // Intento 1: scrape del canal por handle (mejor para @handles)
    const scraped = await getChannelIdFromHandle(HANDLE);
    if (scraped) return { channelId: scraped, data: null };

    // Intento 2 (legacy): algunos canales aún resuelven por ?user=
    const legacyRss = `https://www.youtube.com/feeds/videos.xml?user=${encodeURIComponent(HANDLE)}`;
    const data = await getFeedData(legacyRss);
    const channelId = extractChannelIdFromFeedUrl(data?.feed?.url);
    return { channelId, data };
  };

  const fetchSermones = async () => {
    const cacheKey = `iccm_sermons_cache_${HANDLE}_${MAX_RESULTS}`;
    const now = Date.now();

    let cachedItems = [];
    let cacheExpired = true;
    let renderedFromCache = false;

    // 1) Render inmediato desde cache (aunque esté expirado) para evitar pantalla vacía.
    try {
      const cachedRaw = localStorage.getItem(cacheKey);
      if (cachedRaw) {
        const cached = JSON.parse(cachedRaw);
        if (Array.isArray(cached?.items) && cached.items.length) {
          cachedItems = cached.items;
          cacheExpired = !(cached?.expiresAt > now);
          renderFeatured(cachedItems[0]);
          renderCards(cachedItems.slice(1));
          renderedFromCache = true;
          setStatus(cacheExpired ? "Cargando los sermones más recientes…" : "Mostrando los sermones más recientes.");

          // Si no está expirado, no golpeamos servicios terceros.
          if (!cacheExpired) return;
        }
      }
    } catch {
      // ignore
    }

    if (!renderedFromCache) {
      renderFeaturedSkeleton();
      renderSkeletons(Math.max(0, MAX_RESULTS - 1));
      setStatus("Cargando los sermones más recientes…");
    }

    const attemptFetch = async (attempt) => {
      try {
        const { channelId, data: fallbackData } = await resolveChannelId();

        // Preferimos el RSS oficial por channel_id (más estable)
        let feedData = fallbackData;
        if (channelId) {
          const officialRss = `https://www.youtube.com/feeds/videos.xml?channel_id=${encodeURIComponent(channelId)}`;
          feedData = await getFeedData(officialRss);
        } else {
          const legacyRss = `https://www.youtube.com/feeds/videos.xml?user=${encodeURIComponent(HANDLE)}`;
          feedData = await getFeedData(legacyRss);
        }

        const items = Array.isArray(feedData?.items) ? feedData.items.slice(0, MAX_RESULTS) : [];

        if (!items.length) {
          if (featuredEl) featuredEl.innerHTML = "";
          grid.innerHTML = "";
          setStatus("Aún no hay sermones para mostrar.");
          return;
        }

        renderFeatured(items[0]);
        renderCards(items.slice(1));
        setStatus("Mostrando los sermones más recientes.");

        try {
          localStorage.setItem(
            cacheKey,
            JSON.stringify({
              expiresAt: Date.now() + 30 * 60 * 1000, // 30 min
              items
            })
          );
        } catch {
          // ignore
        }
      } catch {
        const shouldRetry = attempt < RETRY_MAX;

        if (renderedFromCache) {
          setStatus(shouldRetry ? "Conexión inestable… reintentando." : "Mostrando mensajes guardados. No pudimos actualizar por ahora.");
        } else {
          setStatus(shouldRetry ? "Conexión inestable… reintentando." : "No pudimos cargar los sermones en este momento.");
        }

        if (!shouldRetry) {
          if (!renderedFromCache) {
            if (featuredEl) featuredEl.innerHTML = "";
            grid.innerHTML = "";
          }
          return;
        }

        const jitter = Math.floor(Math.random() * 260);
        const delay = RETRY_BASE_MS * Math.pow(2, attempt - 1) + jitter;
        await sleep(delay);
        return attemptFetch(attempt + 1);
      }
    };

    await attemptFetch(1);
  };

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", fetchSermones);
  } else {
    fetchSermones();
  }
})();
