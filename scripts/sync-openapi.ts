/**
 * Syncs the authoritative OpenAPI specs from S3 into openapi-cache/.
 * These specs are the single source of truth for the generated tool manifest.
 * Requires AWS credentials in the environment (same creds used for the API repo).
 */
import { execFileSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const CACHE = path.join(path.resolve(__dirname, ".."), "openapi-cache");
const S3_PREFIX = "s3://openwebninja/portal/openapi/";

try {
  execFileSync(
    "aws",
    ["s3", "sync", S3_PREFIX, CACHE, "--region", "us-east-1", "--delete", "--exclude", "*", "--include", "*.yaml", "--include", "*.json"],
    { stdio: "inherit" }
  );
  console.log(`Synced OpenAPI specs to ${CACHE}`);
} catch (e: any) {
  console.error("S3 sync failed. Ensure AWS credentials are set (AWS_ACCESS_KEY_ID / AWS_SECRET_ACCESS_KEY).");
  process.exit(1);
}
