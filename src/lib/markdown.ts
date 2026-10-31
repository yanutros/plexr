// Notes de version (Markdown simple de GitHub) → HTML : titres, listes, paragraphes, gras, code et
// liens. Le texte est échappé d'abord : rien de ce qui vient de GitHub n'est interprété tel quel.

function escape(text: string): string {
  return text.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
}

function inline(text: string): string {
  return escape(text)
    .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
    .replace(/`([^`]+)`/g, "<code>$1</code>")
    .replace(/\*([^*]+)\*/g, "<em>$1</em>")
    .replace(/\[([^\]]+)\]\((https:\/\/[^)\s]+)\)/g, '<a href="$2" target="_blank" rel="noopener">$1</a>');
}

export function markdown(source: string): string {
  const out: string[] = [];
  let list = false;
  let paragraph: string[] = [];
  const flush = () => {
    if (paragraph.length) out.push(`<p>${inline(paragraph.join(" "))}</p>`);
    paragraph = [];
    if (list) out.push("</ul>");
    list = false;
  };
  for (const raw of source.replace(/\r/g, "").split("\n")) {
    const line = raw.trimEnd();
    const heading = /^#{1,6}\s+(.*)$/.exec(line);
    const item = /^\s*[-*]\s+(.*)$/.exec(line);
    if (heading) {
      flush();
      out.push(`<h4>${inline(heading[1])}</h4>`);
    } else if (item) {
      if (paragraph.length) flush();
      if (!list) out.push("<ul>");
      list = true;
      out.push(`<li>${inline(item[1])}</li>`);
    } else if (!line.trim()) {
      flush();
    } else if (list && /^\s+/.test(raw)) {
      // Suite d'un élément de liste sur la ligne suivante.
      out[out.length - 1] = out[out.length - 1].replace(/<\/li>$/, ` ${inline(line.trim())}</li>`);
    } else {
      if (list) flush();
      paragraph.push(line.trim());
    }
  }
  flush();
  return out.join("");
}
