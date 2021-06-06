# zdpack

zdpack stands for "Zach's Datapacker" and is a tool for merging and converting Minecraft data and resource packs.

As of right now there is only a cli. It is capable of outputing to packs or mods, and will automatically convert yaml and hjson files to json files in the output. It also supports running a javascript file to create part or all of the datapack as well. Use the `zdpack` module in node for some convenience functions when generating your datapack (more coming soon).

Eventually the converter will also support a superset of MCFunction called CommandScript, which will allow you to more easily write MCFunction code and also specify custom commands in the javascript file. Just imagine being able to write NBT and other commands over multiple lines.

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

## Social

Like my stuff, wanna chat, or have an issue/suggestion? Check out my [Discord](https://discord.gg/pBFqEcXvW5)! :D