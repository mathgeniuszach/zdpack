// TODO: API for easily creating datapack files

const fs = require("fs-extra");
const path = require("path");

/**
 * Takes a namespaced id (e.g. `minecraft:thing/another/third`) and converts it to a full path relative to the current working directory (e.g. `data/minecraft/{type}/thing/another/third.json`).
 * 
 * @param {string} type The folder underneath the namespace folder, like "tags" or "advancements".
 * @param {string} id A namespaced id. If it does not have an extension the extension is assumed to be `ext`. If a namespace is not given it is assumed to be "minecraft".
 * @param {string} ext If an extension is not provided in `id`, this is the extension to use for the file.
 * @param {string} root The root folder under the pack folder, "data" for datapacks and "assets" for resource packs.
 * @returns {string} A properly formatted path generated from the id.
 */
exports.resolveID = (type, id, ext=".json", root="data") => {
    if (!/^([a-z][a-z0-9_]*:)?[a-z][a-z0-9_]*(\/[a-z][a-z0-9_]*)*(\.[a-z][a-z0-9_]*)?$/.test(id)) throw new Error(`invalid namespaced id "${id}"`);

    const parts = id.split(/:/g);
    if (parts.length < 2) parts.unshift("minecraft");
    return path.join(root, parts[0], type, parts[1]) + (path.extname(id) ? "" : ext);
};

/**
 * Writes some JSON data to a file in the datapack pointed to by a namespaced id. If the file already exists, it will be overwriten.
 * 
 * @param {string} type The folder underneath the namespace folder, like "tags" or "advancements".
 * @param {string} id A namespaced id to be put into the `resolveID()` function. If it does not have an extension the extension is assumed to be ".json"
 * @param {string} root The root folder under the pack folder, "data" for datapacks and "assets" for resource packs. Defaults to "data".
 * @param {*} object A javascript object to convert into json.
 */
exports.add = async (type, id, object, root="data") => {
    const tid = exports.resolveID(type, id, ".json", root);
    await fs.ensureFile(tid);
    await fs.writeJSON(tid, object);
};

/**
 * Creates or merges values in a tag (specified by a namespaced id).
 * 
 * @param {string} type The folder underneath the "tags" folder, like "items", "blocks", or "functions".
 * @param {string} id A namespaced id to be put into the `resolveID()` function. If it does not have an extension the extension is assumed to be ".json"
 * @param {string} values A list of strings/objects to use as values in the tag
 * @param {boolean} replace A boolean saying whether or not to replace an existing tag. When set to true (false is default), the `replace` field in the tag will be set and the values will not merge with an existing tag.
 * @param {*} object A javascript object to convert into json.
 */
exports.addTag = async (type, id, values, replace=false) => {
    const tid = exports.resolveID("tags/"+type, id);
    if (replace) {
        await fs.ensureFile(tid);
        await fs.writeJSON(tid, {replace: true, values});
    } else {
        if (fs.existsSync(tid)) {
            const old = await fs.readJSON(tid);
            await fs.writeJSON(tid, {values: [...new Set([...old.values, ...values])]});
        } else {
            await fs.ensureFile(tid);
            await fs.writeJSON(tid, {values});
        }
    }
};

/**
 * Registers a command for use in CommandScript files.
 * If a callback is given, it is called with the id of the function as the first argument and the rest of the arguments of the command and should return a string of mcfunction code.
 * Selector, NBT, or HJSON arguments will be transformed into a plain object (selectors have an $ field that defines the target as "@[something]"), numbers into numbers, and strings into strings.
 * @param {string} name The name of the command used to call this command.
 * @param {Function} callback An optional callback function used to generate mcfunction code as a string based upon command arguments.
 */
exports.registerCmd = (name, callback=undefined) => {
    if (!global.ZDPACK) throw Error("Not inside a datapack (you must run this file from the zdpack command)");

    if (callback == undefined) {
        global.ZDPACK.cmds[name] = callback;
    } else {
        global.ZDPACK.rawcmds.add(name);
    }
};

/**
 * Compiles CommandScript code (CommandScript is a superset of MCFunction) into MCFunction code, optionally with custom commands registered through `registerCmd()`.
 * @param {string} id A namespaced id to be put into the `resolveID()` function to determine where to output compiled code to. If it does not have an extension the extension is assumed to be ".mcfunction"
 * @param {string} data A string containing CommandScript code to compile.
 * @param {boolean} append By default, the compiled code will overwrite the file at the given `id`. Set this to true to instead append to the end of the mcfunction file if it exists.
 */
exports.addCmds = async (id, data, append=false) => {
    const loc = exports.resolveID("functions", id, ".mcfunction");

    // TODO: Begin by parsing CommandScript into a JSON AST.
    // TODO: Afterwards, read through JSON AST to create mcfunction code.
};
