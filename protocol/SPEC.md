# TMTRAC radio protocol, version 1

Status: **draft, for the optional fast mode** (TMTRAC launches on stock Meshtastic; see docs/PLAN.md section 3). The position packet is complete and has reference code in C (`c/`) and TypeScript (`ts/`), with shared test vectors (`test-vectors/`). Gateway beacons and the gateway-to-phone link are sketched at the end and will be specified in Phase H2.

All multi-byte fields are **little-endian** (both the nRF52840 and the ESP32-S3 are little-endian, so firmware can read fields without byte swapping).

---

## 1. Radio settings

| Setting | Value |
|---|---|
| Band | 919.0 to 923.0 MHz (MCMC: 500 mW, no duty-cycle conditions) |
| Default channel | 920.125 MHz |
| Modulation | LoRa, SF7, 250 kHz bandwidth, coding rate 4/5 |
| Preamble | 8 symbols |
| Header | explicit, CRC on |
| Sync word | private (0x12) |
| Max TX power | 27 dBm, minus antenna gain above 0 dBi |

Same settings as Meshtastic's ShortFast preset, except the sync word: Meshtastic uses 0x2B, so Meshtastic boards and TMTRAC trackers on the same frequency ignore each other's packets.

## 2. Packet header (all packet types)

| Offset | Size | Field |
|---|---|---|
| 0 | 1 | bits 7 to 5: protocol version (1). Bits 4 to 0: packet type |

| Type | Name | Direction |
|---|---|---|
| 0 | reserved | |
| 1 | Position | tracker → gateway |
| 2 | Beacon | gateway → trackers (draft, section 6) |
| 3 to 31 | reserved | |

A receiver drops any packet whose version it doesn't know.

## 3. Position packet (type 1), 26 bytes

| Offset | Size | Field | Encoding |
|---|---|---|---|
| 0 | 1 | header | `0x21` (version 1, type 1) |
| 1 | 2 | tracker ID | uint16. 1 to 65534; 0 and 65535 are reserved |
| 3 | 1 | sequence | uint8, +1 per packet, wraps 255 → 0 |
| 4 | 4 | fix time | uint32, tenths of a second since **2025-01-01 00:00:00 UTC**, from GPS. Valid until mid-2038 |
| 8 | 4 | latitude | int32, degrees × 10⁷ (range ±90°) |
| 12 | 4 | longitude | int32, degrees × 10⁷ (range ±180°) |
| 16 | 2 | speed over ground | uint16, hundredths of a knot |
| 18 | 2 | course over ground | uint16, hundredths of a degree true, 0 to 35999. `0xFFFF` = unknown |
| 20 | 1 | battery | bits 6 to 0: percent 0 to 100, `127` = unknown. Bit 7: charging |
| 21 | 1 | flags | see below |
| 22 | 4 | auth tag | first 4 bytes of AES-CMAC, see section 4 |

Bytes 0 to 7 travel in the clear. Bytes 8 to 21 are encrypted. The tag covers bytes 0 to 21 after encryption.

**Flags (offset 21):**

| Bits | Meaning |
|---|---|
| 1 to 0 | fix quality: 0 = no fix, 1 = 2D, 2 = 3D, 3 = 3D with SBAS/differential |
| 2 | low battery |
| 3 | button pressed since the last packet |
| 7 to 4 | HDOP bucket: 0 = unknown, 1 to 15 = HDOP × 2 rounded (15 means 7.5 or worse) |

**Why these choices:**
- **26 bytes** costs the same airtime as 24 (both are 48 LoRa symbols at SF7, about 30.8 ms), so the full 4-byte time and the HDOP field are free. 27 bytes would add a symbol group.
- **Full GPS time in the packet** means the server never has to guess the date or rely on the gateway's clock. This matters when a gateway uploads hours of positions after a day offline.
- **Tracker ID, sequence and time in the clear** let the gateway and server dedupe packets and look up the right club key before decrypting.
- **Speed in hundredths of a knot** goes up to 655 kn, so foilers are covered.

**Rule for trackers:** don't send position packets until GPS has given a valid time. The (tracker ID, sequence, time) triple is the encryption nonce and must never repeat with different contents (section 4).

## 4. Encryption and authentication

Each club has a 16-byte **club key**, created by the TMTRAC server and loaded onto the club's trackers when they're flashed. Two working keys are derived from it:

```
K_enc = AES-128-Encrypt(club key, 01 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00)
K_mac = AES-128-Encrypt(club key, 02 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00)
```

**Encrypt** bytes 8 to 21 (14 bytes) with AES-128 in counter mode, one block:

```
counter block = 01 | tracker ID (2) | sequence (1) | fix time (4) | 00 × 8
keystream     = AES-128-Encrypt(K_enc, counter block)
ciphertext    = plaintext XOR first 14 bytes of keystream
```

**Authenticate:** `tag = first 4 bytes of AES-CMAC(K_mac, bytes 0 to 21)` (CMAC as in RFC 4493), written to bytes 22 to 25.

A receiver checks the tag first, in constant time, and drops the packet if it doesn't match. Only then does it decrypt.

**Why encrypt:** positions are public anyway, but only after the event's spectator delay. Without encryption, anyone near the course with a $20 LoRa board could decode every boat's position in real time and relay it to a competitor, which is exactly what the delay is there to prevent (Racing Rules of Sailing rule 41). Encryption costs no extra airtime.

**What the 4-byte tag gives:** a forger has a 1 in 4.3 billion chance per attempt, and the radio can only carry a few hundred attempts a minute. Replayed packets carry an old time and a sequence number the server has already seen, so they're dropped as duplicates.

## 5. Timing (informative)

- Cycle: 2.0 s, starting on even GPS seconds (UTC seconds divisible by 2).
- Slot length: 40 ms. Slot 0 is the gateway beacon; a tracker with slot *n* starts transmitting *n* × 40 ms after the cycle starts.
- The PPS pulse from the GPS marks the second boundary, so all trackers agree to within microseconds.
- A position packet is about 30.8 ms on air, leaving about 9 ms of guard time per slot.

## 6. Next (Phase H2, not final)

- **Beacon (type 2):** gateway ID, cycle length, slot length, race state (e.g. seconds to start for trackers with a screen), authenticated with the club key. Lets trackers check they're in the right place, and later allows slots to be assigned per race.
- **Gateway to phone (Bluetooth LE):** each received packet is forwarded unchanged with the gateway's receive time, RSSI and SNR. The phone uploads the raw packets so the server can verify tags itself; the phone only decrypts for its own map display.
- **Upload to the TMTRAC server:** the rebuild plan's `positions` message gains an optional `raw` field (base64 packet + RSSI + SNR + gateway ID) for fast trackers. `toServerFix()` in the TypeScript package produces the decoded fields in the existing shape.
