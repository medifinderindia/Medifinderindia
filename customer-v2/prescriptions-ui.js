(() => {
  "use strict";
  const camera = document.querySelector("[data-prescription-camera]");
  const file = document.querySelector("[data-prescription-file]");
  const name = document.querySelector("[data-prescription-file-name]");
  function show(input) {
    const selected = input && input.files && input.files[0];
    if (!selected || !name) return;
    const isImage = /^image\/(jpeg|png|webp|heic|heif)$/i.test(selected.type);
    const isPdf = selected.type === "application/pdf" || /\.pdf$/i.test(selected.name);
    if (!isImage && !isPdf) {
      input.value = "";
      name.textContent = "Unsupported file. Choose an image or PDF.";
      return;
    }
    if (selected.size > 10 * 1024 * 1024) {
      input.value = "";
      name.textContent = "File is larger than 10 MB. Please choose a smaller file.";
      return;
    }
    name.textContent = selected.name + " · " + (selected.size / (1024 * 1024)).toFixed(2) + " MB · Selected locally only";
  }
  camera && camera.addEventListener("change", () => show(camera));
  file && file.addEventListener("change", () => show(file));
})();
