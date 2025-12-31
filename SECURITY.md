# Security Policy

## ⚠️ Disclaimer

This is an **educational project** demonstrating end-to-end encryption concepts. While the cryptographic implementations are sound, this has not undergone professional security auditing and should not be used for highly sensitive communications without additional hardening.

## Supported Versions

| Version | Supported          |
| ------- | ------------------ |
| 1.x     | :white_check_mark: |

## Cryptographic Details

### Algorithms Used

- **RSA-OAEP** (2048-bit) - Asymmetric encryption for key exchange
- **AES-256-GCM** - Symmetric encryption for messages
- **PBKDF2** (SHA-256, 100k iterations) - Key derivation
- **SHA-256** - Hashing for user IDs

### Implementation

All cryptography uses the **Web Crypto API** - no external libraries. This ensures:

- Browser-native, hardware-accelerated crypto
- Well-audited implementations
- No supply chain risk from third-party packages

## Known Limitations

### No Forward Secrecy

This implementation uses static RSA keys. If a private key is compromised, all past messages could be decrypted. A production system should implement the Double Ratchet algorithm (as used by Signal).

### Client-Side Key Storage

Private keys are stored in browser `localStorage`. This means:

- Keys are accessible to JavaScript on the same origin
- Keys persist until cleared
- Browser extensions could potentially access keys

Recommendations:
- Use a dedicated browser profile
- Enable full-disk encryption on your device
- Consider using a hardware security module for production

### Server Trust

Users must trust that the server serves unmodified JavaScript. A malicious server operator could serve modified code that exfiltrates keys. Mitigations:

- Self-host your own instance
- Use browser extensions like [Subresource Integrity](https://developer.mozilla.org/en-US/docs/Web/Security/Subresource_Integrity)
- Implement code signing and verification

## Reporting a Vulnerability

If you discover a security vulnerability, please:

1. **Do NOT** open a public issue
2. Email details to [your-email@example.com]
3. Include:
   - Description of the vulnerability
   - Steps to reproduce
   - Potential impact
   - Suggested fix (if any)

We aim to respond within 48 hours and will work with you on responsible disclosure.

## Security Best Practices for Users

1. **Save your recovery key** - Write it down physically, don't store digitally
2. **Verify contacts** - Use safety numbers for sensitive conversations
3. **Use HTTPS** - Never use this over plain HTTP
4. **Keep software updated** - Both browser and OS
5. **Enable device encryption** - Protects localStorage at rest

## Audit Status

This project has **not** been professionally audited. The cryptographic approach is based on well-established patterns, but implementation bugs may exist.

Community code review is welcome and encouraged.
