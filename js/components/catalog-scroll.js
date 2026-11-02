export function setupCatalogScroll(header, sticky, results) {
  const visible = new Set();
  const reducedMotion = matchMedia("(prefers-reduced-motion: reduce)");
  let frame = 0;
  const update = () => {
    frame = 0;
    const edge = sticky.getBoundingClientRect().bottom + parseFloat(getComputedStyle(results).paddingTop || "0");
    const positions = [...visible].map(entry => [entry, entry.getBoundingClientRect().top]);
    for (const [entry, top] of positions) {
      const progress = reducedMotion.matches ? 0 : Math.max(0, Math.min(1, (edge - top) / 64));
      const card = entry.firstElementChild;
      card.style.transform = `scale(${1 - progress * .08})`;
      card.style.opacity = String(1 - progress);
      card.inert = progress === 1;
    }
  };
  const schedule = () => { if (!frame) frame = requestAnimationFrame(update); };
  const observer = new IntersectionObserver(entries => {
    for (const entry of entries) {
      if (entry.isIntersecting) visible.add(entry.target);
      else visible.delete(entry.target);
    }
    schedule();
  });
  const resize = new ResizeObserver(() => {
    sticky.style.top = `${header.getBoundingClientRect().height}px`;
    schedule();
  });
  resize.observe(header);
  resize.observe(sticky);
  window.addEventListener("scroll", schedule, { passive: true });
  reducedMotion.addEventListener("change", schedule);
  window.addEventListener("pagehide", event => {
    if (event.persisted) return;
    observer.disconnect(); resize.disconnect();
    window.removeEventListener("scroll", schedule);
    reducedMotion.removeEventListener("change", schedule);
    cancelAnimationFrame(frame);
  });
  return () => {
    observer.disconnect(); visible.clear();
    results.querySelectorAll(".catalog-entry").forEach(entry => observer.observe(entry));
    schedule();
  };
}
