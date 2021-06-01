const fs = require("fs-extra");
const path = require("path");

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
        if (fs.existsSync(dst) && fs.statSync(dst).isDirectory()) await fs.rm(dst);
        await fs.copy(src, dst);
    }
}

exports.merge = async (payload, bar, loc, ...folders) => {
    // Ensure that the output directory is a folder
    if (fs.existsSync(loc) && fs.statSync(loc).isFile()) await fs.rm(loc);
    await fs.ensureDir(loc);

    // Now copy over each folder
    for (const folder of folders) {
        payload.item = path.basename(folder);
        bar.update(null);

        if (fs.existsSync(folder) && fs.statSync(folder).isDirectory()) {
            await copy(folder, loc);
        }

        bar.increment();
    }
};