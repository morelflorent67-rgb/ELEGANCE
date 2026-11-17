import { router } from "expo-router";
import { useState } from "react";
import { Modal, Pressable, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { messageOf } from "@/api/client";
import { useBooking } from "@/booking";
import { useSession } from "@/session";
import { colors, fonts, spacing } from "@/theme";
import { Button, Check, ErrorText, LabelCaps, Muted, Rule, Title } from "@/ui";

type Window = "morning" | "afternoon" | "day";
const WINDOWS: { id: Window; label: string; hint: string }[] = [
  { id: "morning", label: "Le matin", hint: "avant midi" },
  { id: "afternoon", label: "L'après-midi", hint: "à partir de midi" },
  { id: "day", label: "Toute la journée", hint: "dès qu'une place se libère" },
];

/**
 * « Me prévenir si une place se libère » (R-80, D-73) : la feuille du site, remontée du bas. L'inscription est refusée
 * par le serveur s'il reste une place qui convient (« slots_available »).
 */
export function WaitlistSheet({
  open,
  onClose,
  date,
  dayLabel,
}: {
  open: boolean;
  onClose: () => void;
  date: string;
  dayLabel: string;
}) {
  const { api, customer } = useSession();
  const { draft } = useBooking();
  const insets = useSafeAreaInsets();
  const [window, setWindow] = useState<Window>("day");
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function join() {
    setBusy(true);
    setError(null);
    try {
      await api.post("/waitlist", { serviceIds: draft.serviceIds, staffId: draft.staffId, days: [date], window });
      setDone(true);
    } catch (e) {
      setError(messageOf(e));
    } finally {
      setBusy(false);
    }
  }

  const close = () => {
    onClose();
    setTimeout(() => {
      setDone(false);
      setError(null);
    }, 300);
  };

  return (
    <Modal visible={open} transparent animationType="slide" onRequestClose={close}>
      <Pressable accessibilityLabel="Fermer" style={{ flex: 1, backgroundColor: "rgba(0,6,14,0.78)" }} onPress={close} />
      <View
        style={{
          backgroundColor: colors.ink,
          borderTopWidth: 1,
          borderTopColor: "rgba(239,233,221,0.22)",
          paddingHorizontal: spacing.xl,
          paddingTop: spacing.xl,
          paddingBottom: Math.max(insets.bottom, spacing.xl),
          gap: spacing.lg,
        }}
      >
        {done ? (
          <>
            <Title style={{ fontSize: 30, lineHeight: 33 }}>Vous êtes sur la liste.</Title>
            <Muted style={{ fontSize: 14, lineHeight: 22 }}>
              Dès qu&apos;une place se libère ce jour-là, nous vous écrivons : elle vous est gardée quelques minutes. Vous
              retrouvez et retirez votre inscription dans Mes rendez-vous.
            </Muted>
            <Button label="Compris" onPress={close} />
          </>
        ) : (
          <>
            <Title style={{ fontSize: 30, lineHeight: 33 }}>Me prévenir si une place se libère</Title>
            <Muted style={{ fontSize: 14, lineHeight: 22 }}>
              {dayLabel}. Le premier inscrit est prévenu en premier : la place lui est gardée quelques minutes.
            </Muted>
            <View>
              <LabelCaps style={{ marginBottom: 4 }}>Quand ?</LabelCaps>
              {WINDOWS.map((w) => (
                <View key={w.id}>
                  <Pressable
                    accessibilityRole="radio"
                    accessibilityState={{ selected: window === w.id }}
                    onPress={() => setWindow(w.id)}
                    style={{ minHeight: 48, flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 12 }}
                  >
                    <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
                      <Check checked={window === w.id} />
                      <Text style={{ fontFamily: fonts.sans, fontSize: 14, color: colors.ivory }}>{w.label}</Text>
                    </View>
                    <Text style={{ fontFamily: fonts.sans, fontSize: 12, color: "#8f897e" }}>{w.hint}</Text>
                  </Pressable>
                  <Rule />
                </View>
              ))}
            </View>
            {!customer ? (
              <>
                <ErrorText>Connectez-vous pour vous inscrire.</ErrorText>
                <Button
                  label="Se connecter"
                  kind="secondary"
                  onPress={() => {
                    close();
                    router.push("/connexion");
                  }}
                />
              </>
            ) : (
              <>
                <ErrorText>{error}</ErrorText>
                <Button label="Me prévenir" arrow loading={busy} onPress={() => void join()} />
              </>
            )}
          </>
        )}
      </View>
    </Modal>
  );
}
