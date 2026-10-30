// DOM and Accessibility Utilities

let toastContainer = null;

function ensureToastContainer() {
  if (!toastContainer) {
    toastContainer = document.querySelector('.toast-container');
    if (!toastContainer) {
      toastContainer = document.createElement('div');
      toastContainer.className = 'toast-container';
      toastContainer.setAttribute('aria-live', 'polite');
      toastContainer.setAttribute('aria-atomic', 'true');
      document.body.appendChild(toastContainer);
    }
  }
  return toastContainer;
}

/**
 * Displays an accessible toast notification.
 * @param {string} message
 * @param {'info' | 'error' | 'success'} type
 * @param {number} duration
 */
export function showToast(message, type = 'info', duration = 3000) {
  const container = ensureToastContainer();
  const toast = document.createElement('div');
  toast.className = `toast ${type === 'error' ? 'toast-error' : ''}`;
  toast.setAttribute('role', type === 'error' ? 'alert' : 'status');
  toast.textContent = message;

  container.appendChild(toast);

  setTimeout(() => {
    toast.style.opacity = '0';
    toast.style.transform = 'translateY(8px)';
    toast.style.transition = 'opacity 200ms ease, transform 200ms ease';
    setTimeout(() => toast.remove(), 220);
  }, duration);
}

// Modal Focus & Scroll Management
let activeModal = null;
let previousActiveElement = null;

function handleKeydown(e) {
  if (!activeModal) return;

  if (e.key === 'Escape') {
    const closeBtn = activeModal.querySelector('[data-action="close"]');
    if (closeBtn) {
      closeBtn.click();
    } else {
      closeModal(activeModal);
    }
    return;
  }

  if (e.key === 'Tab') {
    const focusable = Array.from(activeModal.querySelectorAll(
      'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
    ));

    if (focusable.length === 0) {
      e.preventDefault();
      return;
    }

    const firstEl = focusable[0];
    const lastEl = focusable[focusable.length - 1];

    if (e.shiftKey) {
      if (document.activeElement === firstEl) {
        lastEl.focus();
        e.preventDefault();
      }
    } else {
      if (document.activeElement === lastEl) {
        firstEl.focus();
        e.preventDefault();
      }
    }
  }
}

export function openModal(modalEl) {
  if (!modalEl) return;
  previousActiveElement = document.activeElement;
  activeModal = modalEl;
  document.body.classList.add('modal-open');
  modalEl.classList.add('is-open');

  // Focus the first actionable element or close button
  const focusable = modalEl.querySelectorAll(
    'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
  );
  if (focusable.length > 0) {
    focusable[0].focus();
  }

  document.addEventListener('keydown', handleKeydown);
}

export function closeModal(modalEl) {
  if (!modalEl) return;
  modalEl.classList.remove('is-open');
  document.body.classList.remove('modal-open');
  activeModal = null;
  document.removeEventListener('keydown', handleKeydown);

  if (previousActiveElement && typeof previousActiveElement.focus === 'function') {
    previousActiveElement.focus();
  }
}

/**
 * Debounce utility
 * @param {Function} fn
 * @param {number} delay
 */
export function debounce(fn, delay = 180) {
  let timer = null;
  return function (...args) {
    clearTimeout(timer);
    timer = setTimeout(() => fn.apply(this, args), delay);
  };
}

/**
 * Escapes unsafe HTML characters to prevent XSS.
 * @param {string} str
 * @returns {string}
 */
export function escapeHtml(str) {
  if (str === null || str === undefined) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}
