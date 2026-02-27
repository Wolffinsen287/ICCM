/*
  ICCM Mazatlán — JavaScript (Vanilla)
  Funcionalidades:
  - Navbar sticky + cambio de fondo al hacer scroll
  - Menú móvil toggle
  - Smooth scrolling (respetando prefers-reduced-motion)
  - Animaciones están en /js/animations.js
  - Año automático en el footer
*/

(() => {
  "use strict";

  const nav = document.querySelector(".nav");
  const toggle = document.querySelector(".nav__toggle");
  const navMenu = document.getElementById("navMenu");
  const navLinks = document.querySelectorAll('.nav__link[href^="#"]');

  const reducedMotionQuery = window.matchMedia("(prefers-reduced-motion: reduce)");
  const prefersReducedMotion = () => reducedMotionQuery.matches;

  // --- Año automático en footer
  const yearEl = document.getElementById("currentYear");
  if (yearEl) yearEl.textContent = String(new Date().getFullYear());

  // --- Navbar sólido al hacer scroll
  const setNavScrolled = () => {
    if (!nav) return;
    if (nav.getAttribute("data-nav-solid") === "true") {
      nav.classList.add("is-scrolled");
      return;
    }
    nav.classList.toggle("is-scrolled", window.scrollY > 10);
  };

  setNavScrolled();
  window.addEventListener("scroll", setNavScrolled, { passive: true });

  // --- Menú móvil
  const closeMenu = () => {
    if (!nav || !toggle) return;
    nav.classList.remove("is-open");
    toggle.setAttribute("aria-expanded", "false");
  };

  const openMenu = () => {
    if (!nav || !toggle) return;
    nav.classList.add("is-open");
    toggle.setAttribute("aria-expanded", "true");
  };

  if (toggle) {
    toggle.addEventListener("click", () => {
      const isOpen = nav?.classList.contains("is-open");
      if (isOpen) closeMenu();
      else openMenu();
    });
  }

  // Cierra menú al hacer clic en un link
  navLinks.forEach((link) => {
    link.addEventListener("click", () => closeMenu());
  });

  // Cierra menú con Escape
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") closeMenu();
  });

  // --- Smooth scrolling (anchor) con offset por navbar
  // Nota: CSS ya tiene scroll-behavior, pero esto asegura offset y accesibilidad.
  const navHeight = () => (nav ? nav.getBoundingClientRect().height : 0);

  const SLOW_SCROLL_DURATION_MS = 1400;
  let activeScrollRaf = 0;

  const easeInOutCubic = (t) => {
    if (t < 0.5) return 4 * t * t * t;
    return 1 - Math.pow(-2 * t + 2, 3) / 2;
  };

  const setInstantScrollBehavior = () => {
    const root = document.documentElement;
    const prevRoot = root.style.scrollBehavior;
    const prevBody = document.body.style.scrollBehavior;
    root.style.scrollBehavior = "auto";
    document.body.style.scrollBehavior = "auto";
    return () => {
      root.style.scrollBehavior = prevRoot;
      document.body.style.scrollBehavior = prevBody;
    };
  };

  const animateWindowScrollTo = (targetY, durationMs = SLOW_SCROLL_DURATION_MS) => {
    if (activeScrollRaf) cancelAnimationFrame(activeScrollRaf);

    const restoreScrollBehavior = setInstantScrollBehavior();
    const startY = window.scrollY;
    const deltaY = targetY - startY;

    if (Math.abs(deltaY) < 2) {
      restoreScrollBehavior();
      window.scrollTo(0, targetY);
      return;
    }

    let startTime = 0;
    const step = (timestamp) => {
      if (!startTime) startTime = timestamp;
      const elapsed = timestamp - startTime;
      const t = Math.min(elapsed / durationMs, 1);
      const eased = easeInOutCubic(t);
      const y = startY + deltaY * eased;

      try {
        window.scrollTo({ top: y, behavior: "auto" });
      } catch {
        window.scrollTo(0, y);
      }

      if (t < 1) {
        activeScrollRaf = requestAnimationFrame(step);
      } else {
        activeScrollRaf = 0;
        restoreScrollBehavior();
      }
    };

    activeScrollRaf = requestAnimationFrame(step);
  };

  const smoothScrollToId = (id) => {
    const target = document.getElementById(id);
    if (!target) return;

    const y = target.getBoundingClientRect().top + window.scrollY - navHeight();

    if (prefersReducedMotion()) {
      try {
        window.scrollTo({ top: y, behavior: "auto" });
      } catch {
        window.scrollTo(0, y);
      }
      return;
    }

    animateWindowScrollTo(y);
  };

  document.addEventListener("click", (event) => {
    const anchor = event.target.closest('a[href^="#"]');
    if (!anchor) return;

    const href = anchor.getAttribute("href");
    if (!href || href === "#") return;

    const id = href.replace("#", "");
    if (!id) return;

    // Solo intercepta si el destino existe en la página
    if (!document.getElementById(id)) return;

    event.preventDefault();

    // Actualiza URL sin salto brusco
    // Nota: en algunos contextos (p.ej. file://) pushState puede fallar.
    try {
      history.pushState(null, "", `#${id}`);
    } catch {
      // ignore
    }

    smoothScrollToId(id);
  });

  // --- Fix: si el usuario recarga con hash, ajusta el offset
  window.addEventListener("load", () => {
    // --- Video de fondo: intenta iniciar reproducción (algunos navegadores lo bloquean si no hay play())
    if (!prefersReducedMotion()) {
      const bgVideo = document.querySelector(".visit-strip__video");
      if (bgVideo && typeof bgVideo.play === "function") {
        try {
          const result = bgVideo.play();
          if (result && typeof result.catch === "function") {
            result.catch(() => {
              // Autoplay bloqueado: se queda el poster/fondo estático.
            });
          }
        } catch {
          // ignore
        }
      }
    }

    const hash = window.location.hash;
    if (!hash || hash === "#") return;
    const id = hash.replace("#", "");
    if (!document.getElementById(id)) return;

    // Pequeño delay para que el layout esté estable
    setTimeout(() => smoothScrollToId(id), 0);
  });

  /*
    ----------------------
    Carrusel (Vanilla, reutilizable)
    Requisitos cubiertos:
    - Autoplay (3–4s) con pausa en hover/touch y reanudación
    - Loop infinito real usando clonación (sin salto brusco)
    - Responsive: 3/2/1 visibles (desktop/tablet/mobile)
    - Flechas, swipe móvil y dots dinámicos
    - Sin librerías, detecta automáticamente cuántas cards hay
    ----------------------
  */

  const getPerView = () => {
    if (window.matchMedia("(min-width: 900px)").matches) return 3;
    if (window.matchMedia("(min-width: 640px)").matches) return 2;
    return 1;
  };

  const parseMs = (value, fallback) => {
    const num = Number.parseInt(String(value || ""), 10);
    return Number.isFinite(num) ? num : fallback;
  };

  class Carousel {
    constructor(root) {
      this.root = root;
      this.viewport = root.querySelector("[data-carousel-viewport]");
      this.track = root.querySelector("[data-carousel-track]");
      this.btnPrev = root.querySelector("[data-carousel-prev]");
      this.btnNext = root.querySelector("[data-carousel-next]");
      this.dotsEl = root.querySelector("[data-carousel-dots]");

      this.intervalMs = parseMs(root.getAttribute("data-interval"), 3600);
      this.durationMs = parseMs(root.getAttribute("data-duration"), 860);
      this.autoplayEnabled = root.getAttribute("data-autoplay") === "true";

      this.originalSlides = [];
      this.originalCount = 0;
      this.perView = 1;
      this.slideW = 0;
      this.gap = 0;

      this.index = 0; // índice en la lista con clones
      this.isAnimating = false;

      this.timer = 0;
      this.resumeTimer = 0;
      this.transitionFallbackTimer = 0;
      this.isPaused = false;

      // Drag / swipe
      this.isPointerDown = false;
      this.dragStartX = 0;
      this.dragDeltaX = 0;
      this.dragStartTranslate = 0;
      this.pointerId = 0;

      this.onResize = this.onResize.bind(this);
      this.onTransitionEnd = this.onTransitionEnd.bind(this);
      this.onPointerDown = this.onPointerDown.bind(this);
      this.onPointerMove = this.onPointerMove.bind(this);
      this.onPointerUp = this.onPointerUp.bind(this);
    }

    init() {
      if (!this.root || !this.viewport || !this.track) return;

      // Guarda las slides originales (antes de clonar)
      this.originalSlides = Array.from(this.track.children).filter((el) => !el.hasAttribute("data-clone"));
      this.originalCount = this.originalSlides.length;

      // Si hay 0 o 1 slide, no vale la pena carrusel infinito
      if (this.originalCount <= 1) {
        this.updateAriaDots();
        this.disableControls(true);
        return;
      }

      this.perView = Math.min(getPerView(), this.originalCount);
      this.build();
      this.bind();
      this.startAutoplay();
    }

    bind() {
      window.addEventListener("resize", this.onResize, { passive: true });
      this.track.addEventListener("transitionend", this.onTransitionEnd);

      if (this.btnPrev) this.btnPrev.addEventListener("click", () => this.interact(() => this.prev()));
      if (this.btnNext) this.btnNext.addEventListener("click", () => this.interact(() => this.next()));

      // Pausa por hover / focus
      this.root.addEventListener("mouseenter", () => this.pause());
      this.root.addEventListener("mouseleave", () => this.resume());
      this.root.addEventListener("focusin", () => this.pause());
      this.root.addEventListener("focusout", () => this.resume());

      // Swipe (Pointer Events)
      this.viewport.addEventListener("pointerdown", this.onPointerDown);
      this.viewport.addEventListener("pointermove", this.onPointerMove);
      this.viewport.addEventListener("pointerup", this.onPointerUp);
      this.viewport.addEventListener("pointercancel", this.onPointerUp);

      // Pausa si la pestaña no está visible
      document.addEventListener("visibilitychange", () => {
        if (document.hidden) this.pause(true);
        else this.resume();
      });
    }

    build() {
      // Limpia clones anteriores
      Array.from(this.track.querySelectorAll("[data-clone='true']")).forEach((node) => node.remove());

      this.perView = Math.min(getPerView(), this.originalCount);

      // Clona: últimos perView al inicio + primeros perView al final
      const headClones = this.originalSlides.slice(0, this.perView).map((el) => this.makeClone(el));
      const tailClones = this.originalSlides.slice(-this.perView).map((el) => this.makeClone(el));

      // Inserta clones
      tailClones.reverse().forEach((clone) => this.track.insertBefore(clone, this.track.firstChild));
      headClones.forEach((clone) => this.track.appendChild(clone));

      // Recalcula medidas y posiciona en la primera slide real
      this.index = this.perView;
      this.measure();
      this.setTransition(false);
      this.applyTranslate();
      this.setTransition(true);

      this.renderDots();
      this.updateAriaDots();
      this.disableControls(false);
    }

    makeClone(el) {
      const clone = el.cloneNode(true);
      clone.setAttribute("data-clone", "true");
      clone.setAttribute("aria-hidden", "true");
      return clone;
    }

    measure() {
      const trackStyle = window.getComputedStyle(this.track);
      const gapStr = trackStyle.gap || trackStyle.columnGap || "0px";
      this.gap = Number.parseFloat(gapStr) || 0;

      const viewportW = this.viewport.getBoundingClientRect().width;
      const perView = Math.max(1, this.perView);
      const usableW = Math.max(0, viewportW - this.gap * (perView - 1));
      this.slideW = usableW / perView;

      // Aplica width a todas las slides (incluye clones)
      Array.from(this.track.children).forEach((slide) => {
        slide.style.width = `${this.slideW}px`;
      });
    }

    setTransition(enabled) {
      const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      if (reduceMotion) {
        this.track.style.transition = "none";
        return;
      }

      if (!enabled) {
        this.track.style.transition = "none";
        return;
      }

      // Transición suave tipo "smooth scroll" (más orgánica)
      // Nota: se puede ajustar desde HTML con data-duration="850" (ms)
      this.track.style.transition = `transform ${this.durationMs}ms cubic-bezier(0.22, 1, 0.36, 1)`;
    }

    getTranslateX() {
      return -(this.index * (this.slideW + this.gap));
    }

    applyTranslate(extraPx = 0) {
      const x = this.getTranslateX() + extraPx;
      this.track.style.transform = `translate3d(${x}px, 0, 0)`;
    }

    normalizeIndex() {
      // Convierte índice con clones a índice de slide real (0..originalCount-1)
      let real = this.index - this.perView;
      real = ((real % this.originalCount) + this.originalCount) % this.originalCount;
      return real;
    }

    renderDots() {
      if (!this.dotsEl) return;
      this.dotsEl.innerHTML = "";

      for (let i = 0; i < this.originalCount; i += 1) {
        const dot = document.createElement("button");
        dot.type = "button";
        dot.className = "carousel__dot";
        dot.setAttribute("aria-label", `Ir a la tarjeta ${i + 1}`);
        dot.addEventListener("click", () => this.interact(() => this.goToReal(i)));
        this.dotsEl.appendChild(dot);
      }
    }

    updateAriaDots() {
      if (!this.dotsEl) return;
      const active = this.normalizeIndex();
      Array.from(this.dotsEl.children).forEach((dot, i) => {
        dot.setAttribute("aria-current", i === active ? "true" : "false");
      });
    }

    disableControls(disabled) {
      const shouldDisable = disabled || this.originalCount <= this.perView;
      if (this.btnPrev) this.btnPrev.disabled = shouldDisable;
      if (this.btnNext) this.btnNext.disabled = shouldDisable;
      if (this.dotsEl) this.dotsEl.style.opacity = shouldDisable ? "0.55" : "1";
    }

    goTo(index, { animate = true } = {}) {
      if (this.isAnimating) return;

      if (index === this.index) {
        this.updateAriaDots();
        return;
      }

      const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      const shouldAnimate = Boolean(animate && !reduceMotion);

      this.isAnimating = true;
      this.setTransition(shouldAnimate);
      this.index = index;
      this.applyTranslate();

      // Fallback: en algunos navegadores/escenarios transitionend puede no disparar.
      // Esto evita que el carrusel se "congele" por quedarse isAnimating=true.
      if (this.transitionFallbackTimer) {
        clearTimeout(this.transitionFallbackTimer);
        this.transitionFallbackTimer = 0;
      }
      if (shouldAnimate) {
        this.transitionFallbackTimer = window.setTimeout(() => {
          this.transitionFallbackTimer = 0;
          if (this.isAnimating) this.onTransitionEnd();
        }, this.durationMs + 220);
      }

      if (!shouldAnimate) {
        this.isAnimating = false;
        this.updateAriaDots();
      }
    }

    goToReal(realIndex) {
      // Mapea 0..N-1 a índice con clones
      this.goTo(this.perView + realIndex, { animate: true });
    }

    next() {
      this.goTo(this.index + 1, { animate: true });
    }

    prev() {
      this.goTo(this.index - 1, { animate: true });
    }

    onTransitionEnd() {
      if (this.transitionFallbackTimer) {
        clearTimeout(this.transitionFallbackTimer);
        this.transitionFallbackTimer = 0;
      }

      // Loop infinito real: si caímos en clones, saltamos al equivalente sin transición
      const minIndex = this.perView;
      const maxIndex = this.perView + this.originalCount - 1;

      if (this.index > maxIndex) {
        this.index -= this.originalCount;
        requestAnimationFrame(() => {
          this.setTransition(false);
          this.applyTranslate();
          requestAnimationFrame(() => this.setTransition(true));
        });
      } else if (this.index < minIndex) {
        this.index += this.originalCount;
        requestAnimationFrame(() => {
          this.setTransition(false);
          this.applyTranslate();
          requestAnimationFrame(() => this.setTransition(true));
        });
      }

      this.isAnimating = false;
      this.updateAriaDots();
    }

    interact(action) {
      // Pausa por interacción y reanuda después
      this.pause();
      if (typeof action === "function") action();
      this.scheduleResume();
    }

    pause(force = false) {
      if (this.isPaused && !force) return;
      this.isPaused = true;
      if (this.timer) {
        clearInterval(this.timer);
        this.timer = 0;
      }
      if (this.resumeTimer) {
        clearTimeout(this.resumeTimer);
        this.resumeTimer = 0;
      }
    }

    resume() {
      if (!this.isPaused) return;
      this.isPaused = false;
      this.startAutoplay();
    }

    scheduleResume() {
      if (this.resumeTimer) clearTimeout(this.resumeTimer);
      this.resumeTimer = window.setTimeout(() => this.resume(), 1600);
    }

    startAutoplay() {
      if (!this.autoplayEnabled) return;
      if (this.originalCount <= this.perView) return;
      if (this.timer) return;

      this.timer = window.setInterval(() => {
        if (this.isPaused || this.isPointerDown) return;
        this.next();
      }, this.intervalMs);
    }

    onResize() {
      if (this.originalCount <= 1) return;
      const nextPerView = Math.min(getPerView(), this.originalCount);
      const perViewChanged = nextPerView !== this.perView;
      this.perView = nextPerView;

      // Reconstruye clones si cambió la cantidad visible
      if (perViewChanged) {
        this.build();
        return;
      }

      // Si no cambió, solo recalcula medidas y reaplica translate
      this.measure();
      this.setTransition(false);
      this.applyTranslate();
      this.setTransition(true);
    }

    // --- Swipe
    onPointerDown(event) {
      // Solo botón primario / touch
      if (event.pointerType === "mouse" && event.button !== 0) return;
      if (this.originalCount <= this.perView) return;

      this.pause();
      this.isPointerDown = true;
      this.pointerId = event.pointerId;
      this.viewport.setPointerCapture(this.pointerId);

      this.measure();
      this.dragStartX = event.clientX;
      this.dragDeltaX = 0;
      this.dragStartTranslate = this.getTranslateX();
      this.setTransition(false);
    }

    onPointerMove(event) {
      if (!this.isPointerDown) return;
      if (event.pointerId !== this.pointerId) return;

      this.dragDeltaX = event.clientX - this.dragStartX;
      this.track.style.transform = `translate3d(${this.dragStartTranslate + this.dragDeltaX}px, 0, 0)`;
    }

    onPointerUp(event) {
      if (!this.isPointerDown) return;
      if (event.pointerId !== this.pointerId) return;

      this.isPointerDown = false;
      this.pointerId = 0;

      const threshold = Math.max(40, this.slideW * 0.22);
      const delta = this.dragDeltaX;

      this.setTransition(true);

      if (delta <= -threshold) this.next();
      else if (delta >= threshold) this.prev();
      else this.applyTranslate();

      this.dragDeltaX = 0;
      this.scheduleResume();
    }
  }

  /*
    ----------------------
    Carrusel continuo (marquesina)
    - Movimiento constante hacia la izquierda
    - Loop infinito real: clona dinámicamente hasta cubrir el viewport + buffer
    - requestAnimationFrame para rendimiento y suavidad
    - Pausa en hover / touch
    ----------------------
  */

  class MarqueeCarousel {
    constructor(root) {
      this.root = root;
      this.viewport = root.querySelector("[data-carousel-viewport]");
      this.track = root.querySelector("[data-carousel-track]");

      this.speedPxPerSec = Number.parseFloat(root.getAttribute("data-speed")) || 40;

      this.originalSlides = [];
      this.originalCount = 0;
      this.perView = 1;
      this.slideW = 0;
      this.gap = 0;
      this.setW = 0; // ancho del set original (incl. gaps)

      this.x = 0;
      this.raf = 0;
      this.lastTs = 0;
      this.isPaused = false;
      this.isPointerDown = false;
      this.pointerId = 0;

      this.onResize = this.onResize.bind(this);
      this.onEnter = this.onEnter.bind(this);
      this.onLeave = this.onLeave.bind(this);
      this.onPointerDown = this.onPointerDown.bind(this);
      this.onPointerUp = this.onPointerUp.bind(this);
      this.tick = this.tick.bind(this);
    }

    init() {
      if (!this.root || !this.viewport || !this.track) return;

      this.originalSlides = Array.from(this.track.children).filter((el) => !el.hasAttribute("data-clone"));
      this.originalCount = this.originalSlides.length;
      if (this.originalCount === 0) return;

      this.build();
      this.bind();
      this.play();
    }

    bind() {
      window.addEventListener("resize", this.onResize, { passive: true });

      // Pausa por hover (desktop)
      this.root.addEventListener("mouseenter", this.onEnter);
      this.root.addEventListener("mouseleave", this.onLeave);

      // Pausa por touch/pointer (móvil/tablet)
      this.viewport.addEventListener("pointerdown", this.onPointerDown);
      // Nota: escuchamos el 'up/cancel' en window para no romper clics en <a>
      // (pointer capture puede retargetear el click y evitar navegación).
      window.addEventListener("pointerup", this.onPointerUp, { passive: true });
      window.addEventListener("pointercancel", this.onPointerUp, { passive: true });

      // Pausa si la pestaña no está visible
      document.addEventListener("visibilitychange", () => {
        if (document.hidden) this.pause();
        else this.resume();
      });
    }

    onEnter() {
      this.pause();
    }

    onLeave() {
      if (!this.isPointerDown) this.resume();
    }

    onPointerDown(event) {
      // Solo botón primario / touch
      if (event.pointerType === "mouse" && event.button !== 0) return;
      this.isPointerDown = true;
      this.pointerId = event.pointerId;
      this.pause();
    }

    onPointerUp(event) {
      if (!this.isPointerDown) return;
      if (event.pointerId && event.pointerId !== this.pointerId) return;
      this.isPointerDown = false;
      this.pointerId = 0;
      this.resume();
    }

    onResize() {
      if (this.originalCount === 0) return;
      // Recalcula widths y reconstruye clones para que siempre sea infinito y responsive
      this.build();
    }

    clearClones() {
      Array.from(this.track.querySelectorAll("[data-clone='true']")).forEach((node) => node.remove());
    }

    makeClone(el) {
      const clone = el.cloneNode(true);
      clone.setAttribute("data-clone", "true");
      clone.setAttribute("aria-hidden", "true");
      return clone;
    }

    measureGap() {
      const trackStyle = window.getComputedStyle(this.track);
      const gapStr = trackStyle.gap || trackStyle.columnGap || "0px";
      this.gap = Number.parseFloat(gapStr) || 0;
    }

    setSlideWidths() {
      this.perView = Math.min(getPerView(), this.originalCount);
      this.measureGap();

      const viewportW = this.viewport.getBoundingClientRect().width;
      const perView = Math.max(1, this.perView);
      const usableW = Math.max(0, viewportW - this.gap * (perView - 1));
      this.slideW = usableW / perView;

      Array.from(this.track.children).forEach((slide) => {
        slide.style.width = `${this.slideW}px`;
        slide.style.flex = "0 0 auto";
      });
    }

    computeSetWidth() {
      // Ancho de un set completo de slides reales (con gaps)
      // (slideW * N) + (gap * (N - 1))
      const n = this.originalCount;
      this.setW = n > 0 ? (this.slideW * n + this.gap * Math.max(0, n - 1)) : 0;
    }

    build() {
      this.pause();

      // Resetea posición para evitar "saltos" al reconstruir
      this.x = 0;
      this.track.style.transform = "translate3d(0px, 0, 0)";

      // Limpia clones y recalcula widths
      this.clearClones();
      this.setSlideWidths();
      this.computeSetWidth();

      // Duplica automáticamente hasta cubrir: viewport + 1 set + buffer
      const viewportW = this.viewport.getBoundingClientRect().width;
      const targetW = this.setW + viewportW + (this.slideW + this.gap);

      let totalW = this.setW;
      let safety = 0;
      while (totalW < targetW && safety < 50) {
        this.originalSlides.forEach((el) => {
          const clone = this.makeClone(el);
          clone.style.width = `${this.slideW}px`;
          clone.style.flex = "0 0 auto";
          this.track.appendChild(clone);
        });
        totalW += this.setW + this.gap; // +gap aproximado entre sets
        safety += 1;
      }

      this.resume();
    }

    pause() {
      this.isPaused = true;
      this.lastTs = 0;
    }

    resume() {
      this.isPaused = false;
      if (!this.raf) this.play();
    }

    play() {
      if (this.raf) cancelAnimationFrame(this.raf);
      this.raf = requestAnimationFrame(this.tick);
    }

    tick(ts) {
      this.raf = requestAnimationFrame(this.tick);
      if (this.isPaused) return;

      if (!this.lastTs) {
        this.lastTs = ts;
        return;
      }

      const dt = (ts - this.lastTs) / 1000;
      this.lastTs = ts;

      if (!this.setW) return;

      // Mueve hacia la izquierda constantemente
      this.x -= this.speedPxPerSec * dt;

      // Loop infinito real: cuando avanzamos un set completo, reseteamos sin salto
      if (-this.x >= this.setW) {
        this.x += this.setW;
      }

      this.track.style.transform = `translate3d(${this.x}px, 0, 0)`;
    }
  }

  // Inicializa carruseles tipo "slides" si existieran
  const initCarousels = () => {
    const roots = document.querySelectorAll("[data-carousel]");
    roots.forEach((root) => {
      const carousel = new Carousel(root);
      carousel.init();
    });
  };

  // Inicializa carruseles continuos (marquesina)
  const initMarquees = () => {
    const roots = document.querySelectorAll("[data-carousel-marquee]");
    roots.forEach((root) => {
      const marquee = new MarqueeCarousel(root);
      marquee.init();
    });
  };

  initCarousels();
  initMarquees();
})();
