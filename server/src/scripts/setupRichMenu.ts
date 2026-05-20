import { lineClient } from "../line/client.js";

async function main(): Promise<void> {
  const liffId = process.env.LIFF_ID;
  const basicId = process.env.LINE_BOT_BASIC_ID;
  if (!liffId) {
    console.error("LIFF_ID env not set. Aborting.");
    process.exit(1);
  }
  if (!basicId) {
    console.error("LINE_BOT_BASIC_ID env not set. Aborting.");
    process.exit(1);
  }

  const client = lineClient();

  // 2x3 grid: 2500 x 1686
  const W = 2500;
  const H = 1686;
  const cw = Math.floor(W / 3); // 833
  const ch = Math.floor(H / 2); // 843
  const colW = [cw, cw, W - cw * 2]; // 833, 833, 834
  const xs = [0, colW[0]!, colW[0]! + colW[1]!];
  const rowH = [ch, H - ch]; // 843, 843
  const ys = [0, rowH[0]!];

  const menu = await client.createRichMenu({
    size: { width: W, height: H },
    selected: true,
    name: "laiki-main-6",
    chatBarText: "選單",
    areas: [
      // top-left: 記一筆
      {
        bounds: { x: xs[0]!, y: ys[0]!, width: colW[0]!, height: rowH[0]! },
        action: {
          type: "uri",
          label: "記一筆",
          uri: `https://liff.line.me/${liffId}/tx/new`,
        },
      },
      // top-mid: 拍照 (camera)
      {
        bounds: { x: xs[1]!, y: ys[0]!, width: colW[1]!, height: rowH[0]! },
        action: { type: "camera", label: "拍照" },
      },
      // top-right: 餘額
      {
        bounds: { x: xs[2]!, y: ys[0]!, width: colW[2]!, height: rowH[0]! },
        action: {
          type: "postback",
          label: "餘額",
          data: "action=balance",
          displayText: "餘額",
        },
      },
      // bot-left: 帳戶
      {
        bounds: { x: xs[0]!, y: ys[1]!, width: colW[0]!, height: rowH[1]! },
        action: {
          type: "uri",
          label: "帳戶",
          uri: `https://liff.line.me/${liffId}/accounts`,
        },
      },
      // bot-mid: 本月
      {
        bounds: { x: xs[1]!, y: ys[1]!, width: colW[1]!, height: rowH[1]! },
        action: {
          type: "postback",
          label: "本月",
          data: "action=monthly",
          displayText: "本月",
        },
      },
      // bot-right: 選單
      {
        bounds: { x: xs[2]!, y: ys[1]!, width: colW[2]!, height: rowH[1]! },
        action: {
          type: "postback",
          label: "選單",
          data: "action=menu",
          displayText: "選單",
        },
      },
    ],
  });

  console.log("rich menu created:", menu.richMenuId);
  console.log("bot:", basicId);
  console.log("next: upload image then it will be set default:");
  console.log(`  npm run line:richmenu:upload -- ${menu.richMenuId} /tmp/richmenu.jpg`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
