from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    """Configuración leída de variables de entorno (ver .env.example)."""

    # env_ignore_empty: una variable vacía en .env (p. ej. FACTUS_RANGO_NC=) cuenta como no definida
    model_config = SettingsConfigDict(extra="ignore", env_ignore_empty=True)

    app_env: str = "dev"
    app_admin_email: str
    app_admin_password: str
    jwt_secret: str
    database_url: str
    reference_prefix: str = "TFXX"

    factus_mode: str = "fake"  # fake | real
    factus_base_url: str = "https://api-sandbox.factus.com.co"
    factus_client_id: str = ""
    factus_client_secret: str = ""
    factus_username: str = ""
    factus_password: str = ""

    factus_pay_base_url: str = "https://pay-api-sandbox.factus.com.co"
    factus_pay_email: str = ""
    factus_pay_password: str = ""
    factus_pay_webhook_key: str = ""
    # Límites de monto de Factus Pay, enteros COP (verificados en el sandbox)
    pay_min_amount: int = 10_000
    pay_max_amount: int = 12_000_000

    # Fuerzan el rango de numeración por documento; si no se definen se elige uno desde listar_rangos()
    factus_rango_factura: int | None = None
    factus_rango_nc: int | None = None
    factus_rango_nd: int | None = None

    llm_provider: str = "gemini"
    llm_api_key: str = ""

    cors_origins: str = "http://localhost:3000"

    @property
    def sqlalchemy_url(self) -> str:
        """URL con el driver psycopg (v3) que usa SQLAlchemy."""
        url = self.database_url
        if url.startswith("postgresql://"):
            return url.replace("postgresql://", "postgresql+psycopg://", 1)
        return url


settings = Settings()
