"use client";

export interface TeamMemberView {
  id: string;
  firstName: string;
}

/**
 * « Qui fait la modification ? » (R-74) : sur la tablette partagée, chaque réservation, modification, annulation et
 * lapin est signé d'un prénom choisi à chaque fois, jamais mémorisé d'une action à l'autre.
 */
export function AuthorPicker({
  team,
  value,
  onChange,
  label = "Qui fait la modification ?",
  columns = 2,
}: {
  team: TeamMemberView[];
  value: string | null;
  onChange: (id: string) => void;
  label?: string;
  columns?: 2 | 4;
}) {
  return (
    <div role="group" aria-label={label} className="flex flex-col gap-2.5">
      <span className="text-label uppercase text-stone">{label}</span>
      <div className={`grid gap-2 ${columns === 4 ? "grid-cols-4" : "grid-cols-2"}`}>
        {team.map((member) => {
          const on = value === member.id;
          return (
            <button
              key={member.id}
              type="button"
              aria-pressed={on}
              onClick={() => onChange(member.id)}
              className={`h-[52px] border text-[15px] transition-colors duration-200 ${
                on
                  ? "border-ivory bg-ivory text-ink"
                  : "border-line-strong text-ivory hover:bg-graphite-light"
              }`}
            >
              {member.firstName}
            </button>
          );
        })}
      </div>
    </div>
  );
}
