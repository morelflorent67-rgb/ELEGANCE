import { router } from "expo-router";
import { useState } from "react";
import { Pressable, Switch, Text, View } from "react-native";
import { ApiError, messageOf } from "@/api/client";
import type { SessionResponse } from "@/api/types";
import { useSession } from "@/session";
import { colors, fonts, spacing } from "@/theme";
import { PHONE_FIELD } from "@/lib/phone-field";
import { Body, Button, ErrorText, Field, Muted, Row, Title } from "@/ui";

/**
 * Connexion et inscription (R-70, R-71), les mêmes comptes que le site. Utilisé par la fenêtre de connexion et par
 * l'étape « Votre compte » de la réservation (`step`), qui garde les titres du site : « Votre compte » / « Bon retour. ».
 */
export function AuthForm({
  initialMode,
  step,
  onDone,
}: {
  initialMode: "signup" | "login";
  step?: boolean;
  onDone: (response: SessionResponse) => void;
}) {
  const { api, signIn } = useSession();
  const [mode, setMode] = useState(initialMode);
  const register = mode === "signup";
  const [form, setForm] = useState({ firstName: "", lastName: "", phone: "", email: "", password: "" });
  const [accepted, setAccepted] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [fields, setFields] = useState<Record<string, string>>({});

  const set = (name: keyof typeof form) => (value: string) => setForm((f) => ({ ...f, [name]: value }));

  async function submit() {
    setBusy(true);
    setMessage(null);
    setFields({});
    try {
      const response = register
        ? await api.post<SessionResponse>("/auth/register", { ...form, acceptTerms: accepted })
        : await api.post<SessionResponse>("/auth/login", { email: form.email, password: form.password });
      await signIn(response);
      onDone(response);
    } catch (e) {
      if (e instanceof ApiError && e.fieldErrors) setFields(e.fieldErrors);
      setMessage(messageOf(e));
    } finally {
      setBusy(false);
    }
  }

  const title = step ? (register ? "Votre compte" : "Bon retour.") : register ? "Créer un compte" : "Se connecter";
  const subtitle = step
    ? register
      ? "Il vous permet de modifier ou d'annuler en ligne."
      : "Connectez-vous pour finaliser le rendez-vous."
    : null;

  return (
    <View style={{ gap: spacing.lg }}>
      <View style={{ gap: 10 }}>
        <Title>{title}</Title>
        {subtitle ? <Muted style={{ fontSize: 14 }}>{subtitle}</Muted> : null}
      </View>
      {register ? (
        <>
          <Field label="Prénom" value={form.firstName} onChangeText={set("firstName")} error={fields.firstName} autoComplete="given-name" textContentType="givenName" />
          <Field label="Nom" value={form.lastName} onChangeText={set("lastName")} error={fields.lastName} autoComplete="family-name" textContentType="familyName" />
          <Field {...PHONE_FIELD} value={form.phone} onChangeText={set("phone")} error={fields.phone} keyboardType="phone-pad" autoComplete="tel" textContentType="telephoneNumber" />
        </>
      ) : null}
      <Field label="Email" value={form.email} onChangeText={set("email")} error={fields.email} keyboardType="email-address" autoCapitalize="none" autoCorrect={false} autoComplete="email" textContentType="emailAddress" />
      <Field label="Mot de passe" value={form.password} onChangeText={set("password")} error={fields.password} secureTextEntry autoComplete={register ? "new-password" : "current-password"} textContentType={register ? "newPassword" : "password"} />
      {register ? (
        <Row>
          <Switch value={accepted} onValueChange={setAccepted} trackColor={{ true: colors.accent }} accessibilityLabel="J'accepte les conditions" />
          <Body style={{ flex: 1 }}>J&apos;accepte les conditions de réservation et la politique de confidentialité.</Body>
        </Row>
      ) : null}
      {fields.acceptTerms ? <ErrorText>{fields.acceptTerms}</ErrorText> : null}
      <ErrorText>{message}</ErrorText>
      <Button label={register ? "Créer mon compte" : "Se connecter"} arrow onPress={() => void submit()} loading={busy} />
      {!register ? (
        <Pressable accessibilityRole="link" onPress={() => router.push("/mot-de-passe")}>
          <Text style={{ fontFamily: fonts.sansMedium, color: colors.accent, textAlign: "center" }}>Mot de passe oublié ?</Text>
        </Pressable>
      ) : null}
      <Pressable
        accessibilityRole="button"
        onPress={() => {
          setMode(register ? "login" : "signup");
          setMessage(null);
          setFields({});
        }}
      >
        <Muted style={{ textAlign: "center" }}>
          {register ? "Déjà un compte ? Se connecter" : "Pas encore de compte ? En créer un"}
        </Muted>
      </Pressable>
    </View>
  );
}
