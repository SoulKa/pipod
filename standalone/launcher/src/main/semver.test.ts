// @vitest-environment node
import { describe, expect, it } from 'vitest'
import { SemVer } from './semver'

describe('SemVer', () => {
  it.each<[string, string, number]>([
    ['1.0.0', '1.0.1', -1],
    ['1.2.3', '2.0.0', -1],
    ['1.0.1', '1.0.0', 1],
    ['1.10.0', '1.9.0', 1],
    ['1.0.0', '1.0.0', 0]
  ])('compares %s with %s', (a, b, expected) => {
    expect(Math.sign(SemVer.compare(SemVer.parse(a), SemVer.parse(b)))).toBe(expected)
  })

  it('parses a version', () => {
    expect(SemVer.parse('1.2.3')).toEqual(new SemVer(1, 2, 3))
  })

  it.each(['invalid', '1.2', 'v1.2.3', '1.2.3-beta'])('rejects the version %s', (version) => {
    expect(() => SemVer.parse(version)).toThrow(`Invalid version: ${version}`)
  })

  it.each<[string, string, boolean]>([
    ['1.2.3', '1.2.3', true],
    ['1.2.4', '1.2.3', false],
    ['1.2.3', '^1.2.3', true],
    ['1.9.0', '^1.2.3', true],
    ['1.2.2', '^1.2.3', false],
    ['2.0.0', '^1.2.3', false],
    ['0.2.9', '^0.2.3', true],
    ['0.3.0', '^0.2.3', false],
    ['0.0.3', '^0.0.3', true],
    ['0.0.4', '^0.0.3', false]
  ])('checks whether %s satisfies %s', (version, range, expected) => {
    expect(SemVer.parse(version).satisfies(range)).toBe(expected)
  })

  it.each(['>=1.0.0', '~1.0.0', '1.x', '^1'])('rejects the unsupported range %s', (range) => {
    expect(() => new SemVer(1, 0, 0).satisfies(range)).toThrow()
  })
})
