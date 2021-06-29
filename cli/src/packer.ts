import JSZip from "jszip";
import zipdir from "zip-dir";
import nid from "nid";
import zdpack from "./index";

import fs from "fs-extra";
import {tmpdir} from "os";
import path from "path";

// const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

let msgs: [string, string][] = [];
export function addMSG(msg: string, type: string = "log") {
    msgs.push([msg, type]);
}
export function showMSGs() {
    for (const [msg, type] of msgs) console[type](msg);
    msgs = [];
}

import {getPackFormat, validate, convert} from "./convert";
import {merge} from "./merge";

export const options: {[key: string]: any} = {};
let payload: {[key: string]: any} = {};
let bar: any = null;

async function scanItem(packName, item, type?: string) {
    let fileCount = 0;

    const stats = await fs.stat(item);
    if (stats.isDirectory()) {
        // Scan every file in directories
        const dir = await fs.opendir(item);
        try {
            for (const f of dir) fileCount += await scanItem(packName, path.join(item, f.name), type || f);
        } finally {
            await dir.close();
        }
    } else if (stats.isFile()) {
        // Scan and validate this file
        if (await validate(packName, type, item, path.extname(item), item)) {
            fileCount++;
        } else {
            fileCount = -Infinity;
        }
    }

    return fileCount;
}
async function scanPack(root, packName) {
    let fileCount = 0;

    const stats = await fs.stat(root);
    if (stats.isDirectory()) {
        // Should be a pack in a folder
        const dataPath = path.join(root, "data");
        const assetsPath = path.join(root, "assets");

        if (options.type !== "assets" && await fs.existsSync(dataPath)) {
            fileCount += await scanItem(packName, dataPath);
        }
        if (options.type !== "data" && await fs.existsSync(assetsPath)) {
            fileCount += await scanItem(packName, assetsPath, "asset");
        }
    } else if (stats.isFile()) {
        // Should be a pack in a zip file
        const zip = await JSZip().loadAsync(await fs.readFile(root));
        for (const [k, v] of Object.entries(zip.files)) {
            const f = k.split("/");
            // Make sure this is not a root level file (we don't parse root level files)
            if (f.length > 1 && f[f.length-1]) {
                // Make sure this file is in a usable folder
                if (f[0] === "data" && options.type !== "assets" || f[0] === "assets" && options.type !== "data") {
                    // Validate the file
                    if (await validate(packName, f[0] === "assets" ? "asset" : f[2], k, path.extname(k), v)) {
                        fileCount++;
                    } else {
                        fileCount = -Infinity;
                    }
                }
            }
        }
    }

    return fileCount;
}

async function convertItem(packName, item, outItem, type?: string) {
    const stats = await fs.stat(item);
    if (stats.isDirectory()) {
        // Convert every file in directories
        const dir = await fs.opendir(item);
        try {
            for (const f of dir) await convertItem(packName, path.join(item, f.name), path.join(outItem, f.name), type || f);
        } finally {
            await dir.close();
        }
    } else if (stats.isFile()) {
        payload.item = path.basename(item);
        bar.update(null);

        // Convert this file
        try {
            await convert(packName, type, item, path.extname(item), item, outItem);
        } catch (err) {
            addMSG(`Failed to convert file "${item}" from pack "${packName}"; ${err}`, "error");
        }
        
        bar.increment();
    }
}
async function convertPack(tempOut, pack) {
    const packName = path.basename(pack);

    const stats = await fs.stat(pack);
    if (stats.isDirectory()) {
        // Should be a pack in a folder
        const dataPath = path.join(pack, "data");
        const assetsPath = path.join(pack, "assets");

        if (options.type !== "assets" && await fs.existsSync(dataPath)) {
            await convertItem(packName, dataPath, path.join(tempOut, "data"));
        }
        if (options.type !== "data" && await fs.existsSync(assetsPath)) {
            await convertItem(packName, assetsPath, path.join(tempOut, "assets"), "asset");
        }
    } else if (stats.isFile()) {
        // Should be a pack in a zip file
        const zip = await JSZip().loadAsync(await fs.readFile(pack));
        for (const [k, v] of Object.entries(zip.files)) {
            const f = k.split("/");
            const name = f[f.length-1];
            // Make sure this is not a root level file (we don't parse root level files)
            if (f.length > 1 && name) {
                // Make sure this file is in a usable folder
                if (f[0] === "data" && options.type !== "assets" || f[0] === "assets" && options.type !== "data") {
                    payload.item = name;
                    bar.update(null);

                    // Convert this file
                    try {
                        await convert(packName, f[0] === "assets" ? "asset" : f[2], k, path.extname(k), v, path.join(tempOut, k));
                    } catch (err) {
                        addMSG(`Failed to convert file "${k}" from pack "${packName}"; ${err}`, "error");
                    }

                    bar.increment();
                }
            }
        }
    }
}


/**
 * Packs datapack(s) using the options given to it.
 * @param {*} ioptions Options describing what to pack and how to pack it
 * @param {*} ibar A progress bar to update as progress is made
 */
