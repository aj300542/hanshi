let txtDataGlobal = [];
let boxElements = []; // 存储所有 box DOM 元素及坐标信息

Promise.all([
    fetch(txtPath).then(res => res.json()),
    fetch(wufoPath).then(res => res.json())
])
    .then(([txtData, boxes]) => {
        txtDataGlobal = txtData;

        const wrapper = document.querySelector(".image-wrapper");
        const bgImg = wrapper.querySelector("img");
        const preview2 = document.getElementById("box-preview");


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

            // ✅ 统一定位：以 overlay-box 中心为基准
            const box = document.querySelector(`.overlay-box[data-filename="${filename}"]`);
            if (box) {
                const boxRect = box.getBoundingClientRect();
                const centerX = boxRect.left + boxRect.width / 2;
                const centerY = boxRect.top + boxRect.height / 2;

                const offset = 40;
                const previewWidth = preview2.offsetWidth;
                const previewHeight = preview2.offsetHeight;
                const pageWidth = window.innerWidth;

                // ✅ 水平定位逻辑
                let left = centerX + offset;
                if (left + previewWidth > pageWidth) {
                    left = centerX - previewWidth - offset;
                }
                left = Math.max(0, Math.min(left, pageWidth - previewWidth));

                // ✅ 垂直定位固定为距离底部 18vh
                const bottomOffset = 14; // 单位 vh
                const top = window.innerHeight - previewHeight - (bottomOffset * window.innerHeight / 100);

                preview2.style.left = `${left}px`;
                preview2.style.top = `${top}px`;

                // ✅ 获取 DOM 元素
                const poemDisplay = document.getElementById("poem-line");
                const poemTDisplay = document.getElementById("poemT-line");

                // 获取 box-preview 的中心 X 坐标
                const centerXa = left + previewWidth / 2;

                // 固定 Y 坐标（单位：vh）
                const poemBottomOffset = 7;   // 上方的诗句
                const poemTBottomOffset = 3;  // 下方的注释

                // 设置 poem-line（上方）
                poemDisplay.style.left = `${centerXa}px`;
                poemDisplay.style.bottom = `${poemBottomOffset}vh`;
                poemDisplay.style.transform = "translate(-50%, 0)";
                poemDisplay.style.position = "fixed";
                poemDisplay.style.display = "block";

                // 设置 poemT-line（下方）
                poemTDisplay.style.left = `${centerXa}px`;
                poemTDisplay.style.bottom = `${poemTBottomOffset}vh`;
                poemTDisplay.style.transform = "translate(-50%, 0)";
                poemTDisplay.style.position = "fixed";
                poemTDisplay.style.display = "block";

            }
        }
        // ✅ 显式挂载到 window，确保 index2.html 能访问
        window.updatePreview = updatePreview;
        // ✅ 添加事件监听器，供 chars.js 调用
        window.addEventListener("requestBoxPreview", (e) => {
            const { filename } = e.detail;
            updatePreview(filename);
        });

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
                boxDiv.style.display = "block";
                boxDiv.textContent = box.index;

                wrapper.appendChild(boxDiv); // ✅ 挂在 image-wrapper 内部


                boxDiv.addEventListener("mouseenter", () => {
                    const filename = boxDiv.dataset.filename;
                    if (filename) {
                        updatePreview(filename);

                        // ✅ 触发显示诗句和注释
                        window.dispatchEvent(new CustomEvent("hoverOnBox", {
                            detail: { filename }
                        }));

                        // ✅ 滚动 thumb-bar
                        window.dispatchEvent(new CustomEvent("scrollToThumb", {
                            detail: { filename }
                        }));

                        // ✅ 滚动 image-wrapper 居中目标 box
                        window.dispatchEvent(new CustomEvent("scrollToBox", {
                            detail: { filename }
                        }));

                    } else {
                        preview2.innerHTML = "<div class='error'>图像未找到</div>";
                        preview2.style.display = "block";
                    }
                    if (filename) {
                        window.dispatchEvent(new CustomEvent("scrollToThumb", {
                            detail: { filename }
                        }));
                    }
                });

                boxDiv.addEventListener("mousemove", (e) => {
                    updatePreview(boxDiv.dataset.filename, e.clientX, e.clientY);
                });

                // ✅ 触摸屏支持：在 image-wrapper 上触摸时检测 box
                wrapper.addEventListener("touchstart", handleTouchMove, { passive: false });
                wrapper.addEventListener("touchmove", handleTouchMove, { passive: false });

                function handleTouchMove(e) {
                    const touch = e.touches[0];
                    const rect = bgImg.getBoundingClientRect();
                    const x = touch.clientX - rect.left;
                    const y = touch.clientY - rect.top;

                    let found = false;

                    boxElements.forEach(({ element, x: bx, y: by, width, height }) => {
                        const inside = x >= bx && x <= bx + width && y >= by && y <= by + height;
                        element.style.display = inside ? "block" : "none";
                        if (inside) {
                            const filename = element.dataset.filename;
                            updatePreview(filename, touch.clientX, touch.clientY);
                            found = true;
                        }
                    });

                    if (!found) {
                        preview2.style.display = "none";
                        preview2.innerHTML = "";
                    }
                }
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
            boxDiv.addEventListener("touchstart", () => {
                longPressTimer = setTimeout(() => {
                    // 模拟双击下载
                    boxDiv.dispatchEvent(new Event("dblclick"));
                }, 600);
            });

            boxDiv.addEventListener("touchend", () => {
                clearTimeout(longPressTimer);
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
                        box.style.opacity = "0.6";
                        box.style.display = "block";
                    })

                updatePreview(filename);

            });

            // ✅ 响应 hideBoxByFilename 事件
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
            function smoothScrollTo(element, targetLeft, duration = 500) {
                const startLeft = element.scrollLeft;
                const distance = targetLeft - startLeft;
                const startTime = performance.now();

                function step(currentTime) {
                    const elapsed = currentTime - startTime;
                    const progress = Math.min(elapsed / duration, 1);
                    const ease = 0.5 - Math.cos(progress * Math.PI) / 2; // easeInOut

                    element.scrollLeft = startLeft + distance * ease;

                    if (progress < 1) {
                        requestAnimationFrame(step);
                    }
                }

                requestAnimationFrame(step);
            }
            let lastScrollX = null; // 记录上一次 box 的中心 X 坐标

            window.addEventListener("scrollToBox", (e) => {
                const { filename } = e.detail;
                const targetBox = document.querySelector(`.overlay-box[data-filename="${filename}"]`);
                const wrapper = document.querySelector(".image-wrapper");

                if (targetBox && wrapper) {
                    const boxCenterX = targetBox.offsetLeft + targetBox.offsetWidth / 2;
                    const wrapperCenterX = wrapper.clientWidth / 2;
                    const scrollLeft = boxCenterX - wrapperCenterX;

                    // ✅ 使用 wrapper 宽度动态计算阈值（例如 10%）
                    const threshold = wrapper.clientWidth * 0.08; // 10% 宽度
                    const deltaX = lastScrollX === null ? Infinity : Math.abs(boxCenterX - lastScrollX);

                    if (deltaX > threshold) {
                        wrapper.scrollTo({
                            left: scrollLeft,
                            behavior: "smooth"
                        });
                        lastScrollX = boxCenterX;
                    }

                    // ✅ 高亮目标 box
                    targetBox.classList.add("highlight");
                    setTimeout(() => targetBox.classList.remove("highlight"), 1000);
                }
            });

            // ✅ 所有 box 渲染完毕，通知拖拽系统初始化
            window.dispatchEvent(new Event("dragReady"));

        }
        // ✅ 添加 resize 监听器（放在 renderBoxes 定义之后）
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
