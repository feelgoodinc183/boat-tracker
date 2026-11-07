// Position packet, protocol version 1 (SPEC.md section 3).

import { aesCmac } from './cmac.ts';
import type { ClubKeys } from './keys.ts';

export const PROTOCOL_VERSION = 1;
export const PACKET_TYPE_POSITION = 1;
export const POSITION_PACKET_LENGTH = 26;

/** 2025-01-01T00:00:00Z, the zero point of the fix time field. */
export const TMTRAC_EPOCH_MS = Date.UTC(2025, 0, 1);

const HEADER_POSITION = (PROTOCOL_VERSION << 5) | PACKET_TYPE_POSITION;
const CLEAR_LENGTH = 8;
const SIGNED_LENGTH = 22;
const TAG_LENGTH = 4;
const COG_UNKNOWN = 0xffff;
const BATTERY_UNKNOWN = 127;
const MAX_TIME_DS = 0xffffffff;

export type FixQuality = 'none' | '2d' | '3d' | '3d-dgps';
const FIX_QUALITIES: readonly FixQuality[] = ['none', '2d', '3d', '3d-dgps'];

export interface PositionFix {
  trackerId: number;
  /** 0 to 255, wraps. */
  seq: number;
  /** GPS time of the fix, milliseconds since the Unix epoch (100 ms resolution). */
  fixTimeMs: number;
  lat: number;
  lon: number;
  sogKn: number;
  /** Degrees true, or null when unknown (e.g. stationary). */
  cogDeg: number | null;
  /** 0 to 100, or null when unknown. */
  batteryPct: number | null;
  charging: boolean;
  fix: FixQuality;
  lowBattery: boolean;
  buttonPressed: boolean;
  /** Horizontal dilution of precision in 0.5 steps (7.5 means 7.5 or worse), or null. */
  hdop: number | null;
}

/** The fields readable without the club key: enough to dedupe and pick the key. */
export interface PacketHeader {
  version: number;
  type: number;
  trackerId: number;
  seq: number;
  fixTimeMs: number;
}

export type ProtocolErrorCode = 'length' | 'version' | 'type' | 'auth' | 'range';

export class ProtocolError extends Error {
  readonly code: ProtocolErrorCode;

  constructor(code: ProtocolErrorCode, message: string) {
    super(message);
    this.name = 'ProtocolError';
    this.code = code;
  }
}

function counterBlock(packet: Uint8Array): Uint8Array {
  const block = new Uint8Array(16);
  block[0] = 0x01;
  block.set(packet.subarray(1, CLEAR_LENGTH), 1);
  return block;
}

function applyKeystream(keys: ClubKeys, packet: Uint8Array): void {
  const keystream = keys.enc(counterBlock(packet));
  for (let i = CLEAR_LENGTH; i < SIGNED_LENGTH; i++) packet[i] ^= keystream[i - CLEAR_LENGTH];
}

function tagFor(keys: ClubKeys, packet: Uint8Array): Uint8Array {
  return aesCmac(keys.mac, packet.subarray(0, SIGNED_LENGTH)).subarray(0, TAG_LENGTH);
}

