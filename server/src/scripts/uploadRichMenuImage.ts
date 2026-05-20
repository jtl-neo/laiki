import fs from "node:fs";
import { lineClient, lineBlobClient } from "../line/client.js";

async function main(): Promise<void> {
  const richMenuId = process.argv[2];
  const filePath = process.argv[3];
  if (!richMenuId || !filePath) {
    console.error("Usage: uploadRichMenuImage <richMenuId> <imagePath>");
    process.exit(1);
  }
  if (!fs.existsSync(filePath)) {
    console.error(`file not found: ${filePath}`);
    process.exit(1);
  }
  const buf = fs.readFileSync(filePath);
  const mime = filePath.toLowerCase().endsWith(".png") ? "image/png" : "image/jpeg";
  await lineBlobClient().setRichMenuImage(
    richMenuId,
    new Blob([buf], { type: mime }),
  );
  console.log(`uploaded ${buf.length} bytes (${mime}) → ${richMenuId}`);
  await lineClient().setDefaultRichMenu(richMenuId);
  console.log(`set as default rich menu`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
