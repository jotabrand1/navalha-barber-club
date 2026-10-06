import "dotenv/config";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";
import pg from "pg";
import { PGlite } from "@electric-sql/pglite";

export type Row = Record<string, any>;
export interface Queryable {
  query<T extends Row = Row>(
    sql: string,
    params?: unknown[],
  ): Promise<{ rows: T[]; rowCount: number }>;
}
export interface Database extends Queryable {
  engine: "postgres" | "pglite";
  transaction<T>(action: (tx: Queryable) => Promise<T>): Promise<T>;
  close(): Promise<void>;
  migrate(): Promise<void>;
}

export async function createDatabase(
  options: {
    engine?: "postgres" | "pglite";
    url?: string;
    dataDir?: string;
  } = {},
): Promise<Database> {
  const engine =
    options.engine ??
    (process.env.DB_ENGINE === "pglite" ? "pglite" : "postgres");
  let database: Database;
  if (engine === "pglite") {
    if (process.env.NODE_ENV === "production")
      throw new Error(
        "PGlite is for local development and tests only. Use PostgreSQL in production.",
      );
    const instance = new PGlite(
      options.dataDir ?? process.env.PGLITE_PATH ?? ".data",
    );
    await instance.waitReady;
    // One embedded connection: serialize complete operations to keep transactions isolated.
    let tail: Promise<unknown> = Promise.resolve();
    const serialize = <T>(fn: () => Promise<T>): Promise<T> => {
      const next = tail.then(fn, fn);
      tail = next.catch(() => {});
      return next;
    };
    const query: Queryable["query"] = async (sql, params = []) => {
      const result = await instance.query(sql, params);
      return {
        rows: result.rows as any,
        rowCount: result.affectedRows ?? result.rows.length,
      };
    };
    database = {
      engine,
      query: (sql, params) => serialize(() => query(sql, params)),
      transaction: (action) =>
        serialize(() =>
          instance.transaction((tx) =>
            action({
              query: async (sql, params = []) => {
                const result = await tx.query(sql, params);
                return {
                  rows: result.rows as any,
                  rowCount: result.affectedRows ?? result.rows.length,
                };
              },
            }),
          ),
        ),
      close: () => serialize(() => instance.close()),
      migrate: async () => {
        const sql = await migrationSql();
        await serialize(() => instance.exec(sql));
      },
    };
  } else {
    const connectionString = options.url ?? process.env.DATABASE_URL;
    if (!connectionString)
      throw new Error(
        "DATABASE_URL is required. For local embedded PostgreSQL, set DB_ENGINE=pglite.",
      );
    const pool = new pg.Pool({
      connectionString,
      max: 10,
      idleTimeoutMillis: 30_000,
      statement_timeout: 15_000,
    });
    const wrap = (connection: pg.Pool | pg.PoolClient): Queryable => ({
      query: async (sql, params = []) => {
        const result = await connection.query(sql, params);
        return {
          rows: result.rows,
          rowCount: result.rowCount ?? result.rows.length,
        };
      },
    });
    database = {
      engine,
      query: wrap(pool).query,
      transaction: async (action) => {
        const client = await pool.connect();
        try {
          await client.query("BEGIN");
          const result = await action(wrap(client));
          await client.query("COMMIT");
          return result;
        } catch (error) {
          await client.query("ROLLBACK");
          throw error;
        } finally {
          client.release();
        }
      },
      close: () => pool.end(),
      migrate: async () => {
        await pool.query(await migrationSql());
      },
    };
  }
  return database;
}

async function migrationSql(): Promise<string> {
  const directory = path.dirname(fileURLToPath(import.meta.url));
  return readFile(
    path.resolve(directory, "../migrations/001_initial.sql"),
    "utf8",
  );
}
