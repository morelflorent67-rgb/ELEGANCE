import type { PgDatabase } from "drizzle-orm/pg-core";
import type { PostgresJsQueryResultHKT } from "drizzle-orm/postgres-js";
import type * as schema from "./schema";

/**
 * Base de données telle que la voient les modules métier : une connexion ou une transaction.
 * Les modules la reçoivent en paramètre (au lieu d'importer le client global) pour se tester
 * sur une base de test.
 */
export type Database = PgDatabase<PostgresJsQueryResultHKT, typeof schema>;
