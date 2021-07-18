import fs from "fs-extra";
import nid from "nid";
import path from "path";
import pegjs from "pegjs";

// Generate the CommandScript parser
const parser = pegjs.generate(fs.readFileSync(path.resolve(__dirname, "cmds.pegjs"), "utf-8"));



// Options and compiler state
export const state = {
    // Constant numbers that need a scoreboard value set for them (since minecraft doesn't let you do constant multiplication and such)
    consts: new Set([-1]),
    // Dummy variables to initialize
    vars: new Set(["__temp__"]),
    // n and x value for compiled expressions (n is reset, x is not)
    n: 0,
    x: 0,
    // randomly generated namespace to put auto-generated functions in so they don't conflict with anything.
    rng: "f" + nid(10),

    // Registered custom commands
    cmds: new Set(["ability","advancement","agent","allowlist","alwaysday","attribute","ban","ban-ip","banlist","bossbar","camerashake","changesetting","classroommode","clear","clearspawnpoint","clone","closechat","closewebsocket","code","codebuilder","connect","data","datapack","daylock","debug","dedicatedwsserver","defaultgamemode","deop","dialogue","difficulty","effect","enableencryption","enchant","event","execute","experience","fill","fog","forceload","function","gamemode","gamerule","gametest","getchunkdata","getchunks","geteduclientinfo","geteduserverinfo","getlocalplayername","getspawnpoint","gettopsolidblock","give","globalpause","help","immutableworld","item","kick","kill","lesson","list","listd","locate","locatebiome","loot","me","mobevent","msg","music","op","ops","pardon","pardon-ip","particle","permission","playanimation","playsound","publish","querytarget","recipes","reload","remove","replaceitem","ride","save","save-all","save-off","save-on","say","schedule","scoreboard","seed","setblock","setidletimeout","setmaxplayers","setworldspawn","spawnitem","spawnpoint","spectate","spreadplayers","stop","stopsound","structure","summon","tag","takepicture","team","teammsg","teleport","tell","tellraw","testfor","testforblock","testforblocks","tickingarea","time","title","titleraw","tm","toggledownfall","tp","trigger","videostream","w","wb","weather","whitelist","worldborder","worldbuilder","wsserver","xp","achievement","banip","blockdata","broadcast","chunk","clearfixedinv","detect","entitydata","executeasself","home","position","mixer","resupply","say","setfixedinvslot","setfixedinvslots","setspawn","solid","stats","toggledownfall","transferserver","unban"]),
    callbacks: {},
};

export class Selector {
    target: string
    args: any[]

    constructor(target: string, args: any[] = null) {
        this.target = target;
        this.args = args;
    }

    toString(): string {
        if (this.target.length > 1 && !this.args) return this.target;

        const entries = Object.entries(this.args ?? []);
        if (entries.length > 0) {
            return "@" + this.target + "[" + entries.map((s) => `${s[0]}=${stringify(s[1], true, s[0] == "scores")}`).join() + "]";
        } else {
            return "@" + this.target;
        }
    }
}

export class Range {
    min: number
    max: number

    constructor(min: number, max: number) {
        this.min = parseFloat((min ?? -Infinity) as unknown as string);
        this.max = parseFloat((max ?? Infinity) as unknown as string);
    }

    toString(): string {
        return `${isFinite(this.min) ? this.min : ""}..${isFinite(this.max) ? this.max : ""}`;
    }
}

export class JointItem {
    item: string
    state: {[key: string]: any}
    nbt: {[key: string]: any}

    constructor(item: string, state: {[key: string]: any}, nbt: {[key: string]: any}) {
        this.item = item;
        this.state = state;
        this.nbt = nbt;
    }

    toString(): string {
        const s = [this.item];

        if (this.state) s.push("[" + Object.entries(this.state).map((s) => `${s[0]}:${stringify(s[1])}`).join() + "]");
        if (this.nbt) s.push(stringify(this.nbt));

        return s.join("");
    }
}

/**
 * Stringifies something for use in MCFunction code.
 * @param {*} e The thing to stringify
 * @param {boolean} quote Whether or not to quote quoted strings
 * @param {boolean} useEqual Whether or not dictionaries should use equal signs in them instead of colons
 * @returns {string} A string to use in MCFunction code.
 */
