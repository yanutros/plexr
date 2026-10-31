// Type d'appareil, pour adapter l'interface : ordinateur, tablette tactile ou téléviseur.
import { invoke } from "@tauri-apps/api/core";

const TV_WIDTH = 1280;

export const device = { os: "", mobile: false, tv: false, touch: false };

/** Classes posées sur <html> : `mobile`, `tv`, `touch`. */
export async function detectDevice() {
  device.os = (await invoke<string | null>("platform").catch(() => null)) ?? "";
  device.mobile = device.os === "android" || device.os === "ios";
  // Android indique lui-même s'il tourne sur un téléviseur (voir MainActivity.kt) ; à défaut,
  // un appareil Android sans écran tactile en est un.
  const androidTv = (window as { PlexrDevice?: { isTv(): boolean } }).PlexrDevice?.isTv();
  device.touch = !androidTv && (navigator.maxTouchPoints > 0 || matchMedia("(pointer: coarse)").matches);
  device.tv = device.os === "android" && (androidTv ?? !device.touch);
  // Un téléviseur Full HD n'offre que 960 × 540 px à la page (densité ×2) : on l'affiche
  // comme un écran de 1280 px de large, que le WebView réduit pour tenir dans l'image.
  if (device.tv) document.querySelector('meta[name="viewport"]')?.setAttribute("content", `width=${TV_WIDTH}`);
  const root = document.documentElement;
  root.classList.toggle("mobile", device.mobile);
  root.classList.toggle("tv", device.tv);
  root.classList.toggle("touch", device.touch);
}
