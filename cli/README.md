# zdpack

zdpack stands for "Zach's Datapacker" and is a tool for merging and converting Minecraft data and resource packs.

As of right now there is only a cli. It is capable of outputing to packs or mods, and will automatically convert yaml and hjson files to json files in the output. It also supports running a javascript file to create part or all of the datapack as well. Use the `zdpack` module in node for some convenience functions when generating your datapack (more coming soon).

This tool is WIP, so expect some bugs.

## Installation

zdpack requires [Node](https://nodejs.org/en/) in order to run. Once you have it installed, install zdpack with npm in a terminal: `npm install -g zdpack`

After installing you should be able to use the `zdpack` command in the terminal (may require you to close and reopen the terminal).

## Examples

To see all command line options, use `zdpack -h`.

This command will merge the datapacks `a.zip` and `b.zip` into the datapack `c.zip` in the current directory (with a pack.mcmeta file set to the version of 1.16.5):

`zdpack -m 1.16.5 -p a.zip b.zip -o c`

This command will convert the datapack `a.zip` into a mod `a.jar` in the current directory that works in both fabric and forge:

`zdpack -m 1.16.5 -t mod -p a.zip -o a`

This command will generate a bare bones datapack and run a javascript file to do the rest of the work:

`zdpack -m 1.16.5 -j build.js`

## CommandScript

The converter also supports a special superset of MCFunction called CommandScript (beta right now, so expect bugs), which allows you to more easily write MCFunction code and also specify custom commands in the javascript file. To use it, instead of giving your functions the extension `.mcfunction`, give them the extension `.cmds`. Note that CommandScript does not yet ensure that all commands have the proper syntax in-game.

With the exception of the `say` command (and some modded commands), CommandScript should be a true superset of MCFunction, meaning that all other commands are valid in CommandScript, with some changes:

- `say <stuff>`
  The say command works slightly differently; if you want exact text to be printed, put it in quotes. Newlines get translated into multiple say commands on output. If you do not put text in quotes, the say command will _mostly_ work except when you have unclosed parentheses, quotes, or brackets.

- `var <name> [type] [displayName]`
  This is a new alias command for `scoreboard objectives add <name> [type] [displayName]`. When `type` is not given, it defaults to dummy.

- `del <name>`
  This is a new alias command for `scoreboard objectives remove <name>`.
  
- `disp <slot> [name]`
  This is a new alias command for `scoreboard objectives setdisplay <slot> [name]`.

- `$ <var> <op> <expr>`
  You're gonna love this one. This one command holds all the power of simple arithmetic which is very tedious to do in vanilla minecraft. Just make sure you put spaces between the variable, operator, and value at the end.

  | Command                      | Alias                                                        |
  | ---------------------------- | ------------------------------------------------------------ |
  | `$ x = 3`                    | `scoreboard players set @s x 3`                              |
  | `$ @a y += -55`              | `scoreboard players remove @a y 55`                          |
  | `$ @a y *= 4`                | `scoreboard players operation @a y *= 4 __temp__`<br />The `4 __temp__` is automatically set on datapack load in a separate function. |
  | `$ x = y`                    | `scoreboard players operation @s x = @s y`                   |
  | `$ @a x -= Bob y`            | `scoreboard players operation @a x -= Bob y`                 |
  | `$ x = (5+ 9)`               | `scoreboard players set @s x 14`<br />The compiler will generally try to optimize expressions for you.<br />Note that you can omit spaces inside expressions.<br />All expressions require parentheses around them. |
  | `$ @a y = ((x + 9) * 14)`    | scoreboard players set e0 \_\_temp\_\_ 9<br/>scoreboard players operation e0 \_\_temp\_\_ += @s x<br/>scoreboard players set e1 \_\_temp\_\_ 14<br/>scoreboard players operation e1 \_\_temp\_\_ *= e0 \_\_temp\_\_<br/>scoreboard players operation @a y = e1 \_\_temp\_\_<br /><br />Note that expressions are evaluated irrespective of the left hand target selector.<br />If you really want to perform this evaluation on everyone's score,<br />use an `execute as` command. |
  | `$ y = ({clear @s stone 0})` | execute store result score e0 \_\_temp\_\_ run clear @s stone 0<br/>scoreboard players operation @s y = e0 \_\_temp\_\_<br /><br />The compiler isn't perfect, but it'll do it's best! |

There's a few other commands but I'll do a better job explaining them later.

You can register new commands through a javascript file with the `zdpack` module `registerCmd` function. Just use the `-j` option in the terminal and point it to the javascript file.

## Social

Like my stuff, wanna chat, or have an issue/suggestion? Check out my [Discord](https://discord.gg/pBFqEcXvW5)! :D