import { useState, useEffect } from 'react';
import { getVapidPublicKey, subscribePush, unsubscribePush } from './api';

function urlBase64ToUint8Array(base64String) {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const rawData = atob(base64);
  return Uint8Array.from([...rawData].map((c) => c.charCodeAt(0)));
}

export function usePush() {
  const [permission, setPermission] = useState('default');
  const [subscribed, setSubscribed] = useState(false);
  const [loading, setLoading] = useState(false);
  const [supported, setSupported] = useState(false);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const ok = 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;
    setSupported(ok);
    if (ok) setPermission(Notification.permission);
  }, []);

  useEffect(() => {
    if (!supported) return;
    navigator.serviceWorker.ready.then((reg) => {
      reg.pushManager.getSubscription().then((sub) => setSubscribed(!!sub));
    }).catch(() => {});
  }, [supported]);

  async function subscribe() {
    if (!supported) return;
    setLoading(true);
    try {
      const { data } = await getVapidPublicKey();
      const reg = await navigator.serviceWorker.ready;
      const perm = await Notification.requestPermission();
      setPermission(perm);
      if (perm !== 'granted') return;

      const sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(data.publicKey),
      });

      const { endpoint, keys } = sub.toJSON();
      await subscribePush(endpoint, keys.p256dh, keys.auth);
      setSubscribed(true);
    } catch (err) {
      console.error('[Push] subscribe failed', err);
    } finally {
      setLoading(false);
    }
  }

  async function unsubscribe() {
    if (!supported) return;
    setLoading(true);
    try {
      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.getSubscription();
      if (sub) {
        await unsubscribePush(sub.endpoint);
        await sub.unsubscribe();
      }
      setSubscribed(false);
    } catch (err) {
      console.error('[Push] unsubscribe failed', err);
    } finally {
      setLoading(false);
    }
  }

  return { supported, permission, subscribed, loading, subscribe, unsubscribe };
}
