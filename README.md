# zdpack

zdpack stands for "Zach's Datapacker" and is a tool for merging and converting Minecraft data and resource packs. As of right now there is only a cli.

Install with npm: `npm install -g zdpack`

After installing you should be able to use the `zdpack` command in any terminal.

## Examples

To see all command line options, use `zdpack -h `.

This command will merge the datapacks `a.zip` and `b.zip` into the datapack `c.zip` in the current directory (with a pack.mcmeta file set to the version of 1.16.5):

`zdpack -m 1.16.5 -p a.zip b.zip -o c`

This command will convert the datapack `a.zip` into a mod `a.jar` in the current directory that works in both fabric and forge:

`zdpack -m 1.16.5 -t mod -p a.zip -o a`

This command will generate a bare bones datapack and run a javascript file to do the rest of the work:

`zdpack -m 1.16.5 -j build.js`