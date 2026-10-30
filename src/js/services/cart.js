// Local-only Cart Service
// Follows Blueprint Section 04 state contract. Never transmits data to Supabase.

const STORAGE_KEY = 'rasan.cart.v2';
const listeners = new Set();

function getStoredCart() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { version: 2, lines: [] };
    const parsed = JSON.parse(raw);
    if (parsed && parsed.version === 2 && Array.isArray(parsed.lines)) {
      // Validate line structure
      const validLines = parsed.lines.filter(
        (l) => l && typeof l.productId === 'string' && Number.isInteger(l.quantity) && l.quantity >= 1 && l.quantity <= 20
      );
      return { version: 2, lines: validLines };
    }
  } catch (err) {
    console.warn('Failed to parse cart from localStorage, initializing fresh cart:', err);
  }
  return { version: 2, lines: [] };
}

let cartState = getStoredCart();

function persistCart() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(cartState));
  } catch (e) {
    console.error('Error persisting cart to localStorage:', e);
  }
  notify();
}

function notify() {
  listeners.forEach((fn) => {
    try {
      fn(cartState);
    } catch (err) {
      console.error('Error in cart listener:', err);
    }
  });
}

export function subscribeToCart(fn) {
  listeners.add(fn);
  fn(cartState);
  return () => listeners.delete(fn);
}

export function getCart() {
  return cartState;
}

export function addToCart(productId, priceAtAddIqd, quantity = 1, note = '') {
  if (cartState.lines.length >= 50) {
    throw new Error('Cart limit reached (max 50 distinct items)');
  }
  const existingIndex = cartState.lines.findIndex((l) => l.productId === productId);
  if (existingIndex > -1) {
    const newQty = Math.min(20, cartState.lines[existingIndex].quantity + quantity);
    cartState.lines[existingIndex].quantity = newQty;
    if (note) {
      cartState.lines[existingIndex].note = note.slice(0, 120);
    }
  } else {
    cartState.lines.push({
      productId,
      quantity: Math.max(1, Math.min(20, quantity)),
      note: (note || '').slice(0, 120),
      priceAtAddIqd: Math.round(priceAtAddIqd || 0),
    });
  }
  persistCart();
}

export function updateQuantity(productId, quantity) {
  const lineIndex = cartState.lines.findIndex((l) => l.productId === productId);
  if (lineIndex === -1) return;

  if (quantity <= 0) {
    cartState.lines.splice(lineIndex, 1);
  } else {
    cartState.lines[lineIndex].quantity = Math.min(20, quantity);
  }
  persistCart();
}

export function updateNote(productId, note) {
  const line = cartState.lines.find((l) => l.productId === productId);
  if (line) {
    line.note = (note || '').slice(0, 120);
    persistCart();
  }
}

export function removeFromCart(productId) {
  cartState.lines = cartState.lines.filter((l) => l.productId !== productId);
  persistCart();
}

export function clearCart() {
  cartState = { version: 2, lines: [] };
  persistCart();
}

export function syncCartLinePrice(productId, newPrice) {
  const line = cartState.lines.find((l) => l.productId === productId);
  if (line) {
    line.priceAtAddIqd = Math.round(newPrice || 0);
    persistCart();
  }
}

export function getCartTotalCount() {
  return cartState.lines.reduce((sum, line) => sum + line.quantity, 0);
}

/**
 * Automatically purges any cart lines referencing products deleted from the database.
 * Resets cart count badge and prevents ghost items in local storage.
 */
export function purgeDeletedProducts(liveProducts) {
  if (!Array.isArray(liveProducts)) return;
  const liveIds = new Set(liveProducts.map((p) => p.id));
  const initialLength = cartState.lines.length;
  cartState.lines = cartState.lines.filter((l) => liveIds.has(l.productId));
  if (cartState.lines.length !== initialLength) {
    persistCart();
  }
}
