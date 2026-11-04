import ssl

import httpx

# Cloudflare (delante de Factus) responde 403 / error 1010 al User-Agent por defecto de httpx.
USER_AGENT = "TiendaFacil/1.0 (+https://54-209-92-85.sslip.io)"
CABECERAS = {"User-Agent": USER_AGENT, "Accept": "application/json"}


def cliente(base_url: str, transport: httpx.AsyncBaseTransport | None = None) -> httpx.AsyncClient:
    """AsyncClient para Factus. Usa el almacén de certificados del sistema si `truststore`
    está disponible (necesario tras un proxy o antivirus que re-firma HTTPS); la verificación
    TLS sigue activa."""
    try:
        import truststore

        verify: ssl.SSLContext | bool = truststore.SSLContext(ssl.PROTOCOL_TLS_CLIENT)
    except ImportError:
        verify = True
    return httpx.AsyncClient(base_url=base_url, timeout=30, verify=verify, headers=CABECERAS, transport=transport)
