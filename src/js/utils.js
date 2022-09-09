function clickFileInput(formClass) {
    const form = document.querySelector(`.${formClass}`);
    form.reset();
    form.querySelector("input").click();
}

module.exports = {
    clickFileInput
};
