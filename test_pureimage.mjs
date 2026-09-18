import * as PURE from "pureimage";
import fs from "node:fs";

async function testPureImage() {
  const font = PURE.registerFont(
    "F:/origins caffee proiect/COD/origins-platform/public/wallet/apple/Cormorant.ttf",
    "Cormorant",
  );
  font.loadSync();

  const img = await PURE.decodePNGFromStream(
    fs.createReadStream(
      "F:/origins caffee proiect/COD/origins-platform/public/wallet/apple/strip-circle@3x.png",
    ),
  );
  const ctx = img.getContext("2d");

  ctx.fillStyle = "rgba(236, 239, 216, 0.5)";
  ctx.font = "80pt 'Cormorant'";
  ctx.fillText("Szanto Denis", 74, 215 + 2);

  ctx.fillStyle = "rgba(26, 38, 18, 0.4)";
  ctx.fillText("Szanto Denis", 74, 215 - 2);

  ctx.fillStyle = "rgb(42, 59, 31)";
  ctx.fillText("Szanto Denis", 74, 215);

  const outPath = "F:/origins caffee proiect/test_pureimage.png";
  await PURE.encodePNGToStream(img, fs.createWriteStream(outPath));
  console.log("PUREIMAGE SUCCESS! Saved to test_pureimage.png");
}

testPureImage();
