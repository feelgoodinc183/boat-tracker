import { strict as assert } from 'node:assert';
import { createCipheriv } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import {
  POSITION_PACKET_LENGTH,
  ProtocolError,
  TMTRAC_EPOCH_MS,
  aes128,
  aesCmac,
  decodePosition,
  deriveClubKeys,
  encodePosition,
  readHeader,
  toServerFix,
  type PositionFix,
  type ProtocolErrorCode,
} from '../src/index.ts';

const fromHex = (text: string): Uint8Array => Uint8Array.from(Buffer.from(text, 'hex'));
const toHex = (bytes: Uint8Array): string => Buffer.from(bytes).toString('hex');

interface Vectors {
  valid: { name: string; clubKey: string; input: PositionFix; packet: string; decoded: PositionFix }[];
  invalid: { name: string; clubKey: string; packet: string; error: ProtocolErrorCode }[];
}
const vectors: Vectors = JSON.parse(
  readFileSync(new URL('../../test-vectors/position-v1.json', import.meta.url), 'utf8'),
);

const KEY = fromHex('000102030405060708090a0b0c0d0e0f');
const keys = deriveClubKeys(KEY);

const sample: PositionFix = {
  trackerId: 12,
  seq: 200,
  fixTimeMs: Date.parse('2026-11-07T08:00:00.000Z'),
  lat: 5.4145123,
  lon: 100.3292345,
  sogKn: 7.25,
  cogDeg: 45.5,
  batteryPct: 64,
  charging: false,
  fix: '3d',
  lowBattery: false,
  buttonPressed: true,
  hdop: 1.5,
};

function expectError(fn: () => unknown, code: ProtocolErrorCode): void {
  assert.throws(fn, (err: unknown) => err instanceof ProtocolError && err.code === code);
}

test('every valid vector decodes to its expected fields', () => {
  for (const v of vectors.valid) {
    const decoded = decodePosition(fromHex(v.packet), deriveClubKeys(fromHex(v.clubKey)));
    assert.deepEqual(decoded, v.decoded, v.name);
  }
});

test('encoding a vector input reproduces its exact bytes', () => {
  for (const v of vectors.valid) {
    assert.equal(toHex(encodePosition(v.input, deriveClubKeys(fromHex(v.clubKey)))), v.packet, v.name);
  }
});

test('every invalid vector is rejected with its expected error', () => {
  for (const v of vectors.invalid) {
    expectError(() => decodePosition(fromHex(v.packet), deriveClubKeys(fromHex(v.clubKey))), v.error);
  }
});

test('a packet built independently with Node crypto matches encodePosition', () => {
  // Rebuilds SPEC.md section 4 using only Node's AES, so a bug shared by our
  // AES, key derivation and CTR code can't hide.
  const ecb = (key: Uint8Array, block: Uint8Array): Buffer => {
    const c = createCipheriv('aes-128-ecb', key, null);
    c.setAutoPadding(false);
    return c.update(block);
  };
  const label = (n: number): Uint8Array => {
    const b = new Uint8Array(16);
    b[0] = n;
    return b;
  };
  const kEnc = ecb(KEY, label(1));
  const kMac = ecb(KEY, label(2));

  const plain = Buffer.alloc(22);
  plain[0] = 0x21;
  plain.writeUInt16LE(sample.trackerId, 1);
  plain[3] = sample.seq;
  plain.writeUInt32LE((sample.fixTimeMs - TMTRAC_EPOCH_MS) / 100, 4);
  plain.writeInt32LE(Math.round(sample.lat * 1e7), 8);
  plain.writeInt32LE(Math.round(sample.lon * 1e7), 12);
  plain.writeUInt16LE(725, 16);
  plain.writeUInt16LE(4550, 18);
  plain[20] = 64;
  plain[21] = 0x02 | 0x08 | (3 << 4);

  const iv = Buffer.alloc(16);
  iv[0] = 0x01;
  plain.copy(iv, 1, 1, 8);
  const ctr = createCipheriv('aes-128-ctr', kEnc, iv);
  const body = ctr.update(plain.subarray(8, 22));

  const signed = Buffer.concat([plain.subarray(0, 8), body]);
  const tag = aesCmac(aes128(kMac), signed).subarray(0, 4);
  const expected = Buffer.concat([signed, tag]);

  assert.equal(toHex(encodePosition(sample, keys)), expected.toString('hex'));
});

