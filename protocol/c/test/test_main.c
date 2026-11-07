#include <stdio.h>
#include <string.h>

#include "test_vectors.h"
#include "tmtrac_protocol.h"

static int failures = 0;

#define CHECK(cond, ...)                         \
    do {                                         \
        if (!(cond)) {                           \
            failures++;                          \
            printf("FAIL %s:%d: ", __FILE__, __LINE__); \
            printf(__VA_ARGS__);                 \
            printf("\n");                        \
        }                                        \
    } while (0)

static void from_hex(const char *hex, uint8_t *out)
{
    for (size_t i = 0; hex[2 * i]; i++) {
        unsigned v;
        sscanf(hex + 2 * i, "%2x", &v);
        out[i] = (uint8_t)v;
    }
}

static int same_position(const tmtrac_position_t *a, const tmtrac_position_t *b)
{
    return a->tracker_id == b->tracker_id && a->seq == b->seq && a->time_ds == b->time_ds &&
           a->lat_e7 == b->lat_e7 && a->lon_e7 == b->lon_e7 && a->sog_ckn == b->sog_ckn &&
           a->cog_cdeg == b->cog_cdeg && a->battery == b->battery && a->flags == b->flags;
}

static void test_aes_fips197(void)
{
    uint8_t key[16], pt[16], expected[16], rk[176], ct[16];
    from_hex("000102030405060708090a0b0c0d0e0f", key);
    from_hex("00112233445566778899aabbccddeeff", pt);
    from_hex("69c4e0d86a7b0430d8cdb78070b4c55a", expected);
    tmtrac_aes128_expand(key, rk);
    tmtrac_aes128_encrypt(rk, pt, ct);
    CHECK(memcmp(ct, expected, 16) == 0, "AES-128 FIPS-197 example");
}

static void test_cmac_rfc4493(void)
{
    uint8_t key[16], msg[64], rk[176], tag[16], expected[16];
    from_hex("2b7e151628aed2a6abf7158809cf4f3c", key);
    from_hex("6bc1bee22e409f96e93d7e117393172aae2d8a571e03ac9c9eb76fac45af8e51"
             "30c81c46a35ce411e5fbc1191a0a52eff69f2445df4f9b17ad2b417be66c3710",
             msg);
    tmtrac_aes128_expand(key, rk);

    const struct {
        size_t len;
        const char *tag;
    } cases[] = {
        {0, "bb1d6929e95937287fa37d129b756746"},
        {16, "070a16b46b4d4144f79bdd9dd04a287c"},
        {40, "dfa66747de9ae63030ca32611497c827"},
        {64, "51f0bebf7e3b9d92fc49741779363cfe"},
    };
    for (size_t i = 0; i < sizeof cases / sizeof cases[0]; i++) {
        from_hex(cases[i].tag, expected);
        tmtrac_aes_cmac(rk, msg, cases[i].len, tag);
        CHECK(memcmp(tag, expected, 16) == 0, "AES-CMAC RFC 4493, message length %zu", cases[i].len);
    }
}

static void test_valid_vectors(void)
{
    for (size_t i = 0; i < sizeof VALID_VECTORS / sizeof VALID_VECTORS[0]; i++) {
        const valid_vector_t *v = &VALID_VECTORS[i];
        tmtrac_keys_t keys;
        tmtrac_keys_init(&keys, v->club_key);

        tmtrac_position_t decoded;
        int rc = tmtrac_position_decode(&keys, v->packet, TMTRAC_POSITION_LEN, &decoded);
        CHECK(rc == TMTRAC_OK, "decode '%s' returned %d", v->name, rc);
        CHECK(rc != TMTRAC_OK || same_position(&decoded, &v->expected), "decode '%s' fields differ", v->name);

        uint8_t packet[TMTRAC_POSITION_LEN];
        rc = tmtrac_position_encode(&keys, &v->expected, packet);
        CHECK(rc == TMTRAC_OK, "encode '%s' returned %d", v->name, rc);
        CHECK(memcmp(packet, v->packet, TMTRAC_POSITION_LEN) == 0, "encode '%s' bytes differ", v->name);
    }
}

static void test_invalid_vectors(void)
{
    for (size_t i = 0; i < sizeof INVALID_VECTORS / sizeof INVALID_VECTORS[0]; i++) {
        const invalid_vector_t *v = &INVALID_VECTORS[i];
        tmtrac_keys_t keys;
        tmtrac_keys_init(&keys, v->club_key);

        tmtrac_position_t out;
        memset(&out, 0xAB, sizeof out);
        tmtrac_position_t untouched = out;
        int rc = tmtrac_position_decode(&keys, v->packet, v->len, &out);
        CHECK(rc == v->expected_error, "'%s' returned %d, expected %d", v->name, rc, v->expected_error);
        CHECK(memcmp(&out, &untouched, sizeof out) == 0, "'%s' wrote to the output on failure", v->name);
    }
}

static void test_encode_rejects_out_of_range(void)
{
    tmtrac_keys_t keys;
    tmtrac_keys_init(&keys, VALID_VECTORS[0].club_key);
    uint8_t packet[TMTRAC_POSITION_LEN];

    tmtrac_position_t pos = VALID_VECTORS[0].expected;
    pos.tracker_id = 0;
    CHECK(tmtrac_position_encode(&keys, &pos, packet) == TMTRAC_ERR_RANGE, "tracker ID 0");
    pos.tracker_id = 0xFFFF;
    CHECK(tmtrac_position_encode(&keys, &pos, packet) == TMTRAC_ERR_RANGE, "tracker ID 65535");

    pos = VALID_VECTORS[0].expected;
    pos.lat_e7 = 900000001;
    CHECK(tmtrac_position_encode(&keys, &pos, packet) == TMTRAC_ERR_RANGE, "latitude above 90");

    pos = VALID_VECTORS[0].expected;
    pos.lon_e7 = -1800000001;
    CHECK(tmtrac_position_encode(&keys, &pos, packet) == TMTRAC_ERR_RANGE, "longitude below -180");

    pos = VALID_VECTORS[0].expected;
    pos.cog_cdeg = 36000;
    CHECK(tmtrac_position_encode(&keys, &pos, packet) == TMTRAC_ERR_RANGE, "course 360.00");

    pos = VALID_VECTORS[0].expected;
    pos.battery = 101 | TMTRAC_BATTERY_CHARGING;
    CHECK(tmtrac_position_encode(&keys, &pos, packet) == TMTRAC_ERR_RANGE, "battery 101 while charging");
}

int main(void)
{
    test_aes_fips197();
    test_cmac_rfc4493();
    test_valid_vectors();
    test_invalid_vectors();
    test_encode_rejects_out_of_range();

    if (failures) {
        printf("%d check(s) failed\n", failures);
        return 1;
    }
    printf("All C protocol checks passed: AES, CMAC, %zu valid and %zu invalid packet vectors, encode range checks.\n",
           sizeof VALID_VECTORS / sizeof VALID_VECTORS[0], sizeof INVALID_VECTORS / sizeof INVALID_VECTORS[0]);
    return 0;
}
