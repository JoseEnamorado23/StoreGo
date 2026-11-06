// Login con Amazon Cognito (Authorization Code + PKCE) usando AWS Amplify Auth.
// Es independiente del login propio de StoreGo (lib/api.ts): este token solo sirve
// para las rutas protegidas de API Gateway (/api/subir y /api/archivos).
//
// Los valores de abajo NO son secretos (el App Client es de navegador, sin client secret).
// Se pueden cambiar con variables NEXT_PUBLIC_* sin tocar el código.

import { Amplify } from "aws-amplify";
import "aws-amplify/auth/enable-oauth-listener";
import { fetchAuthSession, signInWithRedirect, signOut } from "aws-amplify/auth";

export const COGNITO = {
  userPoolId: process.env.NEXT_PUBLIC_COGNITO_USER_POOL_ID ?? "us-east-1_RSRDPVghJ",
  clientId: process.env.NEXT_PUBLIC_COGNITO_CLIENT_ID ?? "1e335ajfq4lctjm5aqaacp7074",
  domain:
    process.env.NEXT_PUBLIC_COGNITO_DOMAIN ??
    "storego-enamorado.auth.us-east-1.amazoncognito.com",
};

// API Gateway HTTP API (api-s3-privado-ucc). No es la IP de EC2 ni el dominio de CloudFront.
export const FILES_API_URL =
  process.env.NEXT_PUBLIC_FILES_API_URL ??
  "https://cfieaqvbj5.execute-api.us-east-1.amazonaws.com";

let configurado = false;

export function configurarCognito(): void {
  if (configurado || typeof window === "undefined") return;
  // El callback y el logout deben coincidir EXACTAMENTE con los registrados en Cognito:
  // la raíz del sitio con "/" final (ej. https://xxxx.cloudfront.net/).
  const raiz = `${window.location.origin}/`;
  Amplify.configure({
    Auth: {
      Cognito: {
        userPoolId: COGNITO.userPoolId,
        userPoolClientId: COGNITO.clientId,
        loginWith: {
          oauth: {
            domain: COGNITO.domain,
            scopes: ["openid", "email"],
            redirectSignIn: [raiz],
            redirectSignOut: [raiz],
            responseType: "code",
          },
        },
      },
    },
  });
  configurado = true;
}

export async function iniciarSesionCognito(): Promise<void> {
  configurarCognito();
  await signInWithRedirect();
}

export async function cerrarSesionCognito(): Promise<void> {
  configurarCognito();
  await signOut();
}

/** Access token vigente (Amplify lo renueva con el refresh token), o null si no hay sesión. */
export async function obtenerAccessToken(): Promise<string | null> {
  configurarCognito();
  try {
    const sesion = await fetchAuthSession();
    return sesion.tokens?.accessToken?.toString() ?? null;
  } catch {
    return null;
  }
}
