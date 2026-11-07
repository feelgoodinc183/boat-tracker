/*
 * TMTRAC radio protocol, version 1 (see protocol/SPEC.md).
 *
 * Portable C99: no heap, no platform calls. Builds unchanged for the
 * nRF52840 (T-Echo), the ESP32-S3 (Heltec V4) and a PC for the tests.
 * Values are in their on-air units (degrees x 1e7, hundredths of a knot and
 * so on) so firmware can fill the struct straight from the GPS parser.
 */
#ifndef TMTRAC_PROTOCOL_H
#define TMTRAC_PROTOCOL_H

#include <stddef.h>
#include <stdint.h>

#ifdef __cplusplus
extern "C" {
#endif

#define TMTRAC_PROTOCOL_VERSION 1
#define TMTRAC_TYPE_POSITION 1
#define TMTRAC_POSITION_LEN 26

/* Unix time of 2025-01-01T00:00:00Z: the zero point of time_ds. */
#define TMTRAC_EPOCH_UNIX 1735689600UL

#define TMTRAC_COG_UNKNOWN 0xFFFFu
#define TMTRAC_BATTERY_UNKNOWN 127u
#define TMTRAC_BATTERY_CHARGING 0x80u

/* Flags byte. */
#define TMTRAC_FIX_NONE 0u
#define TMTRAC_FIX_2D 1u
#define TMTRAC_FIX_3D 2u
#define TMTRAC_FIX_3D_DGPS 3u
#define TMTRAC_FLAG_LOW_BATTERY 0x04u
#define TMTRAC_FLAG_BUTTON 0x08u
#define TMTRAC_FLAGS(fix, extra, hdop_bucket) \
    ((uint8_t)(((fix) & 0x03u) | (extra) | (((hdop_bucket) & 0x0Fu) << 4)))

/* Results. */
#define TMTRAC_OK 0
#define TMTRAC_ERR_LENGTH (-1)
#define TMTRAC_ERR_VERSION (-2)
#define TMTRAC_ERR_TYPE (-3)
#define TMTRAC_ERR_AUTH (-4)
#define TMTRAC_ERR_RANGE (-5)

typedef struct {
    uint16_t tracker_id; /* 1 to 65534 */
    uint8_t seq;         /* +1 per packet, wraps */
    uint32_t time_ds;    /* tenths of a second since TMTRAC_EPOCH_UNIX */
    int32_t lat_e7;      /* degrees x 1e7 */
    int32_t lon_e7;      /* degrees x 1e7 */
    uint16_t sog_ckn;    /* hundredths of a knot */
    uint16_t cog_cdeg;   /* hundredths of a degree, 0 to 35999, or TMTRAC_COG_UNKNOWN */
    uint8_t battery;     /* percent 0 to 100 or TMTRAC_BATTERY_UNKNOWN, | TMTRAC_BATTERY_CHARGING */
    uint8_t flags;       /* TMTRAC_FLAGS(...) */
} tmtrac_position_t;

/* Expanded AES-128 round keys for the two keys derived from a club key. */
typedef struct {
    uint8_t enc[176];
    uint8_t mac[176];
} tmtrac_keys_t;

/* AES-128 encryption of one block (FIPS-197). */
void tmtrac_aes128_expand(const uint8_t key[16], uint8_t round_keys[176]);
void tmtrac_aes128_encrypt(const uint8_t round_keys[176], const uint8_t in[16], uint8_t out[16]);

/* Full 16-byte AES-CMAC (RFC 4493). */
void tmtrac_aes_cmac(const uint8_t round_keys[176], const uint8_t *msg, size_t len, uint8_t tag[16]);

/*
 * Derives the working keys from a 16-byte club key. Call once at boot, before
 * any other task uses this library: the first call also builds the shared AES
 * S-box, which is not thread-safe.
 */
void tmtrac_keys_init(tmtrac_keys_t *keys, const uint8_t club_key[16]);

/*
 * Builds an encrypted, authenticated packet in out[TMTRAC_POSITION_LEN].
 * Returns TMTRAC_ERR_RANGE (and writes nothing) if a field is out of range.
 * Only call once GPS has given a valid time (SPEC.md section 3).
 */
int tmtrac_position_encode(const tmtrac_keys_t *keys, const tmtrac_position_t *pos, uint8_t out[TMTRAC_POSITION_LEN]);

/* Checks the tag, then decrypts and range-checks. *out is only written on TMTRAC_OK. */
int tmtrac_position_decode(const tmtrac_keys_t *keys, const uint8_t *packet, size_t len, tmtrac_position_t *out);

#ifdef __cplusplus
}
#endif

#endif
