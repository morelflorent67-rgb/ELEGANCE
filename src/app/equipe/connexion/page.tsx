import type { Metadata } from "next";
import { Eyebrow, LedLine, Logo } from "@/components/ui";
import { StaffLoginForm } from "./login-form";

export const metadata: Metadata = { title: "Connexion de la tablette" };

export default function StaffLoginPage() {
  return (
    <div className="flex min-h-dvh items-center justify-center px-6 py-10">
      <main className="flex w-full max-w-[460px] flex-col gap-7">
        <Logo width={120} />
        <div className="flex flex-col gap-3">
          <Eyebrow>Salon</Eyebrow>
          <h1 className="text-title-1">Connexion de la tablette</h1>
          <p className="text-body text-ivory-soft">
            Une seule connexion suffit : la tablette reste ouverte en mode équipe.
          </p>
        </div>
        <LedLine />
        <StaffLoginForm />
      </main>
    </div>
  );
}
