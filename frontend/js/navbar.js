/* Navigation scroll state, accessible drawer and authentication modal. */
import { bySelectorAll } from "./utils.js";

export function initializeNavigation() {
  const navbar = document.querySelector("#navbar");
  const drawer = document.querySelector("[data-mobile-drawer]");
  const scrim = document.querySelector("[data-drawer-scrim]");
  const menuTrigger = document.querySelector("[data-menu-trigger]");
  const loginModal = document.querySelector("[data-login-modal]");
  let loginLauncher = null;
  if (loginModal) loginModal.inert = true;

  const updateNavbar = () => navbar?.classList.toggle("is-scrolled", window.scrollY > 12);
  window.addEventListener("scroll", updateNavbar, { passive: true });
  updateNavbar();

  const setDrawer = (isOpen) => {
    drawer?.classList.toggle("is-open", isOpen);
    scrim?.classList.toggle("is-open", isOpen);
    drawer?.setAttribute("aria-hidden", String(!isOpen));
    menuTrigger?.setAttribute("aria-expanded", String(isOpen));
    document.body.style.overflow = isOpen ? "hidden" : "";
  };
  menuTrigger?.addEventListener("click", () => setDrawer(true));
  document.querySelector("[data-menu-close]")?.addEventListener("click", () => setDrawer(false));
  scrim?.addEventListener("click", () => setDrawer(false));
  drawer?.querySelectorAll("a").forEach((link) => link.addEventListener("click", () => setDrawer(false)));

  const setLoginModal = (isOpen) => {
    if (!isOpen && loginModal?.contains(document.activeElement)) {
      // Return focus before hiding the modal from assistive technology.
      (loginLauncher || document.querySelector("[data-login-trigger]"))?.focus();
    }
    loginModal?.classList.toggle("is-open", isOpen);
    loginModal?.setAttribute("aria-hidden", String(!isOpen));
    if (loginModal) loginModal.inert = !isOpen;
    document.body.style.overflow = isOpen ? "hidden" : "";
    if (isOpen) loginModal?.querySelector("input")?.focus();
  };
  bySelectorAll("[data-login-trigger]").forEach((trigger) => trigger.addEventListener("click", () => {
    loginLauncher = trigger; setDrawer(false); setLoginModal(true);
  }));
  document.querySelector("[data-login-close]")?.addEventListener("click", () => setLoginModal(false));
  loginModal?.addEventListener("click", (event) => { if (event.target === loginModal) setLoginModal(false); });
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") { setDrawer(false); setLoginModal(false); }
  });
}
