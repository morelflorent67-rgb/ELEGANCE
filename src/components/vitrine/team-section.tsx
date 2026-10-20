import type { TeamMember } from "@/modules/vitrine/load";
import { HexBadge } from "./icons";
import { SectionHeading } from "./section-heading";

const ROLE_LABEL = { barber: "Coiffeur", apprentice: "Apprenti" } as const;

/** L'équipe active : prénom, rôle, badge hexagonal. Pas de portrait (D-30). */
export function TeamSection({ team, note }: { team: TeamMember[]; note?: string | null }) {
  if (team.length === 0) return null;
  return (
    <section className="mx-auto flex w-full max-w-[1200px] flex-col gap-7 px-6 py-14 lg:py-20">
      <SectionHeading label="Ceux qui vous reçoivent" title="L'équipe" />
      <ul className="grid grid-cols-2 gap-px border border-line bg-line lg:grid-cols-4" data-reveal>
        {team.map((member) => (
          <li key={member.id} className="flex flex-col gap-[18px] bg-ink px-[18px] py-6">
            <HexBadge letter={member.firstName.charAt(0).toUpperCase()} />
            <div className="flex flex-col gap-1.5">
              <span className="text-[18px] font-normal">{member.firstName}</span>
              <span className="text-label uppercase tracking-[0.26em] text-stone">
                {ROLE_LABEL[member.role]}
              </span>
            </div>
          </li>
        ))}
      </ul>
      {note ? <p className="max-w-xl text-body-sm text-stone">{note}</p> : null}
    </section>
  );
}
