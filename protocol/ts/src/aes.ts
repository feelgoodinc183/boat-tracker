// AES-128 block encryption (FIPS-197), encrypt direction only.
// The protocol only needs encryption: CTR mode and CMAC both use the forward
// cipher. Pure TypeScript so the package runs unchanged in Node, browsers and
// the Capacitor app.

export type BlockCipher = (block: Uint8Array) => Uint8Array;

function xtime(b: number): number {
  return ((b << 1) ^ (b & 0x80 ? 0x1b : 0)) & 0xff;
}

function rotl8(x: number, shift: number): number {
  return ((x << shift) | (x >> (8 - shift))) & 0xff;
}

// Builds the S-box from its definition (multiplicative inverse in GF(2^8)
// followed by the affine transform) instead of a hand-typed table.
function buildSbox(): Uint8Array {
  const sbox = new Uint8Array(256);
  let p = 1;
  let q = 1;
  do {
    p = (p ^ xtime(p)) & 0xff; // p * 3
    q = (q ^ (q << 1)) & 0xff; // q / 3
    q = (q ^ (q << 2)) & 0xff;
    q = (q ^ (q << 4)) & 0xff;
    if (q & 0x80) q ^= 0x09;
    const x = q ^ rotl8(q, 1) ^ rotl8(q, 2) ^ rotl8(q, 3) ^ rotl8(q, 4);
    sbox[p] = (x ^ 0x63) & 0xff;
  } while (p !== 1);
  sbox[0] = 0x63;
  return sbox;
}

const SBOX = buildSbox();

function expandKey(key: Uint8Array): Uint8Array {
  if (key.length !== 16) throw new RangeError('AES-128 key must be 16 bytes');
  const w = new Uint8Array(176);
  w.set(key);
  let rcon = 1;
  for (let i = 16; i < 176; i += 4) {
    let t0 = w[i - 4];
    let t1 = w[i - 3];
    let t2 = w[i - 2];
    let t3 = w[i - 1];
    if (i % 16 === 0) {
      const first = t0;
      t0 = SBOX[t1] ^ rcon;
      t1 = SBOX[t2];
      t2 = SBOX[t3];
      t3 = SBOX[first];
      rcon = xtime(rcon);
    }
    w[i] = w[i - 16] ^ t0;
    w[i + 1] = w[i - 15] ^ t1;
    w[i + 2] = w[i - 14] ^ t2;
    w[i + 3] = w[i - 13] ^ t3;
  }
  return w;
}

function encryptBlock(rk: Uint8Array, input: Uint8Array): Uint8Array {
  if (input.length !== 16) throw new RangeError('AES block must be 16 bytes');
  const s = new Uint8Array(16);
  for (let i = 0; i < 16; i++) s[i] = input[i] ^ rk[i];
  const t = new Uint8Array(16);

  for (let round = 1; round <= 10; round++) {
    // SubBytes and ShiftRows together: row r rotates left by r columns.
    for (let c = 0; c < 4; c++) {
      for (let r = 0; r < 4; r++) {
        t[r + 4 * c] = SBOX[s[r + 4 * ((c + r) % 4)]];
      }
    }
    if (round < 10) {
      for (let c = 0; c < 4; c++) {
        const a0 = t[4 * c];
        const a1 = t[4 * c + 1];
        const a2 = t[4 * c + 2];
        const a3 = t[4 * c + 3];
        s[4 * c] = xtime(a0) ^ xtime(a1) ^ a1 ^ a2 ^ a3;
        s[4 * c + 1] = a0 ^ xtime(a1) ^ xtime(a2) ^ a2 ^ a3;
        s[4 * c + 2] = a0 ^ a1 ^ xtime(a2) ^ xtime(a3) ^ a3;
        s[4 * c + 3] = xtime(a0) ^ a0 ^ a1 ^ a2 ^ xtime(a3);
      }
    } else {
      s.set(t);
    }
    const offset = round * 16;
    for (let i = 0; i < 16; i++) s[i] ^= rk[offset + i];
  }
  return s;
}

/** Returns a function that encrypts single 16-byte blocks with `key`. */
export function aes128(key: Uint8Array): BlockCipher {
  const rk = expandKey(key);
  return (block) => encryptBlock(rk, block);
}
