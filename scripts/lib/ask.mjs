// Questions au clavier pour les scripts : le mot de passe et le code se saisissent sans s'afficher
// et ne passent jamais par la ligne de commande ni par l'historique.
import { createInterface } from "node:readline";

/** Pose une question ; `hidden` masque ce qui est tapé. */
export function ask(question, { hidden = false } = {}) {
  return new Promise((resolve) => {
    let muted = false;
    const rl = createInterface({
      input: process.stdin,
      output: {
        write(chunk) {
          if (!muted) process.stdout.write(chunk);
        },
      },
      terminal: true,
    });
    rl.question(question, (answer) => {
      rl.close();
      if (hidden) process.stdout.write("\n");
      resolve(answer.trim());
    });
    muted = hidden;
  });
}
