
function enableDragScroll(element, options = {}) {
    const speedFactor = options.speedFactor ?? 0.65;
    const inertiaBoost = options.inertiaBoost ?? 1.6;
    const friction = options.friction ?? 0.93;

    let isDown = false;
    let startX;
    let scrollLeft;
    let lastWalk = 0;

    // 鼠标事件
    element.addEventListener("mousedown", (e) => {
        isDown = true;
        element.classList.add("dragging");
        startX = e.pageX - element.offsetLeft;
        scrollLeft = element.scrollLeft;
        e.preventDefault();
    });

    window.addEventListener("mouseup", () => {
        if (!isDown) return;
        isDown = false;
        element.classList.remove("dragging");
        applyInertia();
    });

    element.addEventListener("mouseleave", () => {
        if (!isDown) return;
        isDown = false;
        element.classList.remove("dragging");
        applyInertia();
    });

    element.addEventListener("mousemove", (e) => {
        if (!isDown) return;
        const x = e.pageX - element.offsetLeft;
        const walk = (x - startX) * speedFactor;
        lastWalk = walk * inertiaBoost;
        element.scrollLeft = scrollLeft - walk;
    });

    // 触控事件
    element.addEventListener("touchstart", (e) => {
        isDown = true;
        element.classList.add("dragging");
        startX = e.touches[0].pageX - element.offsetLeft;
        scrollLeft = element.scrollLeft;
    }, { passive: true });

    element.addEventListener("touchend", () => {
        if (!isDown) return;
        isDown = false;
        element.classList.remove("dragging");
        applyInertia();
    });

    element.addEventListener("touchmove", (e) => {
        if (!isDown) return;
        const x = e.touches[0].pageX - element.offsetLeft;
        const walk = (x - startX) * speedFactor;
        lastWalk = walk * inertiaBoost;
        element.scrollLeft = scrollLeft - walk;
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
}

// ✅ 初始化拖拽区域
window.addEventListener("DOMContentLoaded", () => {
    const thumbBar = document.getElementById("thumb-bar");

    enableDragScroll(thumbBar, {
        speedFactor: 0.45,
        inertiaBoost: 1.2,
        friction: 0.9
    });
        const imgwrap = document.getElementById("image-wrapper");

    enableDragScroll(imgwrap, {
        speedFactor: 0.85,
        inertiaBoost: 1.5,
        friction: 0.92
    });
});

