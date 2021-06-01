const {program, Option, InvalidOptionArgumentError} = require("commander");
const progress = require("cli-progress");
const JSZip = require("jszip");
const zipdir = require("zip-dir");
const nid = require("nid");

const fs = require("fs-extra");
const {tmpdir} = require("os");
const path = require("path");

program.version("0.1.0");
program
    .addOption(
        new Option(
            "-t, --type <type>", 
            "The format to output datapacks in.")
        .choices(["data", "assets", "pack", "forge", "fabric", "mod"])
        .default("pack")
    ).option(
        "-o, --output <loc>",
        '"loc" is the full path and name of a folder location to output too, without an extension. Use NUL to mean "do not output to any folder", which is useful for validating json files. If the folder already exists, it will be deleted. Defaults to "pack".',
        "pack"
    ).requiredOption(
        "-m, --mcv <ver>",
        "Minecraft version the output pack is designed for. Use a format like 1.16 or 1.16.0 or 1.16.4.",
        (v) => {
            if (!/^\d+\.\d+(?:\.\d+)?$/.test(v))
                throw new InvalidOptionArgumentError(`Invalid Minecraft version "${v}"`);
            return v;
        }
    ).option(
        "-p, --packs <packs...>",
        "A list of packs (or just a single pack) to convert/merge together. If none are given, the output folder might be empty."
    ).option(
        "-d, --desc <desc>",
        "A description for the outputed pack/mod."
    ).option(
        "-f, --folder",
        'Generate the output pack/mod as a folder at "output" instead of a zip or jar file.'
    ).option(
        "-n, --id <modid>",
        "The mod id to use if the output is a mod. If this is not specified, the id is generated from the output folder."
    ).option(
        "-l, --overwrite",
        "By default, when merging packs together, data copied from packs last in the list will not overwrite data copied from a previous pack. This option makes it so data will overwrite previous files. This does not apply to tags, which can be merged with no issues."
    ).option(
        "-i, --include <folders...>",
        "A list of folders to merge on top of the final output. Warnings will be shown when overwriting data, and items in these folders will always overwrite items with the same name from left to right. You can use this to include files or overwrite mod metadata to include dependencies."
    ).option(
        "-j, --js <file>",
        'A javascript file to run after all datapacks are loaded and include folders merged. The working directory will be set to the root of the datapack before running the script. Use the "zdpack" module for convenience functions you can use to make common files in a datapack.'
    );

program.parse();
const options = program.opts();
exports.options = options;

const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

let msgs = [];
function addMSG(msg, type="log") {
    msgs.push([msg, type]);
}
function showMSGs() {
    for (const [msg, type] of msgs) console[type](msg);
    msgs = [];
}
exports.addMSG = addMSG;
exports.showMSGs = showMSGs;

const {getPackFormat, validate, convert} = require("./convert");
const {merge} = require("./merge");


async function scanItem(packName, item, type) {
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

async function convertItem(packName, item, outItem, type) {
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
        await convert(packName, type, item, path.extname(item), item, outItem);
        
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

                    // Validate the file
                    await convert(packName, f[0] === "assets" ? "asset" : f[2], k, path.extname(k), v, path.join(tempOut, k));

                    bar.increment();
                }
            }
        }
    }
}

// Create progress bar
const payload = {};
const bar = new progress.SingleBar({
    format: "[{bar}] {value}/{total} | {percentage}% | ETA: {eta_formatted} | {item}",
    barCompleteChar: '=',
    barIncompleteChar: ' ',
    hideCursor: true
});

(async()=>{
    const tempOut = await fs.mkdir(path.join(tmpdir(), "zdpack-" + nid(10)));

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


    // Run javascript file
    if (options.js) {
        console.log("Running JavaScript file");

        const script = path.resolve(options.js);
        const cwd = process.cwd();
        process.chdir(tempOut);
        require(script);
        process.chdir(cwd);
    }


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
})();