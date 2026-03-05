import { loadBaseEnv } from '@/config/env.js';
import { createLogger } from '@/lib/logger.js';
import { sendTelegramMessage } from '@/lib/telegram.js';

const log = createLogger('telegram-test');

async function main(): Promise<void> {
  loadBaseEnv();

  log.info('Sending test message to Telegram...');

  const result = await sendTelegramMessage(
    '🧪 YouthAtlas Telegram integration test. If you see this, notifications are working!',
  );

  if (result.error) {
    log.error('Test failed', { error: result.error });
    process.exit(1);
  }

  log.info('Test message sent successfully!');
}

main().catch((err) => {
  log.error('Test crashed', { error: err instanceof Error ? err.message : String(err) });
  process.exit(1);
});
