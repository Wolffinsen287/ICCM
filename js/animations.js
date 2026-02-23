/*
  ICCM Mazatlán — Animaciones (Vanilla)
  Objetivos:
  - Animaciones sutiles al hacer scroll (IntersectionObserver)
  - Variantes: fade-up, fade-in, slide-left, slide-right
  - Performance: solo opacity/transform, respeta prefers-reduced-motion

  Uso (HTML):
  - Agrega la clase .animate al elemento
  - Opcional: agrega un modificador:
    .animate--up | .animate--in | .animate--left | .animate--right
  - Opcional: agrega delay:
    .delay-1 | .delay-2 | .delay-3 | .delay-4

  Nota:
  - Para contenido dinámico (p.ej. cards de YouTube), también se puede
    añadir .is-visible vía JS cuando se inserta en DOM.
*/

(() => {
  "use strict";

  const prefersReducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  const elements = Array.from(document.querySelectorAll(".animate"));
  if (!elements.length) return;

  const show = (el) => el.classList.add("is-visible");

  if (prefersReducedMotion || !("IntersectionObserver" in window)) {
    elements.forEach(show);
    return;
  }

  const observer = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (!entry.isIntersecting) return;
        show(entry.target);
        observer.unobserve(entry.target);
      });
    },
    {
      threshold: 0.12,
      rootMargin: "0px 0px -8% 0px"
    }
  );

  elements.forEach((el) => observer.observe(el));
})();
