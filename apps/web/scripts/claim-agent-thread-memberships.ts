import { getAuthDbClient } from "../src/lib/auth/server";
import { agentThreadRepository } from "../src/lib/agent-threads.server";

const client = await getAuthDbClient();
try {
  const users = await client.execute("SELECT id FROM user ORDER BY id LIMIT 2");
  const userIds = users.rows.map((row) => String(row.id));
  const result = agentThreadRepository.claimLegacyRecords(userIds);
  process.stdout.write(
    `Claimed ${result.claimedThreads} legacy thread(s) and ${result.claimedPreferences} preference record(s) for ${result.userId}.\n`,
  );
} finally {
  client.close();
}
