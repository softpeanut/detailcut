(function () {
  "use strict";

  const { clamp, slugify, scaledHeight, chooseQuietCut, verifyCuts, outputPath, zipStore } = DetailCutCore;
  const edition = window.DetailCutEdition || { name: "Free", maxFiles: 1 };
  const allowedTypes = new Set(["image/jpeg", "image/png", "image/webp"]);
  const maxBytes = 40 * 1024 * 1024;
  const language = document.documentElement.lang.toLowerCase().startsWith("en") ? "en" : "ko";
  const copy = {
    ko: {
      remove: "제거",
      removeLabel: (name) => `${name} 제거`,
      empty: (name, max) => `이미지를 선택하세요. ${name} 버전은 최대 ${max}개를 처리합니다.`,
      ready: (count) => `${count}개 이미지 준비됨 · 파일은 이 브라우저를 벗어나지 않습니다.`,
      invalidFile: "JPG·PNG·WebP만 가능하며 파일당 40MB 이하여야 합니다.",
      fileLimit: (name, count) => `${name} 버전 한도에 따라 ${count}개만 추가했습니다.`,
      widthError: "가로는 320–2400px 정수로 입력하세요.",
      heightError: "조각 높이는 800–10000px 정수로 입력하세요.",
      qualityError: "JPG 품질은 60–100으로 입력하세요.",
      decodeError: (name) => `${name} 파일을 이미지로 읽지 못했습니다.`,
      jpgError: "브라우저가 JPG를 만들지 못했습니다.",
      analysisCanvasError: "이미지 분석용 Canvas를 만들지 못했습니다.",
      cutPlanError: "분할 계획의 행 연속성 검증에 실패했습니다.",
      previewCanvasError: "미리보기 Canvas를 만들지 못했습니다.",
      preview: (cuts) => `예상 ${cuts.length}개 · 높이 ${cuts.map((slice) => `${slice.end - slice.start}px`).join(" / ")} · 주황 점선이 분할 경계입니다.`,
      previewError: (message) => `미리보기를 만들지 못했습니다: ${message}`,
      sampleCanvasError: "샘플 Canvas를 만들지 못했습니다.",
      samplePngError: "샘플 PNG를 만들지 못했습니다.",
      sampleError: (message) => `샘플을 만들지 못했습니다: ${message}`,
      processing: (fileAt, fileCount, sliceAt, sliceCount) => `${fileAt}/${fileCount} 이미지 · ${sliceAt}/${sliceCount} 조각 만드는 중…`,
      outputCanvasError: "출력 Canvas를 만들지 못했습니다.",
      zipping: "ZIP 묶는 중…",
      complete: (files, slices) => `완료 · ${files}개 이미지를 ${slices}개 JPG로 나눴습니다.`,
      failed: (message) => `완료하지 못했습니다: ${message}`,
      edition: (name, max) => `${name} · 최대 ${max}개`,
    },
    en: {
      remove: "Remove",
      removeLabel: (name) => `Remove ${name}`,
      empty: (name, max) => `Choose an image. ${name} processes up to ${max} file${max === 1 ? "" : "s"}.`,
      ready: (count) => `${count} image${count === 1 ? "" : "s"} ready · Files never leave this browser.`,
      invalidFile: "Use JPG, PNG, or WebP files up to 40 MB each.",
      fileLimit: (name, count) => `${name} accepted ${count} file${count === 1 ? "" : "s"} within its limit.`,
      widthError: "Width must be a whole number from 320 to 2400 px.",
      heightError: "Maximum slice height must be a whole number from 800 to 10000 px.",
      qualityError: "JPG quality must be from 60 to 100.",
      decodeError: (name) => `Could not decode ${name} as an image.`,
      jpgError: "This browser could not create a JPG.",
      analysisCanvasError: "Could not create the analysis canvas.",
      cutPlanError: "The cut plan failed its contiguous-row check.",
      previewCanvasError: "Could not create the preview canvas.",
      preview: (cuts) => `Estimated ${cuts.length} slices · Heights ${cuts.map((slice) => `${slice.end - slice.start}px`).join(" / ")} · Orange dashed lines mark cut boundaries.`,
      previewError: (message) => `Could not create the preview: ${message}`,
      sampleCanvasError: "Could not create the sample canvas.",
      samplePngError: "Could not create the sample PNG.",
      sampleError: (message) => `Could not create the sample: ${message}`,
      processing: (fileAt, fileCount, sliceAt, sliceCount) => `Image ${fileAt}/${fileCount} · Creating slice ${sliceAt}/${sliceCount}…`,
      outputCanvasError: "Could not create an output canvas.",
      zipping: "Building ZIP…",
      complete: (files, slices) => `Done · Split ${files} image${files === 1 ? "" : "s"} into ${slices} JPG file${slices === 1 ? "" : "s"}.`,
      failed: (message) => `Could not finish: ${message}`,
      edition: (name, max) => `${name} · Up to ${max} file${max === 1 ? "" : "s"}`,
    },
  }[language];
  let files = [];
  let running = false;
  let previewRequest = 0;
  let previewTimer;

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
      remove.textContent = copy.remove;
      remove.setAttribute("aria-label", copy.removeLabel(file.name));
      remove.onclick = () => {
        if (running) return;
        files.splice(index, 1);
        renderQueue();
      };
      row.append(name, meta, remove);
      return row;
    }));
    exportButton.disabled = running || files.length === 0;
    if (!files.length) {
      previewRequest += 1;
      $("preview").hidden = true;
      setStatus(copy.empty(edition.name, edition.maxFiles));
    } else {
      setStatus(copy.ready(files.length));
      schedulePreview();
    }
  }

  function addFiles(list) {
    const incoming = [...list];
    const invalid = incoming.find((file) => !allowedTypes.has(file.type) || file.size > maxBytes);
    if (invalid) {
      setStatus(copy.invalidFile, "error");
      return;
    }
    const room = edition.maxFiles - files.length;
    files.push(...incoming.slice(0, Math.max(0, room)));
    renderQueue();
    if (incoming.length > room) setStatus(copy.fileLimit(edition.name, Math.max(0, room)), "error");
  }

  function readSettings() {
    const width = Number($("width").value);
    const maxHeight = Number($("height").value);
    const quality = Number($("quality").value);
    if (!Number.isInteger(width) || width < 320 || width > 2400) throw new RangeError(copy.widthError);
    if (!Number.isInteger(maxHeight) || maxHeight < 800 || maxHeight > 10000) throw new RangeError(copy.heightError);
    if (!Number.isInteger(quality) || quality < 60 || quality > 100) throw new RangeError(copy.qualityError);
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
        reject(new Error(copy.decodeError(file.name)));
      };
      image.src = url;
    });
  }

  function canvasBlob(canvas, quality) {
    return new Promise((resolve, reject) => canvas.toBlob((blob) => {
      if (blob) resolve(blob);
      else reject(new Error(copy.jpgError));
    }, "image/jpeg", quality));
  }

  function rowScores(image, scale, start, end) {
    const height = end - start + 1;
    const scanWidth = 128;
    const canvas = document.createElement("canvas");
    canvas.width = scanWidth;
    canvas.height = height;
    const context = canvas.getContext("2d", { alpha: false, willReadFrequently: true });
    if (!context) throw new Error(copy.analysisCanvasError);
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
    if (!verifyCuts(cuts, totalHeight)) throw new Error(copy.cutPlanError);
    return { cuts, scale, totalHeight };
  }

  async function renderPreview(request) {
    if (!files.length) return;
    let image;
    try {
      const settings = readSettings();
      image = await decodeImage(files[0]);
      const { cuts, totalHeight } = planCuts(image, settings);
      if (request !== previewRequest) return;
      const ratio = Math.min(1, 320 / settings.width, 520 / totalHeight);
      const canvas = $("preview-canvas");
      canvas.width = Math.max(1, Math.round(settings.width * ratio));
      canvas.height = Math.max(1, Math.round(totalHeight * ratio));
      const context = canvas.getContext("2d", { alpha: false });
      if (!context) throw new Error(copy.previewCanvasError);
      context.drawImage(image, 0, 0, canvas.width, canvas.height);
      context.strokeStyle = "#ff5a36";
      context.lineWidth = Math.max(2, Math.round(ratio * 6));
      context.setLineDash([8, 5]);
      for (const slice of cuts.slice(0, -1)) {
        const y = Math.min(canvas.height - 1, Math.round(slice.end * ratio));
        context.beginPath();
        context.moveTo(0, y);
        context.lineTo(canvas.width, y);
        context.stroke();
      }
      $("preview-summary").textContent = copy.preview(cuts);
      $("preview").hidden = false;
    } catch (error) {
      if (request === previewRequest) {
        $("preview").hidden = true;
        $("preview-summary").textContent = copy.previewError(error.message);
      }
    } finally {
      if (image && typeof image.close === "function") image.close();
    }
  }

  function schedulePreview() {
    const request = ++previewRequest;
    window.clearTimeout(previewTimer);
    previewTimer = window.setTimeout(() => renderPreview(request), 180);
  }

  async function addSample() {
    try {
      const canvas = document.createElement("canvas");
      canvas.width = 430;
      canvas.height = 3600;
      const context = canvas.getContext("2d");
      if (!context) throw new Error(copy.sampleCanvasError);
      context.fillStyle = "#f5f0e7";
      context.fillRect(0, 0, canvas.width, canvas.height);
      const sections = [[180, 1250, "FIRST DETAIL"], [1450, 2600, "SECOND DETAIL"], [2800, 3420, "SIZE & INFO"]];
      for (const [top, bottom, label] of sections) {
        context.fillStyle = top === 1450 ? "#d8ff54" : "#ff5a36";
        context.fillRect(28, top, canvas.width - 56, bottom - top);
        context.fillStyle = "#161616";
        context.font = "bold 32px sans-serif";
        context.fillText(label, 52, top + 70);
      }
      const blob = await new Promise((resolve, reject) => canvas.toBlob((value) => value ? resolve(value) : reject(new Error(copy.samplePngError)), "image/png"));
      files = [new File([blob], "detailcut-sample.png", { type: "image/png" })];
      canvas.width = 1;
      canvas.height = 1;
      renderQueue();
    } catch (error) {
      setStatus(copy.sampleError(error.message), "error");
    }
  }

  async function exportImage(image, settings, fileIndex) {
    const { cuts, scale, totalHeight } = planCuts(image, settings);
    const entries = [];
    for (let index = 0; index < cuts.length; index += 1) {
      const slice = cuts[index];
      setStatus(copy.processing(fileIndex + 1, files.length, index + 1, cuts.length));
      const canvas = document.createElement("canvas");
      canvas.width = settings.width;
      canvas.height = slice.end - slice.start;
      const context = canvas.getContext("2d", { alpha: false });
      if (!context) throw new Error(copy.outputCanvasError);
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
      setStatus(copy.zipping);
      const zip = zipStore(entries);
      const url = URL.createObjectURL(new Blob([zip], { type: "application/zip" }));
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = `detailcut-${settings.name}.zip`;
      anchor.click();
      window.setTimeout(() => URL.revokeObjectURL(url), 1000);
      setStatus(copy.complete(files.length, totalSlices), "success");
    } catch (error) {
      setStatus(copy.failed(error.message), "error");
    } finally {
      running = false;
      exportButton.disabled = files.length === 0;
    }
  }

  $("browse").onclick = () => fileInput.click();
  const sampleButton = $("sample");
  if (sampleButton) sampleButton.onclick = (event) => {
    event.stopPropagation();
    addSample();
  };
  fileInput.onchange = () => {
    addFiles(fileInput.files);
    fileInput.value = "";
  };
  dropzone.onclick = (event) => {
    if (!event.target.closest("button")) fileInput.click();
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
  for (const id of ["width", "height", "quality", "smart-cut"]) $(id).addEventListener("input", schedulePreview);
  $("edition").textContent = copy.edition(edition.name, edition.maxFiles);
  if (edition.maxFiles > 1) fileInput.multiple = true;
  renderQueue();
})();
