import { lineClient } from "./client.js";

export async function fetchLineGroupName(lineGroupId: string): Promise<string | null> {
  try {
    const s = await lineClient().getGroupSummary(lineGroupId);
    return s.groupName ?? null;
  } catch (e) {
    console.warn("getGroupSummary failed:", e instanceof Error ? e.message : e);
    return null;
  }
}
