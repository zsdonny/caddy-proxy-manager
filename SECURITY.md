# Security Policy

## Supported Versions

We release patches for security vulnerabilities for the following versions:

| Version | Supported          |
| ------- | ------------------ |
| latest  | :white_check_mark: |
| < 1.0   | :x:                |

## Reporting a Vulnerability

If you discover a security vulnerability, please report it by:

1. **DO NOT** open a public issue
2. Email the maintainers or use GitHub's private vulnerability reporting
3. Include detailed information about the vulnerability:
   - Type of vulnerability
   - Steps to reproduce
   - Potential impact
   - Suggested fix (if any)

We will respond within 48 hours and provide regular updates on the fix progress.

## Security Measures

### Build Pipeline Security

Our CI/CD pipeline implements multiple security layers:

1. **SBOM Generation**: Software Bill of Materials is generated for all builds
2. **Provenance Attestation**: Build provenance is recorded for supply chain security
3. **Limited Permissions**: Workflows use minimal required permissions

### Container Security

- Verified amd64 and arm64 image builds
- Regular base image updates
- Minimal attack surface
- Non-root user execution where possible

### Dependency Management

- Regular security audits
- Manual dependency updates as needed

## Security Best Practices for Contributors

When contributing:

1. Never commit secrets, tokens, or credentials
2. Use environment variables for sensitive configuration
3. Keep dependencies up to date
4. Follow principle of least privilege
5. Validate and sanitize all user inputs
6. Use parameterized queries for database operations

## Automated Security Checks

Our repository includes:

- **GitHub Secret Scanning** for credential leak detection
- **GitHub Security Advisories** monitoring

## Security Updates

Security updates are prioritized and released as soon as possible. Subscribe to repository releases to stay informed.
