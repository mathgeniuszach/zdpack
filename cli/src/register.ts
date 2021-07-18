import {registerCmd, addRawCmds, compileCmds, stringify, parseExpr, state, Selector} from "./index";

// The say command, by default works generally how you'd expect, except newline characters create more than one say command
registerCmd("say", (...args) => {
    const lines = args.map(arg => stringify(arg, false)).join(" ").split(/[\r\n|\r|\n]/g);
    return lines.map((line) => `say ${line}`);
});

registerCmd("var", (name, type="dummy", displayName="") => {
    return `scoreboard objectives add ${name} ${type}${displayName ? " " + JSON.stringify(displayName) : ""}`;
});

registerCmd("del", (name) => {
    return `scoreboard objectives remove ${name}`;
});

registerCmd("disp", (slot, name="") => {
    return `scoreboard objectives setdisplay ${slot}${name ? " " + name : ""}`;
});

registerCmd("$", async (...args) => {
    const ops = new Set(["=", "+=", "-=", "*=", "/=", "%=", "<", ">", "><"]);

    // Get target and variable name
    let v = "@s ";
    if (ops.has(args[1])) {
        v += args.shift();
    } else if (ops.has(args[2])) {
        v = `${args.shift()} ${args.shift()}`;
    } else {
        throw Error("unknown operator for $ command");
    }

    // No value or operator means this command doesn't work
    if (args.length < 2) throw Error("$ command has no operator or has no value");
    else if (args.length > 3) throw Error("$ command has too many arguments");
    
    let data;
    if (args.length == 3) {
        data = `${args[1]} ${args[2]}`;
    } else if (typeof args[1] == "string") {
        data = "@s " + args[1];
    } else {
        data = await parseExpr(args[1]);
    }

    // If data is a string, we can only assume it is a variable
    if (typeof data == "string") return `scoreboard players operation ${v} ${args[0]} ${data}`;


    if (typeof data == "object") {
        // If an expression, just do an operation with the output variable
        return [data[0], `scoreboard players operation ${v} ${args[0]} ${data[1]}`];
    } else {
        // The value is a number, so we do specific commands
        switch (args[0]) {
            case "=": return `scoreboard players set ${v} ${data}`;
            case "+=": return `scoreboard players ${data < 0 ? "remove" : "add"} ${v} ${Math.abs(data)}`;
            case "-=": return `scoreboard players ${data < 0 ? "add" : "remove"} ${v} ${Math.abs(data)}`;
            
            case "*=": case "/=": case "%=": case "<": case ">":
                // In these cases minecraft doesn't support constant values, so we need to use a variable
                state.consts.add(data);
                return `scoreboard players operation ${v} ${args[0]} ${data} __temp__`;
            
            default:
                // All other operators are invalid (just the >< operator)
                throw Error(`unknown operator "${args[0]}" applied to number`);                    
        }
    }
});

const conditional = async (...args) => {
    if (args.length < 2 || 5 < args.length) throw Error(`invalid arguments for ${this ? "unless" : "if"} command`);

    // Check for else statement (if found, the condition is cached)
    let elseCode = null;
    let elseLoc = null;
    let elseOutCmd = null;
    if (args[args.length - 2] == "else") {
        elseCode = await compileCmds(args.pop());
        elseLoc = `${state.rng}:else${state.n}`;
        elseOutCmd = elseCode.length == 1 ? elseCode[0] : `function ${elseLoc}`;

        args.pop();
    }

    // Get code to put in external function
    const code = await compileCmds(args[args.length - 1]);
    const loc = `${state.rng}:${this ? "if" : "unl"}${state.n++}`;
    const outCmd = code.length == 1 ? code[0] : `function ${loc}`;

    let cmd: string | string[] = "";
    if (args.length == 2) {
        // There's only one argument to check for
        switch (typeof args[0]) {
            case "number":
                // If the number is truthy, we just run the function (but not the else function)
                // If it is falsy, we run only the else function (if it exists)
                if (args[0]) cmd = outCmd;
                else if (elseOutCmd) cmd = elseOutCmd;
                break;
            case "string":
                // Variable
                if (elseOutCmd) {
                    // Else command exists, so we must cache the value of the variable
                    cmd = [`execute store success score c${state.x} __temp__ ${this ? "unless" : "if"} score @s ${args[0]} matches 0`];
                } else {
                    cmd = `execute ${this ? "unless" : "if"} score @s ${args[0]} matches 0 run ${outCmd}`;
                }
                break;
            case "object":
                if (args[0] instanceof Selector) {
                    if (elseOutCmd) {
                        // Else command exists, so we must cache the value of the variable
                        cmd = [`execute store success score c${state.x} __temp__ ${this ? "if" : "unless"} entity ${args[0]}`];
                    } else {
                        cmd = `execute ${this ? "if" : "unless"} entity ${args[0]} run ${outCmd}`;
                    }
                } else {
                    let expr = await parseExpr(args[0]);
                    if (typeof expr == "number") {
                        if (expr) cmd = outCmd;
                        else if (elseOutCmd) cmd = elseOutCmd;
                    } else {
                        if (elseOutCmd) {
                            // Else command exists, so we must cache the value of the variable
                            cmd = [
                                expr[0],
                                `execute store success score c${state.x} __temp__ ${this ? "unless" : "if"} score ${expr[1]} matches 0`,
                            ];
                        } else {
                            cmd = `${expr[0]}\nexecute ${this ? "unless" : "if"} score ${expr[1]} matches 0 run ${outCmd}`;
                        }
                    }
                }
                break;
        }
    } else if (args.length == 3) {
        // There's two arguments to check for, so it's a variable
        cmd = `execute ${this ? "unless" : "if"} score ${args[0]} ${args[1]} matches 0 run ${outCmd}`;
    } // else {
    //     throw Error(`invalid arguments for ${this ? "if" : "unless"} command`);
    // }

    // Finally add code
    if (cmd) {
        if (elseOutCmd) {
            if (elseCode.length > 1) await addRawCmds(elseLoc, elseCode);
            if (Array.isArray(cmd)) {
                cmd.push(
                    `execute if score c${state.x} __temp__ matches 1 run ${outCmd}`,
                    `execute unless score c${state.x} __temp__ matches 1 run ${elseOutCmd}`
                );
                state.x++;
            }
        }
        if (code.length > 1) await addRawCmds(loc, code.join("\n"));
        return cmd;
    } else {
        return [];
    }
};

registerCmd("if", conditional.bind(true));
registerCmd("unless", conditional.bind(false));