let activeMenu = null;
let initialized = false;
const enhanced = new WeakSet();

function closeMenu(focus = false) {
  if (!activeMenu) return;
  const button = activeMenu.querySelector(".select-menu__button");
  activeMenu.querySelector(".select-menu__options").hidden = true;
  button.setAttribute("aria-expanded", "false");
  if (focus) button.focus();
  activeMenu = null;
}

function enhanceSelect(select) {
  if (enhanced.has(select) || select.multiple || select.size > 1) return;
  enhanced.add(select);

  const wrapper = document.createElement("div");
  const button = document.createElement("button");
  const options = document.createElement("div");
  const listId = `select-menu-${crypto.randomUUID()}`;
  const label = select.id ? document.querySelector(`label[for="${select.id}"]`) : null;

  wrapper.className = "select-menu";
  button.className = "select-menu__button";
  button.type = "button";
  button.setAttribute("aria-haspopup", "listbox");
  button.setAttribute("aria-expanded", "false");
  button.setAttribute("aria-controls", listId);
  if (label?.textContent.trim()) button.setAttribute("aria-label", label.textContent.trim());
  options.className = "select-menu__options";
  options.id = listId;
  options.role = "listbox";
  options.hidden = true;

  select.before(wrapper);
  wrapper.append(select, button, options);
  select.classList.add("select-menu__native");
  select.tabIndex = -1;
  select.setAttribute("aria-hidden", "true");

  function render() {
    const selected = select.selectedOptions[0];
    button.textContent = selected?.textContent || "Pilih";
    button.disabled = select.disabled;
    options.replaceChildren(...[...select.options].map((option, index) => {
      const item = document.createElement("button");
      item.className = "select-menu__option";
      item.type = "button";
      item.role = "option";
      item.dataset.index = String(index);
      item.textContent = option.textContent;
      item.disabled = option.disabled;
      item.setAttribute("aria-selected", String(index === select.selectedIndex));
      return item;
    }));
    if (select.disabled) closeMenu();
  }

  function openMenu() {
    if (button.disabled) return;
    closeMenu();
    options.hidden = false;
    button.setAttribute("aria-expanded", "true");
    activeMenu = wrapper;
  }

  button.addEventListener("click", () => options.hidden ? openMenu() : closeMenu());
  button.addEventListener("keydown", (event) => {
    if (!["ArrowDown", "ArrowUp"].includes(event.key)) return;
    event.preventDefault();
    if (options.hidden) openMenu();
    const items = [...options.querySelectorAll(".select-menu__option:not(:disabled)")];
    (items.find((item) => item.getAttribute("aria-selected") === "true") || items[0])?.focus();
  });
  options.addEventListener("click", (event) => {
    const item = event.target.closest(".select-menu__option");
    if (!item) return;
    select.selectedIndex = Number(item.dataset.index);
    select.dispatchEvent(new Event("input", { bubbles: true }));
    select.dispatchEvent(new Event("change", { bubbles: true }));
    render();
    closeMenu(true);
  });
  options.addEventListener("keydown", (event) => {
    const items = [...options.querySelectorAll(".select-menu__option:not(:disabled)")];
    const current = items.indexOf(document.activeElement);
    if (event.key === "Escape") { event.preventDefault(); closeMenu(true); return; }
    if (!["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key)) return;
    event.preventDefault();
    const next = event.key === "Home" ? 0 : event.key === "End" ? items.length - 1 : (current + (event.key === "ArrowDown" ? 1 : -1) + items.length) % items.length;
    items[next]?.focus();
  });
  select.addEventListener("change", render);
  select.form?.addEventListener("reset", () => queueMicrotask(render));
  new MutationObserver(render).observe(select, { attributes: true, attributeFilter: ["disabled"], childList: true, subtree: true });
  render();
}

export function initializeSelectMenus(root = document) {
  root.querySelectorAll("select").forEach(enhanceSelect);
  if (initialized) return;
  initialized = true;
  new MutationObserver((records) => records.forEach((record) => record.addedNodes.forEach((node) => {
    if (!(node instanceof Element)) return;
    if (node.matches("select")) enhanceSelect(node);
    node.querySelectorAll("select").forEach(enhanceSelect);
  }))).observe(document.body, { childList: true, subtree: true });
  document.addEventListener("click", (event) => { if (activeMenu && !activeMenu.contains(event.target)) closeMenu(); });
  document.addEventListener("keydown", (event) => { if (event.key === "Escape") closeMenu(true); });
}
