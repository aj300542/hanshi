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
        });
    })
    .catch(err => {
        console.error("加载失败:", err);
        poemDisplay.textContent = "数据加载失败";
    });
