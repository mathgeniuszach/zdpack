const {dialog} = require("@electron/remote");
const {pack} = require("../cli/dist/index");

class GUIBar {

}

const options = {
    type: "pack",
    output: "pack",
    mcv: 6,
};

window.addEventListener("DOMContentLoaded", () => {
    // Make all input fields never spellcheck
    for (const input of document.querySelectorAll("input")) {
        input.setAttribute("spellcheck", "false");
        input.onchange = function () {
            options[this.id] = this.value;
        };
    }

    // Implement functionality of pack button
    const finalizer = document.querySelector("#finalize > button");
    finalizer.onclick = async () => {
        try {
            finalizer.setAttribute("disabled", "");

            if (!options.output) options.output = "pack";
            console.log(options); // TODO: remove this when done
            await pack(JSON.parse(JSON.stringify(options)), new GUIBar()); // Copies options to stop any race conditions

            await dialog.showMessageBox(undefined, {
                message: "Packing complete!"
            });
        } catch (err) {
            await dialog.showErrorBox("Fatal Error while packing.", `${err.stack}`);
        } finally {
            finalizer.removeAttribute("disabled");
        }
    };

    // Add functionality to each list
    for (const addBtn of document.querySelectorAll(".list > button")) {
        // Add functionality to list add buttons
        addBtn.onclick = function () {
            const list = this.parentElement;

            console.log(dialog);
            const paths = dialog.showOpenDialogSync(undefined, {properties: [addBtn.classList.contains("file") ? "openFile" : "openDirectory", "multiSelections"]});
            if (!paths) return;
            if (!options[list.id]) options[list.id] = [];
            options[list.id].push(...paths);
    
            for (const path of paths) {
                const div = document.createElement("div");
                div.innerHTML = "<input><button>-</button>";

                // Add functionality to input fields
                const input = div.querySelector("input");
                input.value = path;
                input.onchange = function () {
                    const item = this.parentElement;
                    const index = Array.prototype.indexOf.call(item.parentElement, item);
                    options[item.parentElement.parentElement.id][index] = this.value;
                };
                // Add functionality to remove button
                div.querySelector("button").onclick = function () {
                    const item = this.parentElement;
                    const index = Array.prototype.indexOf.call(item.parentElement, item);
                    console.log(item.parentElement.id);

                    const array = options[item.parentElement.parentElement.id];
                    array.splice(index, 1);
                    if (array.length == 0) delete options[item.parentElement.parentElement.id];
                    item.remove();
                };

                list.querySelector("div").insertAdjacentElement("beforeend", div);
            }
        };
    }
});