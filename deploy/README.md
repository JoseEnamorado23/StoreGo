# Despliegue en EC2 (Amazon Linux 2023)

Servidor: t3.small (2 GB RAM), usuario `ec2-user`, puertos 22/80/443 abiertos, Docker + Compose + git instalados.
Dominio: `54-209-92-85.sslip.io` (apunta a la IP del servidor). Caddy saca el certificado HTTPS solo.

Arquitectura: `caddy` (80/443) → `/api/*` al `backend:8000`, el resto al `frontend:3000`. `db` (Postgres 16) no publica ningún puerto.

## 0. Una sola vez: swap (recomendado)

El build de Next.js puede acercarse a los 2 GB. El Dockerfile limita Node a 1536 MB, pero conviene tener swap de respaldo:

```bash
sudo dd if=/dev/zero of=/swapfile bs=1M count=2048
sudo chmod 600 /swapfile && sudo mkswap /swapfile && sudo swapon /swapfile
echo '/swapfile none swap sw 0 0' | sudo tee -a /etc/fstab
free -h
```

## 1. Código

```bash
cd ~
git clone https://github.com/JoseEnamorado23/tienda-facil.git   # solo la primera vez
cd ~/tienda-facil && git pull
```

## 2. Crear `deploy/.env`

```bash
cp deploy/.env.example deploy/.env
nano deploy/.env        # Ctrl+O, Enter, Ctrl+X para guardar
chmod 600 deploy/.env
```

Qué cambiar (todo lo demás tiene valor por defecto razonable):

- `POSTGRES_PASSWORD`, `APP_ADMIN_PASSWORD`: claves propias.
- `JWT_SECRET`: `openssl rand -hex 32`.
- `FACTUS_PAY_WEBHOOK_KEY`: `openssl rand -hex 24`.
- `REFERENCE_PREFIX`: el prefijo único de tu equipo.
- `FACTUS_MODE`: empieza en `fake`. Para pasar a `real`, rellena las credenciales `FACTUS_*` y `FACTUS_PAY_*`.
- `LLM_API_KEY` (si usas voz con IA).
- `DOMAIN` ya viene con `54-209-92-85.sslip.io`.

`NEXT_PUBLIC_API_URL` y `CORS_ORIGINS` se derivan de `DOMAIN`; no los pongas a mano.

### ¿El seed sigue activo en la demo?

El seed (15 productos de ejemplo) **solo corre con `APP_ENV=dev`**. Es idempotente: crea los productos que falten por código y no toca los existentes, pero si borras uno vuelve a aparecer al reiniciar. Recomendación: `APP_ENV=dev` en el primer arranque para tener catálogo en la demo; después cambia a `APP_ENV=prod` y reinicia el backend si no quieres que se repongan. Con `prod` la base arranca vacía.

## 3. Levantar

```bash
cd ~/tienda-facil
docker compose -f deploy/docker-compose.prod.yml up -d --build
```

El primer build tarda varios minutos (Next.js). Ver estado y logs:

```bash
docker compose -f deploy/docker-compose.prod.yml ps
docker compose -f deploy/docker-compose.prod.yml logs -f backend
docker compose -f deploy/docker-compose.prod.yml logs -f caddy
```

## 4. Verificar

```bash
curl -s https://54-209-92-85.sslip.io/api/health      # {"status":"ok","factus_mode":"fake"}
```

Y abre https://54-209-92-85.sslip.io en el navegador. Si el certificado tarda, revisa `logs caddy` (el dominio debe resolver a la IP y los puertos 80/443 estar abiertos).

## 5. Reiniciar y actualizar

```bash
cd ~/tienda-facil
git pull
docker compose -f deploy/docker-compose.prod.yml up -d --build   # reconstruye lo que cambió
docker compose -f deploy/docker-compose.prod.yml restart backend # solo reiniciar
docker compose -f deploy/docker-compose.prod.yml down            # parar (conserva los datos)
```

- Cambiar una variable del backend en `deploy/.env` → `up -d` basta (recrea el contenedor).
- Cambiar `DOMAIN` → `up -d --build` (el frontend lo lleva incrustado).
- **No** uses `down -v`: borraría la base de datos (`pgdata`) y los certificados (`caddy_data`).
- Limpiar imágenes viejas si se llena el disco: `docker image prune -f`.

## 6. Webhook de Factus Pay

1. En el panel de Factus Pay, sección **Webhook**, registra:

   ```
   https://54-209-92-85.sslip.io/api/webhooks/factus-pay?key=LLAVE
   ```

   donde `LLAVE` es exactamente el valor de `FACTUS_PAY_WEBHOOK_KEY` de `deploy/.env` (sin comillas).
2. Prueba (requiere `FACTUS_MODE=real`): crea una venta digital en la app, abre el simulador https://pay-api-sandbox.factus.com.co/simulator y paga el recaudo.
3. Comprueba que llegó:

   ```bash
   docker compose -f deploy/docker-compose.prod.yml exec db \
     psql -U tienda -d tienda -c "select id, reference_code, procesado_at, created_at from webhook_eventos order by id desc limit 5;"
   ```

   `procesado_at` con fecha = el backend ya lo procesó. La venta debe pasar a pagada y emitirse la factura.
4. Llave incorrecta → el backend responde 401 y no guarda evento. Prueba rápida sin la llave real:
   `curl -i -X POST "https://54-209-92-85.sslip.io/api/webhooks/factus-pay?key=mala" -d '{}' -H 'Content-Type: application/json'` → `401`.

### La llave no se escribe en los logs

- **uvicorn** corre con `--no-access-log` (su log de acceso imprimiría la URL con `?key=`). Por eso en los logs del backend no verás una línea por cada petición; los fallos del procesamiento sí aparecen como `WARNING`/`ERROR`.
- **Caddy** registra los accesos en JSON pero reemplaza el parámetro `key` por `REDACTED`. Puedes ver llegar el webhook con:
  `docker compose -f deploy/docker-compose.prod.yml logs caddy | grep factus-pay`
- Evita pegar la URL completa con la llave en chats o capturas.
