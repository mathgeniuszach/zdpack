const {addMSG, showMSGs, options} = require("./cli");

const HJSON = require("hjson");
const YAML = require("js-yaml");
const fs = require("fs-extra");
const path = require("path");
const JSZip = require("jszip");
const assert = require("assert");

const {isEqual} = require("lodash");

/**
 * Converts a Minecraft version string to a pack format number
 * @param {string} version A Minecraft version string
 * @returns {number} The pack format number corresponding to the Minecraft version.
 */
exports.getPackFormat = (version) => {
    const parts = version.split(".");
    const minor = parseInt(parts[1]);

    if (minor < 6) return 0;

    switch (minor) {
        case 6:
        case 7:
        case 8:
            return 1;
        case 9:
        case 10:
            return 2;
        case 11:
        case 12:
            return 3;
        case 13:
        case 14:
            return 4;
        case 15:
            return 5;
        case 16:
            if (parseInt(parts[2] || 0) <= 1) return 5;
            else return 6;
        case 17:
            return 7;
        case 18:
            return 8;
        case 19:
            return 9;
        case 20:
            return 10;
        default:
            return -1;
    }
};

async function read(link, ext) {
    let data = null;
    if (ext === ".hjson" || ext === ".json") {
        data = HJSON.parse(
            typeof link === "string" ?
                (await fs.readFile(link)).toString() :
                await link.async("text")
        );
    } else if (ext == ".yaml" || ext == ".yml") {
        data = YAML.load(
            typeof link === "string" ?
                (await fs.readFile(link)).toString() :
                await link.async("text")
        );
    } else if (ext == ".mcfunction" || ext == ".cmds") {
        if (typeof link === "string") {
            data = (await fs.readFile(link)).toString();
        } else {
            data = await link.async("text");
        }
    }

    return data;
}

/**
 * Validates a file in a pack.
 * @param {string} pack The friendly name of the pack of the item.
 * @param {string} type The type of the item, e.g. "tags", "functions", etc.
 * @param {string} name A name/path of the file to show on error.
 * @param {string} ext The extension of the file.
 * @param {string | JSZip.JSZipObject} link Either a path pointing to a file to read or a zip object to read.
 * @returns {boolean} Whether or not the file is valid.
 */
exports.validate = async (pack, type, name, ext, link) => {
    try {
        let data = await read(link, ext);

        // Only attempt validation of data if it could be gathered
        if (data) {
            // Validate tags
            // TODO: create a full featured validator.
            if (type === "tags") {
                // Replace is optional, defaults to false.
                assert(["undefined", "boolean"].includes(typeof data.replace));
                // Values is not optional, and it must be an array.
                assert(Array.isArray(data.values));
                // Each value in the array must be a string or an object
                for (const v of data.values) {
                    if (typeof v == "object") {
                        assert(typeof v.id == "string");
                        assert(["undefined", "boolean"].includes(typeof v.required));
                    } else {
                        assert(typeof v == "string");
                    }
                }
            }
        }
        return true;
    } catch (err) {
        addMSG(`"${type}" item "${name}" from pack "${pack}" is invalid; ${err}`, "error");
        return false;
    }
};
/**
 * Converts a file in a pack to an output location, merging files or overwriting depending on the situation.
 * @param {string} pack The friendly name of the pack of the item.
 * @param {string} type The type of the item, e.g. "tags", "functions", etc.
 * @param {string} name A name/path of the file to show on error.
 * @param {string} ext The extension of the file.
 * @param {string | JSZip.JSZipObject} link Either a path pointing to a file to read or a zip object to read.
 * @param {string} outLoc A path to the output location of this file.
 * @returns {boolean} Whether or not the file was successfully converted.
 */
exports.convert = async (pack, type, name, ext, link, outLoc) => {
    try {
        // Minecraft paths can only contain lowercase letters.
        // Also, paths are USUALLY case sensitive, except in Linux, but the temp folder in Linux is all lowercase anyway
        let loc = outLoc.toLowerCase();
        let data = await read(link, ext);

        let known = true;

        if (ext === ".hjson" || ext === ".json") {
            loc = path.parse(outLoc);
            loc = path.join(loc.dir, loc.name) + ".json";
        } else if (ext === ".yaml" || ext === ".yml") {
            loc = path.parse(outLoc);
            loc = path.join(loc.dir, loc.name) + ".json";
        } else if (ext === ".mcfunction" || ext === ".cmds") {
            loc = path.parse(outLoc);
            loc = path.join(loc.dir, loc.name) + ".mcfunction";
        } else {
            known = false;

            // Unknown file types just get copied as is
            if (typeof link === "string") {
                data = await fs.readFile(link);
            } else {
                data = await link.async("nodebuffer");
            }
        }


        // Write output file data to place
        if (fs.existsSync(loc)) {
            // This variable says whether or not overwriting is safe
            let safe = false;

            // Only if we know the file type do we attempt merging
            if (known) {
                const oldData = await read(loc, path.extname(loc));
                // If the old file is the same as the new file, we just skip it because it doesn't matter
                if (isEqual(oldData, data)) return true;

                if (type === "tags") {
                    if (oldData.replace) data.replace = true;
                    // Mix the tag values together
                    data.values = [...new Set([...oldData.values, ...data.values])];

                    safe = true;
                }
                if (type !== "functions") data = JSON.stringify(data, null, 4);
            }

            if (safe) {
                await fs.writeFile(loc, data);
            } else {
                if (options.overwrite) {
                    addMSG(`"${type}" item "${name}" from pack "${pack}" is overwriting existing file`, "log");
                    await fs.rm(loc, {recursive: true});
                    await fs.writeFile(loc, data);
                } else {
                    addMSG(`"${type}" item "${name}" from pack "${pack}" conflicts with existing file, ignoring`, "log");
                }
            }
        } else {
            // If the file does not exist, we don't have to worry about overwriting
            if (known) data = JSON.stringify(data, null, 4);
            await fs.ensureFile(loc);
            await fs.writeFile(loc, data);
        }

        return true;
    } catch (err) {
        addMSG(`Failed to convert "${type}" item "${name}" from pack "${pack}", skipping; ${err}`, "error");
        return false;
    }
};