{
    const Selector = options.Selector;
    const Range = options.Range;
    const JointItem = options.JointItem;

    function unroll(start, list, n) {
        const nlist = [];
        if (start != null) nlist.push(start);
        for (const item of list) nlist.push(item[n]);
        return nlist;
    }
}


start
    = tokens:token* {
        // Return only tokens that are truthy
        tokens.filter(e => e).flat(1);
    }

token
    // Whitespace
    = __+ {
        return null;
    }
    // Comment
    / "#" (!eol .)* eol {
        return null;
    }
    // One line commands (inserted in by compiler)
    // / "/"? name:$("COMMANDS") _ text:$(!eol .)* eol {
    //     return {
    //         cmd: name,
    //         text: text
    //     }
    // }
    / cmd
cmd
    // Execute command (loads arguments until it finds "arg")
    = "/"? (">" / "execute") args:(_? !"run" arg ","?)* _? e:("run" __? cmd)? {
        if (!e) expected("command for execute command");
        return {
            type: "cmd",
            cmd: "execute",
            args: unroll(null, args, 2),
            run: e[2],
            loc: location()
        };
    }
    // Normal Commands
    / "/"? name:$([a-zA-Z0-9$_\-]+) args:(_? arg ","?)* {
        return {
            type: "cmd",
            cmd: name.toLowerCase(),
            args: unroll(null, args, 1),
            loc: location()
        };
    }
    // Function calls
    // / name:$([a-zA-Z0-9$_\-]+) "(" args:(_? (number / iexpr) _? ","?)* _? ")" {
    //     const cmds = [];
    //     for ()
    // }



// To distinguish between normal quoted strings and raw text, strings are returned as String objects
string
    = "\"" t:$((!"\\" (!"\"" .) / "\\" .)*) end:"\""? {
        if (!end) expected('" to end string');
        return new String(JSON.parse(`"${t.replace(/\r\n|\r|\n/g, "\\n")}"`));
    }
    / "\'" t:$((!"\\" (!"\'" .) / "\\" .)*) end:"\'"? {
        if (!end) expected("' to end string");
        return new String(JSON.parse(`"${t.replace(/\r\n|\r|\n/g, "\\n").replace(/'/g, '\0').replace(/"/g, "'").replace(/\x00/g, '"')}"`));
    }
inty = $(("+" / "-")? [0-9]+)
floaty = $(inty? "." [0-9]+ / inty "." [0-9]*)
number
    // Booleans, if used in the place of a number, should return 1 and 0 respectively
    = "true" {
        return 1;
    }
    / "false" {
        return 0;
    }
    // Float
    / t:floaty {
        return parseFloat(t);
    }
    // Integer
    / t:inty {
        return parseInt(t);
    }
range
    = min:$([+-]? [0-9]* "." [0-9]+ / [+-]? [0-9]+)? ".." max:$([+-]? [0-9]* "." [0-9]+ / [+-]? [0-9]+)? &sep {
        return new Range(min, max);
    }

list
    = "[" __? ([A-Z] ";")? args:(__? (selector / val) ","?)* __? end:"]"? {
        if (!end) expected('] to end list');
        return unroll(null, args, 1);
    }
state
    = "[" __? vals:(__? (string / $([A-Za-z0-9$_\-]+)) _? [:=] __? (val / selector) ","?)* __? end:"]"? {
        if (!end) expected("character to end dictionary");
        
        const obj = {};
        for (const val of vals) {
            obj[val[1]] = val[5];
        }
        return obj;
    }
dict
    = "{" __? vals:(__? (string / $([A-Za-z0-9$_\-]+)) _? [:=] __? (val / selector) ","?)* __? end:"}"? {
        if (!end) expected("character to end dictionary");
        
        const obj = {};
        for (const val of vals) {
            obj[val[1]] = val[5];
        }
        return obj;
    }
generic
    = t:$((
        string
        / (!sep .)+
        / "(" generic ")"
        / "[" generic "]"
        / "{" generic "}"
    ))+ {
        return t.trim();
    }
