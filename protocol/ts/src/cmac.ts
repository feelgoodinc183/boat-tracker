// AES-CMAC as specified in RFC 4493.

import type { BlockCipher } from './aes.ts';

function doubleBlock(b: Uint8Array): Uint8Array {
  const out = new Uint8Array(16);
  for (let i = 0; i < 15; i++) out[i] = ((b[i] << 1) | (b[i + 1] >> 7)) & 0xff;
  out[15] = (b[15] << 1) & 0xff;
  if (b[0] & 0x80) out[15] ^= 0x87;
  return out;
}

/** Full 16-byte AES-CMAC of `message` under the cipher's key. */
export function aesCmac(encrypt: BlockCipher, message: Uint8Array): Uint8Array {
  const k1 = doubleBlock(encrypt(new Uint8Array(16)));
  const k2 = doubleBlock(k1);

  const blocks = Math.max(1, Math.ceil(message.length / 16));
  const lastComplete = message.length > 0 && message.length % 16 === 0;

  const last = new Uint8Array(16);
  const lastStart = (blocks - 1) * 16;
  const tail = message.subarray(lastStart);
  last.set(tail);
  if (lastComplete) {
    for (let i = 0; i < 16; i++) last[i] ^= k1[i];
  } else {
    last[tail.length] = 0x80;
    for (let i = 0; i < 16; i++) last[i] ^= k2[i];
  }

  let x: Uint8Array = new Uint8Array(16);
  for (let b = 0; b < blocks - 1; b++) {
    const y = new Uint8Array(16);
    for (let i = 0; i < 16; i++) y[i] = x[i] ^ message[b * 16 + i];
    x = encrypt(y);
  }
  const y = new Uint8Array(16);
  for (let i = 0; i < 16; i++) y[i] = x[i] ^ last[i];
  return encrypt(y);
}
