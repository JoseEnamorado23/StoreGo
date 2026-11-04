import ssl

import httpx


def cliente(base_url: str) -> httpx.AsyncClient:
    """AsyncClient para Factus. Usa el almacén de certificados del sistema si `truststore`
    está disponible (necesario tras un proxy o antivirus que re-firma HTTPS); la verificación
    TLS sigue activa."""
    try:
        import truststore

        verify: ssl.SSLContext | bool = truststore.SSLContext(ssl.PROTOCOL_TLS_CLIENT)
    except ImportError:
        verify = True
    return httpx.AsyncClient(base_url=base_url, timeout=30, verify=verify, headers={"Accept": "application/json"})
