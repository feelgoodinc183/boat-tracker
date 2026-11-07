// Generates the shared test vectors:
//   protocol/test-vectors/position-v1.json  (read by the TypeScript tests)
//   protocol/c/test/test_vectors.h          (read by the C tests)
// Run with --check to fail if the committed files are out of date.

import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import {
  POSITION_PACKET_LENGTH,
  TMTRAC_EPOCH_MS,
  decodePosition,
  deriveClubKeys,
  encodePosition,
  sealPosition,
  type PositionFix,
  type ProtocolErrorCode,
} from '../src/index.ts';

const hex = (bytes: Uint8Array): string => Buffer.from(bytes).toString('hex');
const fromHex = (text: string): Uint8Array => Uint8Array.from(Buffer.from(text, 'hex'));

const KEY_A = '000102030405060708090a0b0c0d0e0f';
const KEY_B = 'f0e1d2c3b4a5968778695a4b3c2d1e0f';

const typical: PositionFix = {
  trackerId: 7,
  seq: 42,
  fixTimeMs: Date.parse('2026-11-07T03:15:22.400Z'),
  lat: 2.5191234,
  lon: 101.7967891,
  sogKn: 5.43,
  cogDeg: 213.5,
  batteryPct: 87,
  charging: false,
  fix: '3d',
  lowBattery: false,
  buttonPressed: false,
  hdop: 0.9,
};

const validCases: { name: string; key: string; fix: PositionFix }[] = [
  { name: 'typical racing fix', key: KEY_A, fix: typical },
  { name: 'same fix under a different club key', key: KEY_B, fix: typical },
  {
    name: 'southern and western hemisphere, last valid time, highest ID and sequence',
    key: KEY_A,
    fix: {
      ...typical,
      trackerId: 65534,
      seq: 255,
      fixTimeMs: TMTRAC_EPOCH_MS + 0xffffffff * 100,
      lat: -33.8567844,
      lon: -151.2152967,
    },
  },
  {
    name: 'no fix yet, unknowns, first valid time',
    key: KEY_A,
    fix: {
      trackerId: 1,
      seq: 0,
      fixTimeMs: TMTRAC_EPOCH_MS,
      lat: 0,
      lon: 0,
      sogKn: 0,
      cogDeg: null,
      batteryPct: null,
      charging: false,
      fix: 'none',
      lowBattery: false,
      buttonPressed: false,
      hdop: null,
    },
  },
  {
    name: 'every flag set, maximum speed, course and battery',
    key: KEY_A,
    fix: {
      ...typical,
      sogKn: 655.35,
      cogDeg: 359.99,
      batteryPct: 100,
      charging: true,
      fix: '3d-dgps',
      lowBattery: true,
      buttonPressed: true,
      hdop: 9,
    },
  },
  {
    name: 'latitude and longitude limits',
    key: KEY_A,
    fix: { ...typical, lat: 90, lon: -180, sogKn: 0, cogDeg: 0 },
  },
];

function rawFields(key: string, packet: Uint8Array) {
  const plain = packet.slice(0, 22);
  // Decrypt by sealing again: CTR is its own inverse, and the tag is discarded.
  const copy = new Uint8Array(POSITION_PACKET_LENGTH);
  copy.set(plain);
  sealPosition(copy, deriveClubKeys(fromHex(key)));
  const view = new DataView(copy.buffer);
  return {
    tracker_id: view.getUint16(1, true),
    seq: copy[3],
    time_ds: view.getUint32(4, true),
    lat_e7: view.getInt32(8, true),
    lon_e7: view.getInt32(12, true),
    sog_ckn: view.getUint16(16, true),
    cog_cdeg: view.getUint16(18, true),
    battery: copy[20],
    flags: copy[21],
  };
}

const valid = validCases.map(({ name, key, fix }) => {
  const keys = deriveClubKeys(fromHex(key));
  const packet = encodePosition(fix, keys);
  return { name, clubKey: key, input: fix, packet: hex(packet), decoded: decodePosition(packet, keys), raw: rawFields(key, packet) };
});

function craft(key: string, edit: (plain: Uint8Array, view: DataView) => void): string {
  const plain = new Uint8Array(POSITION_PACKET_LENGTH);
  const view = new DataView(plain.buffer);
  plain[0] = 0x21;
  view.setUint16(1, 7, true);
  plain[3] = 1;
  view.setUint32(4, 100, true);
  view.setUint16(18, 0xffff, true);
  plain[20] = 127;
  edit(plain, view);
  return hex(sealPosition(plain, deriveClubKeys(fromHex(key))));
}

function flip(packetHex: string, index: number, mask: number): string {
  const bytes = fromHex(packetHex);
  bytes[index] ^= mask;
  return hex(bytes);
}

