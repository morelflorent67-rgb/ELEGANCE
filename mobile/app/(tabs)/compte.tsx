import { router } from "expo-router";
import { useState } from "react";
import { Alert, View } from "react-native";
import { ApiError, messageOf } from "@/api/client";
import type { Customer } from "@/api/types";
import { NeedsLogin } from "@/needs-login";
import { useSession } from "@/session";
import { spacing } from "@/theme";
import { PHONE_FIELD } from "@/lib/phone-field";
import { Body, Button, ErrorText, Field, Heading, Muted, Screen, Title } from "@/ui";

export default function AccountScreen() {
  const { customer } = useSession();
  if (!customer) {
    return (
      <NeedsLogin
        title="Mon compte"
        text="Connectez-vous ou créez un compte pour réserver, retrouver vos rendez-vous et suivre votre fidélité."
      />
    );
  }
  return <Account customer={customer} />;
}

function Account({ customer }: { customer: Customer }) {
  const { api, signOut, setCustomer } = useSession();
  const [form, setForm] = useState({
    firstName: customer.firstName,
    lastName: customer.lastName,
    phone: customer.phone,
    email: customer.email,
    currentPassword: "",
  });
  const [fields, setFields] = useState<Record<string, string>>({});
  const [info, setInfo] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [pw, setPw] = useState({ currentPassword: "", newPassword: "" });
  const [pwFields, setPwFields] = useState<Record<string, string>>({});
  const [deletePassword, setDeletePassword] = useState("");
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const set = (name: keyof typeof form) => (value: string) => setForm((f) => ({ ...f, [name]: value }));
  const emailChanged = form.email.trim().toLowerCase() !== customer.email.toLowerCase();

  async function save() {
    setBusy("save");
    setFields({});
    setError(null);
    setInfo(null);
    try {
      const res = await api.patch<{ customer: Customer }>("/me", {
        ...form,
        currentPassword: form.currentPassword || undefined,
      });
      setCustomer(res.customer);
      setForm((f) => ({ ...f, currentPassword: "" }));
      setInfo("Vos informations sont à jour.");
    } catch (e) {
      if (e instanceof ApiError && e.fieldErrors) setFields(e.fieldErrors);
      setError(messageOf(e));
    } finally {
      setBusy(null);
    }
  }

  async function changePassword() {
    setBusy("password");
    setPwFields({});
    setError(null);
    setInfo(null);
    try {
      await api.post("/me/password", pw);
      setPw({ currentPassword: "", newPassword: "" });
      setInfo("Votre mot de passe a été modifié.");
    } catch (e) {
      if (e instanceof ApiError && e.fieldErrors) setPwFields(e.fieldErrors);
      setError(messageOf(e));
    } finally {
      setBusy(null);
    }
  }

  // Apple 5.1.1(v) : la suppression du compte se fait dans l'app, avec le mot de passe et une confirmation.
  function confirmDelete() {
    setDeleteError(null);
    if (!deletePassword) {
      setDeleteError("Indiquez votre mot de passe pour supprimer votre compte.");
      return;
    }
    Alert.alert(
      "Supprimer votre compte ?",
      "Vos rendez-vous à venir seront annulés et vos informations effacées. Cette action est définitive.",
      [
        { text: "Garder mon compte", style: "cancel" },
        {
          text: "Supprimer définitivement",
          style: "destructive",
          onPress: async () => {
            setBusy("delete");
            try {
              await api.delete("/me", { password: deletePassword });
              await signOut();
            } catch (e) {
              setDeleteError(messageOf(e));
            } finally {
              setBusy(null);
            }
          },
        },
      ],
    );
  }

  return (
    <Screen>
      <Title>Mon compte</Title>

      <Heading>Mes informations</Heading>
      <Field label="Prénom" value={form.firstName} onChangeText={set("firstName")} error={fields.firstName} />
      <Field label="Nom" value={form.lastName} onChangeText={set("lastName")} error={fields.lastName} />
      <Field {...PHONE_FIELD} value={form.phone} onChangeText={set("phone")} error={fields.phone} keyboardType="phone-pad" />
      <Field label="Email" value={form.email} onChangeText={set("email")} error={fields.email} keyboardType="email-address" autoCapitalize="none" autoCorrect={false} />
      {emailChanged ? (
        <Field label="Mot de passe actuel (pour changer d'email)" value={form.currentPassword} onChangeText={set("currentPassword")} error={fields.currentPassword} secureTextEntry />
      ) : null}
      <ErrorText>{error}</ErrorText>
      {info ? <Body>{info}</Body> : null}
      <Button label="Enregistrer" onPress={() => void save()} loading={busy === "save"} />

      <Heading>Mot de passe</Heading>
      <Field label="Mot de passe actuel" value={pw.currentPassword} onChangeText={(v) => setPw((p) => ({ ...p, currentPassword: v }))} error={pwFields.currentPassword} secureTextEntry />
      <Field label="Nouveau mot de passe" value={pw.newPassword} onChangeText={(v) => setPw((p) => ({ ...p, newPassword: v }))} error={pwFields.newPassword} secureTextEntry />
      <Button label="Changer le mot de passe" kind="secondary" onPress={() => void changePassword()} loading={busy === "password"} />

      <Heading>Informations légales</Heading>
      <Button label="Mentions légales" kind="secondary" onPress={() => router.push("/legal/mentions-legales")} />
      <Button label="Politique de confidentialité" kind="secondary" onPress={() => router.push("/legal/confidentialite")} />
      <Button label="Conditions de réservation" kind="secondary" onPress={() => router.push("/legal/conditions")} />

      <Button label="Se déconnecter" kind="secondary" onPress={() => void signOut()} />

      <View style={{ gap: spacing.md, marginTop: spacing.xl }}>
        <Heading>Supprimer mon compte</Heading>
        <Muted>
          Efface vos informations et annule vos rendez-vous à venir. Impossible si un rendez-vous est dans le délai de
          modification : appelez alors le salon.
        </Muted>
        <Field label="Mot de passe" value={deletePassword} onChangeText={setDeletePassword} secureTextEntry />
        <ErrorText>{deleteError}</ErrorText>
        <Button label="Supprimer mon compte" kind="danger" onPress={confirmDelete} loading={busy === "delete"} />
      </View>
    </Screen>
  );
}
