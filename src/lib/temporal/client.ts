import { Connection, Client } from "@temporalio/client";
import { getTemporalEnv, describeTemporalEnv, type TemporalEnv } from "./env";

/**
 * Create a Temporal {@link Client} from environment configuration.
 *
 * - For Temporal Cloud: TEMPORAL_API_KEY + TEMPORAL_ADDRESS + TEMPORAL_NAMESPACE
 *   are required; TLS is enabled automatically and the API key is sent as the
 *   `Authorization: Bearer <key>` credential.
 * - For a local dev server: just leave TEMPORAL_API_KEY unset; it connects to
 *   localhost:7233 / the "default" namespace without TLS.
 *
 * The returned object includes the resolved env so callers can log a redacted
 * summary. Callers are responsible for closing the underlying connection via
 * `client.connection.close()` when done (the worker keeps it open).
 */
export async function createTemporalClient(): Promise<{
  client: Client;
  connection: Connection;
  env: TemporalEnv;
}> {
  const env = getTemporalEnv();

  const connection = await Connection.connect({
    address: env.address,
    tls: env.tls,
    // Passing apiKey makes the SDK attach the Authorization header and, for
    // Cloud, the required `temporal-namespace` metadata is set via the Client.
    apiKey: env.apiKey,
  });

  const client = new Client({
    connection,
    namespace: env.namespace,
  });

  return { client, connection, env };
}

export { describeTemporalEnv, getTemporalEnv };
