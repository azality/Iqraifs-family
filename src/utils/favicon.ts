// Swap the browser-tab favicon to a school's logo and restore the
// platform default on cleanup. Used by branded surfaces (public site,
// per-school login, school workspace shell).
//
// index.html ships multiple <link rel="icon"> entries (.ico plus sized
// PNGs). Browsers pick the "best" icon across ALL of them, so updating
// a single link leaves the platform PNGs winning. The swap therefore
// removes every original icon link and installs one logo link; restore
// puts the originals back.

let originals: HTMLLinkElement[] | undefined;
let custom: HTMLLinkElement | undefined;

/** Set the favicon to `url`. Returns a restore function for unmount. */
export function setFavicon(url: string): () => void {
  if (!originals) {
    originals = Array.from(
      document.querySelectorAll<HTMLLinkElement>('link[rel~="icon"]'),
    );
    originals.forEach((l) => l.remove());
  }
  if (!custom) {
    custom = document.createElement("link");
    custom.rel = "icon";
    document.head.appendChild(custom);
  }
  custom.href = url;
  return () => {
    custom?.remove();
    custom = undefined;
    originals?.forEach((l) => document.head.appendChild(l));
    originals = undefined;
  };
}
