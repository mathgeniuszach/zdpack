const $$ = document.querySelectorAll.bind(document);
const $ = document.querySelector.bind(document);

window.addEventListener("DOMContentLoaded", () => {
    for (const input of $$("input")) {
        input.setAttribute("spellcheck", "false")
    }
});