import { router } from "expo-router";
import { View } from "react-native";
import type { StaffChoice } from "@/api/types";
import { useBooking } from "@/booking";
import { StepHeader } from "@/step-header";
import { useSession } from "@/session";
import { spacing } from "@/theme";
import { useLoad } from "@/use-load";
import { Body, Button, Chip, LoadState, Muted, Screen, Title } from "@/ui";

// Étape 2 : le coiffeur, ou « Sans préférence ». Les coiffeurs proposés sont ceux habilités pour toutes les prestations
// (R-13, R-20) : calculés par le serveur.
export default function StaffStep() {
  const { api } = useSession();
  const { draft, update } = useBooking();
  const loaded = useLoad(
    () =>
      api.post<{ choices: StaffChoice[] }>(
        "/staff-choices",
        draft.movingId ? { appointmentId: draft.movingId } : { serviceIds: draft.serviceIds },
      ),
    [draft.movingId, draft.serviceIds.join(",")],
  );
  const choices = loaded.data?.choices ?? [];

  return (
    <Screen
      footer={<Button label="Continuer" onPress={() => router.push("/reserver/creneau")} />}
    >
      <StepHeader step={2} />
      <Title>Avec qui ?</Title>
      <LoadState loading={loaded.loading} error={loaded.error} hasData={!!loaded.data} reload={loaded.reload}>
        <View style={{ gap: spacing.md }}>
          {choices.length === 0 ? (
            <Body>Aucun coiffeur n&apos;est disponible pour ces prestations. Appelez le salon.</Body>
          ) : (
            <>
              <Chip
                label="Sans préférence"
                caption={choices.length > 1 ? choices.map((c) => c.firstName).join(" ou ") + " · plus de créneaux" : undefined}
                selected={draft.staffId === "any"}
                onPress={() => update({ staffId: "any" })}
              />
              {choices.map((c) => (
                <Chip
                  key={c.id}
                  label={c.firstName}
                  caption={c.role === "apprentice" ? "Apprenti · tarif formation" : undefined}
                  selected={draft.staffId === c.id}
                  onPress={() => update({ staffId: c.id })}
                />
              ))}
            </>
          )}
          <Muted>Le coiffeur choisi est celui de votre rendez-vous.</Muted>
        </View>
      </LoadState>
    </Screen>
  );
}