function sameTag(a: Uint8Array, b: Uint8Array): boolean {
  let diff = 0;
  for (let i = 0; i < TAG_LENGTH; i++) diff |= a[i] ^ b[i];
  return diff === 0;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function checkTrackerId(id: number): void {
  if (!Number.isInteger(id) || id < 1 || id > 0xfffe) {
    throw new ProtocolError('range', `Tracker ID ${id} is outside 1 to 65534`);
  }
}

/** Reads the unencrypted part of any packet. Does not check the tag. */
export function readHeader(packet: Uint8Array): PacketHeader {
  if (packet.length < CLEAR_LENGTH) {
    throw new ProtocolError('length', `Packet is ${packet.length} bytes, too short for a header`);
  }
  const view = new DataView(packet.buffer, packet.byteOffset, packet.byteLength);
  const version = packet[0] >> 5;
  if (version !== PROTOCOL_VERSION) {
    throw new ProtocolError('version', `Unknown protocol version ${version}`);
  }
  return {
    version,
    type: packet[0] & 0x1f,
    trackerId: view.getUint16(1, true),
    seq: packet[3],
    fixTimeMs: TMTRAC_EPOCH_MS + view.getUint32(4, true) * 100,
  };
}

/** Builds an encrypted, authenticated 26-byte position packet. */
export function encodePosition(fix: PositionFix, keys: ClubKeys): Uint8Array {
  checkTrackerId(fix.trackerId);
  if (!Number.isInteger(fix.seq) || fix.seq < 0 || fix.seq > 255) {
    throw new ProtocolError('range', `Sequence ${fix.seq} is outside 0 to 255`);
  }
  const timeDs = Math.round((fix.fixTimeMs - TMTRAC_EPOCH_MS) / 100);
  if (!Number.isFinite(timeDs) || timeDs < 0 || timeDs > MAX_TIME_DS) {
    throw new ProtocolError('range', 'Fix time is outside the range the packet can carry (2025 to 2038)');
  }
  if (!(Math.abs(fix.lat) <= 90) || !(Math.abs(fix.lon) <= 180)) {
    throw new ProtocolError('range', `Position ${fix.lat}, ${fix.lon} is not a valid latitude and longitude`);
  }

  const packet = new Uint8Array(POSITION_PACKET_LENGTH);
  const view = new DataView(packet.buffer);
  packet[0] = HEADER_POSITION;
  view.setUint16(1, fix.trackerId, true);
  packet[3] = fix.seq;
  view.setUint32(4, timeDs, true);
  view.setInt32(8, Math.round(fix.lat * 1e7), true);
  view.setInt32(12, Math.round(fix.lon * 1e7), true);
  view.setUint16(16, clamp(Math.round(fix.sogKn * 100), 0, 0xffff), true);

  let cog = COG_UNKNOWN;
  if (fix.cogDeg !== null) cog = Math.round((((fix.cogDeg % 360) + 360) % 360) * 100) % 36000;
  view.setUint16(18, cog, true);

  const pct = fix.batteryPct === null ? BATTERY_UNKNOWN : clamp(Math.round(fix.batteryPct), 0, 100);
  packet[20] = pct | (fix.charging ? 0x80 : 0);

  const hdopBucket = fix.hdop === null ? 0 : clamp(Math.round(fix.hdop * 2), 1, 15);
  packet[21] =
    FIX_QUALITIES.indexOf(fix.fix) |
    (fix.lowBattery ? 0x04 : 0) |
    (fix.buttonPressed ? 0x08 : 0) |
    (hdopBucket << 4);

  return sealPosition(packet, keys);
}

/**
 * Low-level: encrypts bytes 8 to 21 of a plaintext position packet in place
 * and writes the tag. Does no range checks, so test tools can build packets
 * that a correct tracker would never send. Use encodePosition otherwise.
 */
export function sealPosition(packet: Uint8Array, keys: ClubKeys): Uint8Array {
  if (packet.length !== POSITION_PACKET_LENGTH) {
    throw new ProtocolError('length', `Position packet is ${packet.length} bytes, expected ${POSITION_PACKET_LENGTH}`);
  }
  applyKeystream(keys, packet);
  packet.set(tagFor(keys, packet), SIGNED_LENGTH);
  return packet;
}

/**
 * Checks the tag, decrypts and decodes a position packet.
 * Throws ProtocolError for a wrong length, version or type, a bad tag, or
 * out-of-range values.
 */
export function decodePosition(packet: Uint8Array, keys: ClubKeys): PositionFix {
  if (packet.length !== POSITION_PACKET_LENGTH) {
    throw new ProtocolError('length', `Position packet is ${packet.length} bytes, expected ${POSITION_PACKET_LENGTH}`);
  }
  const header = readHeader(packet);
  if (header.type !== PACKET_TYPE_POSITION) {
    throw new ProtocolError('type', `Packet type ${header.type} is not a position packet`);
  }
  if (!sameTag(tagFor(keys, packet), packet.subarray(SIGNED_LENGTH))) {
    throw new ProtocolError('auth', 'Authentication tag does not match: wrong club key or damaged packet');
  }

  const plain = packet.slice();
  applyKeystream(keys, plain);
  const view = new DataView(plain.buffer);

  const lat = view.getInt32(8, true) / 1e7;
  const lon = view.getInt32(12, true) / 1e7;
  if (Math.abs(lat) > 90 || Math.abs(lon) > 180) {
    throw new ProtocolError('range', `Position ${lat}, ${lon} is not a valid latitude and longitude`);
  }
  const cogRaw = view.getUint16(18, true);
  if (cogRaw !== COG_UNKNOWN && cogRaw > 35999) {
    throw new ProtocolError('range', `Course ${cogRaw / 100} is outside 0 to 359.99 degrees`);
  }
  const pctRaw = plain[20] & 0x7f;
  if (pctRaw !== BATTERY_UNKNOWN && pctRaw > 100) {
    throw new ProtocolError('range', `Battery ${pctRaw}% is outside 0 to 100`);
  }
  const flags = plain[21];
  const hdopBucket = flags >> 4;

  return {
    trackerId: header.trackerId,
    seq: header.seq,
    fixTimeMs: header.fixTimeMs,
    lat,
    lon,
    sogKn: view.getUint16(16, true) / 100,
    cogDeg: cogRaw === COG_UNKNOWN ? null : cogRaw / 100,
    batteryPct: pctRaw === BATTERY_UNKNOWN ? null : pctRaw,
    charging: (plain[20] & 0x80) !== 0,
    fix: FIX_QUALITIES[flags & 0x03],
    lowBattery: (flags & 0x04) !== 0,
    buttonPressed: (flags & 0x08) !== 0,
    hdop: hdopBucket === 0 ? null : hdopBucket / 2,
  };
}

/** One fix in the shape of the TMTRAC server's `positions` message. */
export interface ServerFix {
  lat: number;
  lng: number;
  speedKt: number;
  headingDeg: number | null;
  fixTime: number;
}

export function toServerFix(fix: PositionFix): ServerFix {
  return {
    lat: fix.lat,
    lng: fix.lon,
    speedKt: fix.sogKn,
    headingDeg: fix.cogDeg,
    fixTime: fix.fixTimeMs,
  };
}