test('round trip keeps every field within its encoding resolution', () => {
  const decoded = decodePosition(encodePosition(sample, keys), keys);
  assert.deepEqual(decoded, sample);
});

test('the clear header is readable without the key', () => {
  const packet = encodePosition(sample, keys);
  assert.deepEqual(readHeader(packet), {
    version: 1,
    type: 1,
    trackerId: 12,
    seq: 200,
    fixTimeMs: sample.fixTimeMs,
  });
});

test('position values are hidden on the air', () => {
  const packet = encodePosition(sample, keys);
  const latBytes = Buffer.alloc(4);
  latBytes.writeInt32LE(Math.round(sample.lat * 1e7));
  assert.equal(Buffer.from(packet).indexOf(latBytes), -1);
});

test('the same fix with a different sequence encrypts differently', () => {
  const a = encodePosition(sample, keys);
  const b = encodePosition({ ...sample, seq: 201 }, keys);
  assert.notEqual(toHex(a.subarray(8, 22)), toHex(b.subarray(8, 22)));
});

test('encoding normalises course and clamps speed and battery', () => {
  const decoded = decodePosition(
    encodePosition({ ...sample, cogDeg: -90, sogKn: 1000, batteryPct: 140 }, keys),
    keys,
  );
  assert.equal(decoded.cogDeg, 270);
  assert.equal(decoded.sogKn, 655.35);
  assert.equal(decoded.batteryPct, 100);
});

test('a course that rounds up to 360 is sent as 0', () => {
  assert.equal(decodePosition(encodePosition({ ...sample, cogDeg: 359.999 }, keys), keys).cogDeg, 0);
});

test('encoding rejects values the packet cannot carry', () => {
  expectError(() => encodePosition({ ...sample, trackerId: 0 }, keys), 'range');
  expectError(() => encodePosition({ ...sample, trackerId: 65535 }, keys), 'range');
  expectError(() => encodePosition({ ...sample, seq: 256 }, keys), 'range');
  expectError(() => encodePosition({ ...sample, fixTimeMs: TMTRAC_EPOCH_MS - 100 }, keys), 'range');
  expectError(() => encodePosition({ ...sample, fixTimeMs: Date.parse('2039-01-01T00:00:00Z') }, keys), 'range');
  expectError(() => encodePosition({ ...sample, lat: 90.5 }, keys), 'range');
  expectError(() => encodePosition({ ...sample, lon: Number.NaN }, keys), 'range');
});

test('decoding rejects a packet shorter than the header', () => {
  expectError(() => readHeader(new Uint8Array(5)), 'length');
});

test('decoding works on a packet inside a larger buffer', () => {
  const packet = encodePosition(sample, keys);
  const frame = new Uint8Array(POSITION_PACKET_LENGTH + 10);
  frame.set(packet, 7);
  assert.deepEqual(decodePosition(frame.subarray(7, 7 + POSITION_PACKET_LENGTH), keys), sample);
});

test('club keys must be 16 bytes', () => {
  assert.throws(() => deriveClubKeys(new Uint8Array(8)), RangeError);
});

test('toServerFix produces the TMTRAC positions message shape', () => {
  assert.deepEqual(toServerFix(sample), {
    lat: sample.lat,
    lng: sample.lon,
    speedKt: 7.25,
    headingDeg: 45.5,
    fixTime: sample.fixTimeMs,
  });
});
