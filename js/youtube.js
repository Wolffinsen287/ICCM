/*
  Sermones con backend local en Hostinger
  - NO usa YouTube Data API
  - NO usa API keys
  - Usa PHP local para obtener el feed de YouTube
  - NO depende de proxies lentos desde el navegador

  Estrategia:
  1) Backend PHP solicita el feed oficial de YouTube
  2) El frontend consume `/youtube-feed.php`
  3) Renderiza el video destacado y la lista de videos más recientes
*/

(() => {
  "use strict";

  const HANDLE = "iglesiacristianacongregaci5798"; // del URL: https://www.youtube.com/@...
  const MAX_RESULTS = 4;
  const FETCH_TIMEOUT_MS = 8000;
  const USE_MODAL = true;
  const CHANNEL_URL = `https://www.youtube.com/@${HANDLE}`;
  const API_URL = "youtube-feed.php";

  const FALLBACK_VIDEO_ITEMS = [
    {
      id: "5GSdmHkE0fI",
      title: "El Reino de Dios desde las parábolas.",
      date: "3 años"
    },
    {
      id: "GgG8QIqS3Xc",
      title: "Servicio de Adoración del 11 de Septiembre del 2022",
      date: "3 años"
    },
    {
      id: "FcJ8BwCne7k",
      title: "Antídoto contra las preocupaciones.",
      date: "3 años"
    },
    {
      id: "9F28p-TR9h4",
      title: "Mentalidad cristiana.",
      date: "3 años"
    }
  ];

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

    const videoId = String(it?.id || extractVideoId(it));
    const title = String(it?.title || "Mensaje");
    const link = String(it?.link || (videoId ? `https://www.youtube.com/watch?v=${videoId}` : ""));
    const date = String(it?.date || formatDateEs(it?.pubDate));
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
    if (item?.id) return String(item.id);

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

  const renderFallbackSermon = () => {
    if (!featuredEl || !grid) return;

    featuredEl.innerHTML = `
      <article class="featured-card animate animate--up">
        <div class="featured-card__media featured-card__media--fallback" aria-hidden="true">
          <img class="featured-card__img" src="images/sermon-placeholder.svg" alt="" loading="lazy" />
        </div>
        <div class="featured-card__content">
          <span class="featured-card__badge" aria-hidden="true">Canal de YouTube</span>
          <h3 class="featured-card__title">Visita nuestro canal de YouTube</h3>
          <p class="featured-card__meta">Los mensajes se cargan mejor directamente desde YouTube.</p>
          <div class="featured-card__actions">
            <a class="btn btn--primary btn--sm" href="${escapeHtml(CHANNEL_URL)}" target="_blank" rel="noreferrer">Ver canal</a>
          </div>
        </div>
      </article>
    `;

    grid.innerHTML = "";
  };

  const renderCards = (items) => {
    grid.innerHTML = "";

    items.forEach((it) => {
      const videoId = String(it?.id || extractVideoId(it));
      const title = String(it?.title || "Mensaje");
      const link = String(it?.link || (videoId ? `https://www.youtube.com/watch?v=${videoId}` : ""));
      const date = String(it?.date || formatDateEs(it?.pubDate));

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

  const fetchSermones = async () => {
    renderFeaturedSkeleton();
    renderSkeletons(Math.max(0, MAX_RESULTS - 1));
    setStatus("Cargando los videos más recientes…");

    try {
      const res = await fetchWithTimeout(API_URL, {
        cache: "no-store",
        headers: { Accept: "application/json" }
      });

      if (!res.ok) throw new Error(`HTTP ${res.status}`);

      const data = await res.json();
      const items = Array.isArray(data?.items) ? data.items.slice(0, MAX_RESULTS) : [];

      if (!items.length) {
        throw new Error("No hay videos disponibles");
      }

      renderFeatured(items[0]);
      renderCards(items.slice(1));
      setStatus("Mostrando los videos más recientes.");
      return;
    } catch (error) {
      const fallback = Array.isArray(FALLBACK_VIDEO_ITEMS) ? FALLBACK_VIDEO_ITEMS.slice(0, MAX_RESULTS) : [];
      if (fallback.length) {
        renderFeatured(fallback[0]);
        renderCards(fallback.slice(1));
        setStatus("No se pudieron cargar los videos más recientes. Mostrando una selección local.");
        return;
      }

      renderFallbackSermon();
      setStatus("No pudimos cargar los videos en este momento.");
    }
  };

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", fetchSermones);
  } else {
    fetchSermones();
  }
})();
