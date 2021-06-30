import {program, Option, InvalidOptionArgumentError} from "commander";
import progress from "cli-progress";

process.title = "zdpack";

program.name("zdpack");
program.version(require('../package.json').version);
program
    .addOption(
        new Option(
            "-t, --type <type>", 
            "- The format to output the final datapack in.")
        .choices(["data", "assets", "pack", "forge", "fabric", "mod"])
        .default("pack")
    ).option(
        "-o, --output <loc>",
        '- "loc" is the full path and name of a folder location to output too, without an extension. Use NUL to mean "do not output to any folder", which is useful for validating json files. If the folder already exists, it will be deleted. Defaults to "pack".',
        "pack"
    ).requiredOption(
        "-v, --mcv <ver>",
        "- Mcmeta version the output pack is designed for. If this number does not match the current required number, the data pack displays a warning and requires additional confirmation to load the pack. 1 is for 1.6.1-1.8.9, 2 for 1.9-1.10.2, 3 for 1.11-1.12.2, 4 for 1.13-1.14.4, 5 for 1.15-1.16.1, 6 for 1.16.2-1.16.5, and 7 for 1.17.",
    ).option(
        "-p, --packs <packs...>",
        "- A list of packs (or just a single pack) to convert/merge together. If none are given, the output folder might be empty."
    ).option(
        "-d, --desc <desc>",
        "- A description for the outputed pack/mod, put into the pack.mcmeta file or the mod metadata."
    ).option(
        "-f, --folder",
        '- Generate the output pack/mod as a folder at "output" instead of a zip or jar file.'
    ).option(
        "-n, --id <modid>",
        "- The mod id to use if the output is a mod. If this is not specified, the id is generated from the output folder."
    ).option(
        "-l, --overwrite",
        "- By default, when merging packs together, data copied from packs last in the list will not overwrite data copied from a previous pack. This option makes it so data will overwrite previous files. This does not apply to tags, which can be merged with no issues."
    ).option(
        "-i, --include <items...>",
        "- A list of folders/zips to merge on top of the final output. Items in these folders/zips will always overwrite items with the same name from left to right. You can use this to include files or overwrite mod metadata to include dependencies."
    ).option(
        "-j, --js <file>",
        '- An optional javascript file to be run before the pack is loaded. If a function named "init" is exported, it will be called automatically. If a function named "ready" is exported, it will be run after all other packs/items were merged and included. The working directory will be set to the root of the datapack before running the script or any function. Use the "zdpack" module for convenience functions you can use to make common files in a datapack.'
    );

program.parse();

const bar = new progress.SingleBar({
    format: "[{bar}] {value}/{total} | {percentage}% | ETA: {eta_formatted} | {item}",
    barCompleteChar: '=',
    barIncompleteChar: ' ',
    hideCursor: true
});

require("./packer").pack(program.opts(), bar);