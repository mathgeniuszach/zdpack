const {dialog} = require("@electron/remote");
const {pack} = require("../cli/dist/index");

class GUIBar {

}

const options = {
    type: "pack",
    output: "pack",
    mcv: 6,
    packs: [],
    include: []
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
    document.querySelector("#finalize > button").onclick = () => {
        if (!options.output) options.output = "pack";
        console.log(options); // TODO: remove this when done
        pack(options, new GUIBar());
    };

    // Add functionality to each list
    for (const addBtn of document.querySelectorAll(".list > button")) {
        // Add functionality to list add buttons
        addBtn.onclick = function () {
            const list = this.parentElement;

            console.log(dialog);
            const paths = dialog.showOpenDialogSync(undefined, {properties: [addBtn.classList.contains("file") ? "openFile" : "openDirectory", "multiSelections"]});
            if (!paths) return;
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
                    options[item.parentElement.parentElement.id].splice(index, 1);
                    item.remove();
                };

                list.querySelector("div").insertAdjacentElement("beforeend", div);
            }
        };
    }
});