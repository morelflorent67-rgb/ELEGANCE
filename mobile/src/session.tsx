import Constants from "expo-constants";
import * as SecureStore from "expo-secure-store";
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { createApiClient, type ApiClient } from "@/api/client";
import type { BookingState, Customer, SessionResponse } from "@/api/types";

// Session du client : le jeton vit dans le trousseau de l'iPhone (expo-secure-store), jamais ailleurs. Le serveur fait
// foi : un jeton expiré ou refusé efface la session, l'écran qui en dépend propose alors la connexion.

const TOKEN_KEY = "elegance.session.token";

export const API_BASE_URL: string =
  process.env.EXPO_PUBLIC_API_BASE_URL ??
  (Constants.expoConfig?.extra?.apiBaseUrl as string | undefined) ??
  "https://elegance-strasbourg.fr";

interface SessionValue {
  /** Faux tant qu'on n'a pas lu le trousseau et demandé « qui suis-je » au serveur. */
  ready: boolean;
  customer: Customer | null;
  booking: BookingState | null;
  api: ApiClient;
  signIn: (response: SessionResponse) => Promise<void>;
  signOut: () => Promise<void>;
  setCustomer: (customer: Customer) => void;
}

const SessionContext = createContext<SessionValue | null>(null);

export function SessionProvider({ children }: { children: ReactNode }) {
  const tokenRef = useRef<string | null>(null);
  const [ready, setReady] = useState(false);
  const [customer, setCustomer] = useState<Customer | null>(null);
  const [booking, setBooking] = useState<BookingState | null>(null);

  const forget = useCallback(async () => {
    tokenRef.current = null;
    setCustomer(null);
    setBooking(null);
    await SecureStore.deleteItemAsync(TOKEN_KEY).catch(() => {});
  }, []);

  const forgetRef = useRef(forget);
  forgetRef.current = forget;

  const api = useMemo(
    () =>
      createApiClient({
        baseUrl: API_BASE_URL,
        getToken: () => tokenRef.current,
        onSessionExpired: () => {
          void forgetRef.current();
        },
      }),
    [],
  );

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const stored = await SecureStore.getItemAsync(TOKEN_KEY).catch(() => null);
      if (stored) {
        tokenRef.current = stored;
        try {
          const me = await api.get<{ customer: Customer; booking: BookingState }>("/me");
          if (!cancelled) {
            setCustomer(me.customer);
            setBooking(me.booking);
          }
        } catch {
          // Session refusée : déjà oubliée par onSessionExpired. Pas de réseau : le jeton est gardé, la connexion se
          // refera au prochain appel réussi.
        }
      }
      if (!cancelled) setReady(true);
    })();
    return () => {
      cancelled = true;
    };
  }, [api]);

  const signIn = useCallback(async (response: SessionResponse) => {
    tokenRef.current = response.token;
    await SecureStore.setItemAsync(TOKEN_KEY, response.token);
    setCustomer(response.customer);
    setBooking(response.booking);
  }, []);

  const signOut = useCallback(async () => {
    try {
      await api.post("/auth/logout");
    } catch {
      // Hors ligne : le jeton local est effacé quand même ; il expirera côté serveur.
    }
    await forget();
  }, [api, forget]);

  const value = useMemo<SessionValue>(
    () => ({ ready, customer, booking, api, signIn, signOut, setCustomer }),
    [ready, customer, booking, api, signIn, signOut],
  );
  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}

export function useSession(): SessionValue {
  const value = useContext(SessionContext);
  if (!value) throw new Error("useSession doit être appelé sous SessionProvider");
  return value;
}
