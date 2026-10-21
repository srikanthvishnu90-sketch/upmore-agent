#!/bin/sh
# Operator wrapper (throughput lane, 2026-10-21). Measured on this host:
# - Chromium ignores env proxy vars and cannot CONNECT to the egress proxy
#   directly (ERR_TUNNEL_CONNECTION_FAILED); a minimal re-issued CONNECT via
#   the local relay (127.0.0.1:8474) is accepted -> --proxy-server flag.
# - The host egress TLS-intercepts; Chromium temp profiles carry no trust
#   for the egress CA (ERR_CERT_AUTHORITY_INVALID) -> --ignore-certificate-errors,
#   the same posture as the proven ci-browse pattern on this host.
# Flags are appended AFTER Playwright args so they win switch parsing.
exec /home/hatch/.cache/ms-playwright/chromium-1243/chrome-linux/chrome "$@" --proxy-server=http://127.0.0.1:8474 --ignore-certificate-errors