val
    // List
    = list
    // Dict
    / dict
    // Number Range
    / r:range &sep {
        return r;
    }
    // Boolean
    / t:("true" / "false") &sep {
        return t == "true";
    }
    / n:number &sep {
        return n;
    }
    // null
    / "null" &sep {
        return null;
    }
    // String (it can span multiple lines)
    / string
    // Mixed Item argument item[state] or item{nbt} or item[state]{nbt}
    / item:$([a-zA-Z0-9_:#/-]+) state:selargs? nbt:dict? &sep {
        if (!state && !nbt) return item;
        return new JointItem(item, state, nbt);
    }
    // Other arguments are text up to a space, comma, or slash with a character or another slash
    // Slash by itself or slash and a non-alphanumeric character is just another argument
    / generic

selargs
    = ends:("[" (__? $([A-Za-z0-9$_\-]+) _? [:=] _? val ","?)* __? "]"?) {
        if (!ends[ends.length-1]) expected('] to end selector args');
        return ends;
    }
selector
    = "@" t:$([a-zA-Z0-9_]+) ends:selargs? {
        if (ends) {
            const args = {};
            for (const arg of ends[1]) {
                args[arg[1]] = arg[5];
            }
            return new Selector(t, args);
        } else {
            return new Selector(t);
        }
    }

arg
    // Expression
    = expr
    // Code block
    / "{:" x:start "}" {
        return x;
    }
    // Selector
    / selector
    // TODO: mixed type arguments, like id[state]{nbt}, id[state], or id{nbt} AND other path arguments too! GREAT. These things suck btw
    / item:$([A-Za-z0-9#:_+/\\\-]+) state:state? nbt:dict? &sep {
        if (!state && !nbt) return item;
        return new JointItem(item, state, nbt);
    }
    // All values work as arguments
    / val



// All aboard the expression chain! Choo choo!
mods
    = mods:$(("-" / "!" / "+")+) {
        return mods.replace(/--|\+/g, "").replace(/!!!/g, "!").split("") || null;
    }
expr
    = mods:mods? "(" __? expr:iexpr? __? e:")"? {
        if (!expr) expected("expression");
        if (!e) expected(") to end expression");

        return {type: "expr", data: expr, mods};
    }

iexpr
    = a:and b:(__? "||" __? and?)+ {
        return {type: "or", data: unroll(a, b, 3)};
    }
    / and
and
    = a:eq b:(__? "&&" __? eq?)+ {
        return {type: "and", data: unroll(a, b, 3)};
    }
    / eq
eq
    = a:rel b:(__? ("==" / "!=") __? rel?)+ {
        return {type: "eq", data: unroll(a, b, 3), ops: unroll(null, b, 1)};
    }
    / rel
rel
    = a:add b:(__? ("<=" / "<" / ">=" / ">") __? add?)+ {
        return {type: "rel", data: unroll(a, b, 3), ops: unroll(null, b, 1)};
    }
    / add
add
    = a:mult b:(__? ("+" / "-") __? mult?)+ {
        return {type: "add", data: unroll(a, b, 3), ops: unroll(null, b, 1)};
    }
    / mult
mult
    = a:rfop b:(__? ("*" / "/" / "%") __? rfop?)+ {
        return {type: "mult", data: unroll(a, b, 3), ops: unroll(null, b, 1)};
    }
    / rfop
// Range is of highest precedence to help with sanity
rfop
    = v:fop __? "~" __? range:range? {
        if (!b) expected("range of numbers to match against");
        return {type: "range", v, range};
    }
    / fop
fop
    // Nested expressions are possible
    = expr
    // Numbers
    / mods:mods? n:number {
        let x = n;
        if (mods) {
            for (const mod of mods) {
                if (mod == "!") x = !x;
                else x = -x;
            }
        }
        return x;
    }
    // Variables
    / mods:mods? s:((selector / $([A-Za-z_][A-Za-z0-9_\.]*)) __?) b:$([A-Za-z_][A-Za-z0-9_\.]*)? {
        const data = {type: "var", name: b ? b : s[0], s: b ? s[0] : "@s"};
        if (mods) return {type: "expr", data, mods};
        else return data;
    }
    // Selectors (they just get turned into inline commands, because that's all they are)
    / mods:mods? s:selector {
        // TODO: insert more selectors
        const data = {
            type: "cmd",
            cmd: "execute",
            args: ["if", "entity", s],
        }
        if (mods) return {type: "expr", data, mods};
        else return data;
    }
    // Inline commands are AWESOME!
    / mods:mods? "{" u:"?"? __? cmd:cmd __? "}" {
        cmd.u = u == "?";

        if (mods) return {type: "expr", data: cmd, mods};
        else return cmd;
    }
    // Lists are for handling other kinds of conditions
    / list



_ = $([ \t]+)
__ = (
      [ \t\r\n]+
    / "//" (!eol .)* eol
    / "/*" (!"*/" .)* "*/"
)+

eol = "\n"
sep = _ / eol / "/" [a-zA-Z0-9$_\-\/] / "," / "]" / "}" / ")"