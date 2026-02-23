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
    const hash = window.location.hash;
    if (!hash || hash === "#") return;
    const id = hash.replace("#", "");
    if (!document.getElementById(id)) return;

    // Pequeño delay para que el layout esté estable
    setTimeout(() => smoothScrollToId(id), 0);
  });
})();
