import {state, Selector, compileCmd, stringify} from "./index";
const modInt = (a) => (a + 2147483648) % 4294967296 - 2147483648;

/**
 * Parses an expression AST into either a series of commands and the scoreboard variable output, or into just a number.
 * @param {object} ast an expression AST to parse
 * @param {boolean} reset Whether or not to reset the internal temporary variable counter (defaults to true). You typically don't need to worry about setting this to false.
 * @returns {Promise<[string, string] | number>} Either a series of commands and the scoreboard variable output or the calculated value of the expression. Keep in mind that the number returned could be a non-integer value.
 */
export async function parseExpr(ast: {[key: string]: any}, reset: boolean = true) {
    if (reset) state.n = 0;
    if (ast == null) return 0;
    if (typeof ast != "object") return ast;

    let data: any = [];
    let edata: any = [];
    let code = [];

    // This expression is a special one
    if (Array.isArray(ast)) {
        if (ast.length == 1) {
            // This is a predicate check
            code.push(`execute store result score ${state.n} __temp__ if predicate ${ast[0]}`);
        } else if (ast.includes("is")) {
            // This is a block(s) check
            if (ast.length == 5 && ast[3] == "is") {
                // This is a block check
                code.push(`execute store result score ${state.n} __temp__ if block ${ast.slice(0, 3).join(" ")} ${ast[4]}`);
            } else if ((ast.length == 10 || ast.length == 11) && ast[6] == "is") {
                // This is a blocks check
                code.push(`execute store result score ${state.n} __temp__ if blocks ${ast.slice(0, 6).join(" ")} ${ast.slice(7).join(" ")}`);
            } else {
                throw Error(`unknown special expression ${JSON.stringify(ast)}`);
            }
        } else if (ast.includes("has")) {
            // This is a data check
            if (ast.length == 5 && ast[3] == "has") {
                // This is a block data check
                code.push(`execute store result score ${state.n} __temp__ if data block ${ast.slice(0, 3).join(" ")} ${stringify(ast[4])}`);
            } else if (ast.length == 3 && ast[1] == "has") {
                if (ast[0] instanceof Selector) {
                    // This is an entity data check
                    code.push(`execute store result score ${state.n} __temp__ if data entity ${ast[0]} ${stringify(ast[2])}`);
                } else {
                    // This is a storage data check
                    code.push(`execute store result score ${state.n} __temp__ if data storage ${ast[0]} ${stringify(ast[2])}`);
                }
            } else {
                throw Error(`unknown special expression ${JSON.stringify(ast)}`);
            }
        } else {
            throw Error(`unknown special expression ${JSON.stringify(ast)}`);
        }
    } else {
        // Normal expression to parse
        switch (ast.type) {
            case "expr":
                if (ast.mods) {
                    // There's modifiers that need to be applied on this expression
                    data = await parseExpr(ast.data, false);
                    
                    if (typeof data == "number") {
                        // The expression is a number that we can easily negate or invert
                        for (const mod of ast.mods) {
                            if (mod == "!") data = !data;
                            else data = -data;
                        }
                        return data;
                    } else {
                        // Generate commands to apply negation or inversion
                        code.push(data[0]);
                        code.push(`scoreboard players operation e${state.n} __temp__ = ${data[1]}`);
                        for (const mod of ast.mods) {
                            if (mod == "!") code.push(`execute store success score e${state.n} __temp__ unless score e${state.n} __temp__ matches 0`);
                            else code.push(`scoreboard players operation e${state.n} __temp__ *= -1 __temp__`);
                        }
                    }
                } else {
                    if (typeof ast.data == "number") {
                        return ast.data;
                    } else {
                        const expr = await parseExpr(ast.data, false);
                        if (typeof expr == "number") return expr;

                        code.push(expr[0]);
                        return [code.join("\n").trim(), expr[1]];
                    }
                }
                break;
            case "or":
                // Handle or statement arguments (short circuits if necessary)
                for (const k of ast.data) {
                    if (typeof k == "number") {
                        if (k) return 1;
                        else continue;
                    }

                    const v = await parseExpr(k, false);
                    if (typeof v == "number") {
                        if (v) return 1;
                        else continue;
                    }

                    // Non-short-circuit items are pushed for later
                    code.push(v[0]);
                    data.push(v[1]);
                }

                // If we made it here, then we need to calculate into a temp variable
                code.push(`scoreboard players set e${state.n} __temp__ 0`);
                for (const s of data) {
                    code.push(`execute unless score ${s} matches 0 run scoreboard players set e${state.n} __temp__ 1`);
                }
                break;
            case "and":
                // Handle and statement arguments (short circuits if necessary)
                for (const k of ast.data) {
                    if (typeof k == "number") {
                        if (k) continue;
                        else return 0;
                    }

                    const v = await parseExpr(k, false);
                    if (typeof v == "number") {
                        if (v) continue;
                        else return 0;
                    }

                    // Non-short-circuit items are pushed for later
                    code.push(v[0]);
                    data.push(v[1]);
                }

                // If we made it here, then we need to calculate into a temp variable
                code.push(`scoreboard players set e${state.n} __temp__ 1`);
                for (const s of data) {
                    code.push(`execute if score ${s} matches 0 run scoreboard players set e${state.n} __temp__ 0`);
                }
                break;
            case "eq":
            case "rel":
                // Parse arguments
                for (const k of ast.data) {
                    if (typeof k == "number") {
                        data.push(k);
                    } else {
                        const v = await parseExpr(k, false);
                        if (typeof v == "number") {
                            data.push(v);
                        } else {
                            code.push(v[0]);
                            data.push(v[1]);
                        }
                    }
                }

                // Check for short-circuits
                for (let i = 0; i < data.length; i++) {
                    let a = data[i];
                    let b = data[i+1];
                    let op = ast.ops[i];

                    if (typeof a == "number") {
                        if (typeof b == "number") {
                            // Short circuit number
                            switch (op) {
                                case "==":
                                    if (a == b) continue;
                                    else return 0;
                                case "!=":
                                    if (a != b) continue;
                                    else return 0;
                                case "<=":
                                    if (a <= b) continue;
                                    else return 0;
                                case "<":
                                    if (a < b) continue;
                                    else return 0;
                                case ">=":
                                    if (a >= b) continue;
                                    else return 0;
                                case ">":
                                    if (a > b) continue;
                                    else return 0;
                            }
                        }
                    } else {
                        if (typeof b == "number") {
                            // We switch a and b around
                            [a, b] = [b, a];
                            // This also means we must flip the operator around if necessary
                            op = op.replace("<", "\0").replace(">", "<").replace("\0", ">");
                        } else {
                            // Both are not numbers
                            switch (op) {
                                case "==":
                                case "!=":
                                    edata.push([op == "!=", `score ${a} = ${b}`]);
                                    break;
                                case "<=":
                                    edata.push([false, `score ${a} <= ${b}`]);
                                    break;
                                case "<":
                                    edata.push([false, `score ${a} < ${b}`]);
                                    break;
                                case ">=":
                                    edata.push([false, `score ${a} >= ${b}`]);
                                    break;
                                case ">":
                                    edata.push([false, `score ${a} > ${b}`]);
                                    break;
                            }
                        }
                    }

                    // a is a number, b is not
                    switch (op) {
                        case "==":
                        case "!=":
                            edata.push([op == "!=", `score ${b} matches ${a}`]);
                            break;
                        case "<=":
                        case ">":
                            edata.push([op == ">", `score ${b} matches ..${a}`]);
                            break;
                        case ">=":
                        case "<":
                            edata.push([op == "<", `score ${b} matches ${a}..`]);
                            break;
                    }
                }

                if (edata.length == 0) {
                    // All comparisons passed
                    return 1;
                } else if (edata.length > 1) {
                    // Multiple comparisons require an and-like command thing
                    code.push(`scoreboard players set e${state.n} __temp__ 1`);
                    for (const [b, c] of edata) {
                        code.push(`execute ${b ? "if" : "unless"} ${c} run scoreboard players set e${state.n} __temp__ 0`);
                    }
                } else {
                    // There's only one comparison, so we can do some optimization here at least
                    code.push(`execute store result score e${state.n} __temp__ ${edata[0][0] ? "unless" : "if"} ${edata[0][1]}`);
                }
                break;
            case "add":
                // If we can simplify expressions, we store the sum here
                edata = 0;

                // Parse arguments
                for (let i = 0; i < ast.data.length; i++) {
                    const k = ast.data[i];
                    const top = ast.ops[i-1] ?? "+";
                    const op = top == "-" ? -1 : 1;

                    if (typeof k == "number") {
                        edata = modInt(edata + k * op);
                    } else {
                        const v = await parseExpr(k, false);
                        if (typeof v == "number") {
                            edata += modInt(edata + v * op);
                        } else {
                            code.push(v[0]);
                            data.push([top, v[1]]);
                        }
                    }
                }
                // Ensure that integer overflow is dealt with
                edata = modInt(edata);

                if (data.length == 0) {
                    // Data length is 0, meaning there is nothing to sum
                    return edata;
                } else if (data[0][0] != "-" && edata == 0) {
                    // If the first value is positive and numeric sum is 0
                    if (data.length == 1) {
                        // If we only have one positive variable, then we just return it's location
                        return [code.join("\n"), data[0]];
                    } else {
                        // If sum is 0 but there's more than one thing to sum, the first value is used to set the objective
                        code.push(`scoreboard players operation e${state.n} __temp__ = ${data[0][1]}`);
                        // The other variables then get added to or removed from the sum
                        for (const [op, v] of data.slice(1)) {
                            code.push(`scoreboard players operation e${state.n} __temp__ ${op}= ${v}`);
                        }
                    }
                } else {
                    // We need to sum a number and one or more variables
                    // The number resets the value of the sum
                    code.push(`scoreboard players set e${state.n} __temp__ ${edata}`);
                    // The variables then get added to or removed from the sum
                    for (const [op, v] of data) {
                        code.push(`scoreboard players operation e${state.n} __temp__ ${op}= ${v}`);
                    }
                }
                break;
            case "mult":
                // TODO: deal with integer overflow...
                // Parse arguments
                for (const k of ast.data) {
                    if (typeof k == "number") {
                        data.push(k);
                    } else {
                        const v = await parseExpr(k, false);
                        if (typeof v == "number") {
                            data.push(v);
                        } else {
                            code.push(v[0]);
                            data.push(v[1]);
                        }
                    }
                }

                {
                    let product = null;
                    let i = 1;

                    // Part A: simplifies values until a variable is found
                    // Determine whether or not the first variable is a number or a variable
                    if (typeof data[0] == "number") {
                        product = data[0];
                        if (product == 0) return 0; // Anything times 0 is zero!

                        for (; i < data.length; i++) {
                            const v = data[i];

                            // Break if variable is found
                            if (typeof v != "number") break;

                            // Otherwise do math
                            switch (ast.ops[i-1]) {
                                case "*":
                                    if (v == 0) return 0; // Anything times 0 is zero!
                                    product *= v;
                                    break;
                                case "/":
                                    if (v == 0) throw Error("cannot divide by zero");
                                    product = Math.floor(product / v);
                                    break;
                                case "%":
                                    if (v == 0) throw Error("cannot divide by zero");
                                    product = (product % v + v) % v;
                                    break;
                            }
                        }
                    } else {
                        edata.push(["*", data[0]]);
                    }

                    // Part B: simplifies until non-multiply operator is found
                    for (; i < data.length; i++) {
                        const v = data[i];
                        const op = ast.ops[i-1];
                        
                        if (op != "*") break;

                        if (typeof v == "number") {
                            if (product == null) product = v;
                            else product *= v;
                        } else {
                            edata.push(["*", v]);
                        }
                    }

                    // Part C: convert the rest into edata (no more simplifying can be done)
                    for (; i < data.length; i++) {
                        const v = data[i];
                        const op = ast.ops[i-1];

                        if (typeof v == "number") {
                            state.consts.add(v);
                            edata.push([op, `${v} __temp__`]);
                        } else {
                            edata.push([op, v]);
                        }
                    }

                    // Part D: form commands from edata
                    // Short curcuit, anything times 0 is 0!
                    if (product == 0) return 0;
                    
                    if (product == null || product == 1 && edata[0][0] == "*") {
                        // If there were no numbers to simplify or the simplified value is 1 and the first operator is multiply
                        // the first variable resets the output
                        code.push(`scoreboard players operation e${state.n} __temp__ = ${edata[0][1]}`);
                        // Form commands for the rest
                        for (const [op, v] of edata.slice(1)) {
                            code.push(`scoreboard players operation e${state.n} __temp__ ${op}= ${v}`);
                        }
                    } else if (edata.length > 0) {
                        // Otherwise the product resets the output if commands are available
                        code.push(`scoreboard players set e${state.n} __temp__ ${product}`);
                        // Form commands for the rest
                        for (const [op, v] of edata) {
                            code.push(`scoreboard players operation e${state.n} __temp__ ${op}= ${v}`);
                        }
                    } else {
                        // If no commands, then product is a number to return
                        return product;
                    }
                }
                break;
            case "range":
                // Ranges get converted directly into matches statements
                if (typeof ast.v == "number") {
                    return (ast.range.min <= ast.v && ast.v <= ast.range.max) ? 1 : 0;
                }
                data = await parseExpr(ast.v, false);
                if (typeof data == "number") {
                    return (ast.range.min <= ast.v && ast.v <= ast.range.max) ? 1 : 0;
                }

                code.push(data[0]);
                code.push(`execute store result score e${state.n} __temp__ if score ${data[1]} matches ${ast.range}`);
                break;
            case "var":
                // Variables we just return the variable name and selector as a string
                // TODO: throw an error if the selector allows for more than one target
                return ["", `${ast.s} ${ast.name}`];
            case "cmd":
                // Inline commands are actually also CommandScript code, so we must compile it
                data = await compileCmd(ast);
                if (data.length > 1) {
                    throw Error("inline commands that run more than one vanilla command are not allowed");
                } else if (data.length == 1) {
                    code.push(`execute store ${ast.u ? "success" : "result"} score e${state.n} __temp__ run ${data[0]}`);
                } else {
                    return 0;
                }
                break;
        }
    }

    return [code.join("\n").trim(), `e${state.n++} __temp__`];
}