export function stringify(e: any, quote: boolean = true, useEqual: boolean = false): string {
    if (e instanceof String) {
        if (quote) return JSON.stringify(e);
        else return String(e);
    } else if (Array.isArray(e)) {
        return "[" + e.map((x) => stringify(x)).join() + "]";
    } else if (typeof e == "object" && !(e instanceof Selector || e instanceof Range || e instanceof JointItem)) {
        if (useEqual) {
            return "{" + Object.entries(e).map((s) => s[0].includes(" ") ? `"${s[0]}":${stringify(s[1])}` : `${s[0]}=${stringify(s[1])}`).join(",") + "}";
        } else {
            return "{" + Object.entries(e).map((s) => s[0].includes(" ") ? `"${s[0]}":${stringify(s[1])}` : `${s[0]}:${stringify(s[1])}`).join(",") + "}";
        }
    } else {
        return String(e).replace(/[\r\n]+/g, "");
    }
}

/**
 * Takes a namespaced id (e.g. `minecraft:thing/another/third`) and converts it to a full path relative to the current working directory (e.g. `data/minecraft/{type}/thing/another/third.json`).
 * 
 * @param {string} type The folder underneath the namespace folder, like "tags" or "advancements".
 * @param {string} id A namespaced id. If it does not have an extension the extension is assumed to be `ext`. If a namespace is not given it is assumed to be "minecraft".
 * @param {string} ext If an extension is not provided in `id`, this is the extension to use for the file.
 * @param {string} root The root folder under the pack folder, "data" for datapacks and "assets" for resource packs.
 * @returns {string} A properly formatted path generated from the id.
 */
export function resolveID(type: string, id: string, ext: string = ".json", root: string = "data"): string {
    if (!/^([a-z][a-z0-9_]*:)?[a-z][a-z0-9_]*(\/[a-z][a-z0-9_]*)*(\.[a-z][a-z0-9_]*)?$/.test(id)) throw new Error(`invalid namespaced id "${id}"`);

    const parts = id.split(/:/g);
    if (parts.length < 2) parts.unshift("minecraft");
    return path.join(root, parts[0], type, parts[1]) + (path.extname(id) ? "" : ext);
}

/**
 * Writes some JSON data to a file in the datapack pointed to by a namespaced id. If the file already exists, it will be overwriten.
 * 
 * @param {string} type The folder underneath the namespace folder, like "tags" or "advancements".
 * @param {string} id A namespaced id to be put into the `resolveID()` function. If it does not have an extension the extension is assumed to be ".json"
 * @param {*} object A javascript object to convert into json.
 * @param {string} root The root folder under the pack folder, "data" for datapacks and "assets" for resource packs. Defaults to "data".
 */
export async function add(type: string, id: string, object: any, root: string = "data") {
    const tid = resolveID(type, id, ".json", root);
    await fs.ensureFile(tid);
    await fs.writeJSON(tid, object);
}

/**
 * Deletes the specific file or folder in the datapack at the given id.
 * 
 * @param type The folder underneath the namespace folder, like "tags" or "advancements".
 * @param id A namespaced id to be put into the `resolveID()` function. If it does not have an extension the extension is assumed to be ".json"
 * @param root The root folder under the pack folder, "data" for datapacks and "assets" for resource packs. Defaults to "data".
 */
export async function remove(type: string, id: string, root: string = "data") {
    const tid = resolveID(type, id, ".json", root);
    await fs.remove(tid);
}

/**
 * Creates or merges values in a tag (specified by a namespaced id).
 * 
 * @param {string} type The folder underneath the "tags" folder, like "items", "blocks", or "functions".
 * @param {string} id A namespaced id to be put into the `resolveID()` function. If it does not have an extension the extension is assumed to be ".json"
 * @param {string[]} values A list of strings/objects to use as values in the tag
 * @param {boolean} replace A boolean saying whether or not to replace an existing tag. When set to true (false is default), the `replace` field in the tag will be set and the values will not merge with an existing tag.
 */
