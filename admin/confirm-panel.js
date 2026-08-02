export function createConfirmPanel({ root }) {
  const titleElement = root.querySelector("[data-confirm-title]");
  const messageElement = root.querySelector("[data-confirm-message]");
  const confirmButton = root.querySelector("[data-confirm-action]");
  const cancelButton = root.querySelector("[data-confirm-cancel]");
  const closeButton = root.querySelector("[data-confirm-close]");

  let onConfirm = null;
  let opener = null;

  function handleKeydown(event) {
    if (event.key === "Escape") close();
  }

  function open({ title, message, confirmLabel, tone, onConfirm: handler }) {
    onConfirm = typeof handler === "function" ? handler : null;
    opener = document.activeElement;
    if (titleElement) titleElement.textContent = title ?? "";
    if (messageElement) messageElement.textContent = message ?? "";
    if (confirmButton) confirmButton.textContent = confirmLabel ?? "确认";
    root.dataset.tone = tone ?? "";
    root.setAttribute("role", "dialog");
    root.setAttribute("aria-modal", "true");
    if (titleElement?.id) root.setAttribute("aria-labelledby", titleElement.id);
    root.hidden = false;
    document.removeEventListener("keydown", handleKeydown);
    document.addEventListener("keydown", handleKeydown);
    (cancelButton || confirmButton)?.focus?.();
  }

  function close() {
    if (root.hidden) return;
    root.hidden = true;
    document.removeEventListener("keydown", handleKeydown);
    const restore = opener;
    opener = null;
    onConfirm = null;
    if (restore && typeof restore.focus === "function") restore.focus();
  }

  confirmButton?.addEventListener("click", () => {
    const handler = onConfirm;
    close();
    if (handler) handler();
  });
  cancelButton?.addEventListener("click", close);
  closeButton?.addEventListener("click", close);

  return { open, close };
}
