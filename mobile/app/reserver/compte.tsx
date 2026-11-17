import { router } from "expo-router";
import { useBooking } from "@/booking";
import { AuthForm } from "@/auth-form";
import { routeAfterSlot } from "@/flow";
import { StepHeader } from "@/step-header";
import { Screen } from "@/ui";

// Étape 4 : le compte (R-70, R-71). Sautée si le client est déjà connecté. Une fois connecté, un client bloqué (R-52) ou
// déjà au maximum de RDV à venir (R-25) le sait aussitôt ; sinon on passe au récapitulatif, qui remplace cet écran
// (« retour » ne revient pas au formulaire).
export default function AccountStep() {
  const { draft } = useBooking();
  return (
    <Screen sweep>
      <StepHeader step={4} label="Compte" />
      <AuthForm
        initialMode="signup"
        step
        onDone={(response) =>
          router.replace(routeAfterSlot({ moving: !!draft.movingId, signedIn: true, booking: response.booking }))
        }
      />
    </Screen>
  );
}
