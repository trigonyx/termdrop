import crypto from 'node:crypto';

const TAG_LEN = 16;

/**
 * ChaCha20-Poly1305 with a counter nonce. Each direction has its own key, so a nonce
 * is never reused; reordered, replayed or tampered frames fail authentication.
 */
export class CipherState {
  private counter = 0n;

  constructor(private readonly key: Buffer) {
    if (key.length !== 32) throw new Error('Key must be 32 bytes');
  }

  private nextNonce(): Buffer {
    const nonce = Buffer.alloc(12);
    nonce.writeBigUInt64BE(this.counter, 4);
    this.counter++;
    return nonce;
  }

  encrypt(plain: Buffer): Buffer {
    const cipher = crypto.createCipheriv('chacha20-poly1305', this.key, this.nextNonce(), { authTagLength: TAG_LEN });
    const body = Buffer.concat([cipher.update(plain), cipher.final()]);
    return Buffer.concat([body, cipher.getAuthTag()]);
  }

  /** Throws if the frame is not authentic. */
  decrypt(frame: Buffer): Buffer {
    if (frame.length < TAG_LEN) throw new Error('Frame too short');
    const decipher = crypto.createDecipheriv('chacha20-poly1305', this.key, this.nextNonce(), {
      authTagLength: TAG_LEN,
    });
    decipher.setAuthTag(frame.subarray(frame.length - TAG_LEN));
    return Buffer.concat([decipher.update(frame.subarray(0, frame.length - TAG_LEN)), decipher.final()]);
  }
}
