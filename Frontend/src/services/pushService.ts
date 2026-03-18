// services/pushService.ts — Service Worker registration + Web Push subscription
import { API_URL } from '@/config/api';

let swRegistration: ServiceWorkerRegistration | null = null;

/**
 * Register the service worker and subscribe to web push if allowed.
 * Call once on app boot (after auth).
 */
export async function initPush(): Promise<void> {
  if (!('serviceWorker' in navigator) || !('PushManager' in window)) return;

  try {
    swRegistration = await navigator.serviceWorker.register('/sw.js');
    console.log('[PUSH] Service worker registered');
  } catch (e) {
    console.warn('[PUSH] SW registration failed:', e);
  }
}

/**
 * Subscribe the user to web push notifications.
 * Requests Notification permission if needed, then subscribes via the Push API
 * and sends the subscription to the backend.
 */
export async function subscribeToPush(): Promise<boolean> {
  if (!swRegistration) return false;

  const permission = await Notification.requestPermission();
  if (permission !== 'granted') return false;

  const token = localStorage.getItem('token');
  if (!token) return false;

  try {
    // Get the VAPID public key from the backend
    const keyRes = await fetch(`${API_URL}/notifications/push/vapid-public-key`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!keyRes.ok) return false;
    const { publicKey } = await keyRes.json();
    if (!publicKey) return false;

    // Convert VAPID key from base64url to Uint8Array
    const applicationServerKey = urlBase64ToUint8Array(publicKey);

    // Subscribe
    const subscription = await swRegistration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey,
    });

    // Send subscription to backend
    const res = await fetch(`${API_URL}/notifications/push/subscribe`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(subscription.toJSON()),
    });

    return res.ok;
  } catch (e) {
    console.warn('[PUSH] subscribeToPush failed:', e);
    return false;
  }
}

/**
 * Unsubscribe from web push.
 */
export async function unsubscribeFromPush(): Promise<void> {
  if (!swRegistration) return;
  try {
    const subscription = await swRegistration.pushManager.getSubscription();
    if (!subscription) return;

    await subscription.unsubscribe();

    const token = localStorage.getItem('token');
    if (token) {
      await fetch(`${API_URL}/notifications/push/unsubscribe`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ endpoint: subscription.endpoint }),
      }).catch(() => {});
    }
  } catch (e) {
    console.warn('[PUSH] unsubscribe failed:', e);
  }
}

/** Check if already subscribed */
export async function isPushSubscribed(): Promise<boolean> {
  if (!swRegistration) return false;
  const sub = await swRegistration.pushManager.getSubscription();
  return !!sub;
}

// ── Helpers ──────────────────────────────────────────────────────────

function urlBase64ToUint8Array(base64String: string) {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const rawData = window.atob(base64);
  const array = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; i++) {
    array[i] = rawData.charCodeAt(i);
  }
  return array;
}
