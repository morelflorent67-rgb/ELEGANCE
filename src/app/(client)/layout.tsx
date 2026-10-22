import "./client.css";

// Gabarit de l'interface client (D-72, lot 12) : la page tient dans une colonne de la largeur d'un téléphone. Sur
// téléphone elle occupe tout l'écran ; sur tablette et ordinateur, elle est centrée et le fond vit autour (lignes de
// lumière lentes, deux hexagones qui tournent, un balayage), comme la maquette « Lot12-Ordinateur ».
export default function ClientLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="client min-h-dvh bg-[#0a0908] font-normal">
      <LivingBackground />
      <div className="relative mx-auto min-h-dvh w-full max-w-[430px] bg-[#0a0908] sm:border-x sm:border-line-subtle">
        {children}
      </div>
    </div>
  );
}

const lines: { x: string; y: string; w: string; o: number; cls: string; delay?: string }[] = [
  { x: "10%", y: "14%", w: "46%", o: 0.09, cls: "bg-x" },
  { x: "44%", y: "33%", w: "52%", o: 0.06, cls: "bg-x bg-x2" },
  { x: "4%", y: "61%", w: "38%", o: 0.08, cls: "bg-x bg-x3" },
  { x: "50%", y: "79%", w: "44%", o: 0.07, cls: "bg-x", delay: "-6s" },
  { x: "18%", y: "92%", w: "30%", o: 0.05, cls: "bg-x bg-x2" },
];
const columns: { x: string; y: string; h: string; o: number; cls: string; delay?: string }[] = [
  { x: "16%", y: "8%", h: "48%", o: 0.06, cls: "bg-y" },
  { x: "83%", y: "34%", h: "56%", o: 0.07, cls: "bg-y bg-y2" },
  { x: "70%", y: "2%", h: "30%", o: 0.05, cls: "bg-y", delay: "-22s" },
];

function LivingBackground() {
  return (
    <div
      aria-hidden="true"
      className="bg-live pointer-events-none fixed inset-0 hidden overflow-hidden sm:block"
    >
      {lines.map((l) => (
        <div
          key={`${l.x}${l.y}`}
          className={`${l.cls} absolute h-px`}
          style={{
            left: l.x,
            top: l.y,
            width: l.w,
            background: `rgb(255 255 255 / ${l.o})`,
            animationDelay: l.delay,
          }}
        />
      ))}
      {columns.map((c) => (
        <div
          key={`${c.x}${c.y}`}
          className={`${c.cls} absolute w-px`}
          style={{
            left: c.x,
            top: c.y,
            height: c.h,
            background: `rgb(255 255 255 / ${c.o})`,
            animationDelay: c.delay,
          }}
        />
      ))}
      <svg
        className="bg-turn absolute -left-[140px] top-[52%]"
        width="620"
        height="536"
        viewBox="0 0 620 536"
        fill="none"
      >
        <path d="M155 1H465L619 268L465 535H155L1 268Z" stroke="rgb(255 255 255 / 0.05)" />
      </svg>
      <svg
        className="bg-turn-back absolute -right-[90px] -top-[110px]"
        width="460"
        height="398"
        viewBox="0 0 460 398"
        fill="none"
      >
        <path d="M115 1H345L459 199L345 397H115L1 199Z" stroke="rgb(255 255 255 / 0.05)" />
      </svg>
      <div className="bg-sweep absolute inset-x-0 top-[47%] h-px bg-led shadow-[0_0_10px_rgb(255_255_255_/_0.6)]" />
    </div>
  );
}
