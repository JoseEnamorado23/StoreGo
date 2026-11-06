"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { Hub } from "aws-amplify/utils";
import { configurarCognito } from "@/lib/cognito";

// Configura Amplify una sola vez y, cuando Cognito devuelve al usuario al sitio con ?code=...
// (Amplify canjea el code por tokens), lo lleva a la página de archivos.
export default function CognitoProvider({ children }: { children: React.ReactNode }) {
  const router = useRouter();

  useEffect(() => {
    configurarCognito();
    const cancelar = Hub.listen("auth", ({ payload }) => {
      if (payload.event === "signInWithRedirect") router.replace("/archivos");
    });
    return cancelar;
  }, [router]);

  return <>{children}</>;
}
