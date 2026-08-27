(function () {
  "use strict";

  const { clamp, slugify, scaledHeight, chooseQuietCut, verifyCuts, outputPath, zipStore } = DetailCutCore;
  const edition = window.DetailCutEdition || { name: "Free", maxFiles: 1 };
  const allowedTypes = new Set(["image/jpeg", "image/png", "image/webp"]);
  const maxBytes = 40 * 1024 * 1024;
  let files = [];
  let running = false;

  const $ = (id) => document.getElementById(id);
  const fileInput = $("files");
  const dropzone = $("dropzone");
  const queue = $("queue");
  const exportButton = $("export");
  const status = $("status");

  function setStatus(message, kind = "") {
    status.textContent = message;
    status.dataset.kind = kind;
  }

  function renderQueue() {
    queue.replaceChildren(...files.map((file, index) => {
      const row = document.createElement("div");
      row.className = "queue-item";
      const name = document.createElement("span");
      name.textContent = file.name;
      const meta = document.createElement("small");
      meta.textContent = `${(file.size / 1048576).toFixed(1)} MB`;
      const remove = document.createElement("button");
      remove.type = "button";
      remove.textContent = "제거";
      remove.setAttribute("aria-label", `${file.name} 제거`);
      remove.onclick = () => {
        if (running) return;
        files.splice(index, 1);
        renderQueue();
      };
      row.append(name, meta, remove);
      return row;
    }));
    exportButton.disabled = running || files.length === 0;
    if (!files.length) setStatus(`이미지를 선택하세요. ${edition.name} 버전은 최대 ${edition.maxFiles}개를 처리합니다.`);
    else setStatus(`${files.length}개 이미지 준비됨 · 파일은 이 브라우저를 벗어나지 않습니다.`);
  }

  function addFiles(list) {
    const incoming = [...list];
    const invalid = incoming.find((file) => !allowedTypes.has(file.type) || file.size > maxBytes);
    if (invalid) {
      setStatus("JPG·PNG·WebP만 가능하며 파일당 40MB 이하여야 합니다.", "error");
      return;
    }
    const room = edition.maxFiles - files.length;
    files.push(...incoming.slice(0, Math.max(0, room)));
    renderQueue();
    if (incoming.length > room) setStatus(`${edition.name} 버전 한도에 따라 ${Math.max(0, room)}개만 추가했습니다.`, "error");
  }

  function readSettings() {
    const width = Number($("width").value);
    const maxHeight = Number($("height").value);
    const quality = Number($("quality").value);
    if (!Number.isInteger(width) || width < 320 || width > 2400) throw new RangeError("가로는 320–2400px 정수로 입력하세요.");
    if (!Number.isInteger(maxHeight) || maxHeight < 800 || maxHeight > 10000) throw new RangeError("조각 높이는 800–10000px 정수로 입력하세요.");
    if (!Number.isInteger(quality) || quality < 60 || quality > 100) throw new RangeError("JPG 품질은 60–100으로 입력하세요.");
    return { width, maxHeight, quality: quality / 100, smartCut: $("smart-cut").checked, name: slugify($("name").value) };
  }

  function decodeImage(file) {
    if (typeof createImageBitmap === "function") return createImageBitmap(file);
    return new Promise((resolve, reject) => {
      const image = new Image();
      const url = URL.createObjectURL(file);
      image.onload = () => {
        URL.revokeObjectURL(url);
        resolve(image);
      };
      image.onerror = () => {
        URL.revokeObjectURL(url);
        reject(new Error(`${file.name} 파일을 이미지로 읽지 못했습니다.`));
      };
      image.src = url;
    });
  }

  function canvasBlob(canvas, quality) {
    return new Promise((resolve, reject) => canvas.toBlob((blob) => {
      if (blob) resolve(blob);
      else reject(new Error("브라우저가 JPG를 만들지 못했습니다."));
    }, "image/jpeg", quality));
  }

  function rowScores(image, scale, start, end) {
    const height = end - start + 1;
    const scanWidth = 128;
    const canvas = document.createElement("canvas");
    canvas.width = scanWidth;
    canvas.height = height;
    const context = canvas.getContext("2d", { alpha: false, willReadFrequently: true });
    if (!context) throw new Error("이미지 분석용 Canvas를 만들지 못했습니다.");
    context.fillStyle = "#ffffff";
    context.fillRect(0, 0, scanWidth, height);
    const sourceY = start / scale;
    const sourceHeight = height / scale;
    context.drawImage(image, 0, sourceY, image.width, sourceHeight, 0, 0, scanWidth, height);
    const pixels = context.getImageData(0, 0, scanWidth, height).data;
    const scores = new Float64Array(height);
    for (let y = 0; y < height; y += 1) {
      let horizontal = 0;
      let vertical = 0;
      for (let x = 1; x < scanWidth; x += 1) {
        const at = (y * scanWidth + x) * 4;
        const left = at - 4;
        horizontal += Math.abs(pixels[at] - pixels[left]) + Math.abs(pixels[at + 1] - pixels[left + 1]) + Math.abs(pixels[at + 2] - pixels[left + 2]);
        if (y > 0) {
          const above = at - scanWidth * 4;
          vertical += Math.abs(pixels[at] - pixels[above]) + Math.abs(pixels[at + 1] - pixels[above + 1]) + Math.abs(pixels[at + 2] - pixels[above + 2]);
        }
      }
      scores[y] = (horizontal + vertical * 1.5) / (scanWidth * 3 * 255);
    }
    return Array.from(scores);
  }

  function planCuts(image, settings) {
    const totalHeight = scaledHeight(image.width, image.height, settings.width);
    const scale = settings.width / image.width;
    const minimum = Math.max(400, Math.round(settings.maxHeight * 0.55));
    const lookback = Math.min(900, Math.round(settings.maxHeight * 0.3));
    const cuts = [];
    let start = 0;
    while (totalHeight - start > settings.maxHeight) {
      const idealEnd = start + settings.maxHeight;
      let end = idealEnd;
      if (settings.smartCut) {
        const rangeStart = Math.max(start + minimum, idealEnd - lookback);
        end = chooseQuietCut(rowScores(image, scale, rangeStart, idealEnd), rangeStart, idealEnd);
      }
      if (end <= start || end - start > settings.maxHeight) end = idealEnd;
      cuts.push({ start, end });
      start = end;
    }
    cuts.push({ start, end: totalHeight });
    if (!verifyCuts(cuts, totalHeight)) throw new Error("분할 계획의 행 연속성 검증에 실패했습니다.");
    return { cuts, scale, totalHeight };
  }

  async function exportImage(image, settings, fileIndex) {
    const { cuts, scale, totalHeight } = planCuts(image, settings);
    const entries = [];
    for (let index = 0; index < cuts.length; index += 1) {
      const slice = cuts[index];
      setStatus(`${fileIndex + 1}/${files.length} 이미지 · ${index + 1}/${cuts.length} 조각 만드는 중…`);
      const canvas = document.createElement("canvas");
      canvas.width = settings.width;
      canvas.height = slice.end - slice.start;
      const context = canvas.getContext("2d", { alpha: false });
      if (!context) throw new Error("출력 Canvas를 만들지 못했습니다.");
      context.fillStyle = "#ffffff";
      context.fillRect(0, 0, canvas.width, canvas.height);
      context.imageSmoothingEnabled = true;
      context.imageSmoothingQuality = "high";
      context.drawImage(image, 0, slice.start / scale, image.width, (slice.end - slice.start) / scale, 0, 0, canvas.width, canvas.height);
      const blob = await canvasBlob(canvas, settings.quality);
      entries.push({ name: `${settings.name}-${String(fileIndex + 1).padStart(2, "0")}/${outputPath(settings.name, index)}`, data: new Uint8Array(await blob.arrayBuffer()) });
      canvas.width = 1;
      canvas.height = 1;
    }
    return { entries, count: cuts.length, totalHeight };
  }

  async function runExport() {
    if (running || !files.length) return;
    running = true;
    exportButton.disabled = true;
    try {
      const settings = readSettings();
      const entries = [];
      let totalSlices = 0;
      for (let index = 0; index < files.length; index += 1) {
        const image = await decodeImage(files[index]);
        try {
          const result = await exportImage(image, settings, index);
          entries.push(...result.entries);
          totalSlices += result.count;
        } finally {
          if (typeof image.close === "function") image.close();
        }
      }
      setStatus("ZIP 묶는 중…");
      const zip = zipStore(entries);
      const url = URL.createObjectURL(new Blob([zip], { type: "application/zip" }));
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = `detailcut-${settings.name}.zip`;
      anchor.click();
      window.setTimeout(() => URL.revokeObjectURL(url), 1000);
      setStatus(`완료 · ${files.length}개 이미지를 ${totalSlices}개 JPG로 나눴습니다.`, "success");
    } catch (error) {
      setStatus(`완료하지 못했습니다: ${error.message}`, "error");
    } finally {
      running = false;
      exportButton.disabled = files.length === 0;
    }
  }

  $("browse").onclick = () => fileInput.click();
  fileInput.onchange = () => {
    addFiles(fileInput.files);
    fileInput.value = "";
  };
  dropzone.onclick = (event) => {
    if (event.target.id !== "browse") fileInput.click();
  };
  dropzone.onkeydown = (event) => {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      fileInput.click();
    }
  };
  for (const eventName of ["dragenter", "dragover"]) dropzone.addEventListener(eventName, (event) => {
    event.preventDefault();
    dropzone.classList.add("over");
  });
  for (const eventName of ["dragleave", "drop"]) dropzone.addEventListener(eventName, (event) => {
    event.preventDefault();
    dropzone.classList.remove("over");
  });
  dropzone.addEventListener("drop", (event) => addFiles(event.dataTransfer.files));
  exportButton.onclick = runExport;
  $("quality").oninput = (event) => $("quality-value").textContent = `${event.target.value}%`;
  $("edition").textContent = `${edition.name} · 최대 ${edition.maxFiles}개`;
  if (edition.maxFiles > 1) fileInput.multiple = true;
  renderQueue();
})();