export async function addTag(type: string, id: string, values: string[], replace: boolean = false) {
    const tid = resolveID("tags/"+type, id);
    if (replace) {
        await fs.ensureFile(tid);
        await fs.writeJSON(tid, {replace: true, values});
    } else {
        if (fs.existsSync(tid)) {
            const old: {values: string[]} = await fs.readJSON(tid);
            await fs.writeJSON(tid, {values: [...new Set<string>([...old.values, ...values])]});
        } else {
            await fs.ensureFile(tid);
            await fs.writeJSON(tid, {values});
        }
    }
}

/**
 * Creates a shaped recipe in the datapack at the given id, that takes in the items in `pattern` and outputs the resulting item. Note that NBT crafting is NOT supported by vanilla minecraft. If you need more precise control of the recipe, use the `add()` function.
 * 
 * @param id A namespaced id to be put into the `resolveID()` function that specifies where to put the recipe.
 * @param pattern A list of lists of strings that make up the recipe. For example, `[["minecraft:stone", "minecraft:stone"]]` refers to two pieces of stone horizontally put together. If you want nothing in a spot, use "" or another falsy value. You can also preface a string with a `#` mark to use a tag instead of an item. If an array of strings is used instead of a string, any of those items or tags will be valid for that spot in the crafting recipe.
 * @param result A string id of the item made as a result of the crafting recipe.
 * @param count The number of crafted items made from this recipe.
 */
export async function addShapedRecipe(id: string, pattern: (string | string[])[][], result: string, count: number = 1, group?: string) {
    // Get the size of the pattern
    const iptrn: string[] = [];
    const len = Math.max(...pattern.map(v=>v.length));
    if (pattern.length > 3 || pattern.length < 1 || len > 3 || len < 1) throw Error(`Invalid dimensions ${len}x${pattern.length} for recipe pattern.`);

    // Create a reversed key
    let x = 0;
    const rkey = {"": " "};

    for (let r = 0; r < iptrn.length; r++) {
        iptrn[r] = "";
        for (let c = 0; c < len; c++) {
            let v = pattern[r][c] || "";
            if (typeof v == "object") v = JSON.stringify(v);

            if (v in rkey) {
                iptrn[r] += rkey[v];
            } else {
                rkey[String(x)] = v;
                iptrn[r] += x;
                x++;
            }
        }
    }

    // Create the actual recipe key
    const key = {};
    for (const [k, v] of Object.entries(rkey)) {
        switch (k[0]) {
            case "#":
                key[v] = {tag: k.substring(1)};
                break;
            case "[":
                key[v] = JSON.parse(v).map((s: string) => s[0] == "#" ? {tag: s.substring(1)} : {item: s});
                break;
            default:
                key[v] = {item: k};
                break;
        }
    }

    // Write recipe to file
    const data = {
        pattern: iptrn,
        key: key,
        result: {
            item: result,
            count: count
        }
    };
    if (group) data["group"] = group;
    await add("recipes", id, data);
}

/**
 * Creates a shapeless recipe in the datapack at the given id, that takes in the items in `ingredients` and outputs the resulting item. Note that NBT crafting is NOT supported by vanilla minecraft. If you need more precise control of the recipe, use the `add()` function.
 * 
 * @param id A namespaced id to be put into the `resolveID()` function that specifies where to put the recipe.
 * @param ingredients A list of strings that make up the items required in this recipe. For example, `["minecraft:stone", "minecraft:stone"]` refers to two pieces of stone put together. You can also preface a string with a `#` mark to use a tag instead of an item. If an array of strings is used instead of a string, any of those items or tags will be valid for that spot in the crafting recipe.
 * @param result A string id of the item made as a result of the crafting recipe.
 * @param count The number of crafted items made from this recipe.
 * @param group A string identifier. Used to group multiple recipes together in the recipe book.
 */
export async function addShapelessRecipe(id: string, ingredients: (string | string[])[], result: string, count: number = 1, group?: string) {
    const data = {
        type: "crafting_shapeless",
        ingredients: ingredients.map((v) => {
            if (typeof v == "object") {
                return v.map((s: string) => s[0] == "#" ? {tag: s.substring(1)} : {item: s});
            } else {
                return v[0] == "#" ? {tag: v.substring(1)} : {item: v};
            }
        }),
        result: {
            item: result,
            count: count
        }
    };
    if (group) data["group"] = group;
    await add("recipes", id, data);
}

