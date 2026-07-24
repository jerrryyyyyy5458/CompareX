/* Navigation scroll state, accessible drawer and authentication modal. */
import { bySelectorAll } from "./utils.js";

export function initializeNavigation() {
  const navbar = document.querySelector("#navbar");
  const drawer = document.querySelector("[data-mobile-drawer]");
  const scrim = document.querySelector("[data-drawer-scrim]");
  const menuTrigger = document.querySelector("[data-menu-trigger]");
  const loginModal = document.querySelector("[data-login-modal]");
  const orbitMenu = drawer?.querySelector("[data-orbit-menu]");
  const orbitItems = [...(drawer?.querySelectorAll("[data-orbit-item]") || [])];
  const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
  let orbitOrder = orbitItems.map((_, index) => index);
  let orbitTimer = null;
  let wheelLocked = false;
  let pointerStartY = null;
  let loginLauncher = null;
  if (loginModal) loginModal.inert = true;

  // Put the first destination in the visual center while retaining DOM order.
  if (orbitItems.length) {
    const centerSlot = Math.min(3, orbitItems.length - 1);
    orbitOrder = [
      ...orbitOrder.slice(orbitItems.length - centerSlot),
      ...orbitOrder.slice(0, orbitItems.length - centerSlot),
    ];
  }

  const positionOrbit = (jumpingIndex = null) => {
    if (!orbitMenu || !orbitItems.length) return;
    const centerSlot = Math.min(3, orbitItems.length - 1);
    const availableHeight = orbitMenu.clientHeight || 500;
    const gap = Math.min(68, Math.max(48, (availableHeight - 92) / Math.max(1, orbitItems.length - 1)));
    const centerY = availableHeight / 2 - 26;

    orbitItems.forEach((item, itemIndex) => {
      const slot = orbitOrder.indexOf(itemIndex);
      const distance = slot - centerSlot;
      const magnitude = Math.abs(distance);
      const curve = Math.pow(magnitude, 1.65) * 7;
      const y = centerY + distance * gap;
      const opacity = Math.max(.16, 1 - magnitude * .19);
      const scale = Math.max(.78, 1 - magnitude * .055);
      item.classList.toggle("is-jumping", itemIndex === jumpingIndex);
      item.classList.toggle("is-active", distance === 0);
      item.style.opacity = String(opacity);
      item.style.pointerEvents = opacity > .3 ? "auto" : "none";
      item.style.zIndex = String(20 - magnitude);
      item.style.transform = `translate3d(${curve}px, ${y}px, 0) scale(${scale})`;
    });

    if (jumpingIndex !== null) {
      requestAnimationFrame(() => requestAnimationFrame(() => {
        orbitItems[jumpingIndex]?.classList.remove("is-jumping");
      }));
    }
  };

  const stepOrbit = (direction = 1) => {
    if (orbitOrder.length < 2) return;
    let jumpingIndex;
    if (direction > 0) {
      jumpingIndex = orbitOrder.shift();
      orbitOrder.push(jumpingIndex);
    } else {
      jumpingIndex = orbitOrder.pop();
      orbitOrder.unshift(jumpingIndex);
    }
    positionOrbit(jumpingIndex);
  };

  const stopOrbit = () => {
    window.clearInterval(orbitTimer);
    orbitTimer = null;
  };

  const startOrbit = () => {
    stopOrbit();
    if (!reduceMotion.matches && drawer?.classList.contains("is-open")) {
      orbitTimer = window.setInterval(() => stepOrbit(1), 1900);
    }
  };

  const updateNavbar = () => navbar?.classList.toggle("is-scrolled", window.scrollY > 12);
  window.addEventListener("scroll", updateNavbar, { passive: true });
  updateNavbar();

  const setDrawer = (isOpen) => {
    drawer?.classList.toggle("is-open", isOpen);
    scrim?.classList.toggle("is-open", isOpen);
    drawer?.setAttribute("aria-hidden", String(!isOpen));
    menuTrigger?.setAttribute("aria-expanded", String(isOpen));
    document.body.style.overflow = isOpen ? "hidden" : "";
    if (isOpen) {
      requestAnimationFrame(() => {
        positionOrbit();
        startOrbit();
      });
    } else {
      stopOrbit();
    }
  };
  menuTrigger?.addEventListener("click", () => setDrawer(true));
  document.querySelector("[data-menu-close]")?.addEventListener("click", () => setDrawer(false));
  scrim?.addEventListener("click", () => setDrawer(false));
  drawer?.querySelectorAll("a").forEach((link) => link.addEventListener("click", () => setDrawer(false)));
  orbitMenu?.addEventListener("pointerenter", stopOrbit);
  orbitMenu?.addEventListener("pointerleave", startOrbit);
  orbitMenu?.addEventListener("focusin", stopOrbit);
  orbitMenu?.addEventListener("focusout", (event) => {
    if (!orbitMenu.contains(event.relatedTarget)) startOrbit();
  });
  orbitMenu?.addEventListener("wheel", (event) => {
    event.preventDefault();
    if (wheelLocked || Math.abs(event.deltaY) < 3) return;
    wheelLocked = true;
    stopOrbit();
    stepOrbit(event.deltaY > 0 ? 1 : -1);
    window.setTimeout(() => { wheelLocked = false; }, 420);
  }, { passive: false });
  orbitMenu?.addEventListener("keydown", (event) => {
    if (!["ArrowDown", "ArrowUp"].includes(event.key)) return;
    event.preventDefault();
    stopOrbit();
    stepOrbit(event.key === "ArrowDown" ? 1 : -1);
  });
  orbitMenu?.addEventListener("pointerdown", (event) => {
    pointerStartY = event.clientY;
    stopOrbit();
  });
  orbitMenu?.addEventListener("pointerup", (event) => {
    if (pointerStartY === null) return;
    const distance = event.clientY - pointerStartY;
    pointerStartY = null;
    if (Math.abs(distance) > 28) stepOrbit(distance < 0 ? 1 : -1);
    startOrbit();
  });
  window.addEventListener("resize", () => positionOrbit(), { passive: true });
  reduceMotion.addEventListener?.("change", startOrbit);
  positionOrbit();

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
