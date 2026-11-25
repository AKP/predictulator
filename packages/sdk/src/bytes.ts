/**
 * Little-endian byte helpers.
 *
 * Percolator stores every multi-byte integer as a plain little-endian byte
 * array (the engine's `V16PodU64`, `V16PodU128`, ... wrappers), and the
 * program decodes instruction payloads the same way. Everything 64 bits and
 * wider is handled as `bigint`; narrower values are plain numbers.
 */

export const U64_MAX = (1n << 64n) - 1n;
export const U128_MAX = (1n << 128n) - 1n;
export const I128_MIN = -(1n << 127n);
export const I128_MAX = (1n << 127n) - 1n;

function slice(b: Uint8Array, offset: number, len: number): Uint8Array {
  if (offset < 0 || offset + len > b.length) {
    throw new RangeError(
      `read of ${len} bytes at ${offset} exceeds buffer of ${b.length}`,
    );
  }
  return b.subarray(offset, offset + len);
}

export function readU8(b: Uint8Array, offset: number): number {
  return slice(b, offset, 1)[0]!;
}

export function readU16(b: Uint8Array, offset: number): number {
  const s = slice(b, offset, 2);
  return s[0]! | (s[1]! << 8);
}

export function readU32(b: Uint8Array, offset: number): number {
  const s = slice(b, offset, 4);
  return (s[0]! | (s[1]! << 8) | (s[2]! << 16) | (s[3]! << 24)) >>> 0;
}

export function readUnsigned(b: Uint8Array, offset: number, len: number): bigint {
  const s = slice(b, offset, len);
  let v = 0n;
  for (let i = len - 1; i >= 0; i--) {
    v = (v << 8n) | BigInt(s[i]!);
  }
  return v;
}

export function readU64(b: Uint8Array, offset: number): bigint {
  return readUnsigned(b, offset, 8);
}

export function readU128(b: Uint8Array, offset: number): bigint {
  return readUnsigned(b, offset, 16);
}

export function readI64(b: Uint8Array, offset: number): bigint {
  return BigInt.asIntN(64, readUnsigned(b, offset, 8));
}

export function readI128(b: Uint8Array, offset: number): bigint {
  return BigInt.asIntN(128, readUnsigned(b, offset, 16));
}

export function readBytes(b: Uint8Array, offset: number, len: number): Uint8Array {
  return new Uint8Array(slice(b, offset, len));
}

function assertRange(name: string, v: bigint, min: bigint, max: bigint): void {
  if (v < min || v > max) {
    throw new RangeError(`${name} out of range: ${v}`);
  }
}

export function writeUnsigned(v: bigint, len: number): Uint8Array {
  const out = new Uint8Array(len);
  let x = v;
  for (let i = 0; i < len; i++) {
    out[i] = Number(x & 0xffn);
    x >>= 8n;
  }
  return out;
}

/**
 * Append-only encoder used by every instruction builder. Field order matches
 * the program's `Instruction::decode` exactly.
 */
export class ByteWriter {
  private parts: Uint8Array[] = [];
  private length = 0;

  u8(v: number): this {
    if (!Number.isInteger(v) || v < 0 || v > 0xff) throw new RangeError(`u8 out of range: ${v}`);
    return this.push(new Uint8Array([v]));
  }

  u16(v: number): this {
    if (!Number.isInteger(v) || v < 0 || v > 0xffff) throw new RangeError(`u16 out of range: ${v}`);
    return this.push(new Uint8Array([v & 0xff, (v >> 8) & 0xff]));
  }

  u32(v: number): this {
    if (!Number.isInteger(v) || v < 0 || v > 0xffff_ffff) throw new RangeError(`u32 out of range: ${v}`);
    return this.push(writeUnsigned(BigInt(v), 4));
  }

  u64(v: bigint | number): this {
    const x = BigInt(v);
    assertRange("u64", x, 0n, U64_MAX);
    return this.push(writeUnsigned(x, 8));
  }

  u128(v: bigint | number): this {
    const x = BigInt(v);
    assertRange("u128", x, 0n, U128_MAX);
    return this.push(writeUnsigned(x, 16));
  }

  i64(v: bigint | number): this {
    const x = BigInt(v);
    assertRange("i64", x, -(1n << 63n), (1n << 63n) - 1n);
    return this.push(writeUnsigned(BigInt.asUintN(64, x), 8));
  }

  i128(v: bigint | number): this {
    const x = BigInt(v);
    // The engine forbids i128::MIN in persistent fields; refuse it on the wire too.
    assertRange("i128", x, I128_MIN + 1n, I128_MAX);
    return this.push(writeUnsigned(BigInt.asUintN(128, x), 16));
  }

  bytes32(v: Uint8Array): this {
    if (v.length !== 32) throw new RangeError(`expected 32 bytes, got ${v.length}`);
    return this.push(new Uint8Array(v));
  }

  bytes(v: Uint8Array): this {
    return this.push(new Uint8Array(v));
  }

  private push(p: Uint8Array): this {
    this.parts.push(p);
    this.length += p.length;
    return this;
  }

  toBytes(): Uint8Array {
    const out = new Uint8Array(this.length);
    let o = 0;
    for (const p of this.parts) {
      out.set(p, o);
      o += p.length;
    }
    return out;
  }
}

export function bytesEqual(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
  return true;
}

export function isZeroBytes(a: Uint8Array): boolean {
  for (let i = 0; i < a.length; i++) if (a[i] !== 0) return false;
  return true;
}

export function toHex(a: Uint8Array): string {
  let s = "";
  for (const x of a) s += x.toString(16).padStart(2, "0");
  return s;
}

export function fromHex(s: string): Uint8Array {
  if (s.length % 2 !== 0) throw new RangeError("hex string has odd length");
  const out = new Uint8Array(s.length / 2);
  for (let i = 0; i < out.length; i++) {
    const v = Number.parseInt(s.slice(i * 2, i * 2 + 2), 16);
    if (Number.isNaN(v)) throw new RangeError(`bad hex at ${i * 2}`);
    out[i] = v;
  }
  return out;
}