export async function pack(ioptions, ibar) {
    for (const key of Object.keys(options)) delete options[key];
    Object.assign(options, ioptions);

    payload = {};
    bar = ibar;

    const tempOut = path.join(tmpdir(), "zdpack-" + nid(10));
    await fs.mkdir(tempOut);
    
    // Load javascript file
    let js;
    if (options.js) {
        console.log("Loading JavaScript file");

        const script = path.resolve(options.js);
        const cwd = process.cwd();
        process.chdir(tempOut);
        js = require(script);
        if (js.init) await js.init();
        process.chdir(cwd);
    }

    if (options.packs) {
        // Scan packs to get progress time and to validate them
        console.log("Validating Packs");
        payload.item = path.basename(options.packs[0]);
        bar.start(options.packs.length, 0, payload);

        let total = 0;
        const tpacks = [];

        for (const pack of options.packs) {
            const name = path.basename(pack);
            payload.item = name;
            bar.update(null);

            try {
                const fileCount = await scanPack(pack, name);
                if (fileCount) {
                    tpacks.push(pack);
                    total += fileCount;
                } else {
                    addMSG(`"${name}" has no content files`, "warn");
                }
            } catch (err) {
                addMSG(`"${name}" could not be read; ${err}`, "warn");
            }

            // Increment the progress bar
            bar.increment();
        }

        bar.stop();
        showMSGs();

        // If total is -Infinity, then a file failed and we do not attempt to merge files
        if (total == -Infinity) {
            console.error("\nFailed to validate one or more packs.");
            return;
        } else if (total === 0) {
            console.error("\nNo files found in the given packs!");
            return;
        }


        // Convert, copy, and merge packs into a temporary directory
        console.log("Copying Packs");
        payload.item = "...";
        bar.start(total, 0, payload);

        try {
            for (const pack of tpacks) {
                await convertPack(tempOut, pack);
            }
        } catch (err) {
            fs.rm(tempOut, {recursive: true});
            bar.stop();
            console.error(`Fatal error converting pack; ${err}`);
            return;
        }

        bar.stop();
        showMSGs();
    }


    // Merge include folders
    if (options.include) {
        console.log("Merging include folders");
        payload.item = "...";
        bar.start(options.include.length, 0, payload);

        try {
            merge(payload, bar, tempOut, options.include);
        } catch (err) {
            fs.rm(tempOut, {recursive: true});
            bar.stop();
            console.error(`Fatal error including folders in pack; ${err}`);
            return;
        }

        bar.stop();
        showMSGs();
    }

    
    // Finally, format/archive temporary directory to final output
    const isZip = ["data", "assets", "pack"].includes(options.type);
    if (options.type !== "fabric") {
        // Create pack.mcmeta file
        fs.writeFile(path.join(tempOut, "pack.mcmeta"), JSON.stringify({pack: {
            pack_format: getPackFormat(options.mcv),
            description: options.desc || ""
        }}, null, 4));
    }
    if (options.type === "forge" || options.type === "mod") {
        await fs.ensureDir(path.join(tempOut, "META-INF"));
        await fs.writeFile(path.join(tempOut, "META-INF/MANIFEST.MF"), "Manifest-Version: 1.0\nFMLModType: LIBRARY\n\n");
        await fs.writeFile(path.join(tempOut, "META-INF/mods.toml"), `modLoader="javafml"\nloaderVersion="[1,)"\nlicense="It exists somewhere, I think"\n\n[[mods]]\nmodId="${options.id || path.basename(options.output).replace(/[^A-Za-z_]+/g, "").toLowerCase()}"\ndisplayName="${path.basename(options.output)}"\nversion="1.0.0"\ndescription='''\n${options.desc || ""}\n'''`);
    }
    if (options.type === "fabric" || options.type === "mod") {
        await fs.writeFile(path.join(tempOut, "fabric.mod.json"), JSON.stringify({
            schemaVersion: 1,
            authors: [],
            environment: "*",
            name: path.basename(options.output),
            id: options.id || path.basename(options.output).replace(/[^A-Za-z_]+/g, "").toLowerCase(),
            version: "1.0.0",
            description: options.desc || "",
            license: "It exists somewhere, I think"
        }, null, 4));
    }


    // Run ready in javascript file
    if (options.js) {
        console.log("Loading JavaScript file");

        const cwd = process.cwd();
        process.chdir(tempOut);
        if (js.ready) await js.ready();
        await zdpack.finalize(); // Finalize variables and stuffs
        process.chdir(cwd);

    }

    if (options.output !== "NUL") {
        // Export to folder or zip
        if (options.folder) {
            if (await fs.existsSync(options.output)) await fs.rm(options.output, {recursive: true});
            await fs.move(tempOut, options.output);
        } else {
            // For some reason, this zipping library requires us to move the temp folder once for no reason at all.
            const id = nid(8);
            await fs.move(tempOut, id);
            await zipdir(id, {saveTo: options.output + (isZip ? ".zip" : ".jar")});

            await fs.rm(id, {recursive: true});
        }
    }
}