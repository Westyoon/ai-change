const ALLOWED_TOP_ROUTES = new Set(["account", "settings"]);

export function bindTopNavigation(root, router) {
  const buttons = [...root.querySelectorAll("[data-top-route]")]
    .filter((button) => ALLOWED_TOP_ROUTES.has(button.dataset.topRoute));
  const listeners = [];

  for (const button of buttons) {
    button.disabled = true;
    const route = button.dataset.topRoute;
    const onClick = () => {
      if (button.disabled) return;
      void router.navigate(route);
    };
    button.addEventListener("click", onClick);
    listeners.push([button, onClick]);
  }

  return Object.freeze({
    enable() {
      for (const button of buttons) button.disabled = false;
    },
    disable() {
      for (const button of buttons) button.disabled = true;
    },
    destroy() {
      for (const [button, onClick] of listeners) {
        button.removeEventListener("click", onClick);
        button.disabled = true;
      }
    },
  });
}

export { ALLOWED_TOP_ROUTES };
