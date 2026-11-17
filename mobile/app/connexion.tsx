import { router, useLocalSearchParams } from "expo-router";
import { useState } from "react";
import { Pressable, Switch, Text, View } from "react-native";
import { ApiError, messageOf } from "@/api/client";
import type { SessionResponse } from "@/api/types";
import { useSession } from "@/session";
import { colors, fonts, spacing } from "@/theme";
import { Body, Button, ErrorText, Field, Muted, Row, Screen, Title } from "@/ui";

// Connexion et inscription (R-70, R-71) : les mêmes comptes que le site. Les erreurs de champ viennent du serveur.
export default function ConnexionScreen() {
  const params = useLocalSearchParams<{ mode?: string }>();
  const [register, setRegister] = useState(params.mode === "register");
  const { api, signIn } = useSession();
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
      // On revient là où l'on était (par exemple au récapitulatif de la réservation), sans rien perdre.
      router.back();
    } catch (e) {
      if (e instanceof ApiError && e.fieldErrors) setFields(e.fieldErrors);
      setMessage(messageOf(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Screen padTop={false}>
      <View style={{ gap: spacing.lg, paddingTop: spacing.lg }}>
        <Title>{register ? "Créer un compte" : "Se connecter"}</Title>
        {register ? (
          <>
            <Field label="Prénom" value={form.firstName} onChangeText={set("firstName")} error={fields.firstName} autoComplete="given-name" textContentType="givenName" />
            <Field label="Nom" value={form.lastName} onChangeText={set("lastName")} error={fields.lastName} autoComplete="family-name" textContentType="familyName" />
            <Field label="Téléphone" value={form.phone} onChangeText={set("phone")} error={fields.phone} keyboardType="phone-pad" autoComplete="tel" textContentType="telephoneNumber" />
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
        <Button label={register ? "Créer mon compte" : "Se connecter"} onPress={() => void submit()} loading={busy} />
        {!register ? (
          <Pressable accessibilityRole="link" onPress={() => router.push("/mot-de-passe")}>
            <Text style={{ fontFamily: fonts.sansMedium, color: colors.accent, textAlign: "center" }}>Mot de passe oublié ?</Text>
          </Pressable>
        ) : null}
        <Pressable accessibilityRole="button" onPress={() => { setRegister(!register); setMessage(null); setFields({}); }}>
          <Muted style={{ textAlign: "center" }}>
            {register ? "Déjà un compte ? Se connecter" : "Pas encore de compte ? En créer un"}
          </Muted>
        </Pressable>
      </View>
    </Screen>
  );
}