const good = valid[0].packet;
const invalid: { name: string; clubKey: string; packet: string; error: ProtocolErrorCode }[] = [
  { name: 'wrong club key', clubKey: KEY_B, packet: good, error: 'auth' },
  { name: 'one encrypted bit flipped', clubKey: KEY_A, packet: flip(good, 10, 0x01), error: 'auth' },
  { name: 'tracker ID changed in the clear', clubKey: KEY_A, packet: flip(good, 1, 0x02), error: 'auth' },
  { name: 'tag byte changed', clubKey: KEY_A, packet: flip(good, 25, 0x80), error: 'auth' },
  { name: 'one byte short', clubKey: KEY_A, packet: good.slice(0, -2), error: 'length' },
  { name: 'one byte long', clubKey: KEY_A, packet: `${good}00`, error: 'length' },
  { name: 'protocol version 2', clubKey: KEY_A, packet: `41${good.slice(2)}`, error: 'version' },
  { name: 'beacon type, not position', clubKey: KEY_A, packet: `22${good.slice(2)}`, error: 'type' },
  {
    name: 'latitude 91 degrees with a valid tag',
    clubKey: KEY_A,
    packet: craft(KEY_A, (_, v) => v.setInt32(8, 910000000, true)),
    error: 'range',
  },
  {
    name: 'course 360.00 degrees with a valid tag',
    clubKey: KEY_A,
    packet: craft(KEY_A, (_, v) => v.setUint16(18, 36000, true)),
    error: 'range',
  },
  {
    name: 'battery 101 percent with a valid tag',
    clubKey: KEY_A,
    packet: craft(KEY_A, (p) => {
      p[20] = 101;
    }),
    error: 'range',
  },
];

const json = `${JSON.stringify({ protocolVersion: 1, packet: 'position', valid, invalid }, null, 2)}\n`;

const cByte = (text: string): string => {
  const bytes = fromHex(text);
  return bytes.length === 0 ? '0' : Array.from(bytes, (b) => `0x${b.toString(16).padStart(2, '0')}`).join(', ');
};
const cError: Record<ProtocolErrorCode, string> = {
  length: 'TMTRAC_ERR_LENGTH',
  version: 'TMTRAC_ERR_VERSION',
  type: 'TMTRAC_ERR_TYPE',
  auth: 'TMTRAC_ERR_AUTH',
  range: 'TMTRAC_ERR_RANGE',
};

const header = `/* Generated by protocol/ts/scripts/generate-vectors.ts. Do not edit. */
#ifndef TMTRAC_TEST_VECTORS_H
#define TMTRAC_TEST_VECTORS_H

#include <stddef.h>
#include <stdint.h>
#include "tmtrac_protocol.h"

typedef struct {
    const char *name;
    uint8_t club_key[16];
    uint8_t packet[TMTRAC_POSITION_LEN];
    tmtrac_position_t expected;
} valid_vector_t;

typedef struct {
    const char *name;
    uint8_t club_key[16];
    uint8_t packet[TMTRAC_POSITION_LEN + 1];
    size_t len;
    int expected_error;
} invalid_vector_t;

static const valid_vector_t VALID_VECTORS[] = {
${valid
  .map(
    (v) => `    {
        ${JSON.stringify(v.name)},
        { ${cByte(v.clubKey)} },
        { ${cByte(v.packet)} },
        { ${v.raw.tracker_id}u, ${v.raw.seq}u, ${v.raw.time_ds}u, ${v.raw.lat_e7}, ${v.raw.lon_e7}, ${v.raw.sog_ckn}u, ${v.raw.cog_cdeg}u, ${v.raw.battery}u, ${v.raw.flags}u },
    },`,
  )
  .join('\n')}
};

static const invalid_vector_t INVALID_VECTORS[] = {
${invalid
  .map(
    (v) => `    {
        ${JSON.stringify(v.name)},
        { ${cByte(v.clubKey)} },
        { ${cByte(v.packet)} },
        ${v.packet.length / 2},
        ${cError[v.error]},
    },`,
  )
  .join('\n')}
};

#endif
`;

const outputs: [string, string][] = [
  [fileURLToPath(new URL('../../test-vectors/position-v1.json', import.meta.url)), json],
  [fileURLToPath(new URL('../../c/test/test_vectors.h', import.meta.url)), header],
];

if (process.argv.includes('--check')) {
  const stale = outputs.filter(([path, content]) => {
    try {
      return readFileSync(path, 'utf8') !== content;
    } catch {
      return true;
    }
  });
  if (stale.length > 0) {
    console.error(`Out of date: ${stale.map(([p]) => p).join(', ')}. Run npm run vectors.`);
    process.exit(1);
  }
  console.log('Test vectors are up to date.');
} else {
  for (const [path, content] of outputs) writeFileSync(path, content);
  console.log(`Wrote ${valid.length} valid and ${invalid.length} invalid vectors.`);
}
