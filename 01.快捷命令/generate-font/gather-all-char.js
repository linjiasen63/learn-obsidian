const { time } = require("console");
const fs = require("fs");
const path = require("path");

function recursionFile(filePath, set) {
  const filenameList = fs.readdirSync(filePath);
  for (let i = 0; i < filenameList.length; i++) {
    const filename = filenameList[i];
    if (filename == ".DS_Store") continue;
    const file = path.join(filePath, filename);
    const stat = fs.statSync(file);
    if (stat.isFile()) {
      const fileContent = fs.readFileSync(file);
      const fileStr = String(fileContent);
      for (let ch of fileStr) {
        set.add(ch);
      }
    } else if (stat.isDirectory()) {
      recursionFile(file, set);
    }
  }
}

(function () {
  const curDirPath = __dirname;
  const resultFile = path.resolve(curDirPath, "./.tmp/index.html");
  const resultDir = path.dirname(resultFile);
  if (!fs.existsSync(resultDir)) {
    console.log('mkdir dist')
    fs.mkdirSync(resultDir)
  }
  const set = new Set();
  fs.writeFileSync(resultFile, "");

  const filePath = path.resolve(curDirPath, "../../02.内容管理");
  recursionFile(filePath, set);

  const allCharStr = Array.from(set).join("");
  const htmlStr = `
<!DOCTYPE html>
<html lang="en">
  <body>
    <style>
      @font-face {
        font-family: "CustomFont1";
        src: url("./font/SanMu.ttf") format("truetype");
      }
      @font-face {
        font-family: "CustomFont2";
        src: url("./font/HYRunYuan-55W.ttf") format("truetype");
      }
      * {
        font-family: CustomFont1, CustomFont2 !important;
      }
    </style>
    <!-- 项目所有使用到的字符如下 -->
    <div>${allCharStr}</div>
  </body>
</html>
`;

  fs.writeFileSync(resultFile, htmlStr);
})();
