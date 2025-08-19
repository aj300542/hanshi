const demoButton = document.getElementById("demo-button");
const wrapper = document.querySelector(".image-wrapper");
const statusButton = document.getElementById("demo-status");
const slowButton = document.querySelector('[data-speed="slow"]');
const fastButton = document.querySelector('[data-speed="fast"]');

let demoIndex = 0;
let demoInterval = null;
let isDemoPlaying = false;
let intervalTime = 1000; // 初始播放间隔（毫秒）

demoButton.addEventListener("click", () => {
    const boxes = document.querySelectorAll(".overlay-box");
    if (boxes.length === 0) {
        alert("⚠️ 没有可演示的 boxDiv 元素");
        return;
    }

    if (!isDemoPlaying) {
        // ▶️ 开始播放
        isDemoPlaying = true;
        demoButton.textContent = "⏸️";
        wrapper.style.pointerEvents = "none";
        demoInterval = setInterval(playDemoStep, intervalTime);
    } else {
        // ⏸️ 暂停播放
        isDemoPlaying = false;
        demoButton.textContent = "▶️";
        clearInterval(demoInterval);
        wrapper.style.pointerEvents = "auto";
    }
});

function playDemoStep() {
    const boxes = document.querySelectorAll(".overlay-box");
    boxes.forEach(box => {
        box.style.display = "none";
        box.classList.remove("highlight");
    });

    if (demoIndex >= boxes.length) {
        demoIndex = 0;
    }

    const box = boxes[demoIndex];
    const filename = box.dataset.filename;

    if (filename) {
        box.style.display = "block";
        box.style.opacity = "0.6";
        box.classList.add("highlight");
        setTimeout(() => box.classList.remove("highlight"), 1000);

        setTimeout(() => {
            updatePreview(filename);
            window.dispatchEvent(new CustomEvent("hoverOnBox", { detail: { filename } }));
            window.dispatchEvent(new CustomEvent("scrollToThumb", { detail: { filename } }));
            window.dispatchEvent(new CustomEvent("scrollToBox", { detail: { filename } }));
        }, 100);
    }

    // ✅ 更新百分比进度
    const percent = Math.round((demoIndex + 1) / boxes.length * 100);
    statusButton.textContent = `${percent}%`;

    demoIndex++;
}

// ✅ 控制速度按钮逻辑
slowButton.addEventListener("click", () => {
    intervalTime += 1000;
    restartDemoIfPlaying();
});

fastButton.addEventListener("click", () => {
    intervalTime = Math.max(200, Math.floor(intervalTime * 0.5)); // 最小200ms
    restartDemoIfPlaying();
});

function restartDemoIfPlaying() {
    if (isDemoPlaying) {
        clearInterval(demoInterval);
        demoInterval = setInterval(playDemoStep, intervalTime);
    }
}

// ✅ 鼠标移动时自动检测 box（仅在非演示状态下启用）
wrapper.addEventListener("mousemove", (e) => {
    if (isDemoPlaying) return;

    const rect = wrapper.querySelector("img").getBoundingClientRect();
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
        const preview2 = document.getElementById("box-preview");
        preview2.style.display = "none";
        preview2.innerHTML = "";
    }
});
function resetDemo() {
    isDemoPlaying = false;
    demoIndex = 0;
    clearInterval(demoInterval);
    demoButton.textContent = "▶️";
    wrapper.style.pointerEvents = "auto";
    statusButton.textContent = "0%";

    // 隐藏所有 box
    const boxes = document.querySelectorAll(".overlay-box");
    boxes.forEach(box => {
        box.style.display = "none";
        box.classList.remove("highlight");
    });

    // 清空预览区
    const preview2 = document.getElementById("box-preview");
    if (preview2) {
        preview2.style.display = "none";
        preview2.innerHTML = "";
    }

    // 可选：触发取消事件供其他组件监听
    window.dispatchEvent(new CustomEvent("demoCancelled"));
}
document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") {
        resetDemo();
    }
});
statusButton.addEventListener("click", () => {
    if (isDemoPlaying) {
        resetDemo();
    }
});

