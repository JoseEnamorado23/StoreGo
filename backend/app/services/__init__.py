"""Punto único de acceso a Factus: `pay` y `facturacion`.

Según FACTUS_MODE apuntan a la versión real o a las falsas (fakes.py).
El resto del código usa siempre `from app.services import pay, facturacion`.
"""

from app.config import settings

if settings.factus_mode == "real":
    from app.services import factus_facturacion as facturacion
    from app.services import factus_pay as pay
else:
    from app.services import fakes as facturacion
    from app.services import fakes as pay

__all__ = ["pay", "facturacion"]
