const fs = require("fs-extra");
const path = require("path");
const JSZip = require("jszip");

// TODO: utilize options from packer.js

async function copy(src, dst) {
    const stats = await fs.stat(src);
    if (stats.isDirectory()) {
        if (fs.existsSync(dst) && fs.statSync(dst).isFile()) await fs.rm(dst);
        await fs.ensureDir(dst);

        const dir = await fs.opendir(src);
        try {
            for (const f of dir) await copy(path.join(src, f), path.join(dst, f));
        } finally {
            await dir.close();
        }
    } else {
        if (fs.existsSync(dst) && fs.statSync(dst).isDirectory()) await fs.rm(dst, {recursive: true});
        await fs.copy(src, dst);
    }
}

exports.merge = async (payload, bar, loc, ...items) => {
    // Ensure that the output directory is a folder
    if (fs.existsSync(loc) && fs.statSync(loc).isFile()) await fs.rm(loc);
    await fs.ensureDir(loc);

    // Now copy over each item
    for (const item of items) {
        payload.item = path.basename(item);
        bar.update(null);

        if (fs.existsSync(item)) {
            const stats = await fs.stat(item);
            if (stats.isDirectory()) {
                await copy(item, loc);
            } else {
                // File should be a zip file
                const zip = await new JSZip().loadAsync(await fs.readFile(item));
                for (const [k, v] of Object.entries(zip.files)) {
                    const p = path.join(loc, k);
                    try {
                        await fs.ensureFile(p);
                    } catch (err) {
                        try {
                            // If there's a file where a directory should be, we backtrack and remove it
                            let px = path.dirname(p);
                            while (!fs.existsSync(px)) {
                                px = path.dirname(px);
                            }
                            fs.rm(px);
                            await fs.ensureFile(p);
                        } catch (err2) {
                            throw err;
                        }
                    }
                    fs.writeFile(p, v.async("nodebuffer"));
                }
            }
        }

        bar.increment();
    }
};