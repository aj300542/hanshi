let txtDataGlobal = [];
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

            // 字符标签
            const charLabel = document.createElement("div");
            charLabel.className = "char-label";
            charLabel.textContent = char;
            preview2.appendChild(charLabel);

            // 图片
            const img = document.createElement("img");
            img.src = `${boxImgPath}${filename}`;
            img.alt = filename;
            preview2.appendChild(img);

            preview2.style.display = "block";
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

                boxDiv.style.position = "absolute";
                boxDiv.style.left = `${box.x1 * scaleX}px`;
                boxDiv.style.top = `${box.y1 * scaleY}px`;
                boxDiv.style.width = `${(box.x2 - box.x1) * scaleX}px`;
                boxDiv.style.height = `${(box.y2 - box.y1) * scaleY}px`;
                boxDiv.style.zIndex = "10";
                boxDiv.textContent = box.index;

                boxDiv.addEventListener("mouseenter", () => {
                    const entry = txtDataGlobal[box.index - 1]; // 修复偏移
                    const filename = entry?.filename;
                    if (filename) {
                        updatePreview(filename);
                    } else {
                        preview2.innerHTML = "<div class='error'>图像未找到</div>";
                        preview2.style.display = "block";
                    }
                });


                boxDiv.addEventListener("mousemove", (e) => {
                    const offset = 40;
                    const previewWidth = preview2.offsetWidth;
                    const previewHeight = preview2.offsetHeight;
                    const pageWidth = window.innerWidth;
                    const pageHeight = window.innerHeight;

                    let left = e.clientX + offset;
                    if (left + previewWidth > pageWidth) {
                        left = e.clientX - previewWidth - offset;
                    }

                    let top = (pageHeight - previewHeight) / 2;

                    preview2.style.left = `${left}px`;
                    preview2.style.top = `${top}px`;
                });

                boxDiv.addEventListener("mouseleave", () => {
                    preview2.style.display = "none";
                    preview2.innerHTML = "";
                });

                boxDiv.addEventListener("dblclick", () => {
                    const entry = txtDataGlobal[box.index - 1];
                    const filename = entry?.filename;
                    const char = entry?.char || "未命名";

                    if (!filename) {
                        alert("❌ 无法下载：未找到对应图像");
                        return;
                    }

                    const img = new Image();
                    img.crossOrigin = "anonymous"; // 如果图片是本地或允许跨域
                    img.src = `${boxImgPath}${filename}`;

                    img.onload = () => {
                        const canvas = document.createElement("canvas");
                        canvas.width = img.width;
                        canvas.height = img.height;

                        const ctx = canvas.getContext("2d");
                        ctx.drawImage(img, 0, 0);

                        // ✅ 添加水印文字（字符水印）
                        ctx.font = `${Math.floor(canvas.width / 20)}px 'KaiTi'`;
                        ctx.textAlign = "right";
                        ctx.textBaseline = "bottom";

                        // 设置字符水印颜色（稍深）
                        ctx.fillStyle = "rgba(0, 0, 0, 0.5)";
                        ctx.fillText(`${char}`, canvas.width - 20, canvas.height - 50);

                        // 设置作者水印颜色（更淡）
                        ctx.fillStyle = "rgba(0, 0, 0, 0.25)";
                        ctx.fillText(`aj300542`, canvas.width - 20, canvas.height - 20);


                        // ✅ 生成下载链接
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