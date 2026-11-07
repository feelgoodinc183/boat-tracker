# TMTRAC radio protocol

The packet format fast trackers send over LoRa, with reference code for both ends:

| Folder | What | Used by |
|---|---|---|
| [SPEC.md](SPEC.md) | The format: radio settings, position packet, encryption, timing | Everyone |
| `c/` | C99 encoder and decoder, no heap or platform calls | Tracker and gateway firmware |
| `ts/` | TypeScript package `@tmtrac/protocol`, no runtime dependencies | TMTRAC server and the Capacitor app |
| `test-vectors/` | Packets both implementations must produce and accept | Both test suites |

## Position packet at a glance

26 bytes, about 30.8 ms on air at SF7 / 250 kHz. Tracker ID, sequence and GPS time travel in the clear; position, speed, course, battery and flags are encrypted with the club key; a 4-byte tag stops forged or damaged packets.

## TypeScript

```ts
import { deriveClubKeys, decodePosition, readHeader, toServerFix } from '@tmtrac/protocol';

const header = readHeader(packet);                  // tracker ID, sequence, time: no key needed
const keys = deriveClubKeys(clubKeyForTracker(header.trackerId));
const fix = decodePosition(packet, keys);           // throws ProtocolError on a bad tag or values
send({ type: 'positions', trackerId: fix.trackerId, fixes: [toServerFix(fix)] });
```

```sh
cd ts
npm install
npm test               # crypto against FIPS-197, RFC 4493, Node and OpenSSL; packets; shared vectors
npm run typecheck
npm run build          # dist/ for publishing
npm run vectors        # regenerate test-vectors/ and c/test/test_vectors.h after a format change
```

Needs Node 22.18 or later (runs the `.ts` sources directly).

## C

```c
#include "tmtrac_protocol.h"

static tmtrac_keys_t keys;
tmtrac_keys_init(&keys, club_key);                 // once at boot

tmtrac_position_t pos = {
    .tracker_id = 7, .seq = seq++, .time_ds = gps_time_ds,
    .lat_e7 = lat, .lon_e7 = lon, .sog_ckn = sog, .cog_cdeg = cog,
    .battery = pct, .flags = TMTRAC_FLAGS(TMTRAC_FIX_3D, 0, hdop_bucket),
};
uint8_t packet[TMTRAC_POSITION_LEN];
if (tmtrac_position_encode(&keys, &pos, packet) == TMTRAC_OK) radio_send(packet, sizeof packet);
```

```sh
cd c
make test        # strict warnings as errors
make sanitize    # same tests with address and undefined-behaviour sanitizers
```

## Changing the format

1. Update SPEC.md first.
2. Change both implementations.
3. Run `npm run vectors` in `ts/`, then both test suites.
4. A change that old trackers can't read needs a new protocol version number, not an edit to version 1.
