import os

# Variables mínimas antes de importar la app (la DB no se toca: no se ejecuta el lifespan)
os.environ.setdefault("APP_ADMIN_EMAIL", "tendero@tienda.local")
os.environ.setdefault("APP_ADMIN_PASSWORD", "clave_de_prueba")
os.environ.setdefault("JWT_SECRET", "secreto_de_prueba_largo_largo_largo")
os.environ.setdefault("DATABASE_URL", "postgresql://tienda:tienda@localhost:5432/tienda")
os.environ.setdefault("FACTUS_MODE", "fake")
os.environ.setdefault("FACTUS_PAY_WEBHOOK_KEY", "llave_de_prueba_de_32_caracteres_o_mas")
