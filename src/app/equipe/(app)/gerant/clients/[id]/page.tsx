import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { connection } from "next/server";
import { Suspense } from "react";
import { z } from "zod";
import { db } from "@/db/client";
import { loadCustomerFile } from "@/modules/customers/staff-view";
import { managerUnlocked, requireStaff } from "../../../../_lib/session";
import { ManagerClientActions } from "./manager-client-actions";

export const metadata: Metadata = { title: "Client · espace gérant" };

export default function ManagerClientPage(props: PageProps<"/equipe/gerant/clients/[id]">) {
  return (
    <Suspense
      fallback={
        <p role="status" className="px-6 py-10 text-body-sm text-stone">
          Chargement…
        </p>
      }
    >
      <ManagerClient params={props.params} />
    </Suspense>
  );
}

async function ManagerClient({
  params,
}: {
  params: PageProps<"/equipe/gerant/clients/[id]">["params"];
}) {
  await connection();
  const user = await requireStaff();
  // R-73 : sans le code gérant, on revient à la saisie du code.
  if (!(await managerUnlocked(user))) redirect("/equipe/gerant");
  const id = z.uuid().safeParse((await params).id);
  if (!id.success) notFound();
  const file = await loadCustomerFile(db(), id.data);
  if (!file) notFound();

  const now = new Date();
  const upcoming = file.appointments.filter(
    (a) => a.status === "confirmed" && a.endsAt > now,
  ).length;

  return (
    <main className="min-h-0 flex-1 overflow-y-auto px-7 py-7">
      <div className="mx-auto flex max-w-[820px] flex-col gap-6">
        <Link
          href="/equipe/gerant"
          className="inline-flex min-h-11 items-center self-start text-body-sm text-ivory-soft underline underline-offset-4"
        >
          Retour à l’espace gérant
        </Link>
        <div className="flex flex-col gap-1.5">
          <span className="text-label uppercase tracking-[0.3em] text-stone">
            Espace gérant · Client
          </span>
          <h1 className="text-[30px] font-light leading-tight">
            {file.firstName} {file.lastName}
          </h1>
          <span className="text-[16px] tabular-nums text-ivory-soft">{file.phone}</span>
          <span className="text-[14px] text-stone">{file.email}</span>
        </div>

        <ManagerClientActions
          customerId={file.id}
          name={`${file.firstName} ${file.lastName}`.trim()}
          noShowCount={file.noShowCount}
          threshold={file.blockThreshold}
          blocked={file.blocked}
          canBlock={file.canBlock}
          upcoming={upcoming}
          hasAccount={file.hasAccount}
          samePhone={file.samePhone}
        />
      </div>
    </main>
  );
}
