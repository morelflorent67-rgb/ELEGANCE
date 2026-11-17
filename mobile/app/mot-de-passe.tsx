import { useState } from "react";
import { View } from "react-native";
import { messageOf } from "@/api/client";
import { useSession } from "@/session";
import { spacing } from "@/theme";
import { Body, Button, ErrorText, Field, Screen, Title } from "@/ui";

// Le lien reçu par email ouvre le site pour choisir le nouveau mot de passe (lot 25).
export default function ForgotPasswordScreen() {
  const { api } = useSession();
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    setBusy(true);
    setError(null);
    try {
      await api.post("/auth/forgot-password", { email });
      setSent(true);
    } catch (e) {
      setError(messageOf(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Screen padTop={false}>
      <View style={{ gap: spacing.lg, paddingTop: spacing.lg }}>
        <Title>Mot de passe oublié</Title>
        {sent ? (
          <Body>
            Si un compte existe avec cette adresse, un email vient de vous être envoyé avec un lien pour choisir un
            nouveau mot de passe.
          </Body>
        ) : (
          <>
            <Field label="Email" value={email} onChangeText={setEmail} keyboardType="email-address" autoCapitalize="none" autoCorrect={false} autoComplete="email" />
            <ErrorText>{error}</ErrorText>
            <Button label="Envoyer le lien" onPress={() => void submit()} loading={busy} />
          </>
        )}
      </View>
    </Screen>
  );
}
