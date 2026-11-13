import { ref } from 'vue'
import QRCode from 'qrcode'
import { api } from './api'

/** The QR code that opens a viewer route (`/` or `/view/<id>`) on a phone. */
export function useViewerQr(path: () => string) {
  const url = ref('')
  const svg = ref('')

  /**
   * The console is often opened on `localhost`, which a phone can't reach — so prefer the
   * server's LAN address and only fall back to whatever origin this page was loaded from.
   */
  async function load(): Promise<void> {
    const info = await api.getInfo().catch(() => ({ publicOrigin: null }))
    url.value = `${info.publicOrigin ?? window.location.origin}${path()}`
    svg.value = await QRCode.toString(url.value, { type: 'svg', margin: 2 })
  }

  return { url, svg, load }
}
