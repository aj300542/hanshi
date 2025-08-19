function enableDragScroll(element, options = {}) {
    const speedFactor = options.speedFactor ?? 0.65;
    const inertiaBoost = options.inertiaBoost ?? 1.6;
    const friction = options.friction ?? 0.93;
    const dragThreshold = 5;

    let isDown = false;
    let startX;
    let scrollLeft;
    let lastWalk = 0;
    let hasDragged = false;

    // 鼠标事件
    element.addEventListener("mousedown", (e) => {
        isDown = true;
        hasDragged = false;
        element.classList.add("dragging");
        startX = e.pageX - element.offsetLeft;
        scrollLeft = element.scrollLeft;
        e.preventDefault();
    });

    window.addEventListener("mouseup", () => {
        if (!isDown) return;
        endDrag();
    });

    element.addEventListener("mouseleave", () => {
        if (!isDown) return;
        endDrag();
    });

    element.addEventListener("mousemove", (e) => {
        if (!isDown) return;
        const x = e.pageX - element.offsetLeft;
        const walk = (x - startX) * speedFactor;

        if (!hasDragged && Math.abs(walk) > dragThreshold) {
            hasDragged = true;
        }

        if (hasDragged) {
            lastWalk = walk * inertiaBoost;
            element.scrollLeft = scrollLeft - walk;
        }
    });

    // 触控事件
    element.addEventListener("touchstart", (e) => {
        isDown = true;
        hasDragged = false;
        element.classList.add("dragging");
        startX = e.touches[0].pageX - element.offsetLeft;
        scrollLeft = element.scrollLeft;
    }, { passive: true });

    element.addEventListener("touchend", () => {
        if (!isDown) return;
        endDrag();
    });

    element.addEventListener("touchmove", (e) => {
        if (!isDown) return;
        const x = e.touches[0].pageX - element.offsetLeft;
        const walk = (x - startX) * speedFactor;

        if (!hasDragged && Math.abs(walk) > dragThreshold) {
            hasDragged = true;
        }

        if (hasDragged) {
            lastWalk = walk * inertiaBoost;
            element.scrollLeft = scrollLeft - walk;
        }
    }, { passive: false });

    // 惯性滑动
    function applyInertia() {
        let inertia = Math.max(Math.min(lastWalk, 80), -80);
        const step = () => {
            if (Math.abs(inertia) < 0.5) return;
            element.scrollLeft -= inertia;
            inertia *= friction;
            requestAnimationFrame(step);
        };
        requestAnimationFrame(step);
    }

    // 外部可调用的结束拖拽函数
    function endDrag() {
        isDown = false;
        hasDragged = false;
        element.classList.remove("dragging");
        applyInertia();
    }

    // 返回控制器
    return { endDrag };
}

// ✅ 拖拽区域配置
const dragConfigs = [
    { id: "thumb-bar", speedFactor: 0.45, inertiaBoost: 1.2, friction: 0.9 },
    { id: "image-wrapper", speedFactor: 0.85, inertiaBoost: 1.5, friction: 0.92 }
];

// ✅ 控制器存储，可用于外部调用
const dragControllers = {};

window.addEventListener("DOMContentLoaded", () => {
    dragConfigs.forEach(cfg => {
        const el = document.getElementById(cfg.id);
        if (el) {
            dragControllers[cfg.id] = enableDragScroll(el, cfg);
        }
    });
});

// ✅ 示例：外部调用结束拖拽
// dragControllers["thumb-bar"].endDrag();
