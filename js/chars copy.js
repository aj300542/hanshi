const preview = document.getElementById("preview");
const poemDisplay = document.getElementById("poem-line");
const poemTDisplay = document.getElementById("poemT-line");
const thumbBar = document.getElementById("thumb-bar");

Promise.all([
    fetch(`${charsPath}txt.json`).then(res => res.json()),
    fetch(`${charsPath}poem.json`).then(res => res.json()),
    fetch(`${charsPath}poemT.json`).then(res => res.json())
])
    .then(([txtData, poemData, poemTData]) => {
        const poemLines = poemData.map(p => p.line);
        const poemNotes = poemTData.map(p => p.note);

        // Flatten txt.json
        const flatChars = [];
        txtData.forEach((entry, i) => {
            [...entry.char].forEach((ch, j) => {
                flatChars.push({
                    ch,
                    filename: entry.filename,
                    imageIndex: i,
                    charIndex: j
                });
            });
        });

        // Flatten poem.json
        const flatPoemChars = [];
        poemLines.forEach((line, lineIndex) => {
            [...line].forEach((ch, charIndex) => {
                flatPoemChars.push({
                    ch,
                    lineIndex,
                    charIndex
                });
            });
        });

        function getContextTriple(filename) {
            const idx = flatChars.findIndex(c => c.filename === filename);
            if (idx === -1) return null;

            const prev = idx > 0 ? flatChars[idx - 1].ch : null;
            const curr = flatChars[idx].ch;
            const next = idx < flatChars.length - 1 ? flatChars[idx + 1].ch : null;

            return { prev, curr, next };
        }

        function findMatch({ prev, curr, next }) {
            const target = [prev, curr, next].filter(Boolean).join("");
            for (let i = 0; i <= flatPoemChars.length - target.length; i++) {
                let match = true;
                for (let j = 0; j < target.length; j++) {
                    if (flatPoemChars[i + j].ch !== target[j]) {
                        match = false;
                        break;
                    }
                }
                if (match) {
                    const middleOffset = prev ? 1 : 0;
                    const middleChar = flatPoemChars[i + middleOffset];
                    return {
                        lineIndex: middleChar.lineIndex,
                        charIndex: middleChar.charIndex
                    };
                }
            }
            return null;
        }

        function highlightSingleChar(line, index) {
            return [...line].map((ch, i) =>
                i === index
                    ? `<span class="highlight">${ch}</span>`
                    : ch
            ).join("");
        }

        txtData.forEach((entry, i) => {
            const filename = entry.filename;
            const char = entry.char; // ✅ 修复：定义 char

            const wrapper = document.createElement("div");
            wrapper.className = "thumb-wrapper";

            // 顶部字符标签
            const charLabel = document.createElement("div");
            charLabel.className = "char-label";
            charLabel.textContent = char;

            const img = document.createElement("img");
            img.src = `${imgPath}${filename}`;
            img.alt = filename;
            img.draggable = false;

            const label = document.createElement("div");
            label.className = "filename";
            label.textContent = filename;

            let previewTimer = null;

            img.addEventListener("mouseenter", () => {
                clearTimeout(previewTimer);

                previewTimer = setTimeout(() => {
                    preview.style.backgroundImage = `url(${imgPath}${filename})`;
                    preview.style.display = "block";
                    label.style.opacity = "1";

                    const context = getContextTriple(filename);
                    const match = findMatch(context);

                    if (match) {
                        const line = poemLines[match.lineIndex];
                        const note = poemNotes[match.lineIndex];
                        const highlighted = highlightSingleChar(line, match.charIndex);

                        poemDisplay.innerHTML = highlighted;
                        poemDisplay.style.display = "block";

                        poemTDisplay.textContent = note;
                        poemTDisplay.style.display = "block";
                    } else {
                        poemDisplay.innerHTML = "未找到匹配诗句";
                        poemDisplay.style.display = "block";

                        poemTDisplay.textContent = "";
                        poemTDisplay.style.display = "none";
                    }
                }, 300);
            });

            img.addEventListener("mouseleave", () => {
                preview.style.display = "none";
                label.style.opacity = "0";
                poemDisplay.innerHTML = "";
                poemDisplay.style.display = "none";

                poemTDisplay.textContent = "";
                poemTDisplay.style.display = "none";
            });

            // 添加顺序：charLabel → img → label
            wrapper.appendChild(charLabel);
            wrapper.appendChild(img);
            wrapper.appendChild(label);
            thumbBar.appendChild(wrapper);
            img.addEventListener("dblclick", () => {
                const entry = txtData[i]; // 当前字符条目
                const filename = entry?.filename;
                const char = entry?.char || "未命名";

                if (!filename) {
                    alert("❌ 无法下载：未找到对应图像");
                    return;
                }

                const imgToLoad = new Image();
                imgToLoad.crossOrigin = "anonymous"; // 如果图片是本地或允许跨域
                imgToLoad.src = `${imgPath}${filename}`;

                imgToLoad.onload = () => {
                    const canvas = document.createElement("canvas");
                    canvas.width = imgToLoad.width;
                    canvas.height = imgToLoad.height;

                    const ctx = canvas.getContext("2d");
                    ctx.drawImage(imgToLoad, 0, 0);

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

                imgToLoad.onerror = () => {
                    alert("❌ 图片加载失败");
                };
            });

        });
    })
    .catch(err => {
        console.error("加载失败:", err);
        poemDisplay.textContent = "数据加载失败";
    });
