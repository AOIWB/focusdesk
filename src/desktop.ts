import { isTauri } from "@tauri-apps/api/core";
import {
  isPermissionGranted,
  requestPermission,
  sendNotification,
} from "@tauri-apps/plugin-notification";
import {
  register,
  unregister,
  isRegistered,
} from "@tauri-apps/plugin-global-shortcut";
import { getCurrentWindow } from "@tauri-apps/api/window";
export const shortcut = "CommandOrControl+Shift+Space";
export async function notificationPermission() {
  if (isTauri())
    return (
      (await isPermissionGranted()) || (await requestPermission()) === "granted"
    );
  return (
    "Notification" in window &&
    (Notification.permission === "granted" ||
      (await Notification.requestPermission()) === "granted")
  );
}
export async function notifyEvent(title: string, body: string) {
  if (isTauri()) {
    if (await isPermissionGranted()) sendNotification({ title, body });
  } else if ("Notification" in window && Notification.permission === "granted")
    new Notification(title, { body });
}
export async function configureShortcut(
  enabled: boolean,
  onCapture: () => void,
) {
  if (!isTauri()) {
    if (enabled) throw new Error("全局快捷键需要桌面版");
    return;
  }
  if (await isRegistered(shortcut)) await unregister(shortcut);
  if (enabled)
    await register(shortcut, async (event) => {
      if (event.state !== "Pressed") return;
      const window = getCurrentWindow();
      await window.unminimize();
      await window.show();
      await window.setFocus();
      onCapture();
    });
}
