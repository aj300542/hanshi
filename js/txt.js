let txtDataGlobal = [];
let boxElements = [];

let currentScale = 1;
const minScale = 0.2;
const maxScale = 5;
const scaleStep = 0.1;

Promise.all([
    fetch(txtPath).then(res => res.json()),
    fetch(wufoPath).then(res => res.json())
])
.then(([txtData, boxes]) => {
    txtDataGlobal = txtData;

    const wrapper = document.querySelector(".image-wrapper");
    const bgImg = wrapper.querySelector("img");
    const preview2 = document.getElementById("box-preview");

    // dragging state
    let isDragging = false;
    let dragStartX = 0;
    let dragStartY = 0;
    let startScrollLeft = 0;
    let startScrollTop = 0;

    // utility: clamp
    const clamp = (v, a, b) => Math.min(Math.max(v, a), b);

    function updatePreview(filename) {
        const entry = txtDataGlobal.find(item => item.filename === filename);
        const char = entry?.char || "";

        preview2.innerHTML = "";

        const charLabel = document.createElement("div");
        charLabel.className = "char-label";
        charLabel.textContent = char;
        preview2.appendChild(charLabel);

        const img = document.createElement("img");
        img.src = `${boxImgPath}${filename}`;
        img.alt = filename;
        preview2.appendChild(img);

        preview2.style.display = "block";

        const box = document.querySelector(`.overlay-box[data-filename="${filename}"]`);
        if (box) {
            const boxRect = box.getBoundingClientRect();
            const centerX = boxRect.left + boxRect.width / 2;
            const centerY = boxRect.top + boxRect.height / 2;

            const offset = 40;
            const previewWidth = preview2.offsetWidth;
            const previewHeight = preview2.offsetHeight;
            const pageWidth = window.innerWidth;

            let left = centerX + offset;
            if (left + previewWidth > pageWidth) {
                left = centerX - previewWidth - offset;
            }
            left = Math.max(0, Math.min(left, pageWidth - previewWidth));

            const bottomOffset = 14;
            const top = window.innerHeight - previewHeight - (bottomOffset * window.innerHeight / 100);

            preview2.style.left = `${left}px`;
            preview2.style.top = `${top}px`;

            const poemDisplay = document.getElementById("poem-line");
            const poemTDisplay = document.getElementById("poemT-line");

            const centerXa = left + previewWidth / 2;

            const poemBottomOffset = 7;
            const poemTBottomOffset = 3;

            poemDisplay.style.left = `${centerXa}px`;
            poemDisplay.style.bottom = `${poemBottomOffset}vh`;
            poemDisplay.style.transform = "translate(-50%, 0)";
            poemDisplay.style.position = "fixed";
            poemDisplay.style.display = "block";

            poemTDisplay.style.left = `${centerXa}px`;
            poemTDisplay.style.bottom = `${poemTBottomOffset}vh`;
            poemTDisplay.style.transform = "translate(-50%, 0)";
            poemTDisplay.style.position = "fixed";
            poemTDisplay.style.display = "block";
        }
    }

    window.updatePreview = updatePreview;

    window.addEventListener("requestBoxPreview", (e) => {
        const { filename } = e.detail;
        updatePreview(filename);
    });

    function renderBoxes() {
        // remove existing boxes first (in case of resize)
        boxElements.forEach(({ element }) => element.remove());
        boxElements = [];

        const renderedWidth = bgImg.getBoundingClientRect().width;
        const renderedHeight = bgImg.getBoundingClientRect().height;

        const scaleX = renderedWidth / originalWidth;
        const scaleY = renderedHeight / originalHeight;

        boxes.forEach(box => {
            const boxDiv = document.createElement("div");
            boxDiv.className = "overlay-box";
            boxDiv.dataset.index = box.index;

            const entry = txtDataGlobal[box.index - 1];
            boxDiv.dataset.filename = entry?.filename || "";

            const left = box.x1 * scaleX;
            const top = box.y1 * scaleY;
            const width = (box.x2 - box.x1) * scaleX;
            const height = (box.y2 - box.y1) * scaleY;

            boxDiv.style.position = "absolute";
            boxDiv.style.left = `${left * currentScale}px`;
            boxDiv.style.top = `${top * currentScale}px`;
            boxDiv.style.width = `${width * currentScale}px`;
            boxDiv.style.height = `${height * currentScale}px`;
            boxDiv.style.zIndex = "10";
            boxDiv.style.display = "none";
            boxDiv.textContent = box.index;

            // mouse interactions
            boxDiv.addEventListener("mouseenter", () => {
                const filename = boxDiv.dataset.filename;
                if (filename) {
                    updatePreview(filename);
                    window.dispatchEvent(new CustomEvent("hoverOnBox", { detail: { filename } }));
                    window.dispatchEvent(new CustomEvent("scrollToThumb", { detail: { filename } }));
                    window.dispatchEvent(new CustomEvent("scrollToBox", { detail: { filename } }));
                } else {
                    preview2.innerHTML = "<div class='error'>图像未找到</div>";
                    preview2.style.display = "block";
                }
            });

            boxDiv.addEventListener("mousemove", (e) => {
                updatePreview(boxDiv.dataset.filename, e.clientX, e.clientY);
            });

            boxDiv.addEventListener("mouseleave", () => {
                preview2.style.display = "none";
                preview2.innerHTML = "";
            });

            // double click download
            boxDiv.addEventListener("dblclick", () => {
                const filename = boxDiv.dataset.filename;
                const char = txtDataGlobal[box.index - 1]?.char || "未命名";

                if (!filename) {
                    alert("❌ 无法下载：未找到对应图像");
                    return;
                }

                const img = new Image();
                img.crossOrigin = "anonymous";
                img.src = `${boxImgPath}${filename}`;

                img.onload = () => {
                    const canvas = document.createElement("canvas");
                    canvas.width = img.width;
                    canvas.height = img.height;

                    const ctx = canvas.getContext("2d");
                    ctx.drawImage(img, 0, 0);

                    ctx.font = `${Math.floor(canvas.width / 20)}px 'KaiTi'`;
                    ctx.textAlign = "right";
                    ctx.textBaseline = "bottom";

                    ctx.fillStyle = "rgba(0, 0, 0, 0.5)";
                    ctx.fillText(`${char}`, canvas.width - 20, canvas.height - 50);

                    ctx.fillStyle = "rgba(0, 0, 0, 0.25)";
                    ctx.fillText(`aj300542`, canvas.width - 20, canvas.height - 20);

                    const link = document.createElement("a");
                    link.href = canvas.toDataURL("image/jpeg");
                    link.download = `${char}.jpg`;
                    document.body.appendChild(link);
                    link.click();
                    document.body.removeChild(link);
                };

                img.onerror = () => {
                    alert("❌ 图片加载失败");
                };
            });

            // touch long press -> dblclick
            let longPressTimer;
            boxDiv.addEventListener("touchstart", () => {
                longPressTimer = setTimeout(() => {
                    boxDiv.dispatchEvent(new Event("dblclick"));
                }, 600);
            });
            boxDiv.addEventListener("touchend", () => {
                clearTimeout(longPressTimer);
            });

            wrapper.appendChild(boxDiv);

            // store unscaled box coordinates (relative to current rendered bg size)
            boxElements.push({
                element: boxDiv,
                x: left / currentScale,
                y: top / currentScale,
                width: width / currentScale,
                height: height / currentScale
            });
        });

        // ensure image transform and boxes are applied
        applyScale();
    }

    function applyScale() {
        bgImg.style.transform = `scale(${currentScale})`;
        bgImg.style.transformOrigin = "top left";

        boxElements.forEach(({ element, x, y, width, height }) => {
            element.style.left = `${x * currentScale}px`;
            element.style.top = `${y * currentScale}px`;
            element.style.width = `${width * currentScale}px`;
            element.style.height = `${height * currentScale}px`;
        });
    }

    // wheel zoom (simple)
    wrapper.addEventListener("wheel", (e) => {
        // allow zoom with Ctrl + wheel OR with wheel alone depending on preference
        // 这里直接阻止默认滚动，启用缩放
        e.preventDefault();

        const delta = e.deltaY;
        const prevScale = currentScale;

        if (delta < 0) {
            currentScale = Math.min(currentScale + scaleStep, maxScale);
        } else {
            currentScale = Math.max(currentScale - scaleStep, minScale);
        }

        // optional: keep cursor point approximately stable by adjusting scroll
        // calculate pointer position relative to image top-left
        const rect = bgImg.getBoundingClientRect();
        const pointerX = e.clientX - rect.left;
        const pointerY = e.clientY - rect.top;

        // ratio of pointer in image coordinates (before scaling)
        const ratioX = pointerX / (rect.width || 1);
        const ratioY = pointerY / (rect.height || 1);

        applyScale();

        // adjust wrapper scroll to keep pointer roughly on same content
        // compute new image size
        const newRect = bgImg.getBoundingClientRect();
        const newPointerX = newRect.left + ratioX * newRect.width;
        const newPointerY = newRect.top + ratioY * newRect.height;

        // delta in page coords -> convert to scroll change
        const dx = (newPointerX - e.clientX);
        const dy = (newPointerY - e.clientY);

        wrapper.scrollLeft += dx;
        wrapper.scrollTop += dy;
    }, { passive: false });

    // drag to pan (mouse)
    wrapper.addEventListener("mousedown", (e) => {
        // only start drag on left button (0) or middle (1) if you prefer
        if (e.button !== 0) return;
        isDragging = true;
        wrapper.classList.add("dragging");
        dragStartX = e.clientX;
        dragStartY = e.clientY;
        startScrollLeft = wrapper.scrollLeft;
        startScrollTop = wrapper.scrollTop;
        // prevent text/image selection while dragging
        e.preventDefault();
    });

    window.addEventListener("mousemove", (e) => {
        if (!isDragging) return;
        const dx = e.clientX - dragStartX;
        const dy = e.clientY - dragStartY;
        wrapper.scrollLeft = startScrollLeft - dx;
        wrapper.scrollTop = startScrollTop - dy;
    });

    window.addEventListener("mouseup", () => {
        if (!isDragging) return;
        isDragging = false;
        wrapper.classList.remove("dragging");
    });

    // touch drag for panning
    wrapper.addEventListener("touchstart", (e) => {
        if (e.touches.length !== 1) return;
        isDragging = true;
        const t = e.touches[0];
        dragStartX = t.clientX;
        dragStartY = t.clientY;
        startScrollLeft = wrapper.scrollLeft;
        startScrollTop = wrapper.scrollTop;
    }, { passive: false });

    wrapper.addEventListener("touchmove", (e) => {
        if (!isDragging || e.touches.length !== 1) return;
        const t = e.touches[0];
        const dx = t.clientX - dragStartX;
        const dy = t.clientY - dragStartY;
        wrapper.scrollLeft = startScrollLeft - dx;
        wrapper.scrollTop = startScrollTop - dy;
        e.preventDefault();
    }, { passive: false });

    wrapper.addEventListener("touchend", () => {
        isDragging = false;
    });

    // show/hide boxes externally
    window.addEventListener("showBoxByFilename", (e) => {
        const filename = e.detail;
        document.querySelectorAll(`.overlay-box[data-filename="${filename}"]`)
            .forEach(box => {
                box.style.opacity = "0.6";
                box.style.display = "block";
            });

        updatePreview(filename);
    });

    window.addEventListener("hideBoxByFilename", (e) => {
        const filename = e.detail;
        document.querySelectorAll(`.overlay-box[data-filename="${filename}"]`)
            .forEach(box => {
                box.style.opacity = "0.6";
                box.style.pointerEvents = "auto";
            });

        preview2.style.display = "none";
        preview2.innerHTML = "";
    });

    let lastScrollX = null;

    window.addEventListener("scrollToBox", (e) => {
        const { filename } = e.detail;
        const targetBox = document.querySelector(`.overlay-box[data-filename="${filename}"]`);
        if (targetBox && wrapper) {
            const boxCenterX = targetBox.offsetLeft + targetBox.offsetWidth / 2;
            const wrapperCenterX = wrapper.clientWidth / 2;
            const scrollLeft = boxCenterX - wrapperCenterX;

            const threshold = wrapper.clientWidth * 0.08;
            const deltaX = lastScrollX === null ? Infinity : Math.abs(boxCenterX - lastScrollX);

            if (deltaX > threshold) {
                wrapper.scrollTo({
                    left: scrollLeft,
                    behavior: "smooth"
                });
                lastScrollX = boxCenterX;
            }

            targetBox.classList.add("highlight");
            setTimeout(() => targetBox.classList.remove("highlight"), 1000);
        }
    });

    // mouse move detection for showing boxes (uses unscaled coords * currentScale)
    wrapper.addEventListener("mousemove", (e) => {
        const rect = bgImg.getBoundingClientRect();
        const x = e.clientX - rect.left;
        const y = e.clientY - rect.top;

        let found = false;

        boxElements.forEach(({ element, x: bx, y: by, width, height }) => {
            const inside = x >= bx * currentScale && x <= (bx + width) * currentScale &&
                           y >= by * currentScale && y <= (by + height) * currentScale;
            element.style.display = inside ? "block" : "none";
            if (inside) {
                const filename = element.dataset.filename;
                updatePreview(filename, e.clientX, e.clientY);
                found = true;
            }
        });

        if (!found) {
            preview2.style.display = "none";
            preview2.innerHTML = "";
        }
    });

    window.addEventListener("resize", () => {
        boxElements.forEach(({ element }) => element.remove());
        boxElements = [];
        renderBoxes();
    });

    if (bgImg.complete) {
        renderBoxes();
    } else {
        bgImg.onload = renderBoxes;
    }
})
.catch(err => {
    console.error("❌ 加载失败:", err);
});
