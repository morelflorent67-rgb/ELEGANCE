"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { updateSalonCustomerAction } from "../../../actions";
import { AuthorPicker, type TeamMemberView } from "../../_components/author-picker";
import { CustomerForm, type CustomerFields } from "../../_components/customer-form";

/** Correction d'une fiche sans compte par l'équipe (D-76), signée d'un prénom (R-74). */
export function EditCustomer({
  customerId,
  initial,
  team,
}: {
  customerId: string;
  initial: CustomerFields;
  team: TeamMemberView[];
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [authorId, setAuthorId] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  if (!open) {
    return (
      <div className="flex flex-col gap-2">
        <button
          type="button"
          onClick={() => {
            setOpen(true);
            setSaved(false);
          }}
          className="flex h-12 items-center justify-center border border-line-strong px-5 text-[11px] uppercase tracking-[0.2em]"
        >
          Corriger la fiche
        </button>
        {saved ? (
          <p role="status" className="text-[13px] text-sage">
            Fiche enregistrée.
          </p>
        ) : null}
      </div>
    );
  }

  return (
    <section aria-label="Corriger la fiche" className="flex flex-col gap-4 border border-line p-5">
      <h2 className="text-[20px] font-light">Corriger la fiche</h2>
      <CustomerForm
        idPrefix="edit-client"
        initial={initial}
        submitLabel="Enregistrer"
        ready={!!authorId}
        extra={
          <AuthorPicker
            team={team}
            value={authorId}
            onChange={setAuthorId}
            label="Qui corrige ?"
            columns={4}
          />
        }
        onSubmit={(fields) => updateSalonCustomerAction({ customerId, authorId, fields })}
        onDone={() => {
          setOpen(false);
          setAuthorId(null);
          setSaved(true);
          router.refresh();
        }}
        onCancel={() => {
          setOpen(false);
          setAuthorId(null);
        }}
      />
    </section>
  );
}
