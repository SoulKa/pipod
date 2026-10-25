/** An immutable `major.minor.patch` version (ported from EXXETA/trufos). */
export class SemVer {
  readonly major: number
  readonly minor: number
  readonly patch: number

  constructor(major: number, minor: number, patch: number) {
    this.major = major
    this.minor = minor
    this.patch = patch
  }

  /** @throws if the version is not exactly `major.minor.patch` */
  static parse(version: string): SemVer {
    const match = /^(\d+)\.(\d+)\.(\d+)$/.exec(version)
    if (!match) throw new Error(`Invalid version: ${version}`)
    return new SemVer(parseInt(match[1]), parseInt(match[2]), parseInt(match[3]))
  }

  static compare(a: SemVer, b: SemVer): number {
    return a.major - b.major || a.minor - b.minor || a.patch - b.patch
  }

  isOlderThan(version: SemVer): boolean {
    return SemVer.compare(this, version) < 0
  }

  isEqualTo(version: SemVer): boolean {
    return SemVer.compare(this, version) === 0
  }

  /**
   * Checks whether this version is in the given range. A range is either an exact version
   * (`1.2.3`) or a caret range (`^1.2.3`), which allows changes that keep the left-most non-zero
   * part, like npm: `^1.2.3` is `>=1.2.3 <2.0.0`, `^0.2.3` is `>=0.2.3 <0.3.0` and `^0.0.3` is
   * only `0.0.3`. scripts/build-manifest.mjs validates app ranges against this same grammar —
   * keep its regex in sync when extending it.
   * @throws if the range is neither of the two
   */
  satisfies(range: string): boolean {
    if (!range.startsWith('^')) return this.isEqualTo(SemVer.parse(range))
    const min = SemVer.parse(range.slice(1))
    if (this.isOlderThan(min)) return false
    if (min.major !== 0) return this.major === min.major
    if (min.minor !== 0) return this.major === 0 && this.minor === min.minor
    return this.isEqualTo(min)
  }
}
