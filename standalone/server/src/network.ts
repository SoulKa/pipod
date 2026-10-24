// Where the server can be reached from, for the links and QR codes handed to people:
// the console runs on localhost, but phones scanning a QR code need the LAN address.
import { spawn } from 'node:child_process'
import { networkInterfaces } from 'node:os'
import { env } from './env'

/** First non-internal IPv4 address, or undefined when the machine is offline. */
export function lanAddress(): string | undefined {
  for (const entries of Object.values(networkInterfaces())) {
    for (const entry of entries ?? []) {
      if (entry.family === 'IPv4' && !entry.internal) return entry.address
    }
  }
  return undefined
}

/** `http://host` with the port left out when it is the default, so links stay short. */
export function httpOrigin(host: string, port: number): string {
  return port === 80 ? `http://${host}` : `http://${host}:${port}`
}

/** Origin other devices should use: `PUBLIC_URL`, else the LAN address on the bound port. */
export function publicOrigin(port: number): string | null {
  if (env.publicUrl) return env.publicUrl
  const lan = lanAddress()
  return lan ? httpOrigin(lan, port) : null
}

/** Open a URL in the desktop's default browser. Best effort: failures are only reported. */
export function openInBrowser(url: string, onError: (err: Error) => void): void {
  const [command, args] =
    process.platform === 'darwin'
      ? ['open', [url]]
      : process.platform === 'win32'
        ? ['cmd', ['/c', 'start', '', url]]
        : ['xdg-open', [url]]
  const child = spawn(command, args, { detached: true, stdio: 'ignore' })
  child.on('error', onError)
  child.unref()
}
