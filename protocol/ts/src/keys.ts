import { aes128, type BlockCipher } from './aes.ts';

/** Working keys derived from a club key (SPEC.md section 4). */
export interface ClubKeys {
  readonly enc: BlockCipher;
  readonly mac: BlockCipher;
}

function labelBlock(label: number): Uint8Array {
  const block = new Uint8Array(16);
  block[0] = label;
  return block;
}

/** Derives the encryption and authentication keys from a 16-byte club key. */
export function deriveClubKeys(clubKey: Uint8Array): ClubKeys {
  if (clubKey.length !== 16) throw new RangeError('Club key must be 16 bytes');
  const root = aes128(clubKey);
  return {
    enc: aes128(root(labelBlock(0x01))),
    mac: aes128(root(labelBlock(0x02))),
  };
}
