import { strict as assert } from 'node:assert';
import { execFileSync } from 'node:child_process';
import { createCipheriv, randomBytes } from 'node:crypto';
import { test } from 'node:test';
import { aes128, aesCmac } from '../src/index.ts';

const h = (text: string): Uint8Array => Uint8Array.from(Buffer.from(text.replace(/\s/g, ''), 'hex'));
const x = (bytes: Uint8Array): string => Buffer.from(bytes).toString('hex');

function opensslCmac(key: Uint8Array, message: Uint8Array): string | null {
  try {
    const out = execFileSync('openssl', ['mac', '-cipher', 'AES-128-CBC', '-macopt', `hexkey:${x(key)}`, 'CMAC'], {
      input: message,
      stdio: ['pipe', 'pipe', 'ignore'],
    });
    return out.toString().trim().toLowerCase();
  } catch {
    return null;
  }
}

test('AES-128 matches the FIPS-197 appendix C.1 example', () => {
  const encrypt = aes128(h('000102030405060708090a0b0c0d0e0f'));
  assert.equal(x(encrypt(h('00112233445566778899aabbccddeeff'))), '69c4e0d86a7b0430d8cdb78070b4c55a');
});

test('AES-128 matches Node crypto on 500 random keys and blocks', () => {
  for (let i = 0; i < 500; i++) {
    const key = randomBytes(16);
    const block = randomBytes(16);
    const reference = createCipheriv('aes-128-ecb', key, null);
    reference.setAutoPadding(false);
    assert.equal(x(aes128(key)(block)), reference.update(block).toString('hex'));
  }
});

test('AES-128 rejects keys and blocks of the wrong size', () => {
  assert.throws(() => aes128(new Uint8Array(15)), RangeError);
  assert.throws(() => aes128(new Uint8Array(16))(new Uint8Array(17)), RangeError);
});

test('AES-CMAC matches the four RFC 4493 examples', () => {
  const encrypt = aes128(h('2b7e151628aed2a6abf7158809cf4f3c'));
  const message = h(`6bc1bee22e409f96e93d7e117393172a ae2d8a571e03ac9c9eb76fac45af8e51
                     30c81c46a35ce411e5fbc1191a0a52ef f69f2445df4f9b17ad2b417be66c3710`);
  const expected: [number, string][] = [
    [0, 'bb1d6929e95937287fa37d129b756746'],
    [16, '070a16b46b4d4144f79bdd9dd04a287c'],
    [40, 'dfa66747de9ae63030ca32611497c827'],
    [64, '51f0bebf7e3b9d92fc49741779363cfe'],
  ];
  for (const [length, tag] of expected) {
    assert.equal(x(aesCmac(encrypt, message.subarray(0, length))), tag, `message length ${length}`);
  }
});

test('AES-CMAC matches OpenSSL for every message length from 0 to 48', (t) => {
  const key = randomBytes(16);
  if (opensslCmac(key, new Uint8Array(0)) === null) {
    t.skip('openssl with CMAC support is not installed');
    return;
  }
  const encrypt = aes128(key);
  for (let length = 0; length <= 48; length++) {
    const message = randomBytes(length);
    assert.equal(x(aesCmac(encrypt, message)), opensslCmac(key, message), `message length ${length}`);
  }
});