/**
 * When the "vanilla" data pack is disabled, these kinds of recipes can be used to reenable desired builtin crafting recipes.
 * 
 * @param id A namespaced id to be put into the `resolveID()` function that specifies where to put the recipe.
 * @param type the `*` part of `crafting_special_*`. See the {@link https://minecraft.fandom.com/wiki/Recipe#crafting_special_.2A wiki} for more information.
 */
export async function addSpecialRecipe(id: string, type: string) {
    await add("recipes", id, {type: "crafting_special_" + type});
}

export async function addCookingRecipe(id: string, ingredient: string | string[], result: string, {type, cookingtime = 200, experience, group}: {type: string | string[], cookingtime: number, experience?: number, group?: string}) {
    let s;
    if (typeof ingredient == "string") {
        s = ingredient[0] == "#" ? ingredient.substring(1) : ingredient;
    } else {
        s = ingredient.map((s: string) => s[0] == "#" ? {tag: s.substring(1)} : {item: s});
    }

    const data = {
        type: type || "smelting",
        ingredient: s,
        result: result,
        cookingtime: cookingtime
    };
    if (group) data["group"] = group;
    if (experience) data["experience"] = experience;
    await add("recipes", id, data);
}

export async function addSmithingRecipe(id: string, base: string, addition: string, result: string, group?: string) {
    const data = {
        type: "smithing",
        base: base[0] == "#" ? base.substring(1) : base,
        addition: addition[0] == "#" ? addition.substring(1) : addition,
        result: result
    };
    if (group) data["group"] = group;
    await add("recipes", id, data);
}

export async function addStonecuttingRecipe(id: string, ingredient: string | string[], result: string, count: number = 1, group?: string) {
    let s;
    if (typeof ingredient == "string") {
        s = ingredient[0] == "#" ? ingredient.substring(1) : ingredient;
    } else {
        s = ingredient.map((s: string) => s[0] == "#" ? {tag: s.substring(1)} : {item: s});
    }

    const data = {
        type: "stonecutting",
        ingredient: s,
        result: result,
        count: count
    };
    if (group) data["group"] = group;
    await add("recipes", id, data);
}

/**
 * Registers a command for use in CommandScript files.
 * If a callback is given, it is called with the id of the function as the first argument and the rest of the arguments of the command and should return a string (or list of strings to be joined by newline) of mcfunction code.
 * NBT will be turned into a plain object, selectors into a `Selector` object, number ranges into a `Range` object, and other values into strings, numbers, or 
 * @param {string} name The name of the command to register.
 * @param {Function} callback An optional callback function used to generate mcfunction code as a string based upon command arguments.
 */
export function registerCmd(name: string, callback: (...args: any) => Promise<string | string[]> | string | string[] = undefined) {
    state.cmds.add(name);
    if (callback == undefined) {
        delete state.callbacks[name];
    } else {
        state.callbacks[name] = callback;
    }
}

/**
 * Unregisters a registered command for use in CommandScript files.
 * @param {string} name The name of the command to unregister.
 */
export function unregisterCmd(name: string) {
    delete state.callbacks[name];
    state.cmds.delete(name);
}

/**
 * Compiles the ast of a command into a list of strings to use as mcfunction code.
 * @param {object} ast CommandScript AST of a single command.
 * @returns {Promise<string[]>} a list of strings of mcfunction code
 */
export async function compileCmd(ast: {[key: string]: any}): Promise<string[]> {
    if (ast.type != "cmd") throw TypeError("given object is not a command ast");

    if (ast.cmd == "execute") {
        const code = await compileCmd(ast.run);
        const cmd = "execute " + ast.args.map((v) => v instanceof String ? `"${v}"` : String(v)).join(" ");

        if (code.length > 1) {
            // If the resulting command generates more than one command, we need to create a separate function to run them all
            const loc = `${state.rng}:exec${state.n++}`;
            await addRawCmds(loc, code.join("\n"));
            return [cmd + " run function " + loc];
        } else if (code.length == 1) {
            // Just one command
            return [cmd + " run " + code[0]];
        } else {
            // Execute command with no run statement
            return [cmd];
        }
    } else if (state.cmds.has(ast.cmd)) {
        const callback = state.callbacks[ast.cmd];
        if (callback) {
            // Callback exists, so we call it with the arguments
            const out = await callback(...ast.args);
            if (Array.isArray(out)) return out;
            else return String(out).split("\n").map((v) => v.trim());
        }

        // No callback, so we reconstruct the command from just it's arguments
        return [ast.cmd + " " + ast.args.map((v) => v instanceof String ? `"${v}"` : String(v)).join(" ")];
    }
    
    throw Error(`command "${ast.cmd}" is not registered`);
}


