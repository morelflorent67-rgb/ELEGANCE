# Image du site Elegance Strasbourg (Next.js 16, Node 24, pnpm). Compilée sur le serveur par docker compose.
# La compilation (`pnpm build`) lit la base : elle n'est PAS faite ici mais par `deploy/update.sh`, base démarrée.
FROM node:24-bookworm-slim
WORKDIR /app
ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1 COREPACK_HOME=/opt/corepack COREPACK_ENABLE_DOWNLOAD_PROMPT=0
RUN corepack enable && corepack prepare pnpm@11.18.0 --activate && chmod -R a+rX /opt/corepack

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
# Les outils de compilation (Tailwind, TypeScript, drizzle-kit) sont des dépendances de développement : on les garde.
RUN pnpm install --frozen-lockfile --prod=false

COPY . .
RUN mkdir -p /app/.next && chown -R node:node /app
USER node
EXPOSE 3000
CMD ["pnpm", "start", "-p", "3000", "-H", "0.0.0.0"]
