/**
 * 将 scripts/logo.png（支持 PNG/JPEG）转为符合 Windows 的 logo.ico
 */
import sharp from "sharp";
import pngToIco from "png-to-ico";
import fs from "fs";
import path from "path";

const logoPath = path.join(__dirname, "logo.png");
const icoPath = path.join(__dirname, "logo.ico");

async function main() {
  const buf = await sharp(logoPath).resize(256, 256).png().toBuffer();
  const icoBuf = await pngToIco(buf);
  fs.writeFileSync(icoPath, icoBuf);
  console.log(`✅ 已生成 ${icoPath}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
