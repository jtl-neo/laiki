import { lineClient } from "../client.js";
import { LIFF_BASE as liffBase } from "../../lib/config.js";

async function setup() {
  const client = lineClient();

  const menu = await client.createRichMenu({
    size: { width: 2500, height: 843 },
    selected: true,
    name: "laiki-main",
    chatBarText: "選單",
    areas: [
      {
        bounds: { x: 0, y: 0, width: 833, height: 843 },
        action: { type: "uri", uri: `${liffBase}/dashboard`, label: "Dashboard" },
      },
      {
        bounds: { x: 833, y: 0, width: 834, height: 843 },
        action: { type: "uri", uri: `${liffBase}/tx/new`, label: "Add" },
      },
      {
        bounds: { x: 1667, y: 0, width: 833, height: 843 },
        action: { type: "uri", uri: `${liffBase}/settings`, label: "Settings" },
      },
    ],
  });

  await client.setDefaultRichMenu(menu.richMenuId);
  console.log("rich menu set:", menu.richMenuId);
}

setup().catch((e) => {
  console.error(e);
  process.exit(1);
});
