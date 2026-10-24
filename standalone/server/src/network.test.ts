import { describe, expect, it } from 'vitest'
import { httpOrigin } from './network'

describe('httpOrigin', () => {
  it('leaves out the default port so links and QR codes stay short', () => {
    expect(httpOrigin('192.168.1.20', 80)).toBe('http://192.168.1.20')
  })

  it('keeps any other port', () => {
    expect(httpOrigin('localhost', 3000)).toBe('http://localhost:3000')
  })
})