/**
 * The plural version of `compileCmd()`, which works with a list of json data or a string.
 * @param {string | object} data
 * @returns {Promise<string[]>} a list of strings of mcfunction code
 */
export async function compileCmds(data: string | {[key: string]: any}[]): Promise<string[]> {
    // Begin by parsing CommandScript into a JSON AST.
    const ast: {[key: string]: any}[] = typeof data == "string" ? parseCmds(data) : data;

    // TODO: try catch and give line number
    // Afterwards, read through JSON AST to create mcfunction code.
    const code = [];
    for (const cmd of ast) {
        try {
            code.push(...await compileCmd(cmd));
        } catch (err) {
            // Rethrow error with location data on failure
            if (cmd.loc) throw Error(`line ${cmd.loc.start.line}; ${err.message}`);
            else throw err;
        }
    }
    // const code = (await Promise.all(
    //     ast.map(async (cmd) => (await compileCmd(cmd)).join("\n"))
    // ));
    return code.join("\n").replace(/\n{2,}/, "\n").trim().split("\n");
}

/**
 * Parses CommandScript code into a JSON AST and returns the AST.
 * @param {string} data A string containing CommandScript code to parse.
 * @returns {object} JSON AST
 */
export function parseCmds(data: string): {[key: string]: any}[] {
    // Cleanup lines before parsing
    const pdata = data.replace(/\r\n|\r/g, "\n").replace(/[ \t]+\n\s+\.[ \t]+/g, " ") + "\n";

    return parser.parse(pdata, {
        Selector, Range, JointItem
    });
}

/**
 * Compiles CommandScript code (CommandScript is a superset of MCFunction) into MCFunction code, optionally with custom commands registered through `registerCmd()`.
 * @param {string} id A namespaced id to be put into the `resolveID()` function to determine where to output compiled code to. If it does not have an extension the extension is assumed to be ".mcfunction"
 * @param {string | object} data A string containing CommandScript code to compile, or JSON AST returned from `parseCmds()` or as a command argument.
 * @param {boolean} append By default, the compiled code will overwrite the file at the given `id`. Set this to true to instead append to the end of the mcfunction file if it exists.
 * @param {boolean} raw Whether or not data is raw mcfunction code rather than CommandScript. Defaults to false.
 */
export async function addCmds(id: string, data: string | {[key: string]: any}[], append: boolean = false, raw: boolean = false) {
    const code = raw ? data : (await compileCmds(data)).join("\n");

    // Finally write the code to the file
    const loc = resolveID("functions", id, ".mcfunction");
    await fs.ensureFile(loc);
    if (append) {
        await fs.writeFile(loc, code + "\n");
    } else {
        await fs.appendFile(loc, "\n" + code + "\n");
    }
}

/**
 * Shorthand for `addCmds(id, data, append, true)`, append defaults to false
 */
export async function addRawCmds(id: string, data: string, append: boolean = false) {
    await addCmds(id, data, append, true);
}

/**
 * Writes necessary data to function tags as well as generating a load function with certain variable creation.
 * There's no need to call this manually if you're using zdpack.
 */
export async function finalize() {
    // Create load function to auto-create necessary variables
    const loc = `${state.rng}:load`;
    await addTag("functions", "minecraft:load", [loc]);
    await addRawCmds(loc,
        [...state.vars].map((v) => `scoreboard objectives remove ${v}\nscoreboard objectives add ${v} dummy`).join("\n") + "\n" +
        [...state.consts].map((v) => `scoreboard players set ${v} __temp__ ${v}`).join("\n"),
    );
}

import {parseExpr as p1} from "./expr";
import {pack as p2} from "./packer";
export const parseExpr = p1;
export const pack = p2;
require("./register");

export default {state, Selector, Range, JointItem, stringify, resolveID, add, addTag, registerCmd, unregisterCmd, compileCmd, compileCmds, parseCmds, addCmds, addRawCmds, finalize, parseExpr, pack};