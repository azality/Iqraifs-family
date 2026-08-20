// Swap the browser-tab favicon to a school's logo and restore the
// platform default on cleanup. Used by branded surfaces (public site,
// per-school login, school workspace shell).

let defaultHref: string | null | undefined;

function iconLink(): HTMLLinkElement {
  let link = document.querySelector<HTMLLinkElement>('link[rel="icon"]');
  if (!link) {
    link = document.createElement("link");
    link.rel = "icon";
    document.head.appendChild(link);
  }
  return link;
}

/** Set the favicon to `url`. Returns a restore function for unmount. */
export function setFavicon(url: string): () => void {
  const link = iconLink();
  if (defaultHref === undefined) defaultHref = link.getAttribute("href");
  link.href = url;
  return () => {
    const l = iconLink();
    if (defaultHref) l.href = defaultHref;
    else l.removeAttribute("href");
  };
}
