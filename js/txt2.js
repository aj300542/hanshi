let txtDataGlobal = [];
let boxElements = [];

Promise.all([
    fetch(txtPath).then(res => res.json()),
    fetch(wufoPath).then(res => res.json())
])
.then(([txtData, boxes]) => {
    txtDataGlobal = txtData;

    const wrapper = document.querySelector(".image-wrapper");
    const bgImg = wrapper.querySelector("img");
    const preview2 = document.getElementById("box-preview");

    function updatePreview(filename, x = null, y = null) {
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

        if (x !== null && y !== null) {
            const offset = 40;
            const previewWidth = preview2.offsetWidth;
            const previewHeight = preview2.offsetHeight;
            const pageWidth = window.innerWidth;
            const pageHeight = window.innerHeight;

            let left = x + offset;
            if (left + previewWidth > pageWidth) {
                left = x - previewWidth - offset;
            }
            left = Math.max(0, Math.min(left, pageWidth - previewWidth));

            let top = (pageHeight - previewHeight) / 2;
            preview2.style.left = `${left}px`;
            preview2.style.top = `${top}px`;
        }
    }

    function renderBoxes() {
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
            boxDiv.style.left = `${left}px`;
            boxDiv.style.top = `${top}px`;
            boxDiv.style.width = `${width}px`;
            boxDiv.style.height = `${height}px`;
            boxDiv.style.zIndex = "10";
            boxDiv.style.display = "none";
            boxDiv.textContent = box.index;

            boxDiv.addEventListener("mouseenter", () => {
                const filename = boxDiv.dataset.filename;
                if (filename) {
                    updatePreview(filename);
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

            wrapper.appendChild(boxDiv);

            boxElements.push({
                element: boxDiv,
                x: left,
                y: top,
                width,
                height
            });
        });

        // ✅ 鼠标在 image-wrapper 上移动时自动检测 box
        wrapper.addEventListener("mousemove", (e) => {
            const rect = bgImg.getBoundingClientRect();
            const x = e.clientX - rect.left;
            const y = e.clientY - rect.top;

            let found = false;

            boxElements.forEach(({ element, x: bx, y: by, width, height }) => {
                const inside = x >= bx && x <= bx + width && y >= by && y <= by + height;
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

        // ✅ 响应 showBoxByFilename 事件
        window.addEventListener("showBoxByFilename", (e) => {
            const filename = e.detail;
            document.querySelectorAll(`.overlay-box[data-filename="${filename}"]`)
                .forEach(box => {
                    box.style.display = "block";
                    box.style.opacity = "1";
                });
            updatePreview(filename);
        });

        // ✅ 响应 hideBoxByFilename 事件
        window.addEventListener("hideBoxByFilename", (e) => {
            const filename = e.detail;
            document.querySelectorAll(`.overlay-box[data-filename="${filename}"]`)
                .forEach(box => {
                    box.style.opacity = "0";
                    setTimeout(() => {
                        box.style.display = "none";
                    }, 300);
                });
            preview2.style.display = "none";
            preview2.innerHTML = "";
        });
    }

    if (bgImg.complete) {
        renderBoxes();
    } else {
        bgImg.onload = renderBoxes;
    }
})
.catch(err => {
    console.error("❌ 加载失败:", err);
});
