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
 * @param {string} root The root folder under the pack folder, "data" for datapacks and "assets" for resource packs.
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
 * @param {string} type The folder underneath the "tags" folder, like "items" or "functions".
 * @param {string} id A namespaced id to be put into the `resolveID()` function. If it does not have an extension the extension is assumed to be ".json"
 * @param {string} values A list of strings/objects to use as values in the tag
 * @param {boolean} replace A boolean saying whether or not to replace an existing tag. When set to true (false is default), the `replace` field in the tag will be set and the values will not merge with an existing tag.
 * @param {*} object A javascript object to convert into json.
 */
exports.addTag = async (type, id, values, replace=false) => {
    const tid = exports.resolveID("tags/"+type, id);
    if (replace) {
        await fs.ensureFile(tid);
        await fs.writeJSON(tid, {replace, values});
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
