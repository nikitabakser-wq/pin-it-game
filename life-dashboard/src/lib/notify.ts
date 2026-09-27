"use client";

// Notification channel for the Weekly Review.
// Today: an in-app banner (always) + a system notification through the browser when the
// user has allowed it and the app is open. Real push (while the app is closed) would plug in
// here: register a service worker, store its PushSubscription, and send from a scheduled job.

export type NotifyPermission = "unsupported" | "default" | "granted" | "denied";

export function notificationPermission(): NotifyPermission {
  if (typeof window === "undefined" || !("Notification" in window)) return "unsupported";
  return Notification.permission as NotifyPermission;
}

export async function requestNotifications(): Promise<NotifyPermission> {
  if (notificationPermission() === "unsupported") return "unsupported";
  try {
    return (await Notification.requestPermission()) as NotifyPermission;
  } catch {
    return notificationPermission();
  }
}

/** Shows a system notification once per `key`. Returns true when one was shown. */
export async function showNotification(key: string, title: string, body: string, url: string): Promise<boolean> {
  if (notificationPermission() !== "granted") return false;
  const storageKey = `notified:${key}`;
  try {
    if (localStorage.getItem(storageKey)) return false;
  } catch {
    // storage unavailable — still notify
  }
  let shown = false;
  try {
    const reg = await navigator.serviceWorker?.getRegistration();
    if (reg) {
      await reg.showNotification(title, { body, icon: "/icon.svg", tag: key, data: { url } });
      shown = true;
    }
  } catch {
    // fall through to the page-level API
  }
  if (!shown) {
    try {
      const n = new Notification(title, { body, icon: "/icon.svg", tag: key });
      n.onclick = () => {
        window.focus();
        window.location.assign(url);
      };
      shown = true;
    } catch {
      // some mobile browsers only allow notifications from a service worker
    }
  }
  if (shown) {
    try {
      localStorage.setItem(storageKey, "1");
    } catch {
      // ignore
    }
  }
  return shown;
}
