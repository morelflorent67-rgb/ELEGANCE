"use client";

/** « Déjà client ? Se connecter » / « Pas encore de compte ? Créer un compte », entre deux filets. */
export function SwitchAuth({ login, onSwitch }: { login: boolean; onSwitch: () => void }) {
  return (
    <div className="s-up flex items-center gap-3.5" style={{ animationDelay: "420ms" }}>
      <span className="h-px flex-1 bg-[rgb(239_233_221_/_0.12)]" />
      <button
        type="button"
        onClick={onSwitch}
        className="min-h-11 px-1 text-[13px] text-ivory-soft"
      >
        {login ? "Pas encore de compte ?" : "Déjà client ?"}{" "}
        <span className="text-ivory underline underline-offset-[3px]">
          {login ? "Créer un compte" : "Se connecter"}
        </span>
      </button>
      <span className="h-px flex-1 bg-[rgb(239_233_221_/_0.12)]" />
    </div>
  );
}
