<script lang="ts">
  import qrcode from "qrcode-generator";

  /** QR code en SVG, noir sur blanc avec sa marge, lisible par n'importe quel téléphone. */
  let { text, size = 220 }: { text: string; size?: number } = $props();

  const matrix = $derived.by(() => {
    const qr = qrcode(0, "M");
    qr.addData(text);
    qr.make();
    const n = qr.getModuleCount();
    let path = "";
    for (let y = 0; y < n; y++) {
      for (let x = 0; x < n; x++) if (qr.isDark(y, x)) path += `M${x + 4} ${y + 4}h1v1h-1z`;
    }
    return { box: n + 8, path };
  });
</script>

<svg class="qr" width={size} height={size} viewBox="0 0 {matrix.box} {matrix.box}" shape-rendering="crispEdges" role="img" aria-label="QR code">
  <rect width={matrix.box} height={matrix.box} fill="#fff" />
  <path d={matrix.path} fill="#000" />
</svg>

<style>
  .qr {
    display: block;
    border-radius: 12px;
  }
</style>
