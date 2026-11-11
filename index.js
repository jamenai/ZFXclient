import downloadGame from "./download.js";
console.log("Building ZFX Client");
await downloadGame();
await import("./build.js");
