import { sql } from "../db/client.js";
import { lineClient } from "../line/client.js";
import { logger } from "../lib/logger.js";

const NUDGE_TEXT =
  "嗨～最近還沒看到你的記帳紀錄 👀\n回來記一筆，把這週的花費補上吧！";

interface ChurnUser {
  line_user_id: string;
}

export async function runChurnNudge(): Promise<void> {
  const rows = await sql<ChurnUser[]>`
    SELECT u.line_user_id
    FROM users u
    LEFT JOIN transactions t ON t.paid_by_user_id = u.id
    LEFT JOIN user_preferences p ON p.user_id = u.id
    WHERE COALESCE(p.notify_nudge, true) = true
    GROUP BY u.id, u.line_user_id
    HAVING COALESCE(MAX(t.created_at), 'epoch'::timestamptz) < now() - interval '7 days'
       AND MIN(u.created_at) < now() - interval '7 days'
  `;

  for (const row of rows) {
    try {
      await lineClient().pushMessage({
        to: row.line_user_id,
        messages: [
          {
            type: "text",
            text: NUDGE_TEXT,
            quickReply: {
              items: [
                {
                  type: "action",
                  action: {
                    type: "postback",
                    label: "不再接收此類",
                    data: "action=notify_off&type=nudge",
                    displayText: "不再接收此類通知",
                  },
                },
              ],
            },
          },
        ],
      });
    } catch (err) {
      logger.error({ err }, `[churnNudge] user=${row.line_user_id} failed`);
    }
  }
}
