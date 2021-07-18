const {app, BrowserWindow} = require('electron');
const path = require("path");
const {getDownloadsFolder} = require("platform-folders");

process.chdir(getDownloadsFolder());

// if (process.argv.length <= 1) {
// Initialize the remote module (because it's easier AND WAY SIMPLER than ipc)
require('@electron/remote/main').initialize();

// show gui
function createWindow() {
    const win = new BrowserWindow({
        width: 800,
        height: 600,
        webPreferences: {
            preload: path.join(__dirname, "preload.js"),
            enableRemoteModule: true
        }
    });

    win.loadFile(path.join(__dirname, "index.html"));
    win.setMenuBarVisibility(false);

    app.win = win;
}

app.whenReady().then(() => {
    createWindow();
});
app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length == 0) createWindow();
});
app.on("window-all-closed", () => {
    if (process.platform != "darwin") app.quit();
});
// } else {
//     // revert to cli, which I've given up on for now
//     require(path.join(__dirname, "packer/launch"));
// }